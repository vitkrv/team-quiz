import { useEffect, useRef, useState } from 'react';
import { createReversalWatcher, subscribePlayerScoreHistory } from '../services/playerScoreHistory';
import { SCORE_HISTORY_WINDOW_MS, supportsScoreHistory } from '../utils/scoreHistory';

export default function usePlayerScoreHistory(roomRef, room, playerId, selectedIds = []) {
    const [cutoff] = useState(() => Date.now() - SCORE_HISTORY_WINDOW_MS);
    const [records, setRecords] = useState([]);
    const enabled = supportsScoreHistory(room);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState(false);
    const [statuses, setStatuses] = useState({});
    const [statusError, setStatusError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const watchers = useRef(null);
    const items = enabled ? records : [];

    useEffect(() => {
        if (!enabled) return undefined;
        setRecords([]); setLoading(true); setError(false);
        return subscribePlayerScoreHistory(roomRef, playerId, cutoff,
            (entries) => { setRecords(entries); setLoading(false); setError(false); },
            () => { setError(true); setLoading(false); });
    }, [roomRef, enabled, playerId, cutoff, attempt]);

    useEffect(() => {
        setStatuses({}); setStatusError(false);
        if (!enabled) return undefined;
        const watcher = createReversalWatcher(roomRef,
            (id, value) => setStatuses((previous) => ({ ...previous, [id]: value })),
            () => setStatusError(true));
        watchers.current = watcher;
        return () => { watcher.stop(); watchers.current = null; };
    }, [roomRef, enabled, playerId, attempt]);

    const watchedIds = JSON.stringify([...new Set([...items.map((item) => item.id), ...selectedIds])].sort());
    useEffect(() => {
        watchers.current?.update(JSON.parse(watchedIds));
    }, [roomRef, enabled, playerId, watchedIds, attempt]);

    return {
        items,
        enabled,
        reversed: (id) => statuses[id],
        loading: enabled && (loading || items.some((item) => statuses[item.id] === undefined)),
        error: error || statusError,
        retry: () => setAttempt((value) => value + 1)
    };
}
