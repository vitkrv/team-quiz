import { doc, serverTimestamp } from 'firebase/firestore';
import { getAchievements } from '../utils/achievements';

export const recapRef = (roomRef) => doc(roomRef, 'recap', 'summary');
const tracked = new Set(['player_buzzed', 'player_buzzed_late', 'player_buzzed_early', 'answer_correct', 'answer_incorrect',
    'surprise_answer_correct', 'surprise_answer_incorrect', 'score_set', 'score_adjusted',
    'surprise_table_picked', 'surprise_wheel_scored']);

// Complete every read before the caller starts writing. The projection never reads private history.
export async function prepareRecap(transaction, roomRef, room, update, readPack) {
    const events = (update.history || []).filter((e) => tracked.has(e.type));
    if (room.recapVersion !== 1 || room.status === 'lobby' || !events.length) return () => {};
    if (room.status === 'finished') throw new Error('Game is finished');
    const snapshot = await transaction.get(recapRef(roomRef));
    if (!snapshot.exists()) throw new Error('Recap is missing');
    const summary = snapshot.data();
    const pack = room.activeQuestionId ? await readPack(transaction, roomRef, room) : null;
    const category = pack?.categories?.find((c) => c.questions.some((q) => q.id === room.activeQuestionId));
    const question = category?.questions.find((q) => q.id === room.activeQuestionId);
    const scores = [];
    for (const event of events) {
        const d = event.details;
        const playerId = d.playerId || (event.type.startsWith('player_buzzed') ? event.actorId
            : event.type.startsWith('surprise_') ? room.surpriseRound?.answererId : room.buzzedPlayerId);
        Object.assign(d, { operationId: event.id, playerId: playerId || null,
            questionId: question?.id || null, categoryId: category?.id || null });
        summary.sequence += 1;
        summary.lastEventId = event.id;
        const p = summary.players[playerId];
        if (!p) throw new Error('Recap player is missing');
        if (event.type.startsWith('player_buzzed')) {
            const round = `${question.id}:${(room.incorrectBuzzedIds || []).length}`;
            if (event.type === 'player_buzzed_early') {
                if (p.lastEarlyQuestionId === question.id) return null;
                p.lastEarlyQuestionId = question.id; p.early++; p.buzzes++;
            } else if (p.lastBuzzRound !== round) {
                p.lastBuzzRound = round; p.buzzes++;
                if (event.type === 'player_buzzed_late') {
                    p.late++;
                }
            }
            // An earlier timestamp can replace an already accepted late attempt.
            // Improve its minimum without counting a second attempt in that round.
            if (event.type === 'player_buzzed_late' && d.deltaMs > 0 && (!p.closestLate || d.deltaMs < p.closestLate.deltaMs)) {
                p.closestLate = { deltaMs: d.deltaMs, questionId: question.id, categoryId: category.id,
                    categoryName: category.name, questionPoints: question.points };
            }
        }
        if (/^(surprise_)?answer_(correct|incorrect)$/.test(event.type)) {
            const correct = event.type.endsWith('_correct');
            p[correct ? 'correct' : 'incorrect']++;
            p.streak = correct ? p.streak + 1 : 0;
            p.longestStreak = Math.max(p.longestStreak, p.streak);
        }
        const manual = event.type === 'score_set' || event.type === 'score_adjusted';
        const scoring = manual || ['answer_correct', 'answer_incorrect', 'surprise_table_picked', 'surprise_wheel_scored'].includes(event.type);
        if (scoring) {
            const before = Number(room.players[playerId].score) || 0;
            const delta = manual ? (event.type === 'score_set' ? Number(d.nextScore) - before : Number(d.delta)) : Number(d.points) || 0;
            const after = before + delta;
            update[`players.${playerId}.score`] = after;
            Object.assign(d, { previousScore: before, nextScore: after, delta });
            if (manual) p.adjustments += delta;
            else if (category) {
                const c = p.categories[category.id] || { name: category.name, points: 0 };
                c.points += delta; p.categories[category.id] = c;
            }
            scores.push({ id: event.id, sequence: summary.sequence, playerId, questionId: manual ? null : question?.id || null,
                categoryId: manual ? null : category?.id || null, categoryName: manual ? '' : category?.name || '',
                source: event.type, before, after, delta });
        }
    }
    return () => {
        transaction.set(recapRef(roomRef), summary);
        scores.forEach((score) => transaction.set(doc(roomRef, 'recapScores', score.id), score));
    };
}

export async function prepareFinalRecap(transaction, roomRef, room) {
    if (room.recapVersion !== 1) return () => {};
    const snapshot = await transaction.get(recapRef(roomRef));
    if (!snapshot.exists()) throw new Error('Recap is missing');
    const summary = snapshot.data();
    const awards = getAchievements(summary);
    const profileAwards = Object.fromEntries(Object.keys(summary.players).map((id) => [id, awards.filter((a) => a.playerIds.includes(id))]));
    const completedAt = serverTimestamp();
    return () => {
        transaction.set(recapRef(roomRef), { ...summary, awards, profileAwards, finalized: true, completedAt });
        for (const [playerId, earned] of Object.entries(profileAwards)) {
            if (!earned.length) continue;
            const profile = doc(roomRef.firestore, 'artifacts', roomRef.path.split('/')[1], 'users', playerId, 'gameAchievements', roomRef.id);
            transaction.set(profile, { version: 1, gameId: roomRef.id, gameCode: room.roomCode, completedAt, awards: earned });
        }
    };
}
