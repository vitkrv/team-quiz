import assert from 'node:assert/strict';
import { createRoomSubscription } from '../src/utils/roomSubscription.js';

const snapshot = (value, metadata = {}) => ({
    exists: () => value !== null, data: () => value,
    metadata: { fromCache: false, hasPendingWrites: false, ...metadata }
});
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture() {
    let now = 100000, serial = 0, reads = 0, state = {}, server = snapshot({ stage: 'board' });
    const timers = new Map(), listeners = [], requests = [];
    const document = new EventTarget(), window = new EventTarget(), navigator = { onLine: true };
    document.hidden = false;
    const schedule = (fn, delay, interval = false) => {
        const id = ++serial; timers.set(id, { fn, at: now + delay, delay, interval }); return id;
    };
    const environment = { document, window, navigator, Date: { now: () => now },
        setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: (id) => timers.delete(id),
        setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: (id) => timers.delete(id) };
    let deferred = false;
    const controller = createRoomSubscription({ environment,
        subscribe: (next, error) => {
            const listener = { next, error, active: true }; listeners.push(listener);
            return () => { listener.active = false; };
        },
        readServer: () => {
            reads += 1;
            return deferred ? new Promise((resolve, reject) => requests.push({ resolve, reject })) : Promise.resolve(server);
        },
        publish: (update) => { state = { ...state, ...update }; }
    });
    const live = (value, metadata) => listeners.at(-1).next(snapshot(value, metadata));
    const advance = async (ms) => {
        const end = now + ms;
        while (true) {
            const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!entry) break;
            const [id, timer] = entry;
            now = timer.at;
            if (timer.interval) timer.at += timer.delay; else timers.delete(id);
            timer.fn(); await flush();
        }
        now = end; await flush();
    };
    return { controller, environment, listeners, requests, timers, live, advance,
        state: () => state, reads: () => reads, server: (value) => { server = snapshot(value); },
        defer: () => { deferred = true; } };
}

export async function verifyRoomSubscription(check) {
    await check('room recovery: silent foreground stalls update state and reattach, unchanged rooms stay healthy', async () => {
        const f = fixture();
        try {
            f.live({ stage: 'board' }); f.server({ stage: 'question' });
            await f.advance(29999); assert.equal(f.reads(), 0);
            await f.advance(1); assert.equal(f.state().snapshot.data().stage, 'question');
            assert.equal(f.listeners.length, 2);
            // An older cache replay cannot undo the independent server read.
            f.live({ stage: 'board' }, { fromCache: true });
            assert.equal(f.state().snapshot.data().stage, 'question');
            f.live({ stage: 'question' });
            await f.advance(60000);
            assert.equal(f.reads(), 3); assert.equal(f.listeners.length, 2);
            assert.equal(f.state().status, 'synced');
        } finally { f.controller.dispose(); }
        assert.equal(f.timers.size, 0);
    });
    await check('room recovery: lifecycle signals coalesce, hidden and offline pages do not poll', async () => {
        const f = fixture();
        try {
            f.live({ stage: 'board' });
            f.environment.document.hidden = true;
            await f.advance(60000); assert.equal(f.reads(), 0);
            f.environment.document.hidden = false;
            for (const type of ['focus', 'online', 'pageshow']) f.environment.window.dispatchEvent(new Event(type));
            await f.advance(250); assert.equal(f.reads(), 1);
            f.environment.window.dispatchEvent(new Event('focus'));
            await f.advance(250); assert.equal(f.reads(), 1);
            f.environment.navigator.onLine = false;
            await f.advance(60000); assert.equal(f.reads(), 1);
        } finally { f.controller.dispose(); }
    });
    await check('room recovery: newer live data and pending local writes supersede probe responses', async () => {
        for (const pending of [false, true]) {
            const f = fixture();
            try {
                f.live({ stage: 'board' }); f.defer(); await f.advance(30000);
                f.live({ stage: 'newer' }, { hasPendingWrites: pending });
                f.requests[0].resolve(snapshot({ stage: 'old' })); await flush();
                assert.equal(f.state().snapshot.data().stage, 'newer');
                assert.equal(f.listeners.length, 1);
            } finally { f.controller.dispose(); }
        }
    });
    await check('room recovery: timeout retains state, one outstanding RPC, stale room responses are ignored', async () => {
        const f = fixture();
        f.live({ stage: 'board' }); f.defer(); await f.advance(45000);
        assert.equal(f.state().status, 'failed');
        assert.equal(f.state().snapshot.data().stage, 'board');
        await f.advance(5000); assert.equal(f.reads(), 1);
        f.controller.dispose();
        const before = f.state();
        f.requests[0].resolve(snapshot({ stage: 'wrong-room' })); await flush();
        assert.equal(f.state(), before); assert.equal(f.timers.size, 0);
    });
    await check('room recovery: actionable errors stop retrying, manual reconnect can restart', async () => {
        const f = fixture();
        try {
            f.live({ stage: 'board' }); f.defer(); await f.advance(30000);
            f.requests[0].reject({ code: 'permission-denied' }); await flush();
            assert.equal(f.state().status, 'blocked');
            await f.advance(60000); assert.equal(f.reads(), 1);
            f.controller.reconnect(); await flush(); assert.equal(f.reads(), 2);
            f.requests[1].resolve(snapshot(null)); await flush();
            assert.equal(f.state().snapshot.exists(), false);
        } finally { f.controller.dispose(); }
    });
    await check('room recovery: recoverable probe failures exhaust bounded backoff and retain the last screen', async () => {
        const f = fixture();
        try {
            f.live({ stage: 'board' }); f.defer(); await f.advance(30000);
            const delays = [1000, 2000, 4000, 8000, 16000];
            for (let i = 0; i <= delays.length; i++) {
                f.requests[i].reject({ code: 'unavailable' }); await flush();
                if (i < delays.length) await f.advance(delays[i]);
            }
            assert.equal(f.reads(), 6);
            await f.advance(120000); assert.equal(f.reads(), 6);
            assert.equal(f.state().snapshot.data().stage, 'board');
            assert.equal(f.state().status, 'failed');
        } finally { f.controller.dispose(); }
    });
}
