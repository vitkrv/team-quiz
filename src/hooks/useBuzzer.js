import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useRoomSubscription from './useRoomSubscription';
import useDeadlineClock from './useDeadlineClock';
import { buzzerRef } from '../actions/buzzerState';
import { finalizeBuzz, recordEarlyBuzz, submitBuzz } from '../actions/buzzerActions';
import { generateId } from '../utils/ids';
import { buzzInputState, collectionDeadline, createReactionOrigin, BUZZ_LOCAL_GRACE_MS, EARLY_BUZZ_DELAY_MS, personalUnlockAt } from '../utils/buzzerPolicy';

const readOrigin = (key) => {
    try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
};
const storeOrigin = (key, value) => {
    try { localStorage.setItem(key, String(value)); } catch { /* In-memory clock still works. */ }
};

export default function useBuzzer({ room, roomRef, uid, isHost, isSpectator, serverNow, resumedQuestion, clockSyncKey }) {
    const enabled = room.buzzerPolicyVersion === 1 && !room.textAnswerRound;
    const raceRef = useMemo(() => enabled ? buzzerRef(roomRef) : null, [enabled, roomRef]);
    const sync = useRoomSubscription(raceRef, uid, { probeIdle: false, recoveryGroup: roomRef.path });
    const race = sync.snapshot && !sync.snapshot.metadata.hasPendingWrites && sync.status === 'synced' ? sync.data : null;
    const syncError = ['failed', 'blocked'].includes(sync.status) ? 'buzzSyncFailed' : null;
    const [online, setOnline] = useState(navigator.onLine);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const [outcome, setOutcome] = useState(null);
    const [origin, setOrigin] = useState(null);
    const [localPenalty, setLocalPenalty] = useState(0);
    const busy = useRef(false);
    const firstRace = useRef(room.buzzerRoundId);
    const key = `cortex-rush:buzz-origin:${roomRef.id}:${room.buzzerRoundId}:${uid}`;
    const activeKey = useRef(key);
    activeKey.current = key;

    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
    }, []);

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
    const [, wakeGrace] = useState(0);
    useEffect(() => {
        if (origin?.key !== key) return undefined;
        const remaining = origin.monotonic + BUZZ_LOCAL_GRACE_MS - performance.now();
        if (remaining <= 0) return undefined;
        const timer = setTimeout(() => wakeGrace((value) => value + 1), remaining + 1);
        return () => clearTimeout(timer);
    }, [origin, key]);
    const now = useDeadlineClock(enabled && current && !room.answerRevealed && !room.buzzedPlayerId
        ? [...(eligible ? [unlockAt] : []), ...(current.phase === 'collecting' ? [collectionDeadline(current)] : [])]
        : [], serverNow, clockSyncKey);
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
        const input = buzzInputState({ race: current, uid, eligible, online: navigator.onLine, pending, submitted,
            competitive: room.trueCompetitiveMode, localPenalty, now: serverNow(), monotonicNow: performance.now(),
            origin: origin?.key === key ? origin.monotonic : null });
        if (!input.canClick || busy.current) return 'ignored';
        busy.current = true; setPending(true); setError(null); setOutcome(null);
        const raceId = current.raceId;
        const operationId = generateId();
        const early = !input.unlocked;
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

    return { enabled, reconnect: sync.reconnect, race: current, unlocked, canClick, press, pending, error: visibleError, status, online,
        penalized: Boolean(localPenalty || current?.penalties[uid]) && now < unlockAt,
        collecting,
        waitingForHost: collecting && collectionClosed };
}
