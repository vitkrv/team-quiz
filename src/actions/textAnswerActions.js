import { createHistoryItem } from './gameActions';
import { appendHistory, runRoomTransaction, updateRoomInTransaction } from './gameStorage';
import { bulkTextAnswerBlockReason, textAssessmentDecision, validSignedTextPoints, moveTextAnswer, normalizeTextAnswer, projectTextAnswerScore, textAnswerBlockReason } from '../utils/textAnswerPolicy';
import { FieldPath } from 'firebase/firestore';

export async function saveTextAnswerVisibility(roomRef, sessionId, actorId, revision, showAnswers) {
    if (typeof showAnswers !== 'boolean') throw new Error('Invalid answer visibility');
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (bulkTextAnswerBlockReason(room, sessionId, actorId, revision)) return 'stale';
        transaction.update(roomRef, { 'textAnswerRound.showAnswers': showAnswers,
            'textAnswerRound.assessmentRevision': revision + 1 });
        return 'saved';
    });
}

export async function saveTextAssessment(roomRef, sessionId, actorId, revision, playerId, amount) {
    if (!validSignedTextPoints(amount)) throw new Error('Invalid points');
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (bulkTextAnswerBlockReason(room, sessionId, actorId, revision)
            || !room.textAnswerRound.playerIds.includes(playerId)) return 'stale';
        transaction.update(roomRef, { textAnswerRound: { ...room.textAnswerRound,
            draftPoints: { ...room.textAnswerRound.draftPoints, [playerId]: Number(amount) || 0 },
            assessmentPlayerId: playerId, assessmentRevision: revision + 1 } });
        return 'saved';
    });
}

export async function revealTextAssessments(roomRef, sessionId, actor, revision, t) {
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (bulkTextAnswerBlockReason(room, sessionId, actor.id, revision)) return 'stale';
        const round = room.textAnswerRound;
        const update = { textAnswerRound: { ...round, phase: 'complete', reviewIndex: round.playerIds.length,
            scoreDeltas: { ...round.draftPoints } }, answerRevealed: true,
            [`questionStates.${round.questionId}`]: 'done', mediaPlayback: null, history: [] };
        round.playerIds.forEach((playerId, index) => {
            const delta = round.draftPoints[playerId];
            const previousScore = room.players[playerId]?.score;
            const nextScore = previousScore + delta;
            if (!validSignedTextPoints(delta) || !Number.isSafeInteger(previousScore) || !Number.isSafeInteger(nextScore)) throw new Error('Invalid points');
            const decision = textAssessmentDecision(delta);
            const type = { accept: 'text_answer_accepted', deny: 'text_answer_denied', skip: 'text_answer_skipped' }[decision];
            const playerName = room.players[playerId].name;
            update[`players.${playerId}.score`] = nextScore;
            update.history.push(createHistoryItem({ id: `text_${sessionId}_${index}`, type, actorId: actor.id, actorName: actor.name,
                message: t('historyTextAnswer', { playerName, points: delta }), details: { sessionId, playerId, playerName,
                    questionId: round.questionId, reviewIndex: index, batchIndex: index, amount: Math.abs(delta),
                    points: delta, delta, previousScore, nextScore } }));
        });
        await updateRoomInTransaction(transaction, roomRef, room, update);
        // Legacy rooms retain embedded history; these bounded proof records let
        // rules validate groups of five without exceeding expression limits.
        if (room.dataVersion !== 2) appendHistory(transaction, roomRef,
            update.history.filter((_, index) => index % 5 === 4 || index === round.playerIds.length - 1));
        return 'revealed';
    });
}

export async function submitTextAnswer(roomRef, sessionId, actorId, value) {
    const answer = normalizeTextAnswer(value);
    if (answer === null) throw new Error('Invalid answer');
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (textAnswerBlockReason(room, sessionId, actorId, 'submit')) return 'stale';
        if (room.textAnswerRound.answers[actorId] === answer) return 'saved';
        transaction.update(roomRef, new FieldPath('textAnswerRound', 'answers', actorId), answer);
        return 'saved';
    });
}

export async function closeTextAnswering(roomRef, sessionId, actorId) {
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (textAnswerBlockReason(room, sessionId, actorId, 'close')) return 'stale';
        transaction.update(roomRef, { textAnswerRound: { ...room.textAnswerRound, phase: 'reviewing' } });
        return 'closed';
    });
}

export async function reorderTextAnswer(roomRef, sessionId, actorId, reviewIndex, playerId, direction, expectedOrder) {
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (textAnswerBlockReason(room, sessionId, actorId, 'reorder', reviewIndex)) return 'stale';
        const order = moveTextAnswer(room.textAnswerRound, playerId, direction, expectedOrder);
        if (!order) return 'stale';
        transaction.update(roomRef, { 'textAnswerRound.playerIds': order });
        return 'reordered';
    });
}

export async function revealTextAnswer(roomRef, sessionId, actorId, reviewIndex, expectedPlayerId) {
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (textAnswerBlockReason(room, sessionId, actorId, 'reveal', reviewIndex)) return 'stale';
        if (expectedPlayerId !== undefined && room.textAnswerRound.playerIds[reviewIndex] !== expectedPlayerId) return 'stale';
        transaction.update(roomRef, { textAnswerRound: { ...room.textAnswerRound, answerVisible: true } });
        return 'revealed';
    });
}

export async function judgeTextAnswer(roomRef, sessionId, actor, reviewIndex, decision, amount, t, expectedPlayerId) {
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (textAnswerBlockReason(room, sessionId, actor.id, 'judge', reviewIndex)) return 'stale';
        const round = room.textAnswerRound;
        const playerId = round.playerIds[reviewIndex];
        if (expectedPlayerId !== undefined && playerId !== expectedPlayerId) return 'stale';
        const score = projectTextAnswerScore(room, playerId, decision, decision === 'skip' ? 0 : amount);
        if (!score) throw new Error('Invalid points');
        const type = { accept: 'text_answer_accepted', deny: 'text_answer_denied', skip: 'text_answer_skipped' }[decision];
        const complete = reviewIndex + 1 === round.playerIds.length;
        const playerName = room.players[playerId].name;
        const update = {
            textAnswerRound: { ...round, phase: complete ? 'complete' : 'reviewing',
                scoreDeltas: { ...round.scoreDeltas, [playerId]: score.delta },
                reviewIndex: reviewIndex + 1, answerVisible: !complete },
            [`players.${playerId}.score`]: score.nextScore,
            history: [createHistoryItem({ id: `text_${sessionId}_${reviewIndex}`, type,
                actorId: actor.id, actorName: actor.name, message: t('historyTextAnswer', { playerName, points: score.delta }),
                details: { sessionId, playerId, playerName, questionId: round.questionId, reviewIndex,
                    amount: decision === 'skip' ? 0 : Number(amount), points: score.delta, ...score } })]
        };
        if (complete) Object.assign(update, { answerRevealed: true, [`questionStates.${round.questionId}`]: 'done', mediaPlayback: null });
        await updateRoomInTransaction(transaction, roomRef, room, update);
        return 'judged';
    });
}
