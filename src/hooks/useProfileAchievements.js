import { useEffect, useState } from 'react';
import { loadProfileAchievements } from '../services/resultHistory';

export default function useProfileAchievements(userId) {
    const [result, setResult] = useState(null);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        loadProfileAchievements(userId)
            .then((records) => {
                if (active) setResult({ userId, records });
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
