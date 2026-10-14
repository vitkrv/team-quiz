import { getMediaStops } from './mediaStops.js';

// Event-driven playback policy, separated from React so it can be checked without a browser.
export function createMediaStopPlayback({ element, media, gated, session, storageScope, identity, latest, onView, initialPause = false, environment = globalThis }) {
    const points = getMediaStops(media);
    const key = session ? `media-stops:${storageScope}:${identity}:${session}` : '';
    let saved = {};
    try { saved = JSON.parse(environment.sessionStorage.getItem(key) || '{}') || {}; } catch { /* Storage can be unavailable. */ }
    let complete = !gated || saved.complete === true;
    let localPause = initialPause || saved.localPause === true;
    let resume = localPause;
    let lastTime = 0;
    let internalTarget = null;
    let initialized = false;
    let internalPause = false;
    let playing = false;
    let boundary = null;
    let timer;
    let launchTimer;
    let savedAt = 0;
    let disposed = false;
    const released = () => Math.min(points.length, Math.max(0, latest.current.playback?.releasedStopCount || 0));
    const limit = () => points[released()] ?? element.duration;
    const authorized = () => !gated || Boolean(session && latest.current.playback?.sessionId === session);
    const seek = (time) => {
        lastTime = time;
        if (Math.abs(element.currentTime - time) < 0.0001) return;
        internalTarget = time;
        element.currentTime = time;
    };
    const persist = (force = false) => {
        if (!key || !initialized || (!force && Date.now() - savedAt < 500)) return;
        savedAt = Date.now();
        try { environment.sessionStorage.setItem(key, JSON.stringify({ time: lastTime, complete, localPause })); } catch { /* In-memory playback still works. */ }
    };
    const paint = () => {
        if (!disposed) onView({ time: lastTime, duration: Number.isFinite(element.duration) ? element.duration : media.durationSeconds,
            complete, playing, resume, boundary, localPause });
        latest.current.onStop?.(boundary);
    };
    const pause = () => {
        if (!element.paused) { internalPause = true; element.pause(); }
        playing = false;
    };
    const play = () => {
        if (disposed || latest.current.stopped || !authorized() || (!complete && (localPause || lastTime >= limit()))) return;
        const delay = gated ? (latest.current.playback?.startedAt || 0) - Date.now() : 0;
        if (delay > 0) {
            environment.clearTimeout(launchTimer);
            launchTimer = environment.setTimeout(play, delay);
            return;
        }
        resume = false;
        element.play().catch(() => { if (!disposed) { resume = true; paint(); } });
        paint();
    };
    const check = () => {
        environment.clearTimeout(timer);
        if (!initialized) return;
        if (latest.current.stopped || !authorized()) { pause(); paint(); return; }
        if (!complete && element.playbackRate !== 1) element.playbackRate = 1;
        if (!element.seeking) lastTime = element.currentTime;
        const end = limit();
        if (!complete && released() < points.length && lastTime >= end) {
            pause();
            seek(end);
            boundary = released();
            resume = false;
        } else if (boundary !== null && (complete || released() > boundary)) {
            boundary = null;
            resume = localPause;
            if (!localPause && !resume) play();
        }
        persist();
        paint();
        if (!element.paused && !complete && Number.isFinite(end)) {
            // play() can synchronously dispatch events in embedded players as well
            // as in the non-browser harness; keep only the newest boundary timer.
            environment.clearTimeout(timer);
            timer = environment.setTimeout(check, Math.max(1, Math.min(50, (end - element.currentTime) * 1000)));
        }
    };
    const initialize = () => {
        if (initialized || !Number.isFinite(element.duration) || element.duration <= 0) return;
        initialized = true;
        // A fresh client starts at zero. A refresh cannot restore beyond permission.
        const restored = Number.isFinite(saved.time) ? Math.max(0, saved.time) : 0;
        seek(Math.min(restored, complete ? element.duration : authorized() ? limit() : 0));
        check();
        if (gated && authorized() && !complete && !localPause) {
            launchTimer = environment.setTimeout(play, Math.max(0, (latest.current.playback?.startedAt || 0) - Date.now()));
        }
    };
    const seeking = () => {
        if (!gated || complete) return;
        if (internalTarget !== null && Math.abs(element.currentTime - internalTarget) < 0.005) return;
        seek(lastTime);
    };
    const seeked = () => { internalTarget = null; check(); };
    const played = () => {
        if (!complete && (!authorized() || latest.current.stopped || localPause || lastTime >= limit())) { pause(); return; }
        playing = true;
        resume = false;
        check();
    };
    const paused = () => {
        playing = false;
        if (internalPause) internalPause = false;
        else if (!complete && !element.ended && boundary === null && authorized() && !latest.current.stopped) { localPause = true; resume = true; }
        persist(true);
        paint();
    };
    const ended = () => {
        if (authorized() && (!gated || released() === points.length) && !element.seeking) {
            complete = true;
            lastTime = element.duration;
            boundary = null;
            resume = false;
            localPause = false;
            playing = false;
            persist(true);
            paint();
        } else check();
    };
    const visibility = () => { check(); if (environment.document.visibilityState === 'hidden') persist(true); };
    const events = { loadedmetadata: initialize, durationchange: initialize, timeupdate: check, seeking, seeked,
        play: played, pause: paused, ended, ratechange: check, waiting: check, playing: check };
    Object.entries(events).forEach(([name, listener]) => element.addEventListener(name, listener));
    environment.document.addEventListener('visibilitychange', visibility);
    environment.window.addEventListener('pagehide', visibility);
    const controls = {
        sync: check,
        buzzPause: () => { localPause = true; resume = true; pause(); persist(true); paint(); },
        toggle: () => {
            if (latest.current.stopped) return;
            if (complete && !element.paused) pause();
            else { localPause = false; resume = false; if (complete && element.ended) seek(0); play(); persist(true); }
            paint();
        },
        seek: (time) => { if (complete) { seek(time); persist(true); paint(); } }
    };
    paint();
    initialize();
    controls.dispose = () => {
        persist(true);
        disposed = true;
        environment.clearTimeout(timer);
        environment.clearTimeout(launchTimer);
        Object.entries(events).forEach(([name, listener]) => element.removeEventListener(name, listener));
        environment.document.removeEventListener('visibilitychange', visibility);
        environment.window.removeEventListener('pagehide', visibility);
        element.pause();
    };
    return controls;
}
