const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];
const ACTIONABLE_ERRORS = new Set(['permission-denied', 'unauthenticated', 'invalid-argument', 'failed-precondition', 'unimplemented']);
const confirmed = (snapshot) => !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;

// readServer uses an independent server RPC, not another watch listener.
export function createRoomSubscription({ subscribe, readServer, publish, environment = globalThis }) {
    const { document, navigator, window, setTimeout, clearTimeout, setInterval, clearInterval, Date } = environment;
    let disposed = false;
    let liveUnsubscribe;
    let liveGeneration = 0;
    let liveSequence = 0;
    let lastConfirmedAt = Date.now();
    let retryTimer;
    let warningTimer;
    let resumeTimer;
    let probeCleanup;
    let outstandingProbe = false;
    let lastSnapshot = null;
    let lastProbeAt = -Infinity;
    let attempt = 0;
    let blocked = false;
    let exhausted = false;
    let recovering = false;
    let recoveryStartedAt = Date.now();
    const active = () => !disposed;
    const foreground = () => !document.hidden && navigator.onLine !== false;
    const log = (event, trigger, code = null) => console.info('Room subscription', {
        event, trigger, attempt, elapsedMs: Date.now() - recoveryStartedAt, errorCode: code
    });
    const cancelProbe = () => { probeCleanup?.(); probeCleanup = null; };
    const waitForConfirmation = () => {
        if (warningTimer || recovering) return;
        recoveryStartedAt = Date.now();
        warningTimer = setTimeout(() => {
            warningTimer = null;
            recovering = true;
            publish({ status: 'reconnecting' });
            log('reconnecting', 'server-confirmation');
        }, 5000);
    };
    const fail = (code, trigger) => {
        if (!active()) return;
        if (!recovering && !warningTimer) recoveryStartedAt = Date.now();
        clearTimeout(warningTimer); warningTimer = null;
        recovering = true;
        blocked = ACTIONABLE_ERRORS.has(code);
        publish({ status: blocked ? 'blocked' : 'failed', errorCode: code });
        log('failed', trigger, code);
        if (blocked) {
            clearTimeout(retryTimer); retryTimer = null;
            cancelProbe();
            return;
        }
        if (retryTimer || exhausted) return;
        if (attempt >= RETRY_DELAYS.length) { exhausted = true; return; }
        if (!foreground()) return;
        retryTimer = setTimeout(() => {
            retryTimer = null;
            if (!foreground()) return;
            attempt += 1;
            recover('retry', true);
        }, RETRY_DELAYS[attempt]);
    };
    const attachLive = () => {
        liveUnsubscribe?.();
        const subscription = ++liveGeneration;
        liveUnsubscribe = subscribe((snapshot) => {
            if (!active() || subscription !== liveGeneration) return;
            liveSequence += 1;
            // A replacement listener may initially replay an older cache entry.
            if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites
                && lastSnapshot && confirmed(lastSnapshot)) {
                waitForConfirmation();
                return;
            }
            lastSnapshot = snapshot;
            publish({ snapshot });
            if (confirmed(snapshot)) {
                lastConfirmedAt = Date.now();
                clearTimeout(warningTimer); warningTimer = null;
                clearTimeout(retryTimer); retryTimer = null;
                cancelProbe();
                if (recovering) log('recovered', 'live-listener');
                recovering = false; blocked = false; exhausted = false; attempt = 0;
                publish({ status: 'synced', errorCode: null });
            } else if (snapshot.metadata.fromCache) {
                waitForConfirmation();
            }
        }, (error) => {
            if (!active() || subscription !== liveGeneration) return;
            liveUnsubscribe = null;
            fail(error.code || 'unknown', 'live-listener');
        });
    };
    const startProbe = (trigger) => {
        if (outstandingProbe) return;
        outstandingProbe = true;
        lastProbeAt = Date.now();
        const sequence = liveSequence;
        let done = false;
        const timeout = setTimeout(() => {
            cancelProbe();
            fail('deadline-exceeded', trigger);
        }, 15000);
        // RPCs cannot be cancelled. Keep the slot occupied until settlement,
        // even after timeout/disposal, and ignore superseded results.
        probeCleanup = () => { done = true; clearTimeout(timeout); };
        Promise.resolve().then(readServer).then((snapshot) => {
            if (!active() || done) return;
            cancelProbe();
            lastConfirmedAt = Date.now();
            if (sequence !== liveSequence || lastSnapshot?.metadata.hasPendingWrites) return;
            const changed = !lastSnapshot || snapshot.exists() !== lastSnapshot.exists()
                || JSON.stringify(snapshot.data()) !== JSON.stringify(lastSnapshot.data());
            lastSnapshot = snapshot;
            publish({ snapshot });
            log(changed ? 'missed-state' : 'fresh', trigger);
            if (changed || !liveUnsubscribe) attachLive();
            else {
                clearTimeout(warningTimer); warningTimer = null;
                clearTimeout(retryTimer); retryTimer = null;
                recovering = false; attempt = 0; exhausted = false;
                publish({ status: 'synced', errorCode: null });
            }
        }, (error) => {
            if (!active() || done) return;
            cancelProbe();
            fail(error.code || 'unknown', trigger);
        }).finally(() => { outstandingProbe = false; });
    };
    function recover(trigger, replace = false) {
        if (!active() || !foreground() || blocked || exhausted) return;
        if (probeCleanup && !replace) return;
        if (replace) cancelProbe();
        if (replace) log('reconnecting', trigger);
        if (replace || !liveUnsubscribe) attachLive();
        startProbe(trigger);
    }
    const resume = (event) => {
        if (!foreground() || blocked || resumeTimer) return;
        resumeTimer = setTimeout(() => {
            resumeTimer = null;
            if (!foreground()) return;
            clearTimeout(retryTimer); retryTimer = null;
            attempt = 0; exhausted = false; recoveryStartedAt = Date.now();
            if (recovering || !liveUnsubscribe || Date.now() - Math.max(lastConfirmedAt, lastProbeAt) >= 30000) {
                recover(event.type, recovering || !liveUnsubscribe);
            }
        }, 250);
    };
    const reconnect = () => {
        clearTimeout(retryTimer); retryTimer = null;
        blocked = false; exhausted = false; attempt = 0;
        recovering = true; recoveryStartedAt = Date.now();
        publish({ status: 'reconnecting', errorCode: null });
        log('reconnecting', 'manual');
        recover('manual', true);
    };
    publish({ snapshot: null, status: 'connecting', errorCode: null });
    waitForConfirmation();
    attachLive();
    const interval = setInterval(() => {
        if (!retryTimer && Date.now() - Math.max(lastConfirmedAt, lastProbeAt) >= 30000) recover('fallback');
    }, 1000);
    document.addEventListener('visibilitychange', resume);
    for (const type of ['focus', 'online', 'pageshow']) window.addEventListener(type, resume);
    const dispose = () => {
        disposed = true;
        liveUnsubscribe?.();
        cancelProbe();
        clearInterval(interval);
        clearTimeout(retryTimer);
        clearTimeout(warningTimer);
        clearTimeout(resumeTimer);
        document.removeEventListener('visibilitychange', resume);
        for (const type of ['focus', 'online', 'pageshow']) window.removeEventListener(type, resume);
    };
    return { reconnect, dispose };
}
