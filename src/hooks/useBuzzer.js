import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { buzzerRef } from '../actions/buzzerState';
import { finalizeBuzz, recordEarlyBuzz, submitBuzz } from '../actions/buzzerActions';
import { generateId } from '../utils/ids';
import { collectionDeadline, createReactionOrigin, EARLY_BUZZ_DELAY_MS, personalUnlockAt } from '../utils/buzzerPolicy';

const readOrigin = (key) => {
    try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
};
const storeOrigin = (key, value) => {
    try { localStorage.setItem(key, String(value)); } catch { /* In-memory clock still works. */ }
};

export default function useBuzzer({ room, roomRef, uid, isHost, isSpectator, serverNow, resumedQuestion }) {
    const enabled = room.buzzerPolicyVersion === 1;
    const [race, setRace] = useState(null);
    const [now, setNow] = useState(serverNow);
    const [online, setOnline] = useState(navigator.onLine);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const [localPenalty, setLocalPenalty] = useState(0);
    const busy = useRef(false);
    const origin = useRef(null);
    const firstRace = useRef(room.buzzerRoundId);
    const key = `cortex-rush:buzz-origin:${roomRef.id}:${room.buzzerRoundId}:${uid}`;
    const activeKey = useRef(key);
    activeKey.current = key;

    useEffect(() => {
        if (!enabled) return undefined;
        return onSnapshot(buzzerRef(roomRef), { includeMetadataChanges: true }, (snapshot) => {
            // Pending local server timestamps must never start a race or announce a result.
            if (!snapshot.metadata.hasPendingWrites) setRace(snapshot.data() || null);
        }, () => setError('buzzSyncFailed'));
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
        setLocalPenalty(0); setError(null); setPending(false); busy.current = false; origin.current = null;
    }, [key]);

    const current = race?.raceId === room.buzzerRoundId && race?.questionId === room.activeQuestionId ? race : null;
    const unlockAt = Math.max(personalUnlockAt(current, uid), localPenalty);
    const eligible = enabled && current && room.status === 'playing' && !room.answerRevealed && !room.buzzedPlayerId
        && !isHost && !isSpectator && room.players[uid]?.isHost === false && !(room.incorrectBuzzedIds || []).includes(uid);
    const open = Boolean(eligible && current.phase === 'open' && !current.attempts[uid]);
    const unlocked = Boolean(open && now >= unlockAt);
    const canClick = Boolean(open && online && !pending && (unlocked || (room.trueCompetitiveMode && !current.penalties[uid] && !localPenalty)));

    useLayoutEffect(() => {
        if (!unlocked || origin.current?.key === key) return;
        const saved = readOrigin(key);
        const fallback = resumedQuestion && firstRace.current === room.buzzerRoundId;
        const clock = createReactionOrigin({ savedAt: saved, fallbackAt: fallback ? unlockAt : 0,
            wallNow: Date.now(), serverNow: serverNow(), monotonicNow: performance.now() });
        origin.current = { key, monotonic: clock.monotonic };
        storeOrigin(key, clock.wall);
    }, [unlocked, key, resumedQuestion, room.buzzerRoundId, unlockAt, serverNow]);

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
        busy.current = true; setPending(true); setError(null);
        const raceId = current.raceId;
        const operationId = generateId();
        const early = !unlocked;
        // Capture before the first await. Network delay/retries never change ranking.
        const reactionMs = Math.max(0, performance.now() - (origin.current?.monotonic ?? performance.now()));
        if (early) setLocalPenalty(personalUnlockAt(current, uid) + EARLY_BUZZ_DELAY_MS);
        try {
            const accepted = early ? await recordEarlyBuzz(roomRef, raceId, uid, operationId)
                : await submitBuzz(roomRef, raceId, uid, reactionMs, operationId);
            if (!accepted && !early && activeKey.current === key) setError('buzzNotAccepted');
            return early ? 'early' : accepted ? 'accepted' : 'rejected';
        } catch {
            if (activeKey.current === key) {
                setError('buzzNotAccepted');
                if (early) setLocalPenalty(0);
            }
            return 'rejected';
        } finally { if (activeKey.current === key) { busy.current = false; setPending(false); } }
    };

    return { enabled, race: current, unlocked, canClick, press, pending, error, online,
        penalized: Boolean(localPenalty || current?.penalties[uid]) && now < unlockAt,
        collecting: current?.phase === 'collecting',
        waitingForHost: current?.phase === 'collecting' && now >= collectionDeadline(current) };
}
