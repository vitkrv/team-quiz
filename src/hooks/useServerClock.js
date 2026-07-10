import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore';
import { appId, db } from '../firebase';

const CLOCK_SYNC_SAMPLE_COUNT = 5;
const CLOCK_RESYNC_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CLOCK_SYNC_DELAY_MS = 750;

const getTimestampMillis = (value) => (
    value && typeof value.toMillis === 'function'
        ? value.toMillis()
        : null
);

export default function useServerClock(userId) {
    const [offsetMs, setOffsetMs] = useState(0);
    const [ready, setReady] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState(null);
    const offsetRef = useRef(0);
    const syncPromiseRef = useRef(null);
    const lastSyncStartedAtRef = useRef(0);

    const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

    const syncClock = useCallback(async ({ minIntervalMs = 0 } = {}) => {
        if (!db || !userId) return null;
        if (minIntervalMs > 0 && Date.now() - lastSyncStartedAtRef.current < minIntervalMs) {
            return offsetRef.current;
        }
        if (syncPromiseRef.current) return syncPromiseRef.current;

        lastSyncStartedAtRef.current = Date.now();
        syncPromiseRef.current = (async () => {
            const syncRef = doc(db, 'artifacts', appId, 'users', userId, 'clockSync', 'current');
            const samples = [];

            for (let index = 0; index < CLOCK_SYNC_SAMPLE_COUNT; index += 1) {
                const clientStartMs = Date.now();
                const sampleId = `${clientStartMs}:${index}`;

                await setDoc(syncRef, {
                    clientSentAt: clientStartMs,
                    sampleId,
                    serverReceivedAt: serverTimestamp()
                });

                const clientEndMs = Date.now();
                const snapshot = await getDocFromServer(syncRef);
                const serverReceivedAtMs = getTimestampMillis(snapshot.data()?.serverReceivedAt);
                const actualRoundTripMs = clientEndMs - clientStartMs;
                const effectiveRoundTripMs = Math.min(actualRoundTripMs, MAX_CLOCK_SYNC_DELAY_MS);

                if (serverReceivedAtMs) {
                    samples.push({
                        offsetMs: serverReceivedAtMs - (clientStartMs + (effectiveRoundTripMs / 2)),
                        roundTripMs: actualRoundTripMs
                    });
                }
            }

            const bestSample = samples.sort((a, b) => a.roundTripMs - b.roundTripMs)[0];
            if (!bestSample) return null;

            offsetRef.current = bestSample.offsetMs;
            setOffsetMs(bestSample.offsetMs);
            setReady(true);
            setLastSyncedAt(Date.now());
            return bestSample.offsetMs;
        })();

        try {
            return await syncPromiseRef.current;
        } catch (err) {
            if (import.meta.env.DEV) {
                console.warn('Server clock sync failed; falling back to local clock.', err);
            }
            return null;
        } finally {
            syncPromiseRef.current = null;
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) {
            offsetRef.current = 0;
            lastSyncStartedAtRef.current = 0;
            setOffsetMs(0);
            setReady(false);
            setLastSyncedAt(null);
            return undefined;
        }

        syncClock();

        const intervalId = window.setInterval(syncClock, CLOCK_RESYNC_INTERVAL_MS);
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                syncClock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [syncClock, userId]);

    return {
        offsetMs,
        ready,
        lastSyncedAt,
        serverNow,
        syncClock
    };
}
