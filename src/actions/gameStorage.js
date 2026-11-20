import { getAllQuestions, isRoundComplete } from '../utils/packRounds';
import { prepareBuzzerLifecycle } from './buzzerState';
import { prepareRecap } from './gameRecap';
import { isCurrentGame } from '../utils/wheelPolicy';
import { getTransitionBlockReason, isAnswerJudgment, projectAnswerScore } from '../utils/gameTransitionPolicy';
import { gameplayDiagnostics } from '../utils/gameplayDiagnostics';
import { scoreHistoryChange } from '../utils/scoreHistory';
import { arrayUnion, collection, doc, getDocFromServer, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

export const getPackSummary = (pack) => ({ name: pack.name || '', iconEmoji: pack.iconEmoji || '' });
export const packVersionRef = (roomRef, versionId) => doc(roomRef.parent.parent, 'gamePackVersions', versionId);

export function appendHistory(writer, roomRef, events) {
    events.forEach((event) => writer.set(doc(collection(roomRef, 'history'), event.id), {
        ...event,
        details: { ...event.details, isScoreChange: Boolean(scoreHistoryChange(event)),
            batchIndex: Number.isSafeInteger(event.details?.batchIndex) && event.details.batchIndex >= 0 ? event.details.batchIndex : 0 },
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

// Rules or the Emulator may reject a stale score/version before the SDK retries
// a conflicted transaction. Retry only after proving the room changed.
// Retry only when a server read proves that the room changed since our last read.
export async function runRoomTransaction(roomRef, action, trace) {
    if (!trace) return gameplayDiagnostics.trace((record) => runRoomTransaction(roomRef, action, record));
    let sdkAttempt = 0;
    for (let attempt = 0; ; attempt++) {
        let readState;
        try {
            return await runTransaction(roomRef.firestore, async (transaction) => {
                trace(sdkAttempt++ ? 'transaction_retried' : 'transaction_started');
                const room = (await transaction.get(roomRef)).data();
                readState = JSON.stringify(room);
                return action(transaction, room);
            });
        } catch (error) {
            if (!['permission-denied', 'failed-precondition'].includes(error.code) || attempt >= 2 || readState === undefined) throw error;
            const current = (await getDocFromServer(roomRef)).data();
            if (JSON.stringify(current) === readState) throw error;
            trace(error.code === 'permission-denied' ? 'permission_retry' : 'version_retry', 'room_changed');
        }
    }
}

export async function updateRoom(roomRef, update) {
    return gameplayDiagnostics.trace((trace) => updateRoomWithTrace(roomRef, update, trace), update.history?.[0]?.type || 'room_update');
}

async function updateRoomWithTrace(roomRef, update, trace) {
    const skip = (reason) => { trace('skipped', reason); };
    if (!update.history) return updateDoc(roomRef, update);
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (!room) throw new Error('Room no longer exists');
        if (room.dataVersion === 2 && room.hostId === update.history[0]?.actorId) {
            // A score-editor batch can filter its first no-op event. Any persisted
            // event proves this atomic operation already committed.
            const existing = await Promise.all(update.history.map((event) => transaction.get(doc(roomRef, 'history', event.id))));
            if (existing.some((snapshot) => snapshot.exists())) return skip('already_applied');
        }
        const next = { ...update, history: update.history.map((e) => ({ ...e, details: { ...e.details } })) };
        const event = next.history[0];
        const d = event.details;
        const reason = getTransitionBlockReason(room, event);
        if (reason) return skip(reason);
        if (isAnswerJudgment(event.type) && isCurrentGame(room)) {
            const pack = await readRoomPack(transaction, roomRef, room);
            const question = getAllQuestions(pack).find((q) => q.id === d.questionId);
            const projection = projectAnswerScore(room, event, question);
            if (projection.reason) return skip(projection.reason);
            if (projection.score) {
                const { playerId, delta, total } = projection.score;
                d.points = delta;
                next[`players.${playerId}.score`] = total;
            }
        }
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
        if (event.type === 'board_resumed' && room.roundCount > 1) {
            const pack = await readRoomPack(transaction, roomRef, room);
            if (room.currentRoundIndex < room.roundCount - 1 && isRoundComplete(pack, room.currentRoundIndex, room.questionStates)) {
                next.status = 'round_break';
                next.history.push({ ...event, id: event.id + '_round', type: 'round_completed',
                    details: { actorName: event.actorName, round: room.currentRoundIndex + 1 } });
            }
        }
        next.history = next.history.filter((item) => !['score_set', 'score_adjusted'].includes(item.type) || item.details.delta !== 0);
        if (!next.history.length) return skip('no_score_change');
        const result = await updateRoomInTransaction(transaction, roomRef, room, next);
        if (result === false) skip('recap_rejected');
    }, trace).catch(async (error) => {
        // A competing commit can make an immutable event a forbidden update before
        // Firestore retries the transaction. Confirm our operation already committed.
        if (error.code === 'permission-denied') {
            const room = (await getDocFromServer(roomRef)).data();
            const event = update.history[0];
            if (room?.dataVersion === 2 && room.hostId === event?.actorId) {
                const existing = await Promise.all(update.history.map((item) => getDocFromServer(doc(roomRef, 'history', item.id))));
                if (existing.some((snapshot) => snapshot.exists() && snapshot.data().actorId === event.actorId)) return skip('already_applied');
                if (event.type === 'board_resumed' && room.activeQuestionId !== event.details.questionId) return skip('question_changed');
                if (/^(surprise_)?answer_(correct|incorrect)$/.test(event.type)
                    && (room.activeQuestionId !== event.details.questionId || room.answerRevealed
                        || (event.type.startsWith('surprise_') ? room.surpriseRound?.answererId : room.buzzedPlayerId) !== event.details.playerId)) return skip('judgment_superseded');
            }
            if (event?.type === 'player_buzzed_early' && room?.activeQuestionId === event.details.questionId) {
                const recap = await getDocFromServer(doc(roomRef, 'recap', 'summary'));
                if (recap.data()?.players[event.actorId]?.lastEarlyQuestionId === event.details.questionId) return skip('early_buzz_already_applied');
            }
        }
        throw error;
    });
}

const packReads = new WeakMap();
export async function readRoomPack(transaction, roomRef, room) {
    if (room.dataVersion !== 2) return room.pack;
    if (!room.packVersionId) throw new Error('Game pack is not pinned');
    // The SDK creates a new transaction object for each retry. Never share a
    // read across attempts or use a non-transactional application cache here.
    let reads = packReads.get(transaction);
    if (!reads) { reads = new Map(); packReads.set(transaction, reads); }
    const ref = packVersionRef(roomRef, room.packVersionId);
    if (!reads.has(ref.path)) reads.set(ref.path, transaction.get(ref));
    const snapshot = await reads.get(ref.path);
    if (!snapshot.exists()) throw new Error('Game pack is unavailable');
    return snapshot.data().content;
}
