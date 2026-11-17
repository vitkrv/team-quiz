// Deterministic checks only: no browser, production network, or new test tooling.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createPreloadQueue } from '../src/utils/preloadQueue.js';
import { createIncrementalCache } from '../src/utils/incrementalCache.js';
import { requestMediaJson, uploadMediaForm } from '../src/utils/mediaTransport.js';
import worker from '../imagekit-auth-worker/worker.js';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };

await check('preloads: concurrency, visible priority, deduplication, cancellation, and disposal', async () => {
    const queue = createPreloadQueue({ concurrency: 1, maxEntries: 2 });
    const gate = deferred(), order = [], disposed = [];
    const load = (id) => async () => { order.push(id); return { dispose: () => disposed.push(id) }; };
    const first = queue.load('first', () => gate.promise);
    await flush();
    const background = queue.load('background', load('background'), { priority: 0 });
    const cancelled = queue.load('cancelled', load('cancelled'), { priority: 0 });
    const denial = assert.rejects(cancelled, /cancelled/);
    const visible = queue.load('visible', load('visible'));
    assert.equal(queue.load('background', load('duplicate')), background); // Promote to visible.
    queue.cancelBackground(); await denial;
    assert.deepEqual(order, []);
    gate.resolve({ dispose: () => disposed.push('first') });
    await Promise.all([first, background, visible]); await flush();
    assert.deepEqual(order, ['visible', 'background']);
    assert.deepEqual(disposed, ['first']);
});
await check('preloads: failed cache expires and explicit retry succeeds', async () => {
    let now = 0, calls = 0;
    const queue = createPreloadQueue({ now: () => now, failureTtl: 5000 });
    const fail = () => { calls++; throw Error('offline'); };
    await assert.rejects(queue.load('image', fail)); await flush();
    await assert.rejects(queue.load('image', fail)); assert.equal(calls, 1);
    now = 5001;
    await assert.rejects(queue.load('image', fail)); await flush(); assert.equal(calls, 2);
    assert.equal(await queue.load('image', () => 'loaded', { retry: true }), 'loaded');
});
await check('history cache: concurrent revisions, failed checkpoint, session clear, and eviction', async () => {
    const cache = createIncrementalCache(2), gate = deferred();
    let reads = 0;
    const read = async (previous) => { reads++; await gate.promise; return (previous || 0) + 1; };
    const first = cache.load('game', 1, read), same = cache.load('game', 1, read), next = cache.load('game', 2, read);
    gate.resolve(); assert.deepEqual(await Promise.all([first, same, next]), [1, 1, 2]); assert.equal(reads, 2);
    await assert.rejects(cache.load('game', 3, () => { throw Error('offline'); }));
    assert.equal(await cache.load('game', 3, read), 3);
    cache.clear(); assert.equal(await cache.load('game', 1, read), 1);
    await cache.load('two', 1, read); await cache.load('three', 1, read);
    assert.equal(await cache.load('game', 1, read), 1);
});

class FakeXHR {
    upload = {};
    status = 200;
    responseText = '{}';
    open() {}
    send() {}
    abort() { this.onabort?.(); }
}
await check('upload: malformed responses, HTTP errors, network, abort, timeout, success all settle', async () => {
    for (const scenario of ['json', 'shape', 'http', 'network', 'abort', 'timeout', 'success']) {
        const xhr = new FakeXHR();
        const pending = uploadMediaForm('https://test.invalid', {}, { createXHR: () => xhr, timeoutMs: 5 });
        if (scenario === 'success') {
            xhr.responseText = JSON.stringify({ fileId: 'file', filePath: '/file', url: 'https://test.invalid/file' });
            xhr.onload(); assert.equal((await pending).fileId, 'file');
        } else {
            const rejected = assert.rejects(pending, (error) => Boolean(error.code && error.messageKey));
            if (scenario === 'json') { xhr.responseText = '<html>'; xhr.onload(); }
            if (scenario === 'shape') xhr.onload();
            if (scenario === 'http') { xhr.status = 500; xhr.onload(); }
            if (scenario === 'network') xhr.onerror();
            if (scenario === 'abort') xhr.abort();
            await rejected;
        }
        assert.equal(xhr.onload, null);
    }
});
await check('HTTP: body stalls, invalid JSON, and Worker authorization errors remain bounded/structured', async () => {
    const original = globalThis.fetch;
    try {
        globalThis.fetch = async () => ({ ok: true, text: () => new Promise(() => {}) });
        await assert.rejects(requestMediaJson('https://test.invalid', {}, { timeoutMs: 5 }), { code: 'timeout' });
        globalThis.fetch = async () => new Response('<html>');
        await assert.rejects(requestMediaJson('https://test.invalid'), { code: 'invalid-response' });
        globalThis.fetch = async () => new Response('{}', { status: 403 });
        const token = `test.${Buffer.from(JSON.stringify({ sub: 'owner' })).toString('base64url')}.test`;
        for (const action of ['uploadAuth', 'delete']) {
            const request = new Request('https://test.invalid', { method: 'POST', headers: { Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action, appId: 'app', packId: 'pack', questionId: 'q', slot: 'questionMedia',
                    media: { packId: 'pack', fileId: 'f', filePath: '/TeamQuiz/pack-f', questionId: 'q', slot: 'questionMedia' } }) });
            const response = await worker.fetch(request, { FIREBASE_PROJECT_ID: 'demo-test' });
            assert.equal(response.status, 400);
            assert.equal(response.headers.get('access-control-allow-origin'), '*');
            assert.equal((await response.json()).code, 'media-request-failed');
        }
    } finally { globalThis.fetch = original; }
});

// Tiny hook executor with fake event targets and time. It executes production
// hooks, including their effect cleanup, without a DOM or browser.
function hookHarness() {
    const slots = [], effects = [], timers = new Map();
    let cursor = 0, serial = 0, now = 100000, updates = 0;
    const same = (a, b) => a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    const react = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
            return [slots[i], (v) => { const next = typeof v === 'function' ? v(slots[i]) : v; if (!Object.is(next, slots[i])) updates++; slots[i] = next; }]; },
        useRef(initial) { return slots[cursor++] ??= { current: initial }; },
        useMemo(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
        useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
        useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) effects.push(() => {
            slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); }
    };
    react.useLayoutEffect = react.useEffect;
    const globals = { document: Object.assign(new EventTarget(), { hidden: false }), window: new EventTarget(), navigator: { onLine: true },
        performance: { now: () => now }, localStorage: { getItem: () => null, setItem() {} },
        setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id; },
        clearTimeout: (id) => timers.delete(id) };
    const old = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
    return { react, globals, now: () => now, updates: () => updates, timers,
        render(fn) { cursor = 0; const result = fn(); effects.splice(0).forEach((run) => run()); return result; },
        advance(ms) { const end = now + ms; for (;;) {
            const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!entry) break; const [id, timer] = entry; now = timer.at; timers.delete(id); timer.fn();
        } now = end; },
        dispose() { for (const slot of slots) slot?.cleanup?.(); for (const [key, descriptor] of Object.entries(old)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
    };
}
async function bundleHook(path, fakes) {
    const bundled = await build({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'esm',
        plugins: [{ name: 'hook-fakes', setup(builder) {
            builder.onResolve({ filter: /.*/ }, ({ path }) => Object.hasOwn(fakes, path) ? { path, namespace: 'fake' } : undefined);
            builder.onLoad({ filter: /.*/, namespace: 'fake' }, ({ path }) => ({ contents: fakes[path] }));
        } }] });
    return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
}
await check('deadline clock: no periodic renders, exact transitions, calibration and resume, cleanup', async () => {
    const h = hookHarness(); globalThis.__performanceTest = h;
    try {
        const { default: useDeadlineClock } = await bundleHook('src/hooks/useDeadlineClock.js', {
            react: 'export const { useEffect, useState } = globalThis.__performanceTest.react;' });
        const render = (deadlines = [102000, 104000], key = 0) => h.render(() => useDeadlineClock(deadlines, h.now, key));
        render(); const initial = h.updates();
        h.advance(1900); assert.equal(h.updates(), initial);
        h.advance(102); render(); assert.equal(h.updates(), initial + 1);
        h.advance(2000); render(); assert.equal(h.updates(), initial + 2);
        h.advance(60000); assert.equal(h.updates(), initial + 2); assert.equal(h.timers.size, 0);
        render([200000], 1); assert.equal(h.timers.size, 1);
        h.globals.window.dispatchEvent(new Event('focus')); assert.equal(h.timers.size, 1);
        render([]); assert.equal(h.timers.size, 0);
    } finally { h.dispose(); delete globalThis.__performanceTest; }
});
await check('buzzer hook: unlock, local grace expiry, no 50ms polling, and stale click protection', async () => {
    const h = hookHarness();
    const room = { buzzerPolicyVersion: 1, buzzerRoundId: 'race', activeQuestionId: 'q', status: 'playing', players: { player: { isHost: false } } };
    const race = { raceId: 'race', questionId: 'q', phase: 'open', openedAt: 100000, openingDelayMs: 2000, attempts: {}, penalties: {} };
    const sync = { data: race, snapshot: { metadata: { hasPendingWrites: false } }, status: 'synced' };
    globalThis.__performanceTest = { ...h, sync };
    try {
        const { default: useBuzzer } = await bundleHook('src/hooks/useBuzzer.js', {
            react: 'export const { useEffect, useLayoutEffect, useMemo, useRef, useState } = globalThis.__performanceTest.react;',
            './useRoomSubscription': 'export default () => globalThis.__performanceTest.sync;',
            '../actions/buzzerState': 'export const buzzerRef = () => ({});',
            '../actions/buzzerActions': 'export const finalizeBuzz = async () => {}; export const recordEarlyBuzz = async () => true; export const submitBuzz = async () => "accepted";'
        });
        const roomRef = { id: 'game', path: 'rooms/game' };
        const render = () => h.render(() => useBuzzer({ room, roomRef, uid: 'player', isHost: false, isSpectator: false, serverNow: h.now, clockSyncKey: 0 }));
        render(); let state = render(); assert.equal(state.canClick, false);
        const before = h.updates(); h.advance(1900); assert.equal(h.updates(), before);
        h.advance(102); state = render(); state = render(); assert.equal(state.canClick, true);
        race.phase = 'collecting'; race.firstAcceptedAt = 100100; state = render();
        h.advance(200); state = render(); assert.equal(state.canClick, true); // Local grace survives collection close.
        const stalePress = state.press;
        h.advance(1000); assert.equal(await stalePress(), 'ignored');
        state = render(); assert.equal(state.canClick, false);
        assert.equal(h.timers.size, 0);
        sync.status = 'failed'; state = render(); assert.equal(state.canClick, false); assert.equal(state.error, 'buzzSyncFailed');
    } finally { h.dispose(); delete globalThis.__performanceTest; }
});
await check('subscription hook: stable data across metadata/status updates, grouped reconnect, and identity cleanup', async () => {
    const h = hookHarness(), controllers = [];
    globalThis.__performanceTest = { ...h, create(options) {
        const controller = { options, reconnects: 0, disposed: false,
            reconnect() { this.reconnects++; }, dispose() { this.disposed = true; } };
        controllers.push(controller); return controller;
    } };
    try {
        const { default: useRoomSubscription } = await bundleHook('src/hooks/useRoomSubscription.js', {
            react: 'export const { useEffect, useRef, useState, useCallback } = globalThis.__performanceTest.react;',
            'firebase/firestore': 'export const onSnapshot = () => {}; export const runTransaction = () => {};',
            '../utils/roomSubscription': 'export const createRoomSubscription = globalThis.__performanceTest.create;'
        });
        const firestore = { app: { name: 'test' } };
        const room = { path: 'rooms/game', firestore }, race = { path: 'rooms/game/buzzer/current', firestore };
        const render = (user = 'player') => h.render(() => [useRoomSubscription(room, user),
            useRoomSubscription(race, user, { probeIdle: false, recoveryGroup: room.path })]);
        render();
        const snapshot = (metadata = {}) => ({ data: () => ({ stage: 'question' }),
            metadata: { fromCache: false, hasPendingWrites: false, ...metadata } });
        controllers[0].options.publish({ snapshot: snapshot(), status: 'synced' });
        const initial = render()[0];
        const count = h.updates();
        controllers[0].options.publish({ snapshot: snapshot() });
        assert.equal(h.updates(), count);
        controllers[0].options.publish({ snapshot: snapshot({ fromCache: true }) });
        let state = render()[0]; assert.equal(state.data, initial.data); assert.notEqual(state.snapshot, initial.snapshot);
        controllers[0].options.publish({ status: 'reconnecting' });
        state = render()[0]; assert.equal(state.data, initial.data);
        state.reconnect(); assert.deepEqual(controllers.map((c) => c.reconnects), [1, 1]);
        state = render('other')[0]; assert.equal(state.data, null);
        const afterSwitch = h.updates();
        controllers[0].options.publish({ snapshot: snapshot() }); assert.equal(h.updates(), afterSwitch);
        assert.equal(controllers[0].disposed, true); assert.equal(controllers[1].disposed, true);
    } finally { h.dispose(); delete globalThis.__performanceTest; }
});
console.log(`Client performance verification passed: ${checks} checks.`);
