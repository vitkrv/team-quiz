import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServerClock, CLOCK_FRESHNESS_MS, CLOCK_RETRY_MS } from '../src/utils/serverClock.js';

// Deterministic production-controller checks: no DOM, browser, or Firebase calls.
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function fixture(options = {}) {
    let wall = 1000000, mono = 0, tick = 0, timerId = 0, batch = 0, last;
    const timers = new Map(), changes = [], diagnostics = [], operations = [];
    const context = { userId: 'player', enabled: true, visible: true, online: true };
    const control = { fail: false, mismatch: false, gate: null, gateKind: 'write', delays: [0, 0, 0], ...options };
    const shift = (ms) => { wall += ms; mono += ms; tick += ms; };
    const clock = createServerClock({
        wallNow: () => wall, monotonicNow: () => mono, batchId: () => `batch-${++batch}`,
        schedule: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: tick + ms }); return id; },
        cancel: (id) => timers.delete(id), onChange: (state) => changes.push(state), diagnose: (event) => diagnostics.push(event),
        writeSample: async (uid, sample) => {
            operations.push({ kind: 'write', uid, ...sample });
            if (control.gateKind === 'write' && control.gate) await control.gate.promise;
            if (control.fail) throw new Error('Write failed');
            const delay = control.delays[Number(sample.sampleId.split(':').at(-1))];
            shift(delay);
            last = { sampleId: sample.sampleId, serverReceivedAtMs: sample.clientSentAt + delay / 2 + 250 };
        },
        readSample: async (uid) => {
            operations.push({ kind: 'read', uid });
            if (control.gateKind === 'read' && control.gate) await control.gate.promise;
            return { ...last, ...(control.mismatch ? { sampleId: 'another-tab:0' } : {}) };
        }
    });
    const update = (next = {}, trigger = 'context') => { Object.assign(context, next); return clock.setContext(context, trigger); };
    const advance = async (ms) => {
        const target = tick + ms;
        for (;;) {
            const entry = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
            if (!entry) break;
            const [id, timer] = entry;
            shift(timer.at - tick); timers.delete(id); timer.fn(); await flush();
        }
        shift(target - tick); await flush();
    };
    const counts = () => ({ writes: operations.filter((o) => o.kind === 'write').length, reads: operations.filter((o) => o.kind === 'read').length });
    return { clock, control, update, advance, counts, operations, changes, diagnostics, timers,
        jump: (wallMs, monoMs = 0) => { wall += wallMs; mono += monoMs; } };
}
let checks = 0;
async function check(label, run) { await run(); checks++; console.log(`PASS ${label}`); }

await check('initial three samples, estimator and warning metadata', async () => {
    const f = fixture({ delays: [80, 60, 20] });
    assert.equal(await f.update(), 250);
    assert.deepEqual(f.counts(), { writes: 3, reads: 3 });
    assert.deepEqual(f.clock.snapshot(), { userId: 'player', offsetMs: 250, roundTripMs: 20, ready: true, lastSyncedAt: 1000160 });
    assert.equal(f.changes.filter((s) => s.ready).length, 1);
    assert.equal(new Set(f.operations.filter((o) => o.kind === 'write').map((o) => o.sampleId)).size, 3);
    f.clock.dispose(); assert.equal(f.timers.size, 0);
});
await check('simultaneous initial requests share one promise and batch', async () => {
    const f = fixture(); const first = f.update();
    assert.equal(first, f.clock.request('question'));
    assert.equal(first, f.clock.request('board'));
    await first; assert.deepEqual(f.counts(), { writes: 3, reads: 3 }); f.clock.dispose();
});
await check('fresh question, board, pageshow and foreground requests cost zero operations', async () => {
    const f = fixture(); await f.update();
    for (let i = 0; i < 100; i++) {
        await f.clock.request(i % 2 ? 'question' : 'board');
        await f.update({ visible: false }); await f.update({ visible: true }, 'visibilitychange');
        await f.update({}, 'pageshow');
    }
    assert.deepEqual(f.counts(), { writes: 3, reads: 3 });
    assert.equal(f.timers.size, 1); f.clock.dispose();
});
await check('freshness boundary and timer/question collision start exactly one batch', async () => {
    const f = fixture(); await f.update(); await f.advance(CLOCK_FRESHNESS_MS - 1);
    await f.clock.request('question'); assert.equal(f.counts().writes, 3);
    // Move to the deadline without firing the timer, then request from the game.
    f.jump(1, 1); const promise = f.clock.request('question');
    await f.advance(1); await promise;
    assert.deepEqual(f.counts(), { writes: 6, reads: 6 }); f.clock.dispose();
});
for (const pause of [{ visible: false }, { online: false }, { enabled: false }]) {
    await check(`stale paused session stays quiet and resumes once: ${JSON.stringify(pause)}`, async () => {
        const f = fixture(); await f.update(); const state = f.clock.snapshot(); await f.update(pause);
        assert.equal(f.timers.size, 0); await f.advance(2 * CLOCK_FRESHNESS_MS); await f.clock.request();
        assert.deepEqual(f.clock.snapshot(), state); assert.equal(f.counts().writes, 3);
        await f.update({ visible: true, online: true, enabled: true });
        assert.deepEqual(f.counts(), { writes: 6, reads: 6 }); f.clock.dispose();
    });
}
await check('lobby/results disabled sessions never start calibration', async () => {
    const f = fixture(); await f.update({ enabled: false });
    for (let i = 0; i < 4; i++) { await f.advance(CLOCK_FRESHNESS_MS); await f.update({}, 'pageshow'); }
    assert.deepEqual(f.counts(), { writes: 0, reads: 0 }); f.clock.dispose();
});
for (const role of ['host', 'contestant', 'spectator']) {
    await check(`${role} gets the same five-minute live-play schedule`, async () => {
        const f = fixture(); await f.update({ userId: role }); await f.advance(CLOCK_FRESHNESS_MS);
        assert.deepEqual(f.counts(), { writes: 6, reads: 6 }); f.clock.dispose();
    });
}
await check('failure keeps successful metadata and all triggers obey retry cooldown', async () => {
    const f = fixture(); await f.update(); const state = f.clock.snapshot(); f.control.fail = true;
    await f.advance(CLOCK_FRESHNESS_MS); assert.equal(f.counts().writes, 4);
    assert.deepEqual(f.clock.snapshot(), state);
    for (let i = 0; i < 20; i++) await f.update({}, 'question');
    await f.update({ visible: false }); await f.advance(10000); await f.update({ visible: true });
    await f.advance(CLOCK_RETRY_MS - 10001); assert.equal(f.counts().writes, 4);
    f.control.fail = false; await f.advance(1);
    assert.deepEqual(f.counts(), { writes: 7, reads: 6 }); assert.equal(f.clock.snapshot().ready, true); f.clock.dispose();
});
await check('initial failure retains local fallback and retries after 30 seconds', async () => {
    const f = fixture({ fail: true }); await f.update();
    assert.equal(f.clock.snapshot().ready, false); assert.equal(f.clock.snapshot().offsetMs, 0);
    assert.equal(f.clock.snapshot().lastSyncedAt, null);
    f.control.fail = false; await f.advance(CLOCK_RETRY_MS); assert.equal(f.clock.snapshot().ready, true); f.clock.dispose();
});
await check('another tab cannot supply accepted samples', async () => {
    const f = fixture({ mismatch: true }); await f.update();
    assert.deepEqual(f.counts(), { writes: 3, reads: 3 }); assert.equal(f.clock.snapshot().ready, false);
    assert.equal(f.diagnostics.at(-1).event, 'failure');
    f.control.mismatch = false; await f.advance(CLOCK_RETRY_MS); assert.equal(f.clock.snapshot().ready, true); f.clock.dispose();
});
for (const kind of ['write', 'read']) {
    for (const change of ['hidden', 'offline', 'finished', 'unmounted', 'user']) {
        await check(`${change} during pending ${kind} discards batch and prevents overlap`, async () => {
            const gate = deferred(), f = fixture({ gate, gateKind: kind }); const first = f.update(); await flush();
            assert.deepEqual(f.counts(), { writes: 1, reads: kind === 'read' ? 1 : 0 });
            if (change === 'unmounted') f.clock.dispose();
            else f.update(change === 'hidden' ? { visible: false } : change === 'offline' ? { online: false }
                : change === 'finished' ? { enabled: false } : { userId: 'new-user' });
            // A brief pause/resume must invalidate even a still-unresolved sample.
            if (change === 'hidden') { f.update({ visible: true }); await flush(); }
            assert.equal(f.counts().writes, 1);
            f.control.gate = null; gate.resolve(); await first;
            assert.equal(f.changes.filter((s) => s.ready).length, 0);
            assert.deepEqual(f.counts(), { writes: 1, reads: kind === 'read' ? 1 : 0 });
            if (change === 'user' || change === 'hidden') {
                await f.advance(0); assert.equal(f.counts().writes, 4);
                if (change === 'user') assert.ok(f.operations.slice(kind === 'read' ? 2 : 1).every((o) => o.uid === 'new-user'));
            } else assert.equal(f.timers.size, 0);
            f.clock.dispose();
        });
    }
}
await check('successful state resets on user change and paused same-user state is retained', async () => {
    const f = fixture(); await f.update(); const state = f.clock.snapshot(); await f.update({ enabled: false });
    assert.deepEqual(f.clock.snapshot(), state);
    await f.update({ userId: 'new-user' }); assert.equal(f.clock.snapshot().ready, false);
    assert.equal(f.clock.snapshot().roundTripMs, null); assert.equal(f.clock.snapshot().lastSyncedAt, null);
    await f.update({ enabled: true }); assert.equal(f.clock.snapshot().userId, 'new-user'); f.clock.dispose();
});
for (const [wall, mono] of [[1001, 0], [-1001, 0], [300001, 0], [0, 300001]]) {
    await check(`wall adjustment/sleep ${wall}/${mono} requests a fresh batch`, async () => {
        const f = fixture(); await f.update(); f.jump(wall, mono); await f.clock.request('pageshow');
        assert.equal(f.counts().writes, 6); f.clock.dispose();
    });
}
await check('a 1000ms clock difference remains within the discontinuity threshold', async () => {
    const f = fixture(); await f.update(); f.jump(1000); await f.clock.request();
    assert.equal(f.counts().writes, 3); f.clock.dispose();
});
await check('60-minute operation budget is independent of frequent game transitions', async () => {
    const f = fixture(); await f.update();
    for (let second = 1; second < 3600; second++) {
        await f.advance(1000); await f.clock.request(second % 2 ? 'question' : 'board');
    }
    assert.deepEqual(f.counts(), { writes: 36, reads: 36 });
    assert.equal(f.diagnostics.filter((e) => e.event === 'complete').length, 12);
    console.log('BUDGET [0, 60 minutes): 12 calibrations; 36 reads + 36 writes/client; 720 each/20 contestants');
    f.clock.dispose();
});

// Bundle the real hook with small hook/event/transport fakes. This verifies the
// React adapter and cleanup without a browser, DOM package, or extra dependency.
await check('actual hook: eligibility, browser lifecycle events, StrictMode replay and identity cleanup', async () => {
    const slots = [], effects = [], operations = [], timers = new Map();
    let cursor = 0, timerId = 0, stateUpdates = 0, lastSample, gate = null;
    const depsEqual = (a, b) => a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
    const environment = {
        wall: 1000000,
        react: {
            useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
            useState(initial) {
                const i = cursor++; if (!(i in slots)) slots[i] = initial;
                return [slots[i], (value) => { stateUpdates++; slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
            },
            useCallback(fn, deps) {
                const i = cursor++; if (!depsEqual(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn;
            },
            useEffect(fn, deps) {
                const i = cursor++;
                if (!depsEqual(slots[i]?.deps, deps)) effects.push(() => {
                    slots[i]?.cleanup?.(); slots[i] = { fn, deps, cleanup: fn() };
                });
            }
        },
        createClock(options) {
            return createServerClock({ ...options, wallNow: () => environment.wall, monotonicNow: () => environment.wall,
                schedule: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
                cancel: (id) => timers.delete(id) });
        },
        async write(ref, sample) {
            operations.push({ kind: 'write', ref }); if (gate) await gate.promise;
            lastSample = { ...sample, serverReceivedAt: { toMillis: () => environment.wall + 250 } };
        },
        async read(ref) { operations.push({ kind: 'read', ref }); return { data: () => lastSample }; }
    };
    const previous = Object.fromEntries(['document', 'window', 'navigator', '__clockHook'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const document = Object.assign(new EventTarget(), { hidden: false });
    const window = new EventTarget(), navigator = { onLine: true };
    for (const [key, value] of Object.entries({ document, window, navigator, __clockHook: environment })) {
        Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    try {
        const bundled = await build({ entryPoints: ['src/hooks/useServerClock.js'], bundle: true, write: false,
            platform: 'node', format: 'esm', define: { 'import.meta.env.DEV': 'false' },
            plugins: [{ name: 'clock-hook-fakes', setup(builder) {
                builder.onResolve({ filter: /^(react|firebase\/firestore|\.\.\/firebase|\.\.\/utils\/serverClock)$/ },
                    ({ path }) => ({ path, namespace: 'clock-fake' }));
                builder.onLoad({ filter: /.*/, namespace: 'clock-fake' }, ({ path }) => ({ contents:
                    path === 'react' ? 'export const { useState, useRef, useEffect, useCallback } = globalThis.__clockHook.react;'
                        : path === '../firebase' ? 'export const db = {}; export const appId = "clock-test";'
                            : path === '../utils/serverClock' ? 'export const createServerClock = globalThis.__clockHook.createClock;'
                                : 'export const doc = (_, ...parts) => parts.join("/"); export const serverTimestamp = () => null; export const setDoc = globalThis.__clockHook.write; export const getDocFromServer = globalThis.__clockHook.read;' }));
            } }] });
        const { default: useServerClock } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
        const render = (uid = 'player', enabled = true) => {
            cursor = 0; const result = useServerClock(uid, { enabled }); effects.splice(0).forEach((run) => run()); return result;
        };
        const replay = () => { for (const slot of slots) if (slot?.fn && slot.cleanup) { slot.cleanup(); slot.cleanup = slot.fn(); } };
        render('player', false); await flush(); assert.equal(operations.length, 0);
        render(); replay(); await flush(); // StrictMode invalidates before the first deferred write.
        // A cancelled batch arms one immediate retry; run its fake timer.
        for (const [id, timer] of [...timers]) if (timer.ms === 0) { timers.delete(id); timer.fn(); }
        await flush(); let value = render();
        assert.equal(operations.length, 6); assert.equal(value.ready, true); assert.equal(value.offsetMs, 250);
        assert.equal(value.roundTripMs, 0); assert.equal(value.lastSyncedAt, environment.wall);
        assert.ok(Math.abs(value.serverNow() - Date.now() - 250) < 20);
        const stableNow = value.serverNow;
        document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
        assert.equal(timers.size, 0);
        document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('pageshow')); await value.syncClock(); await flush();
        assert.equal(operations.length, 6); assert.equal(render().serverNow, stableNow);
        navigator.onLine = false; window.dispatchEvent(new Event('offline')); environment.wall += CLOCK_FRESHNESS_MS;
        await value.syncClock(); assert.equal(operations.length, 6); assert.equal(timers.size, 0);
        navigator.onLine = true; window.dispatchEvent(new Event('online')); await flush(); assert.equal(operations.length, 12);
        render('player', false); await flush(); assert.equal(timers.size, 0);
        window.dispatchEvent(new Event('pageshow')); await flush(); assert.equal(operations.length, 12);
        gate = deferred(); render('another-user'); await flush(); value = render('another-user');
        assert.equal(value.ready, false); assert.equal(value.offsetMs, 0); assert.equal(value.lastSyncedAt, null);
        assert.ok(operations.at(-1).ref.includes('/another-user/clockSync/current'));
        for (const slot of slots) slot?.cleanup?.();
        const updatesBefore = stateUpdates, countBefore = operations.length;
        gate.resolve(); await flush(); window.dispatchEvent(new Event('pageshow')); await flush();
        assert.equal(stateUpdates, updatesBefore); assert.equal(operations.length, countBefore); assert.equal(timers.size, 0);
    } finally {
        for (const [key, descriptor] of Object.entries(previous)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
        }
    }
});
console.log(`Server clock verification passed: ${checks} checks.`);
