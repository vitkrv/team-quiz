import assert from 'node:assert/strict';
import { carryMediaPause, createMediaStopPlayback } from '../src/utils/mediaStopPlayback.js';

// Plain event targets and a controllable clock; no DOM implementation or browser.
class MediaElement extends EventTarget {
    duration = 30;
    _time = 0;
    paused = true;
    ended = false;
    seeking = false;
    playbackRate = 1;
    blocked = false;
    seekCount = 0;
    get currentTime() { return this._time; }
    set currentTime(value) {
        if (++this.seekCount > 50) throw new Error('Repeated internal seeking');
        this._time = value;
        this.ended = value >= this.duration;
        this.seeking = true;
        this.dispatchEvent(new Event('seeking'));
        this.seeking = false;
        this.dispatchEvent(new Event('seeked'));
    }
    play() {
        if (this.blocked) return Promise.reject(new Error('Autoplay blocked'));
        this.paused = false;
        this.ended = false;
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
    }
    pause() {
        if (this.paused) return;
        this.paused = true;
        this.dispatchEvent(new Event('pause'));
    }
    advance(time) { this._time = time; this.dispatchEvent(new Event('timeupdate')); }
    finish() {
        this._time = this.duration;
        this.ended = true;
        this.pause();
        this.dispatchEvent(new Event('ended'));
    }
}

function fixture({ released = 0, session = 'session', gated = true, storage = new Map(), blocked = false, initialPause = false, loading = false, stopPoints = [10, 20], allowReplay = true, kind = 'audio', duration = 30, play } = {}) {
    let serial = 0;
    const timers = new Map();
    const element = new MediaElement();
    element.duration = duration;
    if (play) element.play = play.bind(element);
    if (loading) element.duration = NaN;
    element.blocked = blocked;
    const document = new EventTarget();
    document.visibilityState = 'visible';
    const window = new EventTarget();
    const environment = { document, window, sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, { fn, delay }); return id; }, clearTimeout: (id) => timers.delete(id) };
    const latest = { current: { playback: session ? { sessionId: session, releasedStopCount: released, startedAt: 0 } : null, stopped: false, allowReplay } };
    let view;
    const runtime = createMediaStopPlayback({ element, gated, session, storageScope: 'user:room:question', identity: 'file', latest,
        media: { kind, durationSeconds: duration, stopPoints }, onView: (next) => { view = next; }, initialPause, environment });
    const flushStart = () => { for (const [id, timer] of [...timers]) if (timer.delay === 0) { timers.delete(id); timer.fn(); } };
    const nextTimer = () => { const first = timers.entries().next().value; if (first) { timers.delete(first[0]); first[1].fn(); } };
    const release = (count) => { latest.current.playback.releasedStopCount = count; runtime.sync(); };
    return { element, runtime, document, latest, storage, timers, flushStart, nextTimer, release, view: () => view };
}

export async function verifyMediaPlayback(check) {
    await check('media playback: pause scope isolates questions and host replays, preserving pre-start buzzing', async () => {
        const previous = { scope: 'room:q:file', session: 'old', localPause: true };
        assert.equal(carryMediaPause(previous, 'room:q:file', 'new'), false);
        assert.equal(carryMediaPause(previous, 'room:next:file', 'old'), false);
        assert.equal(carryMediaPause(previous, 'room:q:file', 'old'), true);
        assert.equal(carryMediaPause({ ...previous, session: '' }, 'room:q:file', 'first'), true);
        const f = fixture({ stopPoints: [], initialPause: true });
        f.runtime.dispose();
        const replay = fixture({ stopPoints: [], session: 'new', storage: f.storage,
            initialPause: carryMediaPause(previous, 'room:q:file', 'new') });
        try { replay.flushStart(); assert.equal(replay.element.paused, false); assert.equal(replay.element.currentTime, 0); }
        finally { replay.runtime.dispose(); }
    });
    await check('media playback: short video retries muted on autoplay denial and unmutes in the local action', async () => {
        let calls = 0;
        let soundAllowed = false;
        const f = fixture({ kind: 'video', duration: 3, stopPoints: [], loading: true, play() {
            calls += 1;
            if (!this.muted && !soundAllowed) return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
            return MediaElement.prototype.play.call(this);
        } });
        try {
            assert.equal(calls, 0);
            f.element.duration = 3;
            f.element.dispatchEvent(new Event('loadedmetadata'));
            f.flushStart();
            await Promise.resolve(); await Promise.resolve();
            assert.equal(calls, 2); assert.equal(f.view().muted, true);
            assert.equal(f.element.currentTime, 0); assert.equal(f.element.paused, false);
            soundAllowed = true;
            f.runtime.unmute(); assert.equal(calls, 3, 'Unmute calls play within the gesture');
            await Promise.resolve(); assert.equal(f.element.muted, false);
            f.element.finish(); assert.equal(f.view().complete, true);
        } finally { f.runtime.dispose(); }
    });
    await check('media playback: muted short video still honors stop boundaries and loading feedback', async () => {
        const f = fixture({ kind: 'video', duration: 3, stopPoints: [1, 2], play() {
            if (!this.muted) return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
            return MediaElement.prototype.play.call(this);
        } });
        try {
            f.flushStart(); await Promise.resolve(); await Promise.resolve();
            f.element.dispatchEvent(new Event('waiting')); assert.equal(f.view().loading, true);
            f.element.dispatchEvent(new Event('playing')); assert.equal(f.view().loading, false);
            f.element.advance(1.1); assert.equal(f.element.currentTime, 1); assert.equal(f.element.paused, true);
            f.release(1); assert.equal(f.element.paused, false);
            f.element.advance(2.1); assert.equal(f.element.currentTime, 2); assert.equal(f.element.paused, true);
            f.release(2); f.element.finish(); assert.equal(f.view().complete, true);
        } finally { f.runtime.dispose(); }
    });
    await check('media playback: blocked muted fallback and audio expose local resume without retry loops', async () => {
        for (const kind of ['video', 'audio']) {
            let calls = 0;
            const f = fixture({ kind, play() { calls += 1; return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })); } });
            try {
                f.flushStart(); await Promise.resolve(); await Promise.resolve();
                assert.equal(calls, kind === 'video' ? 2 : 1);
                assert.equal(f.view().error, 'blocked'); assert.equal(f.view().resume, true);
                f.element.dispatchEvent(new Event('canplay'));
                assert.equal(calls, kind === 'video' ? 2 : 1);
            } finally { f.runtime.dispose(); }
        }
    });
    await check('media playback: interrupted playback retries readiness once; disposed rejection is ignored', async () => {
        let calls = 0;
        const f = fixture({ play() { calls += 1; return Promise.reject(Object.assign(new Error('interrupted'), { name: 'AbortError' })); } });
        try {
            f.flushStart(); await Promise.resolve();
            assert.equal(f.view().error, 'interrupted');
            f.element.dispatchEvent(new Event('canplay')); await Promise.resolve();
            f.element.dispatchEvent(new Event('canplay')); await Promise.resolve();
            assert.equal(calls, 2);
            f.element.error = { code: 4 }; f.element.dispatchEvent(new Event('error'));
            assert.equal(f.view().error, 'unsupported');
        } finally { f.runtime.dispose(); }
        let reject;
        const stale = fixture({ kind: 'video', play() { return new Promise((resolve, fail) => { reject = fail; }); } });
        stale.flushStart(); stale.runtime.dispose();
        reject(Object.assign(new Error('old'), { name: 'NotAllowedError' })); await Promise.resolve();
        assert.equal(stale.element.muted, false); assert.equal(stale.view().error, null);
    });
    await check('media replay: disabled participant controls stay locked before and after completion and refresh', async () => {
        for (const stopPoints of [[], [10, 20]]) {
            const f = fixture({ stopPoints, allowReplay: false });
            try {
                f.flushStart();
                assert.equal(f.element.paused, false, 'Host-authorized initial playback starts');
                f.element.advance(5);
                f.runtime.seek(25);
                f.element.currentTime = 25;
                assert.equal(f.element.currentTime, 5, 'Seeking is locked during the first playback');
                for (let index = 0; index < stopPoints.length; index++) {
                    f.element.advance(stopPoints[index]);
                    assert.equal(f.element.paused, true);
                    f.release(index + 1);
                    assert.equal(f.element.paused, false);
                }
                f.element.finish();
                assert.equal(f.view().complete, true);
                f.runtime.toggle();
                f.runtime.seek(10);
                f.element.currentTime = 10;
                await f.element.play();
                assert.equal(f.element.currentTime, 30, 'Seeking stays locked after completion');
                assert.equal(f.element.paused, true, 'Local replay stays blocked after completion');
            } finally { f.runtime.dispose(); }
            const restored = fixture({ stopPoints, released: stopPoints.length, storage: f.storage, allowReplay: false });
            try {
                assert.equal(restored.view().complete, true);
                restored.runtime.toggle();
                restored.runtime.seek(1);
                assert.equal(restored.element.paused, true);
                assert.equal(restored.element.currentTime, 30);
            } finally { restored.runtime.dispose(); }
            const replay = fixture({ stopPoints, session: 'shared-host-replay', storage: f.storage, allowReplay: false });
            try {
                replay.flushStart();
                assert.equal(replay.element.currentTime, 0);
                assert.equal(replay.element.paused, false, 'A fresh host session still authorizes playback');
            } finally { replay.runtime.dispose(); }
        }
        const preview = fixture({ gated: false, allowReplay: false });
        try { preview.runtime.seek(12); preview.runtime.toggle(); assert.equal(preview.element.paused, false); }
        finally { preview.runtime.dispose(); }
    });
    await check('media replay: first-playback controls unlock on completion and reset for a shared replay', async () => {
        for (const stopPoints of [[], [10, 20]]) {
            const f = fixture({ stopPoints, released: stopPoints.length });
            try {
                f.flushStart();
                f.element.advance(5);
                f.runtime.seek(25);
                assert.equal(f.element.currentTime, 5);
                f.element.finish();
                assert.equal(f.view().complete, true);
                f.runtime.seek(10);
                f.runtime.toggle();
                assert.equal(f.element.currentTime, 10);
                assert.equal(f.element.paused, false);
            } finally { f.runtime.dispose(); }
            const restored = fixture({ stopPoints, released: stopPoints.length, storage: f.storage });
            try {
                assert.equal(restored.view().complete, true);
                restored.runtime.toggle();
                assert.equal(restored.element.paused, false);
            } finally { restored.runtime.dispose(); }
            const replay = fixture({ stopPoints, session: 'new-host-replay', storage: f.storage });
            try {
                assert.equal(replay.view().complete, false);
                assert.equal(replay.element.currentTime, 0);
                replay.flushStart();
                assert.equal(replay.element.paused, false);
            } finally { replay.runtime.dispose(); }
        }
        const preview = fixture({ gated: false });
        try { preview.runtime.seek(12); preview.runtime.toggle(); assert.equal(preview.element.paused, false); }
        finally { preview.runtime.dispose(); }
    });
    await check('media playback: buzz before metadata or host launch stays paused', async () => {
        const f = fixture({ loading: true, session: '' });
        f.runtime.buzzPause();
        assert.equal(f.view().localPause, true);
        const paused = f.view().localPause;
        f.runtime.dispose();
        const launched = fixture({ loading: true, initialPause: paused });
        try {
            launched.element.duration = 30;
            launched.element.dispatchEvent(new Event('loadedmetadata'));
            launched.flushStart();
            assert.equal(launched.element.paused, true);
            assert.equal(launched.view().resume, true);
            launched.runtime.toggle();
            assert.equal(launched.element.paused, false);
        } finally { launched.runtime.dispose(); }
    });
    await check('media playback: stops clamp without repeated seeking; release continues locally', async () => {
        const f = fixture();
        try {
            f.flushStart();
            assert.equal(f.element.paused, false);
            f.element.advance(10.2);
            assert.equal(f.element.currentTime, 10);
            assert.equal(f.element.paused, true);
            assert.equal(f.view().boundary, 0);
            f.runtime.sync();
            assert.ok(f.element.seekCount <= 1);
            // Browsers may round a sought timestamp; that must not release a stop.
            f.element._time = 9.999;
            f.element.dispatchEvent(new Event('seeked'));
            assert.equal(f.element.paused, true);
            assert.equal(f.view().boundary, 0);
            f.element._time = 10;
            f.runtime.sync();
            f.release(1);
            assert.equal(f.element.currentTime, 10);
            assert.equal(f.element.paused, false);
            f.element.advance(20.1);
            assert.equal(f.element.currentTime, 20);
            assert.equal(f.view().boundary, 1);
            f.release(2);
            assert.equal(f.view().complete, false);
            f.element.finish();
            assert.equal(f.view().complete, true);
            f.runtime.seek(5);
            assert.equal(f.element.currentTime, 5);
        } finally { f.runtime.dispose(); }
    });
    await check('media playback: slow clients pass released stops; seek and speed remain locked', async () => {
        const f = fixture({ released: 1 });
        try {
            f.flushStart();
            f.element.advance(12);
            assert.equal(f.element.paused, false);
            f.element.currentTime = 25;
            assert.equal(f.element.currentTime, 12);
            f.element.currentTime = 2;
            assert.equal(f.element.currentTime, 12);
            f.element.playbackRate = 2;
            f.element.dispatchEvent(new Event('ratechange'));
            assert.equal(f.element.playbackRate, 1);
            f.runtime.seek(3);
            assert.equal(f.element.currentTime, 12);
            f.element._time = 20.2;
            f.nextTimer();
            assert.equal(f.element.currentTime, 20);
            assert.equal(f.element.paused, true);
        } finally { f.runtime.dispose(); }
    });
    await check('media playback: buzz pause survives host releases and refresh', async () => {
        const f = fixture();
        f.flushStart();
        f.element.advance(8);
        f.runtime.buzzPause();
        f.release(1);
        assert.equal(f.element.paused, true);
        f.runtime.dispose();
        const restored = fixture({ released: 1, storage: f.storage });
        try {
            restored.flushStart();
            assert.equal(restored.element.currentTime, 8);
            assert.equal(restored.element.paused, true);
            assert.equal(restored.view().resume, true);
            restored.runtime.toggle();
            assert.equal(restored.element.paused, false);
            restored.element.advance(20);
            restored.runtime.buzzPause();
            restored.release(2);
            assert.equal(restored.element.paused, true);
            assert.equal(restored.view().resume, true);
        } finally { restored.runtime.dispose(); }
    });
    await check('media playback: autoplay rejection, foreground correction, reveal and cleanup', async () => {
        const f = fixture({ blocked: true });
        try {
            f.flushStart();
            await Promise.resolve();
            assert.equal(f.view().resume, true);
            f.element.blocked = false;
            f.runtime.toggle();
            f.element._time = 11;
            f.document.dispatchEvent(new Event('visibilitychange'));
            assert.equal(f.element.currentTime, 10);
            f.release(1);
            f.latest.current.stopped = true;
            f.runtime.sync();
            assert.equal(f.element.paused, true);
            f.runtime.toggle();
            assert.equal(f.element.paused, true);
        } finally { f.runtime.dispose(); }
        assert.equal(f.timers.size, 0);
        const waiting = fixture({ session: '' });
        try { waiting.runtime.toggle(); assert.equal(waiting.element.paused, true); } finally { waiting.runtime.dispose(); }
    });
    await check('media playback: completion restores per client; previews stay unrestricted', async () => {
        const f = fixture({ released: 2 });
        f.flushStart();
        f.element.finish();
        f.runtime.dispose();
        const restored = fixture({ released: 2, storage: f.storage });
        const fresh = fixture({ released: 2 });
        const preview = fixture({ gated: false, session: '' });
        try {
            assert.equal(restored.view().complete, true);
            assert.equal(fresh.view().complete, false);
            assert.equal(fresh.element.currentTime, 0);
            assert.equal(preview.view().complete, true);
            preview.runtime.seek(22);
            assert.equal(preview.element.currentTime, 22);
        } finally { restored.runtime.dispose(); fresh.runtime.dispose(); preview.runtime.dispose(); }
    });
}
