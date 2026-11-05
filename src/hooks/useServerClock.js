import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore';
import { appId, db } from '../firebase';
import { createServerClock } from '../utils/serverClock';

const EMPTY = { offsetMs: 0, ready: false, roundTripMs: null, lastSyncedAt: null };
const syncRef = (userId) => doc(db, 'artifacts', appId, 'users', userId, 'clockSync', 'current');

export default function useServerClock(userId, { enabled }) {
    const [state, setState] = useState(EMPTY);
    const controller = useRef(null);
    const currentUser = useRef(userId);
    currentUser.current = userId;
    const serverNow = useCallback(() => {
        const value = controller.current?.snapshot();
        return Date.now() + (value && value.userId === currentUser.current ? value.offsetMs : 0);
    }, []);
    const syncClock = useCallback(() => controller.current?.request('game-transition') ?? Promise.resolve(null), []);

    useEffect(() => {
        // Retain the controller across cleanup/restart so an unresolved write
        // cannot overlap a new batch, including during StrictMode effect replay.
        if (!controller.current) controller.current = createServerClock({
            writeSample: (id, sample) => setDoc(syncRef(id), { ...sample, serverReceivedAt: serverTimestamp() }),
            readSample: async (id) => {
                const data = (await getDocFromServer(syncRef(id))).data();
                return { sampleId: data?.sampleId, serverReceivedAtMs: data?.serverReceivedAt?.toMillis?.() };
            },
            onChange: setState,
            diagnose: (event) => { if (import.meta.env.DEV) console.info('Server clock calibration', event); }
        });
        const clock = controller.current;
        const refresh = (event) => clock.setContext({ userId, enabled: Boolean(db && enabled),
            visible: !document.hidden, online: navigator.onLine !== false }, event?.type || 'mount');
        refresh();
        document.addEventListener('visibilitychange', refresh);
        for (const type of ['online', 'offline', 'pageshow']) window.addEventListener(type, refresh);
        return () => {
            clock.setContext({ enabled: false });
            document.removeEventListener('visibilitychange', refresh);
            for (const type of ['online', 'offline', 'pageshow']) window.removeEventListener(type, refresh);
        };
    }, [userId, enabled]);

    return { ...(state.userId === userId ? state : EMPTY), serverNow, syncClock };
}
