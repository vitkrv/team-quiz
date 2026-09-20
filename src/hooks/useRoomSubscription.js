import { useCallback, useEffect, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];
const ACTIONABLE_ERRORS = new Set(['permission-denied', 'unauthenticated', 'invalid-argument', 'failed-precondition', 'unimplemented']);
const confirmed = (snapshot) => !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
const EMPTY = { snapshot: null, status: 'connecting', errorCode: null };

export default function useRoomSubscription(roomRef, userId) {
    const [state, setState] = useState(EMPTY);
    const generation = useRef(0);
    const reconnectRef = useRef(null);
    const reconnect = useCallback(() => reconnectRef.current?.(), []);

    useEffect(() => {
        const session = ++generation.current;
        if (!roomRef || !userId) return undefined;
        let disposed = false;
        let liveUnsubscribe;
        let liveGeneration = 0;
        let liveSequence = 0;
        let lastConfirmedAt = 0;
        let retryTimer;
        let warningTimer;
        let resumeTimer;
        let probeCleanup;
        let attempt = 0;
        let blocked = false;
        let exhausted = false;
        let recovering = false;
        let recoveryStartedAt = Date.now();
        const active = () => !disposed && generation.current === session;
        const foreground = () => !document.hidden && navigator.onLine !== false;
        const publish = (update) => {
            if (active()) setState((previous) => ({
                ...(previous.roomRef === roomRef && previous.userId === userId ? previous : EMPTY),
                roomRef, userId, ...update
            }));
        };
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
            liveUnsubscribe = onSnapshot(roomRef, { includeMetadataChanges: true }, (snapshot) => {
                if (!active() || subscription !== liveGeneration) return;
                liveSequence += 1;
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
            if (probeCleanup) return;
            const sequence = liveSequence;
            let done = false;
            let unsubscribe;
            const timeout = setTimeout(() => {
                cancelProbe();
                fail('deadline-exceeded', trigger);
            }, 15000);
            probeCleanup = () => { done = true; clearTimeout(timeout); unsubscribe?.(); };
            unsubscribe = onSnapshot(roomRef, { includeMetadataChanges: true }, (snapshot) => {
                if (!active() || done || !confirmed(snapshot)) return;
                cancelProbe();
                lastConfirmedAt = Date.now();
                if (sequence === liveSequence) publish({ snapshot });
                // A probe confirms this read, never the health of the live listener.
                if (!liveUnsubscribe) attachLive();
            }, (error) => {
                if (!active() || done) return;
                cancelProbe();
                fail(error.code || 'unknown', trigger);
            });
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
                recover(event.type, recovering || !liveUnsubscribe);
            }, 250);
        };
        reconnectRef.current = () => {
            clearTimeout(retryTimer); retryTimer = null;
            blocked = false; exhausted = false; attempt = 0;
            recovering = true; recoveryStartedAt = Date.now();
            publish({ status: 'reconnecting', errorCode: null });
            log('reconnecting', 'manual');
            recover('manual', true);
        };
        publish(EMPTY);
        waitForConfirmation();
        attachLive();
        const interval = setInterval(() => {
            if (!retryTimer && Date.now() - lastConfirmedAt >= 5000) recover('fallback');
        }, 10000);
        document.addEventListener('visibilitychange', resume);
        for (const type of ['focus', 'online', 'pageshow']) window.addEventListener(type, resume);
        return () => {
            disposed = true;
            reconnectRef.current = null;
            liveUnsubscribe?.();
            cancelProbe();
            clearInterval(interval);
            clearTimeout(retryTimer);
            clearTimeout(warningTimer);
            clearTimeout(resumeTimer);
            document.removeEventListener('visibilitychange', resume);
            for (const type of ['focus', 'online', 'pageshow']) window.removeEventListener(type, resume);
        };
    }, [roomRef, userId]);

    const current = state.roomRef === roomRef && state.userId === userId ? state : EMPTY;
    return { snapshot: current.snapshot, status: current.status, errorCode: current.errorCode, reconnect };
}
