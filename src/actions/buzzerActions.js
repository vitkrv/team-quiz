import { getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { buzzerRef } from './buzzerState';
import { updateRoomInTransaction } from './gameStorage';
import { createHistoryItem } from './gameActions';
import { collectionDeadline, EARLY_BUZZ_DELAY_MS, personalUnlockAt, rankBuzzAttempts } from '../utils/buzzerPolicy';

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

function submissionOutcome(room, race, { raceId, uid, operationId }) {
    if (race?.raceId === raceId && race.attempts[uid]) {
        return race.attempts[uid].operationId === operationId ? 'accepted' : 'already-submitted';
    }
    if (!room || !race || room.buzzerRoundId !== raceId || race.raceId !== raceId
        || race.questionId !== room.activeQuestionId || room.status !== 'playing' || room.answerRevealed
        || room.buzzedPlayerId || !['open', 'collecting'].includes(race.phase)) return 'race-ended';
    if (!eligible(room, race, raceId, uid)) return 'ineligible';
    return null;
}

// A failed recovery read must not replace the original write error.
export async function recoverBuzzSubmission(error, readState, submission, serverNow = Date.now) {
    let state;
    try { state = await readState(); } catch { throw error; }
    const outcome = submissionOutcome(state.room, state.race, submission);
    if (outcome) return outcome;
    const { race } = state;
    // A permission error alone is insufficient: verify the same race's deadline
    // and personal unlock. Clock estimates classify feedback, never acceptance.
    if (error.code === 'permission-denied' && race.phase === 'collecting'
        && serverNow() >= collectionDeadline(race) && serverNow() >= personalUnlockAt(race, submission.uid)) {
        return 'collection-closed';
    }
    throw error;
}

export async function submitBuzz(roomRef, raceId, uid, reactionMs, operationId, serverNow = Date.now) {
    if (!Number.isFinite(reactionMs) || reactionMs < 0) throw new Error('Invalid reaction duration');
    const submission = { raceId, uid, operationId };
    const submit = async (retries = 0) => {
        let attemptedRace;
        try {
            return await runTransaction(roomRef.firestore, async (tx) => {
                const room = (await tx.get(roomRef)).data();
                const race = (await tx.get(buzzerRef(roomRef))).data();
                const outcome = submissionOutcome(room, race, submission);
                if (outcome) return outcome;
                attemptedRace = race;
                // Retries always reuse the captured duration and operation ID.
                tx.update(buzzerRef(roomRef), {
                    phase: 'collecting',
                    firstAcceptedAt: race.firstAcceptedAt || serverTimestamp(),
                    attempts: { ...race.attempts, [uid]: { playerId: uid, reactionMs, operationId, acceptedAt: serverTimestamp() } }
                });
                return 'accepted';
            });
        } catch (error) {
            let state;
            try {
                return await recoverBuzzSubmission(error, async () => {
                    const [room, race] = await Promise.all([getDocFromServer(roomRef), getDocFromServer(buzzerRef(roomRef))]);
                    state = { room: room.data(), race: race.data() };
                    return state;
                }, submission, serverNow);
            } catch (failure) {
                // Rules can reject a stale attempts-map write before Firestore
                // reports a transaction conflict. Retry only confirmed growth
                // from another contestant in this same, still-open race.
                if (error.code === 'permission-denied' && retries < 3 && attemptedRace && state
                    && !submissionOutcome(state.room, state.race, submission)
                    && state.race.phase === 'collecting' && serverNow() < collectionDeadline(state.race)
                    && Object.keys(state.race.attempts).length > Object.keys(attemptedRace.attempts).length) {
                    return submit(retries + 1);
                }
                throw failure;
            }
        }
    };
    return submit();
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
