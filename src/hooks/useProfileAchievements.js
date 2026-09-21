import { useEffect, useState } from 'react';
import { collection, getDocsFromServer } from 'firebase/firestore';
import { appId, db } from '../firebase';

export default function useProfileAchievements(userId) {
    const [result, setResult] = useState(null);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        getDocsFromServer(collection(db, 'artifacts', appId, 'users', userId, 'gameAchievements'))
            .then((snapshot) => {
                if (active) setResult({ userId, records: snapshot.docs.map((record) => ({ ...record.data(), gameId: record.id })) });
            })
            .catch((error) => {
                if (active) setResult({ userId, error });
            });
        return () => { active = false; };
    }, [userId, attempt]);

    const current = result?.userId === userId ? result : null;
    return {
        records: current?.records,
        loading: !current,
        error: current?.error,
        retry: () => { setResult(null); setAttempt((value) => value + 1); }
    };
}
