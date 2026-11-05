import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import useGameHistory from './useGameHistory';
import { compareHistoryEvents, reversalEventId, selectPlayerScoreHistory } from '../utils/scoreHistory';

export default function usePlayerScoreHistory(roomRef, room, playerId) {
    const history = useGameHistory(roomRef.id, room.dataVersion === 2);
    const [statuses, setStatuses] = useState({});
    const [statusError, setStatusError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const items = useMemo(() => {
        const source = room.dataVersion === 2 ? history.items
            : [...(room.history || [])].sort(compareHistoryEvents);
        return selectPlayerScoreHistory(source, playerId);
    }, [room.dataVersion, room.history, history.items, playerId]);

    useEffect(() => {
        if (room.dataVersion === 2 && items.length < 3 && history.hasMore && !history.loading && !history.error) history.loadMore();
    }, [room.dataVersion, items.length, history]);

    useEffect(() => {
        let active = true;
        const unsubscribe = [];
        setStatuses({});
        setStatusError(false);
        if (room.dataVersion !== 2) return undefined;
        Promise.all(items.map(async (item) => {
            const id = await reversalEventId(item.id);
            if (!active) return;
            unsubscribe.push(onSnapshot(doc(roomRef, 'history', id), { includeMetadataChanges: true }, (snapshot) => {
                if (!active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
                setStatuses((previous) => ({ ...previous, [item.id]: snapshot.exists() }));
            }, () => { if (active) setStatusError(true); }));
        })).catch(() => { if (active) setStatusError(true); });
        return () => { active = false; unsubscribe.forEach((stop) => stop()); };
    }, [roomRef, room.dataVersion, items, attempt]);

    const legacyReversed = new Set((room.history || []).filter((e) => e.type === 'score_reverted').map((e) => e.details?.revertsEventId));
    return {
        items,
        reversed: (id) => room.dataVersion === 2 ? statuses[id] : legacyReversed.has(id),
        loading: room.dataVersion === 2 && (history.loading || items.some((item) => statuses[item.id] === undefined)),
        error: history.error || statusError,
        retry: () => { history.retry(); setAttempt((value) => value + 1); }
    };
}
