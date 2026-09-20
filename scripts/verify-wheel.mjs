import assert from 'node:assert/strict';
import { collection, deleteDoc, doc, getDocFromServer, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

// Run only through verify-game-storage.mjs, with its isolated project and rules.
export async function verifyWheel({ actions, check, denied, hostDb, playerDb, spectatorDb, seedDb, ref, roomRef, event, t, client }) {
    const hostActor = { id: 'host', name: 'host' }, playerActor = { id: 'player', name: 'player' };
    const read = async (target) => (await getDocFromServer(target)).data();
    const pack = { ownerId: 'host', name: 'Wheel recovery', surpriseScoringMechanic: 'wheel', categories: [{ id: 'cat', name: 'Category', questions: [
        { id: 'wheel', text: 'Surprise', answer: 'Answer', points: 100, isSurpriseQuestion: true },
        { id: 'ordinary', text: 'Ordinary', answer: 'Answer', points: 100 },
        { id: 'next', text: 'Next', answer: 'Answer', points: 200 }
    ] }] };
    await setDoc(ref(hostDb, 'packs', 'wheel-pack'), pack);
    const make = async (points = 100) => {
        const id = await actions.createRoom({ hostId: 'host', packId: 'wheel-pack', pack, status: 'lobby',
            players: { host: { name: 'host', isHost: true, score: 0 }, player: { name: 'player', isHost: false, score: 0 },
                other: { name: 'other', isHost: false, score: 0 } },
            activeQuestionId: null, answerRevealed: false, buzzedPlayerId: null, buzzTimestamp: null,
            buzzUnlockAt: 0, buzzAttempts: {}, incorrectBuzzedIds: [], history: [event('room_created')] });
        const host = roomRef(hostDb, id), player = roomRef(playerDb, id), seed = roomRef(seedDb, id);
        await actions.startGame(host, hostActor, t);
        await updateDoc(host, { status: 'playing' });
        await actions.beginSurprisePlayerDraw(host, 'wheel', 'host', 'player');
        await actions.completeSurprisePlayerDraw(host, (await read(host)).surprisePlayerDraw.id, 'host', event('question_picked'));
        const round = (await read(host)).surpriseRound;
        await actions.updateRoom(host, { answerRevealed: true, currentTurn: 'player', 'questionStates.wheel': 'done',
            surpriseRound: { ...round, judgeResult: 'correct', scoringMechanic: 'wheel', wheelValues: [points], scoreAppliedAt: null },
            history: [event('surprise_answer_correct', 'host', { questionId: 'wheel', playerId: 'player' })] });
        return { id, host, player, seed };
    };
    const expire = async (game) => {
        // Fixture clock control only; production clients cannot alter a persisted start.
        await updateDoc(game.seed, { 'surpriseRound.rolledAt': Timestamp.fromMillis(Date.now() - 6100) });
        return (await read(game.host)).surpriseRound.spinId;
    };
    const resume = (game, questionId = 'wheel', history = event('board_resumed', 'host', { questionId })) => actions.updateRoom(game.host, {
        activeQuestionId: null, answerRevealed: false, buzzedPlayerId: null, buzzTimestamp: null, buzzAttempts: {},
        incorrectBuzzedIds: [], mediaPlayback: null, surpriseRound: null, history: [history]
    });
    await check('wheel: concurrent starts select once and server rejects early awards and spin tampering', async () => {
        const game = await make();
        await Promise.all([actions.startSurpriseWheel(game.host, 'wheel', hostActor, t), actions.startSurpriseWheel(game.player, 'wheel', playerActor, t)]);
        const room = await read(game.host), spin = room.surpriseRound;
        assert.equal(room.players.player.score, 0);
        assert.equal(spin.durationMs, 6000);
        assert.equal((await getDocs(collection(game.host, 'history'))).docs.filter((d) => d.data().type === 'surprise_wheel_rolled').length, 1);
        assert.equal((await getDocs(collection(game.host, 'recapScores'))).size, 0);
        assert.equal(await actions.completeSurpriseWheel(game.player, 'wheel', spin.spinId, playerActor, t, () => spin.rolledAt.toMillis()), 'not-ready');
        // A fast client clock cannot bypass the server deadline, including for the host.
        await denied(actions.completeSurpriseWheel(game.host, 'wheel', spin.spinId, hostActor, t, () => Date.now() + 60000));
        await denied(actions.completeSurpriseWheel(game.player, 'wheel', spin.spinId, playerActor, t, () => Date.now() + 60000));
        await denied(updateDoc(game.host, { 'surpriseRound.rolledAt': Timestamp.fromMillis(0) }));
        await denied(updateDoc(game.player, { 'surpriseRound.rollResult': 9000 }));
        await denied(updateDoc(game.host, { 'surpriseRound.spinId': 'replacement' }));
        assert.equal((await read(game.host)).players.player.score, 0);
        assert.equal(await actions.startSurpriseWheel(roomRef(spectatorDb, game.id), 'wheel', { id: 'spectator', name: 'spectator' }, t), 'stale');
    });
    await check('wheel: fresh clients recover an expired spin exactly once with concurrent score edits', async () => {
        const game = await make();
        await actions.startSurpriseWheel(game.player, 'wheel', playerActor, t);
        const spinId = await expire(game);
        const reconnected = roomRef(client('host', false, 'wheel-host-reconnected'), game.id);
        const adjustment = event('score_adjusted');
        const labels = ['reconnected host completion', 'player completion', 'manual adjustment', 'duplicate manual adjustment'];
        const outcomes = await Promise.allSettled([
            actions.completeSurpriseWheel(reconnected, 'wheel', spinId, hostActor, t),
            actions.completeSurpriseWheel(game.player, 'wheel', spinId, playerActor, t),
            actions.adjustScore(game.host, 'player', -999, 25, adjustment),
            actions.adjustScore(game.host, 'player', -999, 25, adjustment)
        ]);
        outcomes.forEach((outcome, index) => {
            if (outcome.status === 'rejected') throw new Error(`Wheel recovery: ${labels[index]} failed`, { cause: outcome.reason });
        });
        assert.equal((await read(game.host)).players.player.score, 125);
        assert.equal(await actions.completeSurpriseWheel(game.player, 'wheel', spinId, playerActor, t), 'already-applied');
        const scores = await getDocs(collection(game.host, 'recapScores'));
        assert.equal(scores.size, 2);
        assert.equal(scores.docs.filter((d) => d.data().source === 'surprise_wheel_scored').length, 1);
        const summary = await read(doc(game.host, 'recap', 'summary'));
        assert.equal(summary.players.player.categories.cat.points, 100);
        assert.equal(summary.players.player.adjustments, 25);
        assert.equal((await getDocs(collection(game.host, 'history'))).docs.filter((d) => d.data().type === 'surprise_wheel_scored').length, 1);
        const versionId = (await read(game.host)).packVersionId;
        await actions.handleEndGame(game.host, event('game_finished'));
        assert.equal((await read(game.host)).players.player.score, 125);
        assert.equal((await read(doc(game.host, 'recap', 'summary'))).finalized, true);
        assert.equal((await getDocFromServer(ref(hostDb, 'gamePackVersions', versionId))).exists(), false);
    });
    await check('wheel: pending awards block continue/finish; stale callbacks cannot clear the next question', async () => {
        const game = await make(-100);
        const history = event('board_resumed', 'host', { questionId: 'wheel' });
        await resume(game, 'wheel', history);
        assert.equal((await read(game.host)).activeQuestionId, 'wheel');
        await assert.rejects(actions.handleEndGame(game.host, event('game_finished')), /pending/);
        await denied(updateDoc(game.host, { status: 'finished' }));
        await actions.startSurpriseWheel(game.host, 'wheel', hostActor, t);
        const spinId = await expire(game);
        assert.equal(await actions.completeSurpriseWheel(game.host, 'wheel', 'wrong-spin', hostActor, t), 'stale');
        await actions.completeSurpriseWheel(game.host, 'wheel', spinId, hostActor, t);
        assert.equal((await read(game.host)).players.player.score, -100);
        await Promise.all([resume(game, 'wheel', history), resume(game, 'wheel', history)]);
        await actions.handlePickQuestion(game.host, 'ordinary', 'host', event('question_picked'));
        await resume(game);
        assert.equal((await read(game.host)).activeQuestionId, 'ordinary');
        assert.equal(await actions.completeSurpriseWheel(game.host, 'wheel', spinId, hostActor, t), 'stale');
        assert.equal((await read(game.host)).players.player.score, -100);
    });
    await check('wheel: missing recap rolls back completion and permits retry without rerolling', async () => {
        const game = await make();
        await actions.startSurpriseWheel(game.host, 'wheel', hostActor, t);
        const spinId = await expire(game);
        const summaryRef = doc(game.seed, 'recap', 'summary'), summary = await read(summaryRef);
        await deleteDoc(summaryRef);
        await assert.rejects(actions.completeSurpriseWheel(game.host, 'wheel', spinId, hostActor, t), /Recap is missing/);
        assert.equal((await read(game.host)).players.player.score, 0);
        assert.equal((await read(game.host)).surpriseRound.scoreAppliedAt, null);
        assert.equal((await getDocFromServer(doc(game.host, 'history', `wheel_${spinId}_scored`))).exists(), false);
        await setDoc(summaryRef, summary);
        await actions.completeSurpriseWheel(game.player, 'wheel', spinId, playerActor, t);
        assert.equal((await read(game.host)).players.player.score, 100);
        // Even after the deadline, directly marking an award without history/recap is forbidden.
        const other = await make();
        await actions.startSurpriseWheel(other.host, 'wheel', hostActor, t);
        await expire(other);
        await denied(updateDoc(other.host, { 'surpriseRound.scoreAppliedAt': serverTimestamp(), 'players.player.score': 100, currentTurn: 'player' }));
    });
    await check('quiz: current judgments derive pack points and preserve concurrent adjustments', async () => {
        const game = await make();
        await actions.startSurpriseWheel(game.host, 'wheel', hostActor, t);
        await actions.completeSurpriseWheel(game.host, 'wheel', await expire(game), hostActor, t);
        await resume(game);
        await actions.handlePickQuestion(game.host, 'ordinary', 'host', event('question_picked'));
        // Set an already-resolved buzz fixture; buzzer acceptance is covered by verify-buzzer.
        await updateDoc(game.seed, { buzzedPlayerId: 'player' });
        const judgment = event('answer_correct', 'host', { questionId: 'ordinary', playerId: 'player', points: 9999 });
        const judge = () => actions.updateRoom(game.host, { 'players.player.score': -999, answerRevealed: true,
            'questionStates.ordinary': 'done', currentTurn: 'player', history: [judgment] });
        await Promise.all([judge(), judge(), actions.adjustScore(game.host, 'player', -999, 25, event('score_adjusted'))]);
        assert.equal((await read(game.host)).players.player.score, 225);
        await actions.updateRoom(game.host, { 'players.player.score': 9999, history: [event('answer_correct', 'host', { questionId: 'next', playerId: 'player' })] });
        assert.equal((await read(game.host)).players.player.score, 225);
        assert.equal((await read(doc(game.host, 'recap', 'summary'))).players.player.correct, 2);
        const batch = { 'players.player.score': 225, 'players.other.score': 50, history: [
            event('score_set', 'host', { playerId: 'player', nextScore: 225 }),
            event('score_set', 'host', { playerId: 'other', nextScore: 50 })
        ] };
        await actions.updateRoom(game.host, batch);
        await actions.adjustScore(game.host, 'player', -999, 25, event('score_adjusted'));
        await actions.updateRoom(game.host, batch);
        assert.equal((await read(game.host)).players.player.score, 250, 'Retry must deduplicate even when the first batch event was a no-op');
    });
}
