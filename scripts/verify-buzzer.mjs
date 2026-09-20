import assert from 'node:assert/strict';
import { collection, doc, getDocFromServer, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { createReactionOrigin, rankBuzzAttempts } from '../src/utils/buzzerPolicy.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function verifyBuzzer({ actions, check, denied, hostDb, playerDb, lateDb, spectatorDb, seedDb, ref, roomRef, event, t, client }) {
    await check('buzzer: monotonic origins preserve refresh elapsed time and personal-unlock fallback', async () => {
        const fresh = createReactionOrigin({ savedAt: 0, fallbackAt: 0, wallNow: 10000, serverNow: 12000, monotonicNow: 200 });
        assert.equal(fresh.monotonic, 200); assert.equal(fresh.wall, 10000);
        const restored = createReactionOrigin({ savedAt: 10000, fallbackAt: 0, wallNow: 15000, serverNow: 25000, monotonicNow: 50 });
        assert.equal(550 - restored.monotonic, 5500);
        const personal = createReactionOrigin({ savedAt: 0, fallbackAt: 14500, wallNow: 13000, serverNow: 15000, monotonicNow: 100 });
        assert.equal(200 - personal.monotonic, 600);
    });
    const players = { host: { name: 'host', isHost: true, score: 0 }, player: { name: 'player', isHost: false, score: 0 }, late: { name: 'late', isHost: false, score: 0 } };
    const pack = { ownerId: 'host', name: 'Buzzer policy', categories: [{ id: 'cat', name: 'Category', questions: [
        { id: 'q1', text: 'Question', answer: 'Answer', points: 100 },
        { id: 'q2', text: 'Next', answer: 'Answer', points: 100 },
        { id: 'surprise', text: 'Surprise', answer: 'Answer', points: 100, isSurpriseQuestion: true }
    ] }] };
    await setDoc(ref(hostDb, 'packs', 'buzz-pack'), pack);
    const make = async (roster = players) => {
        const id = await actions.createRoom({ hostId: 'host', packId: 'buzz-pack', pack, status: 'lobby', trueCompetitiveMode: true,
            players: roster, activeQuestionId: null, answerRevealed: false, buzzedPlayerId: null,
            buzzTimestamp: null, buzzUnlockAt: 0, buzzAttempts: {}, incorrectBuzzedIds: [], history: [event('room_created')] });
        const host = roomRef(hostDb, id);
        await actions.startGame(host, { id: 'host', name: 'host' }, t);
        await updateDoc(host, { status: 'playing' });
        await actions.handlePickQuestion(host, 'q1', 'host', event('question_picked'));
        return { id, host, raceRef: doc(host, 'buzzer', 'current'), player: roomRef(playerDb, id), late: roomRef(lateDb, id) };
    };
    const read = async (target) => (await getDocFromServer(target)).data();
    const unlock = async (game) => {
        // Set a controlled clock on fixture state; all contestant actions still use real rules.
        await updateDoc(doc(roomRef(seedDb, game.id), 'buzzer', 'current'), { openedAt: Timestamp.fromMillis(Date.now() - 2100) });
        return (await read(game.raceRef)).raceId;
    };
    const closeWindow = async (game) => {
        const race = await read(game.raceRef);
        await sleep(Math.max(0, race.firstAcceptedAt.toMillis() + 2050 - Date.now()));
    };
    let game;
    await check('buzzer: server opening, immutable marker, eligibility and direct-write protection', async () => {
        game = await make();
        const race = await read(game.raceRef);
        assert.equal(race.phase, 'open'); assert.equal(race.openingDelayMs, 2000);
        await denied(updateDoc(game.host, { buzzerPolicyVersion: 0 }));
        await denied(actions.submitBuzz(game.player, race.raceId, 'player', 0, 'before-unlock'));
        await denied(updateDoc(game.player, { buzzedPlayerId: 'player', buzzTimestamp: Date.now() }));
        assert.equal(await actions.submitBuzz(roomRef(spectatorDb, game.id), race.raceId, 'spectator', 1, 'spectator'), false);
        assert.equal(await actions.submitBuzz(game.host, race.raceId, 'host', 1, 'host'), false);
        await assert.rejects(actions.submitBuzz(game.player, race.raceId, 'player', NaN, 'nan'));
        await assert.rejects(actions.submitBuzz(game.player, race.raceId, 'player', -1, 'negative'));
        await assert.rejects(actions.submitBuzz(game.player, race.raceId, 'player', Infinity, 'infinity'));
    });
    await check('buzzer: delayed faster reaction wins, duplicate submission is immutable, premature finalization denied', async () => {
        const id = await unlock(game);
        assert.equal(await actions.submitBuzz(game.late, id, 'late', 1000, 'B'), true);
        await denied(actions.finalizeBuzz(game.host, id, 'host'));
        await sleep(600);
        assert.equal(await actions.submitBuzz(game.player, id, 'player', 500, 'A'), true);
        assert.equal(await actions.submitBuzz(game.player, id, 'player', 10, 'replacement'), false);
        assert.equal(await actions.submitBuzz(game.player, id, 'player', 500, 'A'), true);
        await closeWindow(game);
        await Promise.all([actions.finalizeBuzz(game.host, id, 'host'), actions.finalizeBuzz(game.host, id, 'host')]);
        const room = await read(game.host), summary = await read(doc(game.host, 'recap', 'summary'));
        assert.equal(room.buzzedPlayerId, 'player'); assert.equal(room.buzzAttempts.late.deltaMs, 500);
        assert.ok(room.buzzTimestamp.toMillis() >= (await read(game.raceRef)).firstAcceptedAt.toMillis() + 2000);
        assert.equal(summary.players.player.buzzes, 1); assert.equal(summary.players.late.buzzes, 1);
        assert.equal(summary.players.late.closestLate.deltaMs, 500);
        const events = (await getDocs(collection(game.host, 'history'))).docs.map((d) => d.data()).filter((e) => e.type.startsWith('player_buzzed'));
        assert.equal(events.length, 2); assert.ok(events.every((e) => e.actorId === 'host'));
        await denied(getDocs(collection(game.player, 'history')));
    });
    await check('buzzer: wrong answer creates fresh immediate race, excludes answerer, and rejects stale attempts', async () => {
        const old = (await read(game.raceRef)).raceId;
        await actions.updateRoom(game.host, { buzzedPlayerId: null, buzzTimestamp: null, buzzAttempts: {}, incorrectBuzzedIds: ['player'],
            history: [event('answer_incorrect', 'host', { playerId: 'player', questionId: 'q1', points: -100 })] });
        const race = await read(game.raceRef);
        assert.notEqual(race.raceId, old); assert.equal(race.openingDelayMs, 0);
        assert.equal(await actions.submitBuzz(game.player, race.raceId, 'player', 1, 'excluded'), false);
        assert.equal(await actions.submitBuzz(game.late, old, 'late', 1, 'stale'), false);
        assert.equal(await actions.submitBuzz(game.late, race.raceId, 'late', 400, 'reopened'), true);
        await closeWindow(game); await actions.finalizeBuzz(game.host, race.raceId, 'host');
        assert.equal((await read(doc(game.host, 'recap', 'summary'))).players.late.buzzes, 2);
    });
    await check('buzzer: early penalty persists, concurrent reports count once, cannot be cleared or bypassed', async () => {
        game = await make(); const race = await read(game.raceRef);
        await Promise.all([actions.recordEarlyBuzz(game.player, race.raceId, 'player', 'early-a'), actions.recordEarlyBuzz(game.player, race.raceId, 'player', 'early-b')]);
        const penalized = await read(game.raceRef);
        assert.equal(penalized.penalties.player, race.openedAt.toMillis() + 4500);
        assert.equal((await read(doc(game.host, 'recap', 'summary'))).players.player.early, 1);
        await denied(updateDoc(doc(game.player, 'buzzer', 'current'), { penalties: {} }));
        await denied(actions.submitBuzz(game.player, race.raceId, 'player', 1, 'penalty-bypass'));
        await sleep(Math.max(0, penalized.penalties.player + 30 - Date.now()));
        assert.equal(await actions.submitBuzz(game.player, race.raceId, 'player', 10, 'after-penalty'), true);
        assert.equal((await read(game.raceRef)).attempts.player.reactionMs, 10);
    });
    await check('buzzer: expired submissions cannot enter an unresolved race; host reconnect resolves without extending deadline', async () => {
        const race = await read(game.raceRef);
        await closeWindow(game);
        await denied(actions.submitBuzz(game.late, race.raceId, 'late', 1, 'too-late'));
        assert.equal((await read(game.raceRef)).phase, 'collecting');
        await actions.finalizeBuzz(game.host, race.raceId, 'host');
        assert.equal((await read(game.host)).buzzedPlayerId, 'player');
    });
    await check('buzzer: equal reactions use server order then stable player ID and never earn zero-gap closest-late', async () => {
        assert.deepEqual(rankBuzzAttempts({ b: { playerId: 'b', reactionMs: 1, acceptedAt: 2 }, a: { playerId: 'a', reactionMs: 1, acceptedAt: 2 } }).map((a) => a.playerId), ['a', 'b']);
        game = await make(); const id = await unlock(game);
        await actions.submitBuzz(game.late, id, 'late', 500, 'tie-first');
        await actions.submitBuzz(game.player, id, 'player', 500, 'tie-second');
        await closeWindow(game); await actions.finalizeBuzz(game.host, id, 'host');
        assert.equal((await read(game.host)).buzzedPlayerId, 'late');
        const summary = await read(doc(game.host, 'recap', 'summary'));
        assert.equal(summary.players.player.late, 1); assert.equal(summary.players.player.closestLate, null);
    });
    await check('buzzer: reveal cancels collecting, stale finalization does nothing, next question resets penalties', async () => {
        game = await make(); const id = await unlock(game);
        await actions.submitBuzz(game.player, id, 'player', 300, 'cancelled');
        await actions.updateRoom(game.host, { answerRevealed: true, buzzedPlayerId: null, buzzTimestamp: null, buzzAttempts: {},
            history: [event('question_skipped', 'host', { questionId: 'q1' })] });
        assert.equal((await read(game.raceRef)).phase, 'cancelled');
        assert.equal(await actions.finalizeBuzz(game.host, id, 'host'), false);
        assert.equal(await actions.submitBuzz(game.late, id, 'late', 100, 'after-reveal'), false);
        await actions.updateRoom(game.host, { activeQuestionId: null, answerRevealed: false,
            history: [event('board_resumed', 'host', { questionId: 'q1' })] });
        assert.equal((await read(game.host)).activeQuestionId, null);
        assert.equal(await actions.handlePickQuestion(game.host, 'q2', 'host', event('question_picked')), true);
        assert.equal((await read(game.host)).activeQuestionId, 'q2');
        assert.notEqual((await read(game.raceRef)).raceId, id);
        assert.equal((await read(game.raceRef)).questionId, 'q2');
        assert.deepEqual((await read(game.raceRef)).penalties, {});
    });
    await check('buzzer: 20-player race finalizes history and recap atomically within rules access limits', async () => {
        const roster = { host: players.host }, connections = [];
        for (let i = 0; i < 20; i++) { const uid = `buzz${i}`; roster[uid] = { name: uid, score: 0, isHost: false }; connections.push([uid, client(uid)]); }
        game = await make(roster); const id = await unlock(game);
        // Start near-concurrent real transactions; contention is included in the deadline.
        const results = await Promise.allSettled(connections.map(([uid, db], i) => actions.submitBuzz(roomRef(db, game.id), id, uid, 500 + i, uid)));
        // The emulator may exhaust the real 2s window under 20-way contention. Seed
        // only the acceptance fixture for the separate maximum-size finalization check.
        assert.ok(results.some((r) => r.status === 'fulfilled' && r.value));
        const acceptedAt = Timestamp.fromMillis(Date.now() - 2100);
        await updateDoc(doc(roomRef(seedDb, game.id), 'buzzer', 'current'), { firstAcceptedAt: acceptedAt,
            attempts: Object.fromEntries(connections.map(([uid], i) => [uid, { playerId: uid, reactionMs: 500 + i, operationId: uid, acceptedAt }])) });
        await actions.finalizeBuzz(game.host, id, 'host');
        const summary = await read(doc(game.host, 'recap', 'summary'));
        assert.ok(connections.every(([uid]) => summary.players[uid].buzzes === 1));
        assert.equal((await getDocs(collection(game.host, 'history'))).docs.filter((d) => d.data().type.startsWith('player_buzzed')).length, 20);
        await actions.handleEndGame(game.host, event('game_finished'));
        assert.equal((await read(game.raceRef)).phase, 'cancelled');
        assert.equal((await read(doc(game.host, 'recap', 'summary'))).finalized, true);
    });
    await check('buzzer: forged acceptance timestamps and other-player submissions are denied', async () => {
        game = await make(); await unlock(game);
        for (const [uid, acceptedAt] of [['player', Timestamp.fromMillis(1)], ['late', serverTimestamp()]]) {
            await denied(updateDoc(doc(game.player, 'buzzer', 'current'), { phase: 'collecting', firstAcceptedAt: serverTimestamp(),
                attempts: { [uid]: { playerId: uid, reactionMs: 0, operationId: 'forged', acceptedAt } } }));
        }
    });
    await check('buzzer: wrong-answer reopening retains another contestant\'s unexpired penalty', async () => {
        const raceId = (await read(game.raceRef)).raceId;
        await actions.recordEarlyBuzz(game.player, raceId, 'player', 'persist-penalty');
        await actions.submitBuzz(game.late, raceId, 'late', 100, 'other-winner');
        await closeWindow(game); await actions.finalizeBuzz(game.host, raceId, 'host');
        const penalty = (await read(game.raceRef)).penalties.player;
        await actions.updateRoom(game.host, { buzzedPlayerId: null, buzzTimestamp: null, buzzAttempts: {}, incorrectBuzzedIds: ['late'],
            history: [event('answer_incorrect', 'host', { playerId: 'late', questionId: 'q1', points: -100 })] });
        assert.equal((await read(game.raceRef)).penalties.player, penalty);
    });
    await check('buzzer: finish cancels unresolved collection and surprise questions have no ordinary race', async () => {
        game = await make(); let id = await unlock(game);
        await actions.submitBuzz(game.player, id, 'player', 100, 'finish-pending');
        await actions.handleEndGame(game.host, event('game_finished'));
        assert.equal((await read(game.raceRef)).phase, 'cancelled');
        assert.equal(await actions.finalizeBuzz(game.host, id, 'host'), false);
        game = await make();
        await actions.updateRoom(game.host, { answerRevealed: true, buzzedPlayerId: null, buzzTimestamp: null, buzzAttempts: {},
            'questionStates.q1': 'done', history: [event('question_skipped', 'host', { questionId: 'q1' })] });
        await actions.updateRoom(game.host, { activeQuestionId: null, answerRevealed: false,
            history: [event('board_resumed', 'host', { questionId: 'q1' })] });
        assert.equal((await read(game.host)).activeQuestionId, null);
        assert.equal(await actions.handlePickQuestion(game.host, 'surprise', 'host', event('question_picked')), true);
        const room = await read(game.host);
        assert.equal(room.activeQuestionId, 'surprise');
        assert.equal(room.buzzerRoundId, null);
        assert.equal((await read(game.raceRef)).phase, 'cancelled');
        id = (await read(game.raceRef)).raceId;
        assert.equal(await actions.submitBuzz(game.player, id, 'player', 1, 'surprise'), false);
    });
}
