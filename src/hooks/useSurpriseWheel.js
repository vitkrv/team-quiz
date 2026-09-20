import { useEffect, useState } from 'react';
import { completeSurpriseWheel } from '../actions/gameActions';
import { timestampMillis } from '../utils/buzzerPolicy';
import { WHEEL_ANIMATION_MS } from '../utils/wheelPolicy';

export default function useSurpriseWheel({ roomRef, round, questionId, actorId, actorName, canComplete, serverNow, clockReady, t }) {
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    const spinId = round?.spinId;
    const applied = Boolean(round?.scoreAppliedAt);
    const startedAt = timestampMillis(round?.rolledAt);
    useEffect(() => {
        setError(false);
        if (!canComplete || !spinId || applied || !startedAt || !clockReady) return undefined;
        let disposed = false;
        let timer;
        let running = false;
        const attempt = async () => {
            if (disposed || running) return;
            window.clearTimeout(timer);
            const remaining = startedAt + WHEEL_ANIMATION_MS - serverNow();
            if (remaining > 0 || !navigator.onLine) {
                timer = window.setTimeout(attempt, Math.max(1000, remaining));
                return;
            }
            running = true;
            let retryNeeded = true;
            try {
                const outcome = await completeSurpriseWheel(roomRef, questionId, spinId,
                    { id: actorId, name: actorName }, t, serverNow);
                retryNeeded = outcome === 'not-ready';
                if (!disposed) setError(false);
            } catch {
                if (!disposed) setError(true);
            } finally {
                running = false;
                if (!disposed && retryNeeded) timer = window.setTimeout(attempt, 2000);
            }
        };
        attempt();
        window.addEventListener('online', attempt);
        document.addEventListener('visibilitychange', attempt);
        return () => {
            disposed = true;
            window.clearTimeout(timer);
            window.removeEventListener('online', attempt);
            document.removeEventListener('visibilitychange', attempt);
        };
    }, [roomRef, questionId, spinId, applied, startedAt, canComplete, actorId, actorName, serverNow, clockReady, t, retry]);
    return { error, retry: () => setRetry((value) => value + 1) };
}
