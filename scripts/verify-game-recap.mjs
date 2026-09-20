import assert from 'node:assert/strict';
import { collection, deleteDoc, deleteField, doc, getDocFromServer, getDocs, increment, runTransaction, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { createRecapSummary, getAchievements } from '../src/utils/achievements.js';

export async function verifyGameRecap({ actions, check, denied, hostDb, playerDb, lateDb, spectatorDb, adminDb, seedDb, namespace, ref, roomRef, event, t }) {
    await check('achievement fixtures: ties, thresholds, duplicate names and minimum timing', async () => {
        const summary = createRecapSummary({ host: { isHost: true }, a: { name: 'Same', score: 0 }, b: { name: 'Same', score: 0 } });
        assert.deepEqual(getAchievements(summary), []);
        Object.assign(summary.players.a, { correct: 2, incorrect: 1, longestStreak: 2, closestLate: { deltaMs: 9 } });
        Object.assign(summary.players.b, { correct: 4, incorrect: 2, longestStreak: 3, closestLate: { deltaMs: 10 } });
        const awards = getAchievements(summary);
        assert.deepEqual(awards.find((a) => a.id === 'accuracy').playerIds, ['a', 'b']);
        assert.deepEqual(awards.find((a) => a.id === 'closestLate').playerIds, ['a']);
        assert.deepEqual(awards.find((a) => a.id === 'streak').playerIds, ['b']);
        summary.players.a.correct = 1;
        assert.deepEqual(getAchievements(summary).find((a) => a.id === 'accuracy').playerIds, ['b']);
    });
    const players = { host: { name: 'host', score: 0, isHost: true, avatar: '🎙️' },
        player: { name: 'player', score: 0, isHost: false, avatar: '🦊' }, late: { name: 'late', score: 0, isHost: false, avatar: '🐱' } };
    for (let i = 0; i < 18; i++) players[`offline${i}`] = { name: `Offline ${i}`, score: 0, isHost: false, avatar: '🐻' };
    const pack = { ownerId: 'host', isPublic: false, name: 'Recap pack', iconEmoji: '🧠', categories: [{ id: 'cat', name: 'Science', questions: Array.from({ length: 25 }, (_, i) => ({ id: `q${i}`, text: `Question ${i}`, answer: `Answer ${i}`, points: 100 })) }] };
    await setDoc(ref(hostDb, 'packs', 'recap-pack'), pack);
    const id = await actions.createRoom({ hostId: 'host', packId: 'recap-pack', pack, status: 'lobby', trueCompetitiveMode: true,
        players, activeQuestionId: null, answerRevealed: false, buzzedPlayerId: null, buzzTimestamp: null,
        buzzUnlockAt: 0, buzzAttempts: {}, incorrectBuzzedIds: [], history: [event('room_created')] });
    // Existing recap scenarios also exercise rooms created before buzzer policy v1.
    await updateDoc(roomRef(seedDb, id), { buzzerPolicyVersion: deleteField(), buzzerRoundId: deleteField() });
    const hostRoom = roomRef(hostDb, id), summaryRef = doc(hostRoom, 'recap', 'summary');
    const read = async () => (await getDocFromServer(summaryRef)).data();
    await actions.startGame(hostRoom, { id: 'host', name: 'host' }, t);
    await updateDoc(hostRoom, { status: 'playing' });
    const versionId = (await getDocFromServer(hostRoom)).data().packVersionId;
    const buzz = async (uid, db, clickedAt, late = false) => runTransaction(db, async (transaction) => {
        const target = roomRef(db, id), room = (await transaction.get(target)).data();
        await actions.updateRoomInTransaction(transaction, target, room, {
            ...(late ? {} : { buzzedPlayerId: uid, buzzTimestamp: clickedAt }),
            buzzAttempts: { ...room.buzzAttempts, [uid]: { questionId: room.activeQuestionId, clickedAt } },
            history: [event(late ? 'player_buzzed_late' : 'player_buzzed', uid, { actorName: uid, ...(late ? { playerName: room.players[room.buzzedPlayerId].name, deltaMs: clickedAt - room.buzzTimestamp } : {}) })]
        });
    });
    await check('early attempts deduplicate across concurrent clients and forged counters fail', async () => {
        await actions.handlePickQuestion(hostRoom, 'q0', 'host', event('question_picked'), {}, () => 1000);
        const early = () => actions.updateRoom(roomRef(playerDb, id), { history: [event('player_buzzed_early', 'player', { actorName: 'player', clickedAt: 2000, questionId: 'q0' })] });
        await Promise.all([early(), early()]);
        const summary = await read();
        assert.equal(summary.players.player.early, 1);
        assert.equal(summary.players.player.buzzes, 1);
        await denied(updateDoc(doc(roomRef(playerDb, id), 'recap', 'summary'), { 'players.player.correct': 100 }));
        await denied(updateDoc(doc(roomRef(spectatorDb, id), 'recap', 'summary'), { sequence: 100 }));
        await denied(actions.updateRoom(roomRef(lateDb, id), { history: [event('player_buzzed_early', 'late', { actorName: 'late', clickedAt: 9000 })] }));
    });
    await check('judgments, round resets, score projections and stable operation IDs', async () => {
        await buzz('player', playerDb, 3100);
        await buzz('late', lateDb, 3108, true);
        await buzz('late', lateDb, 3105, true);
        const wrong = event('answer_incorrect', 'host', { playerId: 'player', questionId: 'q0', points: -100 });
        const update = { 'players.player.score': increment(-100), buzzedPlayerId: null, buzzTimestamp: null, buzzAttempts: {}, incorrectBuzzedIds: ['player'], history: [wrong] };
        await actions.updateRoom(hostRoom, update);
        await actions.updateRoom(hostRoom, update);
        await buzz('late', lateDb, 3300);
        const correct = event('answer_correct', 'host', { playerId: 'late', questionId: 'q0', points: 100 });
        await actions.updateRoom(hostRoom, { 'players.late.score': 100, answerRevealed: true, 'questionStates.q0': 'done', history: [correct] });
        const summary = await read();
        assert.equal(summary.players.player.incorrect, 1);
        assert.equal(summary.players.player.streak, 0);
        assert.equal(summary.players.late.correct, 1);
        assert.equal(summary.players.late.buzzes, 2);
        assert.equal(summary.players.late.closestLate.deltaMs, 5);
        assert.equal(summary.players.late.late, 1);
        assert.equal(summary.players.player.categories.cat.points, -100);
        const adjustment = event('score_adjusted');
        await Promise.all([actions.adjustScore(hostRoom, 'late', -999, 25, adjustment), actions.adjustScore(hostRoom, 'late', -999, 25, adjustment)]);
        assert.equal((await getDocFromServer(hostRoom)).data().players.late.score, 125);
        assert.equal((await read()).players.late.adjustments, 25);
    });
    await check('surprise wheel scoring records applied points once and ignores stale callbacks', async () => {
        await updateDoc(hostRoom, { surpriseRound: { questionId: 'q0', answererId: 'player', judgeResult: 'correct', rollResult: 50, rolledAt: 5000, scoreAppliedAt: null } });
        const update = { 'players.player.score': increment(50), currentTurn: 'player', 'surpriseRound.scoreAppliedAt': 6000,
            history: [event('surprise_wheel_scored', 'player', { playerId: 'player', playerName: 'player', questionId: 'q0', points: 50, rolledAt: 5000 })] };
        await actions.updateRoom(roomRef(playerDb, id), update);
        await actions.updateRoom(roomRef(playerDb, id), update);
        assert.equal((await getDocFromServer(hostRoom)).data().players.player.score, -50);
        assert.equal((await read()).players.player.categories.cat.points, -50);
        await denied(getDocs(collection(roomRef(playerDb, id), 'history')));
    });
    // Use real host actions to give all 20 participants a shared correct-answer award.
    await check('twenty participants retain shared achievements and score projections', async () => {
        const recipients = Object.keys(players).filter((uid) => uid !== 'host' && uid !== 'late');
        for (let i = 1; i < 20; i++) {
            const qid = `q${i}`, uid = recipients[i - 1];
            await updateDoc(hostRoom, { activeQuestionId: qid, answerRevealed: false, buzzedPlayerId: uid, surpriseRound: null });
            await actions.updateRoom(hostRoom, { answerRevealed: true, [`questionStates.${qid}`]: 'done',
                [`players.${uid}.score`]: 100,
                history: [event('answer_correct', 'host', { playerId: uid, questionId: qid, points: 100 })] });
        }
        const summary = await read();
        assert.equal(getAchievements(summary).find((a) => a.id === 'correct').playerIds.length, 20);
    });
    await check('failed finalization rolls back; concurrent finish persists 20 offline profiles within rules limits', async () => {
        const profilePath = (db, uid) => doc(db, 'artifacts', namespace, 'users', uid, 'gameAchievements', id);
        // An existing immutable record forces the whole transaction to fail.
        await setDoc(profilePath(seedDb, 'player'), { blocker: true });
        await denied(actions.handleEndGame(hostRoom, event('game_finished')));
        assert.equal((await getDocFromServer(hostRoom)).data().status, 'playing');
        assert.equal((await getDocFromServer(ref(hostDb, 'gamePackVersions', versionId))).exists(), true);
        assert.equal((await read()).finalized, false);
        await deleteDoc(profilePath(seedDb, 'player'));
        await Promise.all([actions.handleEndGame(hostRoom, event('game_finished')), actions.handleEndGame(hostRoom, event('game_finished'))]);
        assert.equal((await getDocFromServer(ref(hostDb, 'gamePackVersions', versionId))).exists(), false);
        assert.equal((await read()).finalized, true);
        for (const uid of Object.keys(players).filter((uid) => uid !== 'host')) {
            const record = (await getDocFromServer(profilePath(seedDb, uid))).data();
            assert.equal(record.gameId, id);
            assert.ok(record.completedAt.toMillis() > 0);
            assert.ok(record.awards.some((a) => a.id === 'correct'));
        }
        const own = profilePath(playerDb, 'player');
        const record = (await getDocFromServer(own)).data();
        await denied(updateDoc(own, { gameCode: '000000' }));
        await denied(deleteDoc(own));
        await denied(getDocFromServer(profilePath(spectatorDb, 'player')));
        assert.equal((await getDocFromServer(profilePath(adminDb, 'player'))).exists(), true);
        await denied(setDoc(profilePath(playerDb, 'host'), record));
        await denied(updateDoc(summaryRef, { 'players.player.correct': 1000 }));
        await setDoc(doc(playerDb, 'artifacts', namespace, 'users', 'player'), { language: 'uk', updatedAt: Date.now() }, { merge: true });
    });
    await check('results survive pack deletion, code reuse and new viewer sessions without history access', async () => {
        await deleteDoc(ref(hostDb, 'packs', 'recap-pack'));
        const room = (await getDocFromServer(hostRoom)).data();
        await setDoc(ref(seedDb, 'roomCodes', room.roomCode), { gameId: 'AnotherGame0000000001' });
        assert.equal('pack' in room || 'history' in room, false);
        assert.ok((await getDocs(collection(roomRef(spectatorDb, id), 'recapScores'))).size >= 20);
        await denied(getDocs(collection(roomRef(spectatorDb, id), 'history')));
        const batch = writeBatch(hostDb);
        batch.update(hostRoom, { 'players.player.score': 9999 });
        await denied(batch.commit());
    });
    return id;
}
