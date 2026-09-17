import { arrayUnion, collection, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

export const getPackSummary = (pack) => ({ name: pack.name || '', iconEmoji: pack.iconEmoji || '' });
export const packVersionRef = (roomRef, versionId) => doc(roomRef.parent.parent, 'gamePackVersions', versionId);

export function appendHistory(writer, roomRef, events) {
    events.forEach((event) => writer.set(doc(collection(roomRef, 'history'), event.id), {
        ...event,
        recordedAt: serverTimestamp()
    }));
}

// Call only after all transaction reads. Legacy rooms retain their embedded array.
export function updateRoomInTransaction(transaction, roomRef, room, update) {
    const { history, ...fields } = update;
    if (history?.length) {
        if (room.dataVersion === 2) appendHistory(transaction, roomRef, history);
        else fields.history = arrayUnion(...history);
    }
    transaction.update(roomRef, fields);
}

export async function updateRoom(roomRef, update) {
    if (!update.history) return updateDoc(roomRef, update);
    return runTransaction(roomRef.firestore, async (transaction) => {
        const snapshot = await transaction.get(roomRef);
        if (!snapshot.exists()) throw new Error('Room no longer exists');
        updateRoomInTransaction(transaction, roomRef, snapshot.data(), update);
    });
}

export async function readRoomPack(transaction, roomRef, room) {
    if (room.dataVersion !== 2) return room.pack;
    if (!room.packVersionId) throw new Error('Game pack is not pinned');
    const snapshot = await transaction.get(packVersionRef(roomRef, room.packVersionId));
    if (!snapshot.exists()) throw new Error('Game pack is unavailable');
    return snapshot.data().content;
}
