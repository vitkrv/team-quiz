import { hasPendingSurpriseAward, isCurrentGame } from './wheelPolicy.js';

export const isAnswerJudgment = (type) => /^(surprise_)?answer_(correct|incorrect)$/.test(type);

// Pure decisions over the latest transaction snapshot. A reason means a safe
// no-op, not a failed request. Legacy behavior is intentionally kept separate.
export function getTransitionBlockReason(room, event) {
    const { type, actorId, details: d = {} } = event;
    if (room.status === 'finished') return 'game_finished';
    if (room.textAnswerRound && (isAnswerJudgment(type) || type === 'question_skipped')) return 'text_answer_action_required';
    if (isCurrentGame(room)) {
        const scoreEdit = ['score_set', 'score_adjusted'].includes(type);
        const hostAction = isAnswerJudgment(type) || scoreEdit || ['question_skipped', 'board_resumed'].includes(type);
        if (hostAction && actorId !== room.hostId) return 'host_required';
        if (hostAction && !scoreEdit && room.status !== 'playing') return 'game_not_playing';
        if (type === 'board_resumed') {
            if (!d.questionId || room.activeQuestionId !== d.questionId) return 'question_changed';
            if (!room.answerRevealed) return 'answer_not_revealed';
            if (hasPendingSurpriseAward(room)) return 'surprise_award_pending';
        }
        if (['surprise_wheel_rolled', 'surprise_wheel_scored'].includes(type)) return 'dedicated_wheel_action_required';
    }
    if (type === 'player_buzzed_early' && d.questionId && room.activeQuestionId !== d.questionId) return 'question_changed';
    if (isAnswerJudgment(type)) {
        if (room.activeQuestionId !== d.questionId) return 'question_changed';
        if (room.answerRevealed) return 'answer_already_revealed';
        const playerId = type.startsWith('surprise_') ? room.surpriseRound?.answererId : room.buzzedPlayerId;
        if (!playerId || playerId !== d.playerId || !room.players[playerId] || room.players[playerId].isHost) return 'answerer_changed';
    }
    if (type === 'question_skipped') {
        if (room.activeQuestionId !== d.questionId) return 'question_changed';
        if (room.answerRevealed) return 'answer_already_revealed';
    }
    if (type === 'surprise_wheel_rolled' && (room.activeQuestionId !== d.questionId || room.surpriseRound?.rollResult != null)) return 'wheel_changed';
    if (type === 'surprise_wheel_scored' && (room.activeQuestionId !== d.questionId || room.surpriseRound?.scoreAppliedAt
        || room.surpriseRound?.rolledAt !== d.rolledAt || room.surpriseRound?.rollResult !== d.points)) return 'wheel_changed';
    if (type === 'tie_breaker_started' && ((room.currentRoundIndex || 0) < (room.roundCount || 1) - 1
        || room.status !== 'playing' || room.activeQuestionId
        || Object.values(room.questionStates || {}).some((state) => state !== 'done'))) return 'board_not_complete';
    return null;
}

// Pack-backed score projection: never trust UI points or a UI score snapshot.
// Surprise awards remain owned by their wheel/table lifecycle actions.
export function projectAnswerScore(room, event, question) {
    if (!question || Boolean(question.isSurpriseQuestion) !== event.type.startsWith('surprise_')) {
        return { reason: 'question_type_changed' };
    }
    if (question.isSurpriseQuestion) return { score: null };
    const points = Number(question.points) || 0;
    const delta = event.type === 'answer_correct' ? points : room.trueCompetitiveMode ? -points : 0;
    return { score: { playerId: event.details.playerId, delta,
        total: (Number(room.players[event.details.playerId].score) || 0) + delta } };
}
