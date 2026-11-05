import { collection, doc, documentId, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { reversalEventId } from '../utils/scoreHistory.js';

export function playerScoreHistoryQuery(roomRef, playerId, cutoff) {
    return query(collection(roomRef, 'history'), where('details.playerId', '==', playerId),
        where('details.isScoreChange', '==', true), where('recordedAt', '>=', Timestamp.fromMillis(cutoff)),
        orderBy('recordedAt', 'desc'), orderBy('details.batchIndex', 'desc'), orderBy(documentId(), 'desc'), limit(3));
}

export function subscribePlayerScoreHistory(roomRef, playerId, cutoff, publish, failed, listen = onSnapshot) {
    let active = true;
    const stop = listen(playerScoreHistoryQuery(roomRef, playerId, cutoff), { includeMetadataChanges: true }, (snapshot) => {
        if (!active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        publish(snapshot.docs.map((item) => ({ ...item.data(), id: item.id })));
    }, (error) => { if (active) failed(error); });
    return () => { active = false; stop(); };
}

export function createReversalWatcher(roomRef, publish, failed, listen = onSnapshot) {
    const entries = new Map();
    const remove = (id, entry) => { entry.active = false; entry.stop?.(); entries.delete(id); publish(id, undefined); };
    return {
        update(ids) {
            const wanted = new Set(ids);
            for (const [id, entry] of entries) if (!wanted.has(id)) remove(id, entry);
            for (const id of wanted) {
                if (entries.has(id)) continue;
                const entry = { active: true };
                entries.set(id, entry);
                reversalEventId(id).then((reverseId) => {
                    if (!entry.active) return;
                    entry.stop = listen(doc(roomRef, 'history', reverseId), { includeMetadataChanges: true }, (snapshot) => {
                        if (!entry.active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
                        publish(id, snapshot.exists());
                    }, (error) => { if (entry.active) failed(error); });
                }).catch((error) => { if (entry.active) failed(error); });
            }
        },
        stop() {
            for (const [id, entry] of entries) {
                entry.active = false; entry.stop?.(); entries.delete(id);
            }
        }
    };
}
