import assert from 'node:assert/strict';
import { createMediaStopPlayback } from '../src/utils/mediaStopPlayback.js';

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

function fixture({ released = 0, session = 'session', gated = true, storage = new Map(), blocked = false, initialPause = false, loading = false } = {}) {
    let serial = 0;
    const timers = new Map();
    const element = new MediaElement();
    if (loading) element.duration = NaN;
    element.blocked = blocked;
    const document = new EventTarget();
    document.visibilityState = 'visible';
    const window = new EventTarget();
    const environment = { document, window, sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, { fn, delay }); return id; }, clearTimeout: (id) => timers.delete(id) };
    const latest = { current: { playback: session ? { sessionId: session, releasedStopCount: released, startedAt: 0 } : null, stopped: false } };
    let view;
    const runtime = createMediaStopPlayback({ element, gated, session, storageScope: 'user:room:question', identity: 'file', latest,
        media: { kind: 'audio', durationSeconds: 30, stopPoints: [10, 20] }, onView: (next) => { view = next; }, initialPause, environment });
    const flushStart = () => { for (const [id, timer] of [...timers]) if (timer.delay === 0) { timers.delete(id); timer.fn(); } };
    const nextTimer = () => { const first = timers.entries().next().value; if (first) { timers.delete(first[0]); first[1].fn(); } };
    const release = (count) => { latest.current.playback.releasedStopCount = count; runtime.sync(); };
    return { element, runtime, document, latest, storage, timers, flushStart, nextTimer, release, view: () => view };
}

export async function verifyMediaPlayback(check) {
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
