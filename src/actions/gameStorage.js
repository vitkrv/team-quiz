import { prepareBuzzerLifecycle } from './buzzerState';
import { prepareRecap } from './gameRecap';
import { hasPendingSurpriseAward, isCurrentGame } from '../utils/wheelPolicy';
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
    const writeBuzzer = await prepareBuzzerLifecycle(transaction, roomRef, room, update, readRoomPack);
    const project = await prepareRecap(transaction, roomRef, room, update, readRoomPack);
    if (project === null) return false;
    writeBuzzer();
    project();
    const { history, ...fields } = update;
    if (history?.length) {
        if (room.dataVersion === 2) appendHistory(transaction, roomRef, history);
        else fields.history = arrayUnion(...history);
    }
    if (Object.keys(fields).length) transaction.update(roomRef, fields);
}

// Rules may reject a stale score before the SDK retries a conflicted transaction.
// Retry only when a server read proves that the room changed since our last read.
export async function runRoomTransaction(roomRef, action) {
    for (let attempt = 0; ; attempt++) {
        let readState;
        try {
            return await runTransaction(roomRef.firestore, async (transaction) => {
                const room = (await transaction.get(roomRef)).data();
                readState = JSON.stringify(room);
                return action(transaction, room);
            });
        } catch (error) {
            if (error.code !== 'permission-denied' || attempt >= 2 || readState === undefined) throw error;
            const current = (await getDocFromServer(roomRef)).data();
            if (JSON.stringify(current) === readState) throw error;
        }
    }
}

export async function updateRoom(roomRef, update) {
    if (!update.history) return updateDoc(roomRef, update);
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (!room) throw new Error('Room no longer exists');
        if (room.dataVersion === 2 && room.hostId === update.history[0]?.actorId) {
            // A score-editor batch can filter its first no-op event. Any persisted
            // event proves this atomic operation already committed.
            const existing = await Promise.all(update.history.map((event) => transaction.get(doc(roomRef, 'history', event.id))));
            if (existing.some((snapshot) => snapshot.exists())) return;
        }
        const next = { ...update, history: update.history.map((e) => ({ ...e, details: { ...e.details } })) };
        const event = next.history[0];
        const d = event.details;
        if (room.status === 'finished') return;
        if (isCurrentGame(room)) {
            const hostAction = /^(surprise_)?answer_(correct|incorrect)$/.test(event.type)
                || ['question_skipped', 'board_resumed', 'score_set', 'score_adjusted'].includes(event.type);
            if (hostAction && event.actorId !== room.hostId) return;
            if (hostAction && !['score_set', 'score_adjusted'].includes(event.type) && room.status !== 'playing') return;
            if (event.type === 'board_resumed' && (!d.questionId || room.activeQuestionId !== d.questionId
                || !room.answerRevealed || hasPendingSurpriseAward(room))) return;
            // These writes must use the dedicated lifecycle actions.
            if (['surprise_wheel_rolled', 'surprise_wheel_scored'].includes(event.type)) return;
        }
        if (event.type === 'player_buzzed_early' && d.questionId && room.activeQuestionId !== d.questionId) return;
        if (/^(surprise_)?answer_(correct|incorrect)$/.test(event.type)) {
            if (room.activeQuestionId !== d.questionId || room.answerRevealed) return;
            const playerId = event.type.startsWith('surprise_') ? room.surpriseRound?.answererId : room.buzzedPlayerId;
            if (!playerId || playerId !== d.playerId || !room.players[playerId] || room.players[playerId].isHost) return;
            if (isCurrentGame(room)) {
                const pack = await readRoomPack(transaction, roomRef, room);
                const question = pack.categories.flatMap((category) => category.questions).find((q) => q.id === d.questionId);
                if (!question || Boolean(question.isSurpriseQuestion) !== event.type.startsWith('surprise_')) return;
                if (!question.isSurpriseQuestion) {
                    const points = Number(question.points) || 0;
                    d.points = event.type === 'answer_correct' ? points : room.trueCompetitiveMode ? -points : 0;
                    next[`players.${playerId}.score`] = (Number(room.players[playerId].score) || 0) + d.points;
                }
            }
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
                const existing = await Promise.all(update.history.map((item) => getDocFromServer(doc(roomRef, 'history', item.id))));
                if (existing.some((snapshot) => snapshot.exists() && snapshot.data().actorId === event.actorId)) return;
                if (event.type === 'board_resumed' && room.activeQuestionId !== event.details.questionId) return;
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
