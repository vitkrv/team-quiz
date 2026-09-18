import { useEffect, useState } from 'react';
import { collection, doc, getDocsFromServer, limit, onSnapshot, orderBy, query, startAfter } from 'firebase/firestore';
import { appId, db } from '../firebase';

export default function useGameRecap(gameId, enabled) {
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [scores, setScores] = useState(null);
    const [scoresError, setScoresError] = useState(false);
    useEffect(() => {
        setSummary(null); setError(false);
        if (!enabled || !gameId) return undefined;
        return onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', gameId, 'recap', 'summary'), (snapshot) => {
            if (snapshot.exists()) { setSummary(snapshot.data()); setError(false); }
            else setError(true);
        }, () => setError(true));
    }, [gameId, enabled, attempt]);
    useEffect(() => {
        let active = true;
        setScores(null); setScoresError(false);
        if (!enabled || !gameId || !summary) return undefined;
        const load = async () => {
            const base = collection(db, 'artifacts', appId, 'public', 'data', 'rooms', gameId, 'recapScores');
            const entries = [];
            let cursor;
            do {
                const page = await getDocsFromServer(query(base, orderBy('sequence'), ...(cursor ? [startAfter(cursor)] : []), limit(100)));
                if (!active) return;
                entries.push(...page.docs.map((d) => d.data()));
                cursor = page.size === 100 ? page.docs.at(-1) : null;
            } while (cursor);
            if (active) setScores(entries);
        };
        load().catch(() => { if (active) setScoresError(true); });
        return () => { active = false; };
    }, [gameId, enabled, summary, attempt]);
    return { summary, error, scores, scoresError, retry: () => setAttempt((v) => v + 1) };
}
