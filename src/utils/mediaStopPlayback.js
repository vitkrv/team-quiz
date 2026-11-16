import { getMediaStops } from './mediaStops.js';

// Only a pre-launch pause belongs to the first launch of the same question.
export const carryMediaPause = (previous, scope, session) => Boolean(previous?.scope === scope
    && (previous.session === session || (!previous.session && session)) && previous.localPause);

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
    let playGeneration = 0;
    let playPending = false;
    let mutedFallback = false;
    let loading = Number.isFinite(element.readyState) && element.readyState < 3;
    let error = null;
    let readinessRetry = false;
    let retriedReadiness = false;
    element.muted = false;
    const released = () => Math.min(points.length, Math.max(0, latest.current.playback?.releasedStopCount || 0));
    const limit = () => points[released()] ?? element.duration;
    const authorized = () => !gated || Boolean(session && latest.current.playback?.sessionId === session);
    const freeControls = () => complete && (!gated || latest.current.allowReplay !== false);
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
        if (disposed) return;
        onView({ time: lastTime, duration: Number.isFinite(element.duration) ? element.duration : media.durationSeconds,
            complete, playing, resume, boundary, localPause, muted: mutedFallback, error, loading });
        latest.current.onStop?.(boundary);
    };
    const pause = () => {
        playGeneration += 1;
        playPending = false;
        if (!element.paused) { internalPause = true; element.pause(); }
        playing = false;
    };
    const play = () => {
        if (disposed || latest.current.stopped || !authorized() || (complete && !freeControls()) || (!complete && (localPause || lastTime >= limit()))) return;
        const delay = gated ? (latest.current.playback?.startedAt || 0) - Date.now() : 0;
        if (delay > 0) {
            environment.clearTimeout(launchTimer);
            launchTimer = environment.setTimeout(play, delay);
            return;
        }
        if (playPending) return;
        const generation = ++playGeneration;
        playPending = true;
        resume = false;
        error = null;
        const failed = (failure) => {
            if (disposed || generation !== playGeneration) return;
            playPending = false;
            const name = failure?.name;
            console.info('Media playback', { category: name || 'unknown', muted: mutedFallback });
            if (name === 'NotAllowedError' && media.kind === 'video' && !mutedFallback) {
                mutedFallback = true;
                element.muted = true;
                play();
                return;
            }
            error = name === 'NotAllowedError' ? 'blocked'
                : name === 'AbortError' ? 'interrupted'
                    : name === 'NotSupportedError' ? 'unsupported' : 'network';
            readinessRetry = error === 'interrupted' && !retriedReadiness;
            loading = false;
            resume = true;
            paint();
        };
        try {
            Promise.resolve(element.play()).then(() => {
                if (disposed || generation !== playGeneration) return;
                playPending = false;
                error = null;
                paint();
            }, failed);
        } catch (failure) { failed(failure); }
        paint();
    };
    const check = () => {
        environment.clearTimeout(timer);
        if (!initialized) return;
        if (!freeControls() && element.playbackRate !== 1) element.playbackRate = 1;
        if (latest.current.stopped || !authorized() || (complete && !freeControls())) { pause(); paint(); return; }
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
        if (!gated || freeControls()) return;
        if (internalTarget !== null && Math.abs(element.currentTime - internalTarget) < 0.005) return;
        seek(lastTime);
    };
    const seeked = () => { internalTarget = null; check(); };
    const played = () => {
        if (complete && (!freeControls() || latest.current.stopped)) { pause(); return; }
        if (!complete && (!authorized() || latest.current.stopped || localPause || lastTime >= limit())) { pause(); return; }
        playing = true;
        resume = false;
        check();
    };
    const paused = () => {
        playGeneration += 1;
        playPending = false;
        playing = false;
        if (internalPause) internalPause = false;
        else if (!complete && !element.ended && boundary === null && authorized() && !latest.current.stopped) { localPause = true; resume = true; }
        persist(true);
        paint();
    };
    const ended = () => {
        playGeneration += 1;
        playPending = false;
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
    const ready = () => {
        loading = false;
        initialize();
        paint();
        if (!readinessRetry || localPause || latest.current.stopped) return;
        readinessRetry = false;
        retriedReadiness = true;
        play();
    };
    const mediaError = () => {
        if (disposed) return;
        pause();
        loading = false;
        error = element.error?.code === 4 || element.error?.code === 3 ? 'unsupported' : 'network';
        resume = true;
        console.info('Media playback', { category: error, code: element.error?.code });
        paint();
    };
    const waiting = () => { loading = true; check(); paint(); };
    const playingEvent = () => { loading = false; check(); };
    const events = { loadedmetadata: initialize, durationchange: initialize, timeupdate: check, seeking, seeked,
        play: played, pause: paused, ended, ratechange: check, waiting, playing: playingEvent,
        canplay: ready, error: mediaError };
    Object.entries(events).forEach(([name, listener]) => element.addEventListener(name, listener));
    environment.document.addEventListener('visibilitychange', visibility);
    environment.window.addEventListener('pagehide', visibility);
    const controls = {
        sync: check,
        buzzPause: () => { localPause = true; resume = true; pause(); persist(true); paint(); },
        unmute: () => {
            if (latest.current.stopped || !authorized() || (complete && !freeControls())) return;
            element.muted = false;
            mutedFallback = false;
            localPause = false;
            // Call play inside the gesture, including when iOS pauses on unmute.
            if (boundary === null && !complete) play();
            paint();
        },
        toggle: () => {
            if (latest.current.stopped || (complete && !freeControls())) return;
            if (complete && !element.paused) pause();
            else { localPause = false; resume = false; if (complete && element.ended) seek(0); play(); persist(true); }
            paint();
        },
        seek: (time) => { if (freeControls() && !latest.current.stopped) { seek(time); persist(true); paint(); } }
    };
    paint();
    initialize();
    controls.dispose = () => {
        persist(true);
        disposed = true;
        playGeneration += 1;
        environment.clearTimeout(timer);
        environment.clearTimeout(launchTimer);
        Object.entries(events).forEach(([name, listener]) => element.removeEventListener(name, listener));
        environment.document.removeEventListener('visibilitychange', visibility);
        environment.window.removeEventListener('pagehide', visibility);
        element.pause();
    };
    return controls;
}
