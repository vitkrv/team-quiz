import assert from 'node:assert/strict';
import { collection, doc, getDocFromServer, getDocs, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { getAllCategories, getAllQuestions, getPackMedia, getPackRounds, validatePackRounds } from '../src/utils/packRounds.js';
import { hasDefinedFinalResults } from '../src/utils/gameResults.js';
import worker from '../imagekit-auth-worker/worker.js';

// Called only by the isolated storage harness; never starts a browser or uses real services.
export async function verifyPackRounds({ actions, check, denied, hostDb, playerDb, spectatorDb, seedDb, ref, roomRef, event, t, client }) {
    const actor = { id: 'host', name: 'host' };
    const pack = { ownerId: 'host', name: 'Three rounds', isPublic: false, rounds: [0, 1, 2].map((index) => ({
        id: `round-${index}`, categories: [{ id: `category-${index}`, name: 'Same category name', questions: [
            { id: `round-question-${index}`, text: 'Question', answer: 'Answer', points: 100 }
        ] }]
    })) };
    const read = async (target) => (await getDocFromServer(target)).data();
    let serial = 0;
    const make = async (source = pack) => {
        const packId = `rounds-${serial++}`;
        await setDoc(ref(hostDb, 'packs', packId), source);
        const id = await actions.createRoom({ hostId: 'host', packId, pack: source, status: 'lobby', trueCompetitiveMode: true,
            players: { host: { name: 'host', isHost: true, score: 0 }, player: { name: 'player', isHost: false, score: 0 } },
            activeQuestionId: null, answerRevealed: false, buzzedPlayerId: null, buzzTimestamp: null,
            buzzUnlockAt: 0, buzzAttempts: {}, incorrectBuzzedIds: [], history: [event('room_created')] });
        return { id, packId, host: roomRef(hostDb, id), player: roomRef(playerDb, id), seed: roomRef(seedDb, id) };
    };
    const resume = (game, questionId) => actions.updateRoom(game.host, {
        activeQuestionId: null, answerRevealed: false, buzzedPlayerId: null, buzzTimestamp: null,
        buzzUnlockAt: null, buzzAttempts: {}, incorrectBuzzedIds: [], mediaPlayback: null,
        surprisePlayerDraw: null, surpriseRound: null,
        history: [event('board_resumed', 'host', { questionId })]
    });
    const answer = async (game, questionId) => {
        await updateDoc(game.host, { status: 'playing' });
        assert.equal(await actions.handlePickQuestion(game.host, questionId, 'host', event('question_picked')), true);
        const raceRef = doc(game.host, 'buzzer', 'current');
        await updateDoc(doc(game.seed, 'buzzer', 'current'), { openedAt: Timestamp.fromMillis(Date.now() - 2200) });
        const race = await read(raceRef);
        assert.equal(await actions.submitBuzz(game.player, race.raceId, 'player', 250, `press-${questionId}`), true);
        // Exercise actual server acceptance/finalization in every round.
        await new Promise((resolve) => setTimeout(resolve, 2050));
        await actions.finalizeBuzz(game.host, race.raceId, 'host');
        await actions.updateRoom(game.host, { answerRevealed: true, currentTurn: 'player', [`questionStates.${questionId}`]: 'done',
            history: [event('answer_correct', 'host', { questionId, playerId: 'player', points: 100 })] });
    };

    await check('pack rounds: legacy normalization, size limits, empty categories and unique IDs', async () => {
        const legacy = { categories: pack.rounds[0].categories };
        assert.equal(getPackRounds(legacy).length, 1);
        assert.equal(validatePackRounds(legacy), null);
        assert.equal(validatePackRounds({ rounds: getPackRounds(legacy) }), null);
        assert.equal(getAllCategories(pack).length, 3);
        assert.equal(getAllQuestions(pack).length, 3);
        const mediaPack = structuredClone(pack);
        getAllQuestions(mediaPack).forEach((question, index) => {
            question.questionMedia = { fileId: `question-${index}` };
            question.answerMedia = { fileId: `answer-${index}` };
        });
        mediaPack.prize = { hiddenMedia: { fileId: 'hidden' }, revealedMedia: { fileId: 'revealed' } };
        assert.equal(getPackMedia(mediaPack).length, 8);
        assert.equal(getPackMedia({ categories: mediaPack.rounds[0].categories }).length, 2);
        for (const rounds of [[], [...pack.rounds, { ...pack.rounds[0], id: 'four' }],
            [{ id: 'empty', categories: [] }], [{ id: 'empty', categories: [{ id: 'cat', questions: [] }] }],
            [pack.rounds[0], { ...pack.rounds[0], id: 'duplicate-questions' }]]) {
            assert.ok(validatePackRounds({ rounds }));
            const game = await make({ ...pack, rounds });
            await assert.rejects(actions.startGame(game.host, actor, t));
            assert.equal((await read(game.host)).status, 'lobby');
        }
        for (const count of [1, 2]) {
            const game = await make({ ...pack, rounds: pack.rounds.slice(0, count) });
            await actions.startGame(game.host, actor, t);
            assert.equal((await read(game.host)).roundCount, count);
            await actions.handleEndGame(game.host, event('game_finished'));
        }
    });

    let game;
    await check('pack rounds: frozen full pack, future-question denial, negative scores and shared break', async () => {
        game = await make();
        await actions.startGame(game.host, actor, t);
        const start = await read(game.host);
        assert.equal(start.roundCount, 3);
        assert.equal(Object.keys(start.questionStates).length, 3);
        await updateDoc(ref(hostDb, 'packs', game.packId), { rounds: [pack.rounds[0]] });
        assert.deepEqual((await read(ref(hostDb, 'gamePackVersions', start.packVersionId))).content.rounds, pack.rounds);
        await updateDoc(game.host, { status: 'playing' });
        assert.equal(await actions.handlePickQuestion(game.host, 'round-question-1', 'host', event('question_picked')), false);
        assert.equal(await actions.pulseQuestionSelection(game.player, 'round-question-1', 'player'), false);
        await denied(updateDoc(game.host, { activeQuestionId: 'round-question-1' }));
        await denied(updateDoc(game.player, { currentRoundIndex: 1 }));
        await actions.adjustScore(game.host, 'player', 0, -500, event('score_adjusted'));
        await answer(game, 'round-question-0');
        await Promise.all([resume(game, 'round-question-0'), resume(game, 'round-question-0')]);
        const state = await read(roomRef(spectatorDb, game.id));
        assert.equal(state.status, 'round_break');
        assert.equal(state.players.player.score, -400);
        assert.equal(state.currentTurn, 'player');
        assert.equal(hasDefinedFinalResults(state), false);
        const summary = await read(doc(game.host, 'recap', 'summary'));
        assert.equal(summary.players.player.correct, 1);
        assert.equal(summary.finalized, false);
        assert.equal((await getDocs(collection(game.host, 'history'))).docs.filter((d) => d.data().type === 'round_completed').length, 1);
        await assert.rejects(actions.startNextRound(game.player, 0, { id: 'player' }, t));
        await denied(updateDoc(game.player, { status: 'category_preview', currentRoundIndex: 1 }));
        await denied(updateDoc(game.host, { status: 'category_preview' }));
        await actions.initializeTieBreaker(game.host, ['player'], 'one', event('tie_breaker_started'));
        assert.equal((await read(game.host)).tieBreaker, undefined);
    });

    await check('pack rounds: concurrent advance, reconnect, cumulative streaks and final-only results', async () => {
        await Promise.all([actions.startNextRound(game.host, 0, actor, t), actions.startNextRound(game.host, 0, actor, t)]);
        const reconnected = roomRef(client('host', false, 'rounds-host-reconnected'), game.id);
        let state = await read(reconnected);
        assert.equal(state.status, 'category_preview');
        assert.equal(state.currentRoundIndex, 1);
        assert.equal(state.categoryPreviewIndex, 0);
        assert.equal(state.players.player.score, -400);
        assert.equal(state.currentTurn, 'player');
        assert.deepEqual(state.currentRoundQuestionIds, ['round-question-1']);
        assert.equal(await actions.startNextRound(reconnected, 0, actor, t), false);
        await answer(game, 'round-question-1');
        await resume(game, 'round-question-1');
        assert.equal((await read(game.host)).status, 'round_break');
        assert.equal(await actions.startNextRound(reconnected, 0, actor, t), false);
        await actions.startNextRound(reconnected, 1, actor, t);
        await answer(game, 'round-question-2');
        await resume(game, 'round-question-2');
        state = await read(game.host);
        assert.equal(state.status, 'playing');
        assert.equal(state.players.player.score, -200);
        assert.equal(hasDefinedFinalResults(state), true);
        const summary = await read(doc(game.host, 'recap', 'summary'));
        assert.equal(summary.players.player.correct, 3);
        assert.equal(summary.players.player.longestStreak, 3);
        assert.equal(Object.keys(summary.players.player.categories).length, 3);
        assert.equal((await getDocs(collection(game.host, 'history'))).docs.filter((d) => d.data().type === 'round_started').length, 2);
        const version = ref(hostDb, 'gamePackVersions', state.packVersionId);
        await actions.handleEndGame(game.host, event('game_finished'));
        assert.equal((await getDocFromServer(version)).exists(), false);
        assert.equal((await read(doc(game.host, 'recap', 'summary'))).finalized, true);
        assert.equal(hasDefinedFinalResults(await read(roomRef(spectatorDb, game.id))), true);
    });

    await check('pack rounds: skip enters break and early finish deletes frozen snapshot', async () => {
        const skipped = await make();
        await actions.startGame(skipped.host, actor, t);
        await updateDoc(skipped.host, { status: 'playing' });
        await actions.handlePickQuestion(skipped.host, 'round-question-0', 'host', event('question_picked'));
        await actions.updateRoom(skipped.host, { answerRevealed: true, 'questionStates.round-question-0': 'done',
            history: [event('question_skipped', 'host', { questionId: 'round-question-0' })] });
        await resume(skipped, 'round-question-0');
        const state = await read(skipped.host);
        assert.equal(state.status, 'round_break');
        await actions.handleEndGame(skipped.host, event('game_finished'));
        assert.equal((await getDocFromServer(ref(hostDb, 'gamePackVersions', state.packVersionId))).exists(), false);
    });

    await check('pack rounds: surprise wheel completion gates round advancement', async () => {
        const source = structuredClone(pack);
        source.rounds[0].categories[0].questions[0].isSurpriseQuestion = true;
        const surprise = await make(source);
        await actions.startGame(surprise.host, actor, t);
        await updateDoc(surprise.host, { status: 'playing' });
        await actions.beginSurprisePlayerDraw(surprise.host, 'round-question-0', 'host', 'player');
        await actions.completeSurprisePlayerDraw(surprise.host, (await read(surprise.host)).surprisePlayerDraw.id, 'host', event('question_picked'));
        await actions.updateRoom(surprise.host, { answerRevealed: true, 'questionStates.round-question-0': 'done',
            surpriseRound: { ...(await read(surprise.host)).surpriseRound, judgeResult: 'correct', scoringMechanic: 'wheel', wheelValues: [-100], scoreAppliedAt: null },
            history: [event('surprise_answer_correct', 'host', { questionId: 'round-question-0', playerId: 'player' })] });
        await resume(surprise, 'round-question-0');
        assert.equal((await read(surprise.host)).status, 'playing');
        await denied(updateDoc(surprise.host, { status: 'round_break', activeQuestionId: null }));
        await actions.startSurpriseWheel(surprise.host, 'round-question-0', actor, t);
        await updateDoc(surprise.seed, { 'surpriseRound.rolledAt': Timestamp.fromMillis(Date.now() - 6100) });
        await actions.completeSurpriseWheel(surprise.host, 'round-question-0', (await read(surprise.host)).surpriseRound.spinId, actor, t);
        await resume(surprise, 'round-question-0');
        assert.equal((await read(surprise.host)).status, 'round_break');
        await actions.startNextRound(surprise.host, 0, actor, t);
        assert.equal((await read(surprise.host)).players.player.score, -100);
        await actions.handleEndGame(surprise.host, event('game_finished'));
    });

    await check('pack rounds: Worker upload authorization traverses every round and preserves ownership', async () => {
        const originalFetch = globalThis.fetch;
        const value = (v) => Array.isArray(v) ? { arrayValue: { values: v.map(value) } }
            : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, value(val)])) } }
                : typeof v === 'string' ? { stringValue: v } : { integerValue: String(v) };
        const token = `a.${Buffer.from(JSON.stringify({ sub: 'host' })).toString('base64url')}.c`;
        const env = { FIREBASE_PROJECT_ID: 'demo-game-storage', IMAGEKIT_PRIVATE_KEY: 'test-only', IMAGEKIT_PUBLIC_KEY: 'test', IMAGEKIT_URL_ENDPOINT: 'https://example.test' };
        const request = (questionId) => new Request('https://worker.test', { method: 'POST', headers: { authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: 'uploadAuth', appId: 'test', packId: 'pack', questionId, slot: 'questionMedia' }) });
        try {
            for (const source of [pack, { ...pack, rounds: undefined, categories: pack.rounds[0].categories }]) {
                const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined));
                globalThis.fetch = async () => Response.json({ fields: value(cleaned).mapValue.fields });
                for (const question of getAllQuestions(cleaned)) assert.equal((await worker.fetch(request(question.id), env)).status, 200);
                await assert.rejects(worker.fetch(request('missing'), env), /not found/);
            }
            globalThis.fetch = async () => Response.json({ fields: value({ ...pack, ownerId: 'other' }).mapValue.fields });
            await assert.rejects(worker.fetch(request('round-question-0'), env), /owner/);

            const media = { packId: 'pack', questionId: 'round-question-2', slot: 'answerMedia', fileId: 'file', filePath: '/TeamQuiz/pack-answer.png' };
            const deletion = (item = media) => new Request('https://worker.test', { method: 'POST', headers: { authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: 'delete', appId: 'test', media: item }) });
            await assert.rejects(worker.fetch(deletion(), env), /owner/);
            let deleted = false;
            globalThis.fetch = async (url, options) => {
                if (String(url).includes('firestore.googleapis.com')) return Response.json({ fields: value(pack).mapValue.fields });
                if (options?.method === 'DELETE') { deleted = true; return Response.json({}); }
                return Response.json({ filePath: media.filePath });
            };
            await assert.rejects(worker.fetch(deletion({ ...media, filePath: '/TeamQuiz/another-pack.png' }), env), /does not belong/);
            assert.equal(deleted, false);
            assert.equal((await worker.fetch(deletion(), env)).status, 200);
            assert.equal(deleted, true);
        } finally { globalThis.fetch = originalFetch; }
    });
}
