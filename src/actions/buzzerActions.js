import { getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { buzzerRef } from './buzzerState';
import { updateRoomInTransaction } from './gameStorage';
import { createHistoryItem } from './gameActions';
import { EARLY_BUZZ_DELAY_MS, personalUnlockAt, rankBuzzAttempts } from '../utils/buzzerPolicy';

function eligible(room, race, raceId, uid) {
    return room?.buzzerPolicyVersion === 1 && room.status === 'playing' && !room.answerRevealed
        && !room.buzzedPlayerId && room.buzzerRoundId === raceId && race?.raceId === raceId
        && race.questionId === room.activeQuestionId && room.players[uid]?.isHost === false
        && !(room.incorrectBuzzedIds || []).includes(uid);
}

export async function recordEarlyBuzz(roomRef, raceId, uid, operationId) {
    return runTransaction(roomRef.firestore, async (tx) => {
        const room = (await tx.get(roomRef)).data();
        const race = (await tx.get(buzzerRef(roomRef))).data();
        if (!eligible(room, race, raceId, uid) || !room.trueCompetitiveMode || race.phase !== 'open') return false;
        if (race.penalties[uid]) return false;
        const actorName = room.players[uid].name;
        const event = createHistoryItem({ id: operationId, type: 'player_buzzed_early', actorId: uid, actorName,
            message: 'player_buzzed_early', details: { playerId: uid, questionId: race.questionId, actorName, raceId } });
        await updateRoomInTransaction(tx, roomRef, room, { history: [event] });
        tx.update(buzzerRef(roomRef), { penalties: { ...race.penalties, [uid]: personalUnlockAt(race, uid) + EARLY_BUZZ_DELAY_MS },
            earlyOperations: { ...race.earlyOperations, [uid]: operationId } });
        return true;
    }).catch(async (error) => {
        const race = (await getDocFromServer(buzzerRef(roomRef))).data();
        if (race?.raceId === raceId && race.penalties[uid]) return false;
        throw error;
    });
}

export async function submitBuzz(roomRef, raceId, uid, reactionMs, operationId) {
    if (!Number.isFinite(reactionMs) || reactionMs < 0) throw new Error('Invalid reaction duration');
    return runTransaction(roomRef.firestore, async (tx) => {
        const room = (await tx.get(roomRef)).data();
        const race = (await tx.get(buzzerRef(roomRef))).data();
        if (!eligible(room, race, raceId, uid) || !['open', 'collecting'].includes(race.phase)) return false;
        if (race.attempts[uid]) return race.attempts[uid].operationId === operationId;
        // The captured duration never changes when Firestore retries this transaction.
        tx.update(buzzerRef(roomRef), {
            phase: 'collecting',
            firstAcceptedAt: race.firstAcceptedAt || serverTimestamp(),
            attempts: { ...race.attempts, [uid]: { playerId: uid, reactionMs, operationId, acceptedAt: serverTimestamp() } }
        });
        return true;
    }).catch(async (error) => {
        const race = (await getDocFromServer(buzzerRef(roomRef))).data();
        if (race?.raceId === raceId && race.attempts[uid]?.operationId === operationId) return true;
        throw error;
    });
}

export async function finalizeBuzz(roomRef, raceId, actorId) {
    return runTransaction(roomRef.firestore, async (tx) => {
        const room = (await tx.get(roomRef)).data();
        const race = (await tx.get(buzzerRef(roomRef))).data();
        if (room?.hostId !== actorId) throw new Error('Only the host can resolve buzzing');
        if (room.status !== 'playing' || room.answerRevealed || room.buzzedPlayerId
            || room.buzzerRoundId !== raceId || race?.raceId !== raceId || race.phase !== 'collecting') return false;
        const ranked = rankBuzzAttempts(race.attempts);
        if (!ranked.length) return false;
        const winner = ranked[0];
        const actorName = room.players[actorId].name;
        const attempts = Object.fromEntries(ranked.map((attempt) => [attempt.playerId, {
            questionId: race.questionId, reactionMs: attempt.reactionMs,
            deltaMs: attempt.reactionMs - winner.reactionMs, raceId
        }]));
        const history = ranked.map((attempt, index) => createHistoryItem({
            id: `${raceId}-${attempt.playerId}`, type: index === 0 ? 'player_buzzed' : 'player_buzzed_late',
            actorId, actorName, message: index === 0 ? 'player_buzzed' : 'player_buzzed_late',
            details: { playerId: attempt.playerId, actorName: room.players[attempt.playerId].name,
                playerName: room.players[winner.playerId].name, deltaMs: attempt.reactionMs - winner.reactionMs,
                reactionMs: attempt.reactionMs, raceId, timingPolicy: 1 }
        }));
        await updateRoomInTransaction(tx, roomRef, room, {
            buzzedPlayerId: winner.playerId, buzzTimestamp: serverTimestamp(), buzzAttempts: attempts, history
        });
        tx.update(buzzerRef(roomRef), { phase: 'resolved' });
        return true;
    }).catch(async (error) => {
        const race = (await getDocFromServer(buzzerRef(roomRef))).data();
        if (race?.raceId === raceId && race.phase === 'resolved') return false;
        throw error;
    });
}
