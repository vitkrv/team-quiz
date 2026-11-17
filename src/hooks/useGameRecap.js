import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { loadRecapScores } from '../services/resultHistory';
import { appId, db } from '../firebase';

export default function useGameRecap(gameId, enabled) {
    const [loadedSummary, setSummary] = useState(null);
    const summary = loadedSummary?.gameId === gameId ? loadedSummary.data : null;
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [loadedScores, setScores] = useState(null);
    const scores = loadedScores?.gameId === gameId ? loadedScores.entries : null;
    const [scoresError, setScoresError] = useState(false);
    useEffect(() => {
        setSummary(null); setError(false);
        if (!enabled || !gameId) return undefined;
        return onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', gameId, 'recap', 'summary'), { includeMetadataChanges: true }, (snapshot) => {
            // Only a committed summary can establish a complete score checkpoint.
            if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
            if (snapshot.exists()) { setSummary({ gameId, data: snapshot.data() }); setError(false); }
            else setError(true);
        }, () => setError(true));
    }, [gameId, enabled, attempt]);
    const sequence = summary?.sequence;
    useEffect(() => {
        let active = true;
        setScoresError(false);
        if (!enabled || !gameId || !Number.isSafeInteger(sequence)) return undefined;
        loadRecapScores(gameId, sequence).then((entries) => { if (active) setScores({ gameId, entries }); })
            .catch(() => { if (active) setScoresError(true); });
        return () => { active = false; };
    }, [gameId, enabled, sequence, attempt]);
    return { summary, error, scores, scoresError, retry: () => setAttempt((v) => v + 1) };
}
