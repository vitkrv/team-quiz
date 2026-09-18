import { prepareRecap } from './gameRecap';
import { arrayUnion, collection, doc, getDocFromServer, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

export const getPackSummary = (pack) => ({ name: pack.name || '', iconEmoji: pack.iconEmoji || '' });
export const packVersionRef = (roomRef, versionId) => doc(roomRef.parent.parent, 'gamePackVersions', versionId);

export function appendHistory(writer, roomRef, events) {
    events.forEach((event) => writer.set(doc(collection(roomRef, 'history'), event.id), {
        ...event,
        recordedAt: serverTimestamp()
    }));
}

// Await this before any other writes: recap projection may need additional reads.
export async function updateRoomInTransaction(transaction, roomRef, room, update) {
    const project = await prepareRecap(transaction, roomRef, room, update, readRoomPack);
    if (project === null) return false;
    project();
    const { history, ...fields } = update;
    if (history?.length) {
        if (room.dataVersion === 2) appendHistory(transaction, roomRef, history);
        else fields.history = arrayUnion(...history);
    }
    if (Object.keys(fields).length) transaction.update(roomRef, fields);
}

export async function updateRoom(roomRef, update) {
    if (!update.history) return updateDoc(roomRef, update);
    return runTransaction(roomRef.firestore, async (transaction) => {
        const snapshot = await transaction.get(roomRef);
        if (!snapshot.exists()) throw new Error('Room no longer exists');
        const room = snapshot.data();
        if (room.dataVersion === 2 && room.hostId === update.history[0]?.actorId) {
            const existing = await transaction.get(doc(roomRef, 'history', update.history[0].id));
            if (existing.exists()) return;
        }
        const next = { ...update, history: update.history.map((e) => ({ ...e, details: { ...e.details } })) };
        const event = next.history[0];
        const d = event.details;
        if (room.status === 'finished') return;
        if (event.type === 'player_buzzed_early' && d.questionId && room.activeQuestionId !== d.questionId) return;
        if (/^(surprise_)?answer_(correct|incorrect)$/.test(event.type)) {
            if (room.activeQuestionId !== d.questionId || room.answerRevealed) return;
            const playerId = event.type.startsWith('surprise_') ? room.surpriseRound?.answererId : room.buzzedPlayerId;
            if (playerId !== d.playerId) return;
        }
        if (event.type === 'question_skipped' && (room.activeQuestionId !== d.questionId || room.answerRevealed)) return;
        if (event.type === 'surprise_wheel_rolled' && (room.activeQuestionId !== d.questionId || room.surpriseRound?.rollResult != null)) return;
        if (event.type === 'surprise_wheel_scored' && (room.activeQuestionId !== d.questionId || room.surpriseRound?.scoreAppliedAt
            || room.surpriseRound?.rolledAt !== d.rolledAt || room.surpriseRound?.rollResult !== d.points)) return;
        for (const item of next.history) {
            if (['score_adjusted', 'score_set'].includes(item.type)) {
                const id = item.details.playerId;
                if (id && room.players[id]) {
                    const before = Number(room.players[id].score) || 0;
                    const after = item.type === 'score_set' ? item.details.nextScore : before + item.details.delta;
                    next[`players.${id}.score`] = after;
                    Object.assign(item.details, { previousScore: before, nextScore: after, delta: after - before });
                }
            }
        }
        next.history = next.history.filter((item) => !['score_set', 'score_adjusted'].includes(item.type) || item.details.delta !== 0);
        if (!next.history.length) return;
        await updateRoomInTransaction(transaction, roomRef, room, next);
    }).catch(async (error) => {
        // A competing commit can make an immutable event a forbidden update before
        // Firestore retries the transaction. Confirm our operation already committed.
        if (error.code === 'permission-denied') {
            const room = (await getDocFromServer(roomRef)).data();
            const event = update.history[0];
            if (room?.dataVersion === 2 && room.hostId === event?.actorId) {
                const existing = await getDocFromServer(doc(roomRef, 'history', event.id));
                if (existing.exists() && existing.data().actorId === event.actorId) return;
                if (/^(surprise_)?answer_(correct|incorrect)$/.test(event.type)
                    && (room.activeQuestionId !== event.details.questionId || room.answerRevealed
                        || (event.type.startsWith('surprise_') ? room.surpriseRound?.answererId : room.buzzedPlayerId) !== event.details.playerId)) return;
            }
            if (event?.type === 'player_buzzed_early' && room?.activeQuestionId === event.details.questionId) {
                const recap = await getDocFromServer(doc(roomRef, 'recap', 'summary'));
                if (recap.data()?.players[event.actorId]?.lastEarlyQuestionId === event.details.questionId) return;
            }
        }
        throw error;
    });
}

export async function readRoomPack(transaction, roomRef, room) {
    if (room.dataVersion !== 2) return room.pack;
    if (!room.packVersionId) throw new Error('Game pack is not pinned');
    const snapshot = await transaction.get(packVersionRef(roomRef, room.packVersionId));
    if (!snapshot.exists()) throw new Error('Game pack is unavailable');
    return snapshot.data().content;
}
