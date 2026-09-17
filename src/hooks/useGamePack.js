import { useEffect, useState } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { appId, db } from '../firebase';

export default function useGamePack(room, gameId) {
    const needsPack = room.dataVersion === 2 && room.status !== 'lobby' && room.status !== 'finished';
    const key = needsPack ? `${gameId}/${room.packVersionId}` : null;
    const [loaded, setLoaded] = useState(null);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!key) return undefined;
        let active = true;
        const load = async () => {
            try {
                if (!room.packVersionId) throw new Error('Missing pack version');
                const snapshot = await getDocFromServer(doc(db, 'artifacts', appId, 'public', 'data', 'gamePackVersions', room.packVersionId));
                if (!snapshot.exists() || snapshot.data().gameId !== gameId) throw new Error('Missing game pack');
                if (active) setLoaded({ key, content: snapshot.data().content });
            } catch (error) {
                if (active) setLoaded({ key, error });
            }
        };
        load();
        return () => { active = false; };
    }, [key, gameId, room.packVersionId, attempt]);

    const current = loaded?.key === key ? loaded : null;
    return {
        pack: room.dataVersion !== 2 ? room.pack : needsPack ? current?.content : room.packSummary,
        loading: needsPack && !current,
        error: needsPack && current?.error,
        retry: () => { setLoaded(null); setAttempt((value) => value + 1); }
    };
}
