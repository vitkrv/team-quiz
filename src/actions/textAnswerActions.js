import { createHistoryItem } from './gameActions';
import { runRoomTransaction, updateRoomInTransaction } from './gameStorage';
import { normalizeTextAnswer, projectTextAnswerScore, textAnswerBlockReason } from '../utils/textAnswerPolicy';
import { FieldPath } from 'firebase/firestore';

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

export async function revealTextAnswer(roomRef, sessionId, actorId, reviewIndex) {
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (textAnswerBlockReason(room, sessionId, actorId, 'reveal', reviewIndex)) return 'stale';
        transaction.update(roomRef, { textAnswerRound: { ...room.textAnswerRound, answerVisible: true } });
        return 'revealed';
    });
}

export async function judgeTextAnswer(roomRef, sessionId, actor, reviewIndex, decision, amount, t) {
    return runRoomTransaction(roomRef, async (transaction, room) => {
        if (textAnswerBlockReason(room, sessionId, actor.id, 'judge', reviewIndex)) return 'stale';
        const round = room.textAnswerRound;
        const playerId = round.playerIds[reviewIndex];
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
