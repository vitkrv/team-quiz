import assert from 'node:assert/strict';
import { collection, deleteField, doc, getDocFromServer, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { scoreHistoryChange } from '../src/utils/scoreHistory.js';

// Invoked exclusively by verify-game-storage.mjs against its isolated Emulator.
export async function verifyTextAnswers({ actions, check, denied, hostDb, playerDb, spectatorDb, seedDb, ref, roomRef, event, t, client }) {
    const actor = { id: 'host', name: 'host' };
    const read = async (target) => (await getDocFromServer(target)).data();
    const stage = async (label, action) => { try { return await action(); } catch (error) { error.message = `${label}: ${error.message}`; throw error; } };
    const pack = { ownerId: 'host', name: 'Text answers', isPublic: false, rounds: [0, 1].map((index) => ({
        id: `text-round-${index}`, categories: [{ id: `text-category-${index}`, name: 'Text', questions: [
            { id: `text-question-${index}`, text: 'Question', answer: 'Official answer', points: 300, isTextAnswerQuestion: true },
            { id: `buzz-question-${index}`, text: 'Ordinary', answer: 'Answer', points: 100 }
        ] }]
    })) };
    let serial = 0;
    const make = async (competitive = false, count = 3, legacy = false, source = pack) => {
        const players = { host: { name: 'host', isHost: true, score: 0 } };
        const ids = Array.from({ length: count }, (_, i) => i === 0 ? 'player' : `text-player-${String(i).padStart(2, '0')}`);
        ids.forEach((id) => { players[id] = { name: id, isHost: false, score: 100 }; });
        const packId = `text-test-pack-${serial++}`;
        await setDoc(ref(hostDb, 'packs', packId), source);
        const id = await actions.createRoom({ hostId: 'host', packId, pack: source, status: 'lobby', trueCompetitiveMode: competitive,
            players, activeQuestionId: null, answerRevealed: false, buzzedPlayerId: null, buzzTimestamp: null,
            buzzUnlockAt: 0, buzzAttempts: {}, incorrectBuzzedIds: [], history: [event('room_created')] });
        const host = roomRef(hostDb, id), seed = roomRef(seedDb, id);
        if (legacy) await updateDoc(seed, { pack: source, history: [], dataVersion: deleteField(), recapVersion: deleteField(),
            buzzerPolicyVersion: deleteField(), scoreHistoryVersion: deleteField() });
        await stage(`start ${count} contestants`, () => actions.startGame(host, actor, t));
        await stage('enter playing', () => updateDoc(host, { status: 'playing' }));
        const turn = (await read(host)).currentTurn;
        assert.equal(await stage(`open text ${count} contestants`, () => actions.handlePickQuestion(host, 'text-question-0', 'host', event('question_picked'))), true);
        const round = (await read(host)).textAnswerRound;
        return { id, host, seed, round, turn, ids: [...ids].sort(), player: roomRef(playerDb, id), spectator: roomRef(spectatorDb, id), packId };
    };
    const reveal = (game, index) => actions.revealTextAnswer(game.host, game.round.id, 'host', index);
    const judge = (game, index, decision, amount = 300) => actions.judgeTextAnswer(game.host, game.round.id, actor, index, decision, amount, t);
    const resume = (game, questionId = 'text-question-0') => actions.updateRoom(game.host, { activeQuestionId: null,
        answerRevealed: false, textAnswerRound: null, mediaPlayback: null, buzzedPlayerId: null, buzzTimestamp: null,
        buzzUnlockAt: null, buzzAttempts: {}, incorrectBuzzedIds: [],
        history: [event('board_resumed', 'host', { questionId })] });

    const makeBulk = async (count = 3, legacy = false, competitive = false) => {
        const source = structuredClone(pack);
        source.rounds[0].categories[0].questions[0].assessAllAtOnce = true;
        return make(competitive, count, legacy, source);
    };
    const saveBulk = (game, revision, uid, points) => stage(`bulk save ${revision}`, () => actions.saveTextAssessment(game.host, game.round.id, 'host', revision, uid, points));
    const revealBulk = (game, revision) => stage(`bulk reveal ${revision}`, () => actions.revealTextAssessments(game.host, game.round.id, actor, revision, t));
    for (const legacy of [false, true]) await check(`bulk text: answer visibility defaults, persistence, authorization and reveal ${legacy}`, async () => {
        const game = await makeBulk(3, legacy);
        const saveVisibility = (revision, show) => actions.saveTextAnswerVisibility(game.host, game.round.id, 'host', revision, show);
        assert.equal(game.round.showAnswers, true);
        assert.equal(await saveVisibility(0, false), 'stale');
        await actions.submitTextAnswer(game.player, game.round.id, 'player', 'Hidden answer');
        await actions.closeTextAnswering(game.host, game.round.id, 'host');
        const before = await read(game.host);
        assert.equal(await saveVisibility(0, false), 'saved');
        const saved = await read(game.host);
        assert.equal(saved.textAnswerRound.showAnswers, false);
        assert.deepEqual(saved.players, before.players);
        assert.deepEqual(saved.textAnswerRound.answers, before.textAnswerRound.answers);
        assert.deepEqual(saved.textAnswerRound.draftPoints, before.textAnswerRound.draftPoints);
        for (const target of [game.player, game.spectator]) await denied(updateDoc(target, {
            'textAnswerRound.showAnswers': true, 'textAnswerRound.assessmentRevision': 2
        }));
        await denied(updateDoc(game.host, { 'textAnswerRound.showAnswers': 'false', 'textAnswerRound.assessmentRevision': 2 }));
        assert.equal(await saveVisibility(0, true), 'stale');
        assert.equal(await revealBulk(game, 0), 'stale');
        assert.equal(await saveVisibility(1, true), 'saved');
        assert.equal(await saveVisibility(2, false), 'saved');
        assert.equal(await revealBulk(game, 3), 'revealed');
        const result = await read(game.spectator);
        assert.equal(result.textAnswerRound.showAnswers, false);
        assert.deepEqual(result.players, before.players);
        assert.equal(await saveVisibility(3, true), 'stale');
        await denied(updateDoc(game.host, { 'textAnswerRound.showAnswers': true, 'textAnswerRound.assessmentRevision': 4 }));
    });

    for (const legacy of [false, true]) for (const competitive of [false, true]) await check(`bulk text: atomic signed scoring, neutral zeros, history and compatibility ${legacy}/${competitive}`, async () => {
        const game = await makeBulk(3, legacy, competitive);
        assert.equal(game.round.assessAllAtOnce, true);
        assert.deepEqual(game.round.draftPoints, Object.fromEntries(game.ids.map((uid) => [uid, 0])));
        assert.equal(await saveBulk(game, 0, 'player', 10), 'stale');
        await actions.submitTextAnswer(game.player, game.round.id, 'player', 'bulk private answer');
        await actions.closeTextAnswering(game.host, game.round.id, 'host');
        const before = await read(game.host);
        assert.equal(await saveBulk(game, 0, game.ids[0], 123), 'saved');
        assert.equal(await saveBulk(game, 1, game.ids[1], -234), 'saved');
        assert.equal(await reveal(game, 0), 'stale');
        assert.equal(await judge(game, 0, 'accept', 1), 'stale');
        assert.equal(await actions.reorderTextAnswer(game.host, game.round.id, 'host', 0, game.ids[1], -1, game.ids), 'stale');
        const draft = await read(game.host);
        assert.deepEqual(draft.players, before.players);
        assert.equal(draft.answerRevealed, false);
        assert.deepEqual(draft.textAnswerRound.answers, before.textAnswerRound.answers);
        assert.equal(draft.textAnswerRound.draftPoints[game.ids[1]], -234);
        const results = await Promise.all([revealBulk(game, 2), revealBulk(game, 2)]);
        assert.deepEqual(results.sort(), ['revealed', 'stale']);
        const after = await read(game.host);
        assert.deepEqual(game.ids.map((uid) => after.players[uid].score), [223, -134, 100]);
        assert.equal(after.currentTurn, game.turn);
        assert.equal(after.answerRevealed, true);
        assert.equal(after.textAnswerRound.phase, 'complete');
        assert.deepEqual(after.textAnswerRound.scoreDeltas, draft.textAnswerRound.draftPoints);
        assert.deepEqual((await read(game.spectator)).textAnswerRound.scoreDeltas, draft.textAnswerRound.draftPoints);
        assert.equal(await saveBulk(game, 2, 'player', 999), 'stale');
        const history = legacy ? after.history : (await getDocs(collection(game.host, 'history'))).docs.map((d) => d.data());
        const events = history.filter((e) => e.type.startsWith('text_answer_'));
        assert.equal(events.length, 3);
        assert.ok(events.every((e) => !JSON.stringify(e).includes('bulk private answer')));
        if (!legacy) {
            const recap = await read(doc(game.host, 'recap', 'summary'));
            assert.equal(recap.players[game.ids[0]].correct, 1);
            assert.equal(recap.players[game.ids[1]].incorrect, 1);
            assert.equal(recap.players[game.ids[2]].correct + recap.players[game.ids[2]].incorrect, 0);
            const scores = await getDocs(collection(game.host, 'recapScores'));
            assert.equal(scores.size, 2);
            await stage('bulk score reversal', () => actions.savePlayerScore(game.host, { playerId: game.ids[0], actor, manualDelta: 0,
                sourceEventIds: [events.find((e) => e.details.playerId === game.ids[0]).id], operationId: `bulk-reverse-${competitive}` }));
            assert.equal((await read(game.host)).players[game.ids[0]].score, 100);
        }
        await resume(game);
        assert.equal((await read(game.host)).textAnswerRound, null);
    });

    await check('bulk text: permissions, frozen answers, revision conflicts and overflow', async () => {
        const game = await makeBulk();
        await actions.closeTextAnswering(game.host, game.round.id, 'host');
        for (const target of [game.player, game.spectator]) await denied(updateDoc(target, {
            'textAnswerRound.draftPoints.player': 10, 'textAnswerRound.assessmentRevision': 1, 'textAnswerRound.assessmentPlayerId': 'player' }));
        for (const update of [
            { 'textAnswerRound.assessAllAtOnce': false }, { 'textAnswerRound.answers.player': 'changed' },
            { 'textAnswerRound.draftPoints.player': 10 },
            { 'textAnswerRound.draftPoints.player': 0.5, 'textAnswerRound.assessmentRevision': 1, 'textAnswerRound.assessmentPlayerId': 'player' },
            { 'textAnswerRound.draftPoints.host': 10, 'textAnswerRound.assessmentRevision': 1, 'textAnswerRound.assessmentPlayerId': 'host' },
            { 'textAnswerRound.draftPoints.player': 10, 'textAnswerRound.assessmentRevision': 1, 'textAnswerRound.assessmentPlayerId': 'player', 'players.player.score': 110 }
        ]) await denied(updateDoc(game.host, update));
        const saves = await Promise.all([saveBulk(game, 0, 'player', 10), saveBulk(game, 0, 'player', 20)]);
        assert.deepEqual(saves.sort(), ['saved', 'stale']);
        assert.equal(await revealBulk(game, 0), 'stale');
        assert.equal(await saveBulk(game, 1, 'player', Number.MAX_SAFE_INTEGER), 'saved');
        await assert.rejects(revealBulk(game, 2), /Invalid points/);
        assert.equal((await read(game.host)).players.player.score, 100);
        assert.equal(await saveBulk(game, 2, 'player', -1), 'saved');
        const racing = await Promise.all([saveBulk(game, 3, 'player', 5), revealBulk(game, 3)]);
        assert.equal(racing.filter((result) => result === 'stale').length, 1);
        if (racing[0] === 'saved') assert.equal(await revealBulk(game, 4), 'revealed');
        assert.equal((await read(game.host)).players.player.score, racing[0] === 'saved' ? 105 : 99);
    });

    for (const zero of [false, true]) await check(`bulk text: twenty-player atomic reveal, all zero=${zero}`, async () => {
        const game = await makeBulk(20);
        await actions.closeTextAnswering(game.host, game.round.id, 'host');
        const summaryBefore = await read(doc(game.host, 'recap', 'summary'));
        let revision = 0;
        if (!zero) for (const [index, uid] of game.ids.entries()) {
            assert.equal(await saveBulk(game, revision++, uid, index % 2 ? -101 : 202), 'saved');
        }
        assert.equal(await revealBulk(game, revision), 'revealed');
        const room = await read(game.host);
        game.ids.forEach((uid, index) => assert.equal(room.players[uid].score, zero ? 100 : index % 2 ? -1 : 302));
        const summary = await read(doc(game.host, 'recap', 'summary'));
        if (zero) assert.deepEqual(summary, summaryBefore);
        else game.ids.forEach((uid, index) => assert.equal(summary.players[uid][index % 2 ? 'incorrect' : 'correct'], 1));
        assert.equal((await getDocs(collection(game.host, 'recapScores'))).size, zero ? 0 : 20);
        const events = (await getDocs(collection(game.host, 'history'))).docs.filter((d) => d.id.startsWith(`text_${game.round.id}_`));
        assert.equal(events.length, 20);
        assert.equal(await revealBulk(game, revision), 'stale');
    });

    await check('bulk text: grouped proofs reject missing records, forged scores and profile changes', async () => {
        const game = await makeBulk(20);
        await actions.closeTextAnswering(game.host, game.round.id, 'host');
        const before = await read(game.host), round = before.textAnswerRound;
        const completion = { textAnswerRound: { ...round, phase: 'complete', reviewIndex: 20, scoreDeltas: round.draftPoints },
            answerRevealed: true, 'questionStates.text-question-0': 'done', mediaPlayback: null };
        await denied(updateDoc(game.host, completion));
        for (const [index, field, value] of [[0, 'score', 101], [17, 'score', 101], [7, 'name', 'forged']]) {
            const batch = writeBatch(hostDb);
            batch.update(game.host, { ...completion, [`players.${game.ids[index]}.${field}`]: value });
            round.playerIds.forEach((uid, i) => {
                const id = `text_${round.id}_${i}`;
                batch.set(doc(game.host, 'history', id), { ...event('text_answer_skipped', 'host', {
                    sessionId: round.id, playerId: uid, playerName: uid, questionId: round.questionId, reviewIndex: i,
                    batchIndex: i, amount: 0, points: 0, delta: 0, previousScore: 100, nextScore: 100, isScoreChange: false
                }), id, recordedAt: serverTimestamp() });
            });
            await denied(batch.commit());
            assert.deepEqual((await read(game.host)).players, before.players);
        }
        assert.equal(await revealBulk(game, 0), 'revealed');
    });

    await check('bulk text: twenty-player legacy room retains embedded history and bounded proofs', async () => {
        const game = await makeBulk(20, true);
        await actions.closeTextAnswering(game.host, game.round.id, 'host');
        for (const [index, uid] of game.ids.entries()) await saveBulk(game, index, uid, index % 2 ? -100 : 200);
        assert.equal(await revealBulk(game, 20), 'revealed');
        const after = await read(game.host);
        assert.equal(after.history.filter((e) => e.type.startsWith('text_answer_')).length, 20);
        game.ids.forEach((uid, i) => assert.equal(after.players[uid].score, i % 2 ? 0 : 300));
        assert.equal((await getDocs(collection(game.host, 'history'))).docs.filter((d) => d.id.startsWith(`text_${game.round.id}_`)).length, 4);
        await resume(game);
        assert.equal((await read(game.host)).textAnswerRound, null);
    });

    for (const legacy of [false, true]) for (const competitive of [false, true]) await check('text answers: persisted ordering, locks, races and authorization ' + legacy + '/' + competitive, async () => {
        const game = await make(competitive, 4, legacy);
        const move = (index, uid, direction, order) => actions.reorderTextAnswer(game.host, game.round.id, 'host', index, uid, direction, order);
        const original = game.ids;
        const swapped = [original[1], original[0], ...original.slice(2)];
        assert.equal(await move(0, original[1], -1, original), 'stale');
        await actions.closeTextAnswering(game.host, game.round.id, 'host');
        await denied(updateDoc(game.player, { 'textAnswerRound.playerIds': swapped }));
        await denied(updateDoc(game.spectator, { 'textAnswerRound.playerIds': swapped }));
        await denied(updateDoc(game.host, { 'textAnswerRound.playerIds': original.slice(1) }));
        await denied(updateDoc(game.host, { 'textAnswerRound.playerIds': [original[0], original[0], ...original.slice(2)] }));
        await denied(updateDoc(game.host, { 'textAnswerRound.playerIds': swapped, 'textAnswerRound.answerVisible': true }));
        const moves = await Promise.all([move(0, original[1], -1, original), move(0, original[1], -1, original)]);
        assert.deepEqual(moves.sort(), ['reordered', 'stale']);
        assert.deepEqual((await read(game.host)).textAnswerRound.playerIds, swapped);
        assert.equal(await actions.revealTextAnswer(game.host, game.round.id, 'host', 0, original[0]), 'stale');
        assert.equal(await actions.revealTextAnswer(game.host, game.round.id, 'host', 0, swapped[0]), 'revealed');
        await denied(updateDoc(game.host, { 'textAnswerRound.playerIds': original }));
        assert.equal(await move(0, swapped[1], -1, swapped), 'stale');
        assert.equal(await actions.judgeTextAnswer(game.host, game.round.id, actor, 0, 'accept', 17, t, original[0]), 'stale');
        const results = await Promise.all([move(0, swapped[2], -1, swapped), actions.judgeTextAnswer(game.host, game.round.id, actor, 0, 'accept', 17, t, swapped[0])]);
        assert.ok(['reordered', 'stale'].includes(results[0]));
        assert.equal(results[1], 'judged');
        let current = await read(game.host);
        assert.equal(current.players[swapped[0]].score, 117);
        assert.equal(current.textAnswerRound.answerVisible, true);
        const order = current.textAnswerRound.playerIds;
        await denied(updateDoc(game.host, { 'textAnswerRound.playerIds': [order[0], order[2], order[1], order[3]] }));
        await denied(updateDoc(game.host, { 'textAnswerRound.playerIds': [order[1], order[0], ...order.slice(2)] }));
        for (let index = 1; index < order.length; index++) assert.equal(await judge(game, index, 'deny', 5), 'judged');
        current = await read(game.host);
        assert.deepEqual(current.textAnswerRound.playerIds, order);
        assert.equal(current.answerRevealed, true);
        for (const uid of order.slice(1)) assert.equal(current.players[uid].score, competitive ? 95 : 100);
        assert.equal(await move(4, order[3], -1, order), 'stale');
    });

    await check('text answers: frozen flag, bounded roster, no buzzer, valid replacements and Unicode limits', async () => {
        const game = await make();
        const room = await read(game.host);
        assert.equal(room.buzzerRoundId, null);
        assert.equal((await getDocFromServer(doc(game.host, 'buzzer', 'current'))).exists(), false);
        assert.deepEqual(game.round.playerIds, game.ids);
        assert.ok(Object.values(game.round.answers).every((value) => value === ''));
        await updateDoc(ref(hostDb, 'packs', game.packId), { rounds: [] });
        assert.equal(await actions.submitTextAnswer(game.player, game.round.id, 'player', ' first '), 'saved');
        assert.equal(await actions.submitTextAnswer(game.player, game.round.id, 'player', 'first'), 'saved');
        assert.equal(await actions.submitTextAnswer(game.player, game.round.id, 'player', '😀'.repeat(40)), 'saved');
        assert.equal((await read(game.host)).textAnswerRound.answers.player, '😀'.repeat(40));
        for (const value of ['', ' ', 'a\nb', '\na', '😀'.repeat(41)]) {
            await assert.rejects(actions.submitTextAnswer(game.player, game.round.id, 'player', value));
            await denied(updateDoc(game.player, { 'textAnswerRound.answers.player': value }));
        }
        for (const value of [' leading', 'trailing ', '\u00a0x', 'x\u3000', 'a\u2028b', 'a\u2029b']) await denied(updateDoc(game.player, { 'textAnswerRound.answers.player': value }));
        assert.equal(await actions.submitTextAnswer(game.player, 'old-session', 'player', 'stale'), 'stale');
        await denied(updateDoc(game.player, { 'textAnswerRound.answers.text-player-01': 'forged' }));
        await denied(updateDoc(game.spectator, { 'textAnswerRound.answers.player': 'spectator' }));
        await denied(updateDoc(game.host, { 'textAnswerRound.answers.player': 'host edit' }));
        await denied(updateDoc(game.player, { 'players.player.score': 999 }));
        await denied(updateDoc(game.host, { answerRevealed: true }));
        await denied(updateDoc(game.host, { textAnswerRound: null }));
        await denied(updateDoc(game.host, { history: [] }));
        await denied(updateDoc(game.host, { buzzerRoundId: 'fake' }));
        const buzzer = { raceId: 'fake', questionId: 'text-question-0', categoryIndex: 0, questionIndex: 0, phase: 'open' };
        await denied(setDoc(doc(game.host, 'buzzer', 'current'), buzzer));
        await denied(setDoc(doc(game.host, 'history', 'forged-ordinary'), { ...event('answer_correct', 'host', {
            playerId: 'player', questionId: 'text-question-0', points: 300, isScoreChange: true, batchIndex: 0 }),
            id: 'forged-ordinary', recordedAt: serverTimestamp() }));
        await actions.updateRoom(game.host, { answerRevealed: true, history: [event('question_skipped', 'host', { questionId: 'text-question-0' })] });
        assert.equal((await read(game.host)).answerRevealed, false);
    });

    await check('text answers: 20 simultaneous submissions retain all latest answers and server closure freezes them', async () => {
        const game = await make(false, 20);
        const targets = game.ids.map((uid) => roomRef(uid === 'player' ? playerDb : client(uid), game.id));
        const results = await Promise.all(targets.map((target, i) => stage(`submit ${game.ids[i]}`, () => actions.submitTextAnswer(target, game.round.id, game.ids[i], `answer-${i}`))));
        assert.ok(results.every((value) => value === 'saved'));
        const answers = (await read(game.host)).textAnswerRound.answers;
        assert.equal(Object.values(answers).filter(Boolean).length, 20);
        await Promise.all(targets.map((target, i) => actions.submitTextAnswer(target, game.round.id, game.ids[i], `last-${i}`)));
        const racing = await Promise.all([actions.submitTextAnswer(game.player, game.round.id, 'player', 'racing'),
            actions.closeTextAnswering(game.host, game.round.id, 'host')]);
        assert.ok(['saved', 'stale'].includes(racing[0]));
        const frozen = (await read(game.host)).textAnswerRound;
        assert.equal(frozen.answers.player, racing[0] === 'saved' ? 'racing' : `last-${game.ids.indexOf('player')}`);
        assert.equal(frozen.phase, 'reviewing'); assert.equal(frozen.answerVisible, false);
        assert.equal(await actions.submitTextAnswer(game.player, game.round.id, 'player', 'late'), 'stale');
        await denied(updateDoc(game.player, { 'textAnswerRound.answers.player': 'late' }));
        await denied(updateDoc(game.host, { 'textAnswerRound.phase': 'answering' }));
        await denied(updateDoc(game.host, { 'textAnswerRound.playerIds': ['player'] }));
        await denied(updateDoc(game.host, { 'textAnswerRound.reviewIndex': 1 }));
        assert.equal(await reveal(game, 0), 'revealed');
        for (let index = 0; index < game.ids.length; index++) {
            assert.equal((await read(game.host)).textAnswerRound.answerVisible, true);
            assert.equal(await reveal(game, index), 'stale');
            assert.equal(await judge(game, index, 'accept', 1), 'judged');
        }
        const complete = await read(game.host);
        assert.equal(complete.answerRevealed, true);
        assert.deepEqual(complete.textAnswerRound.scoreDeltas, Object.fromEntries(game.ids.map((uid) => [uid, 1])));
        assert.ok(game.ids.every((uid) => complete.players[uid].score === 101));
        const summary = await read(doc(game.host, 'recap', 'summary'));
        assert.ok(game.ids.every((uid) => summary.players[uid].correct === 1));
    });

    for (const competitive of [false, true]) await check(`text answers: ${competitive ? 'competitive' : 'standard'} review, custom points, blanks, duplicate host judgments and recap`, async () => {
        const game = await make(competitive);
        await actions.submitTextAnswer(game.player, game.round.id, 'player', 'Visible after reveal');
        await actions.closeTextAnswering(game.host, game.round.id, 'host');
        assert.equal(await judge(game, 0, 'accept', 123), 'stale');
        await denied(updateDoc(game.host, { 'textAnswerRound.answerVisible': true, 'textAnswerRound.scoreDeltas': { player: 999 } }));
        await denied(updateDoc(game.player, { 'textAnswerRound.scoreDeltas': { player: 999 } }));
        await denied(updateDoc(game.player, { 'textAnswerRound.answerVisible': true }));
        assert.equal(await reveal(game, 0), 'revealed');
        for (const amount of ['', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(judge(game, 0, 'accept', amount));
        if (!competitive) await assert.rejects(judge(game, 0, 'skip', 0));
        const duplicate = await Promise.all([judge(game, 0, 'accept', 123), judge(game, 0, 'deny', 777)]);
        assert.equal(duplicate.filter((value) => value === 'judged').length, 1);
        const first = (await read(game.host)).players.player.score;
        assert.ok(first === 223 || first === (competitive ? -677 : 100));
        assert.equal((await read(game.host)).textAnswerRound.answerVisible, true);
        assert.equal(await reveal(game, 0), 'stale');
        assert.equal(await reveal(game, 1), 'stale');
        await denied(updateDoc(game.host, { 'textAnswerRound.answerVisible': false }));
        assert.equal(await judge(game, 1, 'deny', 137), 'judged');
        assert.equal((await read(game.host)).textAnswerRound.answerVisible, true);
        assert.equal(await judge(game, 2, competitive ? 'skip' : 'accept', 0), 'judged');
        const room = await read(game.host);
        assert.equal(room.answerRevealed, true); assert.equal(room.questionStates['text-question-0'], 'done');
        assert.equal(room.currentTurn, game.turn); assert.equal(room.textAnswerRound.phase, 'complete');
        assert.equal(room.players[game.ids[1]].score, competitive ? -37 : 100);
        assert.equal(room.players[game.ids[2]].score, 100);
        const expectedDeltas = { [game.ids[0]]: first - 100, [game.ids[1]]: competitive ? -137 : 0, [game.ids[2]]: 0 };
        assert.deepEqual(room.textAnswerRound.scoreDeltas, expectedDeltas);
        assert.deepEqual((await read(game.player)).textAnswerRound.scoreDeltas, expectedDeltas);
        assert.deepEqual((await read(game.spectator)).textAnswerRound.scoreDeltas, expectedDeltas);
        await denied(updateDoc(game.host, { 'textAnswerRound.scoreDeltas.player': 999 }));
        const events = (await getDocs(collection(game.host, 'history'))).docs.map((snapshot) => snapshot.data()).filter((e) => e.type.startsWith('text_answer_'));
        assert.equal(events.length, 3); assert.ok(events.every((e) => !JSON.stringify(e).includes('Visible after reveal')));
        const recap = await read(doc(game.host, 'recap', 'summary'));
        assert.equal(recap.players[game.ids[1]].incorrect, 1);
        assert.equal(recap.players[game.ids[2]].correct, competitive ? 0 : 1);
        assert.equal(recap.players[game.ids[2]].incorrect, 0);
        const scored = events.find((e) => e.details.playerId === 'player');
        if (scoreHistoryChange(scored)) {
            await actions.savePlayerScore(game.host, { playerId: 'player', actor, manualDelta: 0, sourceEventIds: [scored.id], operationId: `text-reverse-${competitive}` });
            assert.equal((await read(game.host)).players.player.score, 100);
            assert.equal((await read(doc(game.host, 'recap', 'summary'))).players.player.correct, recap.players.player.correct);
        }
        await resume(game); assert.equal((await read(game.host)).textAnswerRound, null);
        assert.equal(await actions.handlePickQuestion(game.host, 'buzz-question-0', 'host', event('question_picked')), true);
        assert.ok((await read(game.host)).buzzerRoundId);
        await actions.handleEndGame(game.host, event('game_finished'));
        assert.equal((await read(game.host)).textAnswerRound, null);
    });

    await check('text answers: forgery rejected, atomic judgment required, safe score limits and finish cleanup', async () => {
        const game = await make(true, 1);
        await denied(updateDoc(game.player, { 'textAnswerRound.phase': 'reviewing' }));
        await actions.closeTextAnswering(game.host, game.round.id, 'host'); await reveal(game, 0);
        await assert.rejects(judge(game, 0, 'accept', Number.MAX_SAFE_INTEGER));
        const batch = writeBatch(hostDb);
        batch.update(game.host, { 'players.player.score': 400, answerRevealed: true, 'questionStates.text-question-0': 'done',
            'textAnswerRound.reviewIndex': 1, 'textAnswerRound.phase': 'complete', 'textAnswerRound.answerVisible': false });
        await denied(batch.commit());
        await denied(setDoc(doc(game.host, 'history', `text_${game.round.id}_0`), { ...event('text_answer_accepted'),
            id: `text_${game.round.id}_0`, recordedAt: serverTimestamp(),
            details: { sessionId: game.round.id, reviewIndex: 0, playerId: 'player', questionId: 'text-question-0',
                amount: 999, points: 999, delta: 999, previousScore: 100, nextScore: 1099, isScoreChange: true, batchIndex: 0 } }));
        await actions.handleEndGame(game.host, event('game_finished'));
        const room = await read(game.host); assert.equal(room.status, 'finished'); assert.equal(room.textAnswerRound, null);
        assert.equal((await getDocFromServer(ref(hostDb, 'gamePackVersions', room.packVersionId))).exists(), false);
    });

    await check('text answers: media submissions preserve playback, review blocks replay, round breaks and cumulative streaks', async () => {
        const source = structuredClone(pack);
        source.rounds.forEach((round) => { round.categories[0].questions = round.categories[0].questions.slice(0, 1); });
        source.rounds[0].categories[0].questions[0].questionMedia = { kind: 'audio', mimeType: 'audio/wav',
            fileId: 'text-media', url: 'https://example.invalid/text.wav', stopPoints: [2], durationSeconds: 5, allowParticipantMediaReplay: false };
        const game = await make(false, 1, false, source);
        assert.equal(await actions.startQuestionMedia(game.host, 'host', 'text-question-0'), true);
        const playback = (await read(game.host)).mediaPlayback;
        await actions.submitTextAnswer(game.player, game.round.id, 'player', 'with media');
        assert.deepEqual((await read(game.host)).mediaPlayback, playback);
        assert.equal(await actions.continueQuestionMedia(game.host, 'host', 'text-question-0', playback.sessionId, 0), true);
        await actions.closeTextAnswering(game.host, game.round.id, 'host');
        assert.equal(await actions.startQuestionMedia(game.host, 'host', 'text-question-0', playback.startedAt), false);
        await reveal(game, 0); await judge(game, 0, 'accept', 111); await resume(game);
        assert.equal((await read(game.host)).status, 'round_break');
        await actions.startNextRound(game.host, 0, actor, t);
        await updateDoc(game.host, { status: 'playing' });
        await actions.handlePickQuestion(game.host, 'text-question-1', 'host', event('question_picked'));
        game.round = (await read(game.host)).textAnswerRound;
        await actions.closeTextAnswering(game.host, game.round.id, 'host'); await reveal(game, 0); await judge(game, 0, 'accept', 222);
        const recap = await read(doc(game.host, 'recap', 'summary'));
        assert.equal(recap.players.player.correct, 2); assert.equal(recap.players.player.streak, 2);
        assert.equal(recap.players.player.categories['text-category-0'].points, 111);
        assert.equal(recap.players.player.categories['text-category-1'].points, 222);
        assert.equal((await read(game.host)).players.player.score, 433);
        assert.equal((await read(game.host)).currentTurn, game.turn);
        await resume(game, 'text-question-1');
        assert.equal((await read(game.host)).status, 'playing');
        await actions.handleEndGame(game.host, event('game_finished'));
    });

    await check('text answers: embedded legacy pack compatibility and invalid mixed modes', async () => {
        const game = await make(false, 1, true);
        await actions.submitTextAnswer(game.player, game.round.id, 'player', 'legacy');
        await actions.closeTextAnswering(game.host, game.round.id, 'host'); await reveal(game, 0); await judge(game, 0, 'accept', 321);
        assert.equal((await read(game.host)).players.player.score, 421);
        await resume(game);
        const invalid = structuredClone(pack); invalid.rounds[0].categories[0].questions[0].isSurpriseQuestion = true;
        const packId = 'text-invalid-mode'; await setDoc(ref(hostDb, 'packs', packId), invalid);
        await updateDoc(game.seed, { status: 'lobby', pack: invalid });
        await assert.rejects(actions.startGame(game.host, actor, t), /invalidQuestionMode/);
    });
}
