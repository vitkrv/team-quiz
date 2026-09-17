import { useEffect, useRef, useState } from 'react';
import { collection, doc, documentId, getDocsFromServer, limit, onSnapshot, orderBy, query, startAfter } from 'firebase/firestore';
import { appId, db } from '../firebase';

const PAGE_SIZE = 50;

export default function useGameHistory(gameId, enabled) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const session = useRef(null);

    useEffect(() => {
        if (!enabled) return undefined;
        const state = { active: true, events: new Map(), cursor: null, busy: false };
        session.current = state;
        setItems([]);
        setLoading(true);
        setError(false);
        setHasMore(false);
        const history = collection(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', gameId), 'history');
        state.base = query(history, orderBy('recordedAt', 'desc'), orderBy(documentId(), 'desc'));
        state.merge = (snapshot) => {
            snapshot.docs.forEach((item) => state.events.set(item.id, { ...item.data(), id: item.id }));
            setItems([...state.events.values()].sort((a, b) => {
                const time = (b.recordedAt?.seconds || 0) - (a.recordedAt?.seconds || 0)
                    || (b.recordedAt?.nanoseconds || 0) - (a.recordedAt?.nanoseconds || 0);
                return time || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
            }));
        };
        const unsubscribe = onSnapshot(query(state.base, limit(PAGE_SIZE)), { includeMetadataChanges: true }, (snapshot) => {
            if (!state.active || snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
            state.merge(snapshot);
            if (!state.cursor) {
                state.cursor = snapshot.docs.at(-1) || null;
                setHasMore(snapshot.size === PAGE_SIZE);
            }
            if (!state.busy) setLoading(false);
        }, () => { if (state.active) { setError(true); setLoading(false); } });
        return () => { state.active = false; unsubscribe(); };
    }, [gameId, enabled, attempt]);

    const loadMore = async () => {
        const state = session.current;
        if (!state?.active || !state.cursor || state.busy) return;
        state.busy = true;
        setLoading(true);
        setError(false);
        try {
            const snapshot = await getDocsFromServer(query(state.base, startAfter(state.cursor), limit(PAGE_SIZE)));
            if (!state.active) return;
            state.merge(snapshot);
            state.cursor = snapshot.docs.at(-1) || state.cursor;
            setHasMore(snapshot.size === PAGE_SIZE);
        } catch {
            if (state.active) setError(true);
        } finally {
            state.busy = false;
            if (state.active) setLoading(false);
        }
    };
    return { items, loading, error, hasMore, loadMore, retry: () => setAttempt((value) => value + 1) };
}
