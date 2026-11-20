export const TEXT_ANSWER_LIMIT = 40;

export function normalizeTextAnswer(value) {
    if (typeof value !== 'string' || /[\r\n\u2028\u2029]/u.test(value)) return null;
    const answer = value.trim();
    return Array.from(answer).length >= 1 && Array.from(answer).length <= TEXT_ANSWER_LIMIT ? answer : null;
}

export const validTextPoints = (value) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value));

export const validSignedTextPoints = (value) => /^-?\d+$/.test(String(value)) && Number.isSafeInteger(Number(value));
export const textAssessmentDecision = (delta) => delta > 0 ? 'accept' : delta < 0 ? 'deny' : 'skip';
export const textAssessmentShortcut = (correct, points, competitive) => correct ? points : competitive ? -points : 0;

export function bulkTextAnswerBlockReason(room, sessionId, actorId, revision) {
    const round = room?.textAnswerRound;
    return !room || room.status !== 'playing' || room.answerRevealed || !round?.assessAllAtOnce
        || round.id !== sessionId || round.questionId !== room.activeQuestionId || round.phase !== 'reviewing'
        || round.assessmentRevision !== revision || actorId !== room.hostId ? 'stale' : null;
}

export function createTextAnswerRound(room, questionId, id, categoryIndex = 0, questionIndex = 0, assessAllAtOnce = false) {
    const playerIds = Object.keys(room.players).filter((uid) => uid !== room.hostId && !room.players[uid].isHost).sort();
    if (!playerIds.length || playerIds.length > 20) throw new Error('Invalid text answer roster');
    return { version: 1, id, questionId, categoryIndex, questionIndex, phase: 'answering', playerIds,
        answers: Object.fromEntries(playerIds.map((uid) => [uid, ''])), reviewIndex: 0, answerVisible: false,
        ...(assessAllAtOnce ? { assessAllAtOnce: true, assessmentRevision: 0, showAnswers: true,
            draftPoints: Object.fromEntries(playerIds.map((uid) => [uid, 0])) } : {}) };
}

export function textAnswerBlockReason(room, sessionId, actorId, action, reviewIndex) {
    const round = room?.textAnswerRound;
    if (!room || room.status !== 'playing' || room.answerRevealed || !round
        || round.id !== sessionId || round.questionId !== room.activeQuestionId) return 'stale';
    if (action === 'submit') return round.phase === 'answering' && round.playerIds.includes(actorId)
        && actorId !== room.hostId && room.players[actorId]?.isHost === false ? null : 'ineligible';
    if (actorId !== room.hostId) return 'host_required';
    if (action === 'close') return round.phase === 'answering' ? null : 'stale';
    if (round.assessAllAtOnce) return 'stale';
    if (round.phase !== 'reviewing' || round.reviewIndex !== reviewIndex) return 'stale';
    if (action === 'reorder') return null;
    if (action === 'reveal') return round.answerVisible ? 'stale' : null;
    return round.answerVisible ? null : 'answer_hidden';
}

export function moveTextAnswer(round, playerId, direction, expectedOrder) {
    if (round.phase !== 'reviewing' || ![-1, 1].includes(direction)
        || !Array.isArray(expectedOrder) || expectedOrder.length !== round.playerIds.length
        || expectedOrder.some((uid, index) => uid !== round.playerIds[index])) return null;
    const index = round.playerIds.indexOf(playerId);
    const target = index + direction;
    const firstMovable = round.reviewIndex + (round.answerVisible ? 1 : 0);
    if (index < firstMovable || target < firstMovable || target >= round.playerIds.length) return null;
    const order = [...round.playerIds];
    [order[index], order[target]] = [order[target], order[index]];
    return order;
}

export function projectTextAnswerScore(room, playerId, decision, amount) {
    if (!['accept', 'deny', 'skip'].includes(decision) || !validTextPoints(amount)
        || (decision === 'skip' && !room.trueCompetitiveMode)) return null;
    const delta = (decision === 'accept' ? Number(amount) : decision === 'deny' && room.trueCompetitiveMode ? -Number(amount) : 0) || 0;
    const previousScore = room.players[playerId]?.score;
    const nextScore = previousScore + delta;
    return Number.isSafeInteger(previousScore) && Number.isSafeInteger(nextScore) ? { previousScore, nextScore, delta } : null;
}
