import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { buzzerRef } from '../actions/buzzerState';
import { finalizeBuzz, recordEarlyBuzz, submitBuzz } from '../actions/buzzerActions';
import { generateId } from '../utils/ids';
import { buzzInputState, collectionDeadline, createReactionOrigin, EARLY_BUZZ_DELAY_MS, personalUnlockAt } from '../utils/buzzerPolicy';

const readOrigin = (key) => {
    try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
};
const storeOrigin = (key, value) => {
    try { localStorage.setItem(key, String(value)); } catch { /* In-memory clock still works. */ }
};
const BUZZ_SYNC_RETRY_MS = 500;
const BUZZ_SYNC_MAX_RETRIES = 3;

export default function useBuzzer({ room, roomRef, uid, isHost, isSpectator, serverNow, resumedQuestion }) {
    const enabled = room.buzzerPolicyVersion === 1;
    const [race, setRace] = useState(null);
    const [now, setNow] = useState(serverNow);
    const [online, setOnline] = useState(navigator.onLine);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const [syncError, setSyncError] = useState(null);
    const [outcome, setOutcome] = useState(null);
    const [origin, setOrigin] = useState(null);
    const [localPenalty, setLocalPenalty] = useState(0);
    const busy = useRef(false);
    const firstRace = useRef(room.buzzerRoundId);
    const key = `cortex-rush:buzz-origin:${roomRef.id}:${room.buzzerRoundId}:${uid}`;
    const activeKey = useRef(key);
    activeKey.current = key;

    useEffect(() => {
        if (!enabled) return undefined;
        let disposed = false;
        let generation = 0;
        let retries = 0;
        let retryTimer;
        let unsubscribe;
        setSyncError(null);
        setRace(null);

        const subscribe = () => {
            const subscription = ++generation;
            const active = () => !disposed && subscription === generation;
            const failed = (failure) => {
                if (!active()) return;
                generation += 1;
                unsubscribe?.();
                unsubscribe = undefined;
                // Do not enable input using race state from a failed listener.
                setRace(null);
                if (retries >= BUZZ_SYNC_MAX_RETRIES) {
                    setSyncError('buzzSyncFailed');
                    console.error('Buzzer synchronization failed after 3 retries.', failure);
                    return;
                }
                retryTimer = setTimeout(() => {
                    retryTimer = undefined;
                    if (disposed) return;
                    retries += 1;
                    subscribe();
                }, BUZZ_SYNC_RETRY_MS);
            };
            try {
                const cleanup = onSnapshot(buzzerRef(roomRef), { includeMetadataChanges: true }, (snapshot) => {
                    if (!active()) return;
                    // Cached snapshots must not reset consecutive failed retries.
                    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
                        retries = 0;
                        setSyncError(null);
                    }
                    // Pending local timestamps cannot start a race or announce a result.
                    if (!snapshot.metadata.hasPendingWrites) setRace(snapshot.data() || null);
                }, failed);
                if (active()) unsubscribe = cleanup;
                else cleanup();
            } catch (failure) { failed(failure); }
        };
        subscribe();
        return () => {
            disposed = true;
            generation += 1;
            clearTimeout(retryTimer);
            unsubscribe?.();
        };
    }, [enabled, roomRef]);

    useEffect(() => {
        if (!enabled) return undefined;
        const tick = () => { setNow(serverNow()); setOnline(navigator.onLine); };
        const interval = setInterval(tick, 50);
        window.addEventListener('online', tick);
        window.addEventListener('offline', tick);
        return () => { clearInterval(interval); window.removeEventListener('online', tick); window.removeEventListener('offline', tick); };
    }, [enabled, serverNow]);

    useLayoutEffect(() => {
        setLocalPenalty(0); setError(null); setOutcome(null); setPending(false); busy.current = false; setOrigin(null);
    }, [key]);

    const current = race?.raceId === room.buzzerRoundId && race?.questionId === room.activeQuestionId ? race : null;
    const unlockAt = Math.max(personalUnlockAt(current, uid), localPenalty);
    const eligible = enabled && current && room.status === 'playing' && !room.answerRevealed && !room.buzzedPlayerId
        && !isHost && !isSpectator && room.players[uid]?.isHost === false && !(room.incorrectBuzzedIds || []).includes(uid)
        && !['collection-closed', 'race-ended', 'ineligible'].includes(outcome);
    const submitted = outcome === 'accepted' || outcome === 'already-submitted' || Boolean(current?.attempts[uid]);
    useEffect(() => {
        if (current?.attempts[uid]) setError((previous) => previous === 'buzzNotAccepted' ? null : previous);
    }, [current, uid]);
    const { unlocked, canClick, collecting, collectionClosed } = buzzInputState({
        race: current, uid, eligible, online, pending, submitted, competitive: room.trueCompetitiveMode,
        localPenalty, now, monotonicNow: performance.now(), origin: origin?.key === key ? origin.monotonic : null
    });

    useLayoutEffect(() => {
        if (!unlocked || !canClick || origin?.key === key) return;
        const saved = readOrigin(key);
        const fallback = resumedQuestion && firstRace.current === room.buzzerRoundId;
        const clock = createReactionOrigin({ savedAt: saved, fallbackAt: fallback ? unlockAt : 0,
            wallNow: Date.now(), serverNow: serverNow(), monotonicNow: performance.now() });
        setOrigin({ key, monotonic: clock.monotonic });
        storeOrigin(key, clock.wall);
    }, [unlocked, canClick, origin, key, resumedQuestion, room.buzzerRoundId, unlockAt, serverNow]);

    useEffect(() => {
        if (!enabled || !isHost || current?.phase !== 'collecting' || room.answerRevealed || room.status !== 'playing') return undefined;
        let disposed = false;
        let running = false;
        const resolve = async () => {
            if (disposed || running || !navigator.onLine || serverNow() < collectionDeadline(current)) return;
            running = true;
            try { await finalizeBuzz(roomRef, current.raceId, uid); if (!disposed) setError(null); }
            catch { if (!disposed) setError('buzzResolveFailed'); }
            finally { running = false; }
        };
        const timer = setInterval(resolve, 500);
        window.addEventListener('online', resolve);
        window.addEventListener('focus', resolve);
        resolve();
        return () => { disposed = true; clearInterval(timer); window.removeEventListener('online', resolve); window.removeEventListener('focus', resolve); };
    }, [enabled, isHost, current, room.answerRevealed, room.status, roomRef, uid, serverNow]);

    const press = async () => {
        if (!canClick || busy.current) return 'ignored';
        busy.current = true; setPending(true); setError(null); setOutcome(null);
        const raceId = current.raceId;
        const operationId = generateId();
        const early = !unlocked;
        // Capture before the first await. Network delay/retries never change ranking.
        const reactionMs = Math.max(0, performance.now() - (origin?.monotonic ?? performance.now()));
        if (early) setLocalPenalty(personalUnlockAt(current, uid) + EARLY_BUZZ_DELAY_MS);
        try {
            if (early) {
                const accepted = await recordEarlyBuzz(roomRef, raceId, uid, operationId);
                if (!accepted && activeKey.current === key) setLocalPenalty(0);
                return accepted ? 'early' : 'ignored';
            }
            const result = await submitBuzz(roomRef, raceId, uid, reactionMs, operationId, serverNow);
            if (activeKey.current === key) setOutcome(result);
            return result;
        } catch {
            if (activeKey.current === key) {
                setError('buzzNotAccepted');
                if (early) setLocalPenalty(0);
            }
            return 'rejected';
        } finally { if (activeKey.current === key) { busy.current = false; setPending(false); } }
    };

    const visibleError = syncError || error;
    const status = visibleError || (room.buzzedPlayerId || room.answerRevealed || room.status !== 'playing' ? null
        : pending ? 'buzzSubmitting'
        : outcome === 'collection-closed' ? 'buzzArrivedTooLate'
        : outcome === 'race-ended' ? 'buzzRaceEnded'
        : outcome === 'ineligible' ? 'buzzIneligible'
        : submitted && !room.buzzedPlayerId && collecting ? 'buzzSubmitted'
        : collecting && collectionClosed ? (canClick ? 'buzzGracePeriod' : 'buzzWaitingHost')
        : collecting && canClick && unlocked ? 'buzzCollectingOpen'
        : collecting ? 'buzzCollecting'
        : canClick && unlocked ? 'buzzReady' : null);

    return { enabled, race: current, unlocked, canClick, press, pending, error: visibleError, status, online,
        penalized: Boolean(localPenalty || current?.penalties[uid]) && now < unlockAt,
        collecting,
        waitingForHost: collecting && collectionClosed };
}
