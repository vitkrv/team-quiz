import assert from 'node:assert/strict';
import { collection, doc, getDocFromServer, getDocs, orderBy, documentId, query, setDoc, serverTimestamp, deleteField, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { compareHistoryEvents, reversalEventId, scoreHistoryChange, selectPlayerScoreHistory, supportsScoreHistory, SCORE_HISTORY_WINDOW_MS, validScore } from '../src/utils/scoreHistory.js';
import { createReversalWatcher, playerScoreHistoryQuery, subscribePlayerScoreHistory } from '../src/services/playerScoreHistory.js';

// Invoked only by the isolated storage entry point; never uses a browser.
export async function verifyScoreEdits({ actions, check, denied, hostDb, playerDb, spectatorDb, seedDb, ref, roomRef, event, t }) {
    const actor = { id: 'host', name: 'host' };
    const read = async (ref) => (await getDocFromServer(ref)).data();
    const pack = { ownerId: 'host', name: 'Score edits', categories: [{ id: 'cat', name: 'Category', questions: [
        { id: 'q', text: 'Question', answer: 'Answer', points: 300 }, { id: 'q2', text: 'Next', answer: 'Answer', points: 100 }
    ] }] };
    await setDoc(ref(hostDb, 'packs', 'score-edit-pack'), pack);
    const make = async () => {
        const id = await actions.createRoom({ hostId: 'host', packId: 'score-edit-pack', pack, status: 'lobby', trueCompetitiveMode: true,
            players: { host: { name: 'host', isHost: true, score: 0 }, player: { name: 'Same', isHost: false, score: 0 },
                other: { name: 'Same', isHost: false, score: 0 } },
            activeQuestionId: null, answerRevealed: false, buzzedPlayerId: null, buzzTimestamp: null,
            buzzUnlockAt: 0, buzzAttempts: {}, incorrectBuzzedIds: [], history: [event('room_created')] });
        const target = roomRef(hostDb, id);
        await actions.startGame(target, actor, t);
        await updateDoc(target, { status: 'playing' });
        return { id, target };
    };
    let operation = 0;
    const save = (target, manualDelta = 0, sourceEventIds = [], operationId = `edit_${++operation}`, playerId = 'player', who = actor) =>
        actions.savePlayerScore(target, { playerId, manualDelta, sourceEventIds, operationId, actor: who });
    const entries = async (target) => (await getDocs(query(collection(target, 'history'), orderBy('recordedAt', 'asc'), orderBy(documentId(), 'asc')))).docs.map((s) => s.data());
    const game = await make();
    await check('score history: existing writes derive flags and normalize batch ordering', async () => {
        const types = [
            ['answer_correct', { points: 100 }, true], ['answer_incorrect', { points: -100 }, true],
            ['answer_incorrect', { points: 0 }, false], ['surprise_table_picked', { points: -100 }, true],
            ['surprise_wheel_scored', { points: 200 }, true], ['surprise_wheel_rolled', { points: 200, spinId: 'start' }, false],
            ['score_adjusted', { delta: -100 }, true], ['score_set', { previousScore: 0, nextScore: 100 }, true],
            ['score_reverted', { delta: 100, batchIndex: 2 }, true], ['player_buzzed', {}, false],
            ['question_picked', {}, false], ['surprise_answer_correct', { points: 100 }, false]
        ];
        const written = [];
        const writer = { set: (ref, value) => written.push(value) };
        for (const [type, details, expected] of types) {
            const source = event(type, 'host', { playerId: 'player', ...details, isScoreChange: !expected });
            actions.appendHistory(writer, game.target, [source]);
            const saved = written.at(-1);
            assert.equal(saved.details.isScoreChange, expected, type);
            assert.equal(saved.details.batchIndex, details.batchIndex || 0);
            assert.equal(source.details.isScoreChange, !expected, 'classification must not mutate callers');
        }
        assert.equal(written.length, types.length, 'one existing history write per event');
        await save(game.target, -50, [], 'flagged_manual');
        const saved = await read(doc(game.target, 'history', 'score_edit_flagged_manual'));
        assert.equal(saved.details.isScoreChange, true); assert.equal(saved.details.batchIndex, 0);
        await save(game.target, 0, [saved.id], 'flagged_reversal');
        assert.equal((await read(doc(game.target, 'history', await reversalEventId(saved.id)))).details.isScoreChange, true);
        assert.equal((await read(game.target)).players.player.score, 0);
    });
    await check('score history: direct limit-three query respects player, flag, cutoff, live replacement and cleanup', async () => {
        const target = (await make()).target;
        const seeded = roomRef(seedDb, target.id);
        const cutoff = Date.now() - SCORE_HISTORY_WINDOW_MS;
        const put = (id, time, playerId = 'player', flag = true) => setDoc(doc(seeded, 'history', id), {
            id, type: 'score_adjusted', timestamp: cutoff - 99999, recordedAt: Timestamp.fromMillis(time),
            details: { playerId, delta: 100, isScoreChange: flag, batchIndex: 0 }
        });
        await put('before', cutoff - 1); await put('at', cutoff); await put('after', cutoff + 1);
        await put('other', cutoff + 2, 'other'); await put('not_score', cutoff + 3, 'player', false);
        await setDoc(doc(seeded, 'history', 'unflagged'), { id: 'unflagged', recordedAt: Timestamp.fromMillis(cutoff + 5),
            details: { playerId: 'player', delta: 100, batchIndex: 0 } });
        const base = playerScoreHistoryQuery(target, 'player', cutoff);
        assert.deepEqual((await getDocs(base)).docs.map((d) => d.id), ['after', 'at']);
        await denied(getDocs(playerScoreHistoryQuery(roomRef(playerDb, target.id), 'player', cutoff)));
        await denied(getDocs(playerScoreHistoryQuery(roomRef(spectatorDb, target.id), 'player', cutoff)));
        const updates = [];
        let failure;
        const stop = subscribePlayerScoreHistory(target, 'player', cutoff, (items) => updates.push(items), (e) => { failure = e; });
        const waitFor = async (test) => {
            for (let i = 0; i < 500 && !test() && !failure; i++) await new Promise((resolve) => setTimeout(resolve, 10));
            if (failure) throw failure;
            assert.ok(test(), 'direct history listener completed');
        };
        try {
            await waitFor(() => updates.length);
            await put('new_1', cutoff + 10); await put('new_2', cutoff + 11);
            await waitFor(() => updates.at(-1)?.[0]?.id === 'new_2');
            assert.deepEqual(updates.at(-1).map((e) => e.id), ['new_2', 'new_1', 'after']);
            assert.ok(updates.every((items) => items.length <= 3));
            assert.equal((await getDocs(playerScoreHistoryQuery(target, 'player', cutoff + 12))).size, 0);
        } finally { stop(); }
        let deliver, failed, stopped = 0;
        const mocked = [];
        const retryStop = subscribePlayerScoreHistory(target, 'player', cutoff, (items) => mocked.push(items), (e) => { failed = e; },
            (q, metadata, next, error) => { deliver = next; failed = error; return () => { stopped++; }; });
        const page = await getDocs(base);
        const snapshot = { docs: page.docs, metadata: { fromCache: false, hasPendingWrites: false } };
        const onError = failed;
        onError(Object.assign(new Error('index required'), { code: 'failed-precondition' }));
        assert.equal(failed.code, 'failed-precondition');
        deliver({ ...snapshot, metadata: { fromCache: true, hasPendingWrites: false } });
        deliver({ ...snapshot, metadata: { fromCache: false, hasPendingWrites: true } });
        assert.equal(mocked.length, 0);
        deliver(snapshot); assert.deepEqual(mocked[0].map((e) => e.id), ['new_2', 'new_1', 'after']);
        deliver({ docs: [], metadata: snapshot.metadata }); assert.equal(mocked.at(-1).length, 0, 'snapshots replace rather than accumulate');
        retryStop(); deliver(snapshot); assert.equal(mocked.length, 2); assert.equal(stopped, 1);
    });
    await check('score history: room marker is immutable and old rooms remain editable without recent history', async () => {
        assert.equal(supportsScoreHistory(await read(game.target)), true);
        for (const value of [0, 2, null, deleteField()]) await denied(updateDoc(game.target, { scoreHistoryVersion: value }));
        const old = (await make()).target;
        await updateDoc(roomRef(seedDb, old.id), { scoreHistoryVersion: deleteField() });
        assert.equal(supportsScoreHistory(await read(old)), false);
        assert.equal(supportsScoreHistory({ dataVersion: 1, scoreHistoryVersion: 1 }), false);
        await denied(updateDoc(old, { scoreHistoryVersion: 1 }));
        await save(old, 100, [], 'old_manual');
        assert.equal((await read(old)).players.player.score, 100);
        assert.equal(supportsScoreHistory(await read(old)), false);
        const raw = event('question_picked');
        await setDoc(doc(old, 'history', raw.id), { ...raw, recordedAt: serverTimestamp() });
        const marked = event('question_picked');
        const write = (details) => setDoc(doc(game.target, 'history', marked.id), {
            ...marked, details, recordedAt: serverTimestamp()
        });
        await denied(write({})); await denied(write({ isScoreChange: 'true', batchIndex: 0 }));
        await denied(write({ isScoreChange: false, batchIndex: -1 }));
        await denied(write({ isScoreChange: false, batchIndex: 0.5 }));
        await write({ isScoreChange: false, batchIndex: 0 });
        const stored = await read(game.target);
        const newId = 'HISTORYMARKERTEST000';
        const draft = { ...stored, status: 'lobby', roomCode: '835267', packVersionId: null, questionStates: {} };
        const create = (version) => {
            const room = { ...draft, scoreHistoryVersion: version };
            if (version === undefined) delete room.scoreHistoryVersion;
            const batch = writeBatch(hostDb);
            batch.set(roomRef(hostDb, newId), room);
            batch.set(doc(game.target.parent.parent, 'roomCodes', draft.roomCode), { gameId: newId });
            return batch.commit();
        };
        for (const version of [undefined, 0, 2]) await denied(create(version));
        await create(1);
    });
    await check('score history: four-event atomic score edits return their latest three in batch order', async () => {
        const target = (await make()).target;
        const sourceIds = [];
        for (let i = 0; i < 3; i++) {
            await save(target, 100, [], `batch_source_${i}`); sourceIds.push(`score_edit_batch_source_${i}`);
        }
        await save(target, 25, sourceIds, 'four_events');
        const recent = await getDocs(playerScoreHistoryQuery(target, 'player', Date.now() - SCORE_HISTORY_WINDOW_MS));
        assert.equal(recent.size, 3);
        assert.deepEqual(recent.docs.map((d) => d.data().details.batchIndex), [3, 2, 1]);
        assert.ok(recent.docs.every((d) => d.data().details.isScoreChange && d.data().details.saveOperationId === 'four_events'));
    });
    await check('score history: reversal listeners retain selected IDs and clean up late callbacks', async () => {
        const subscriptions = new Map(), statuses = new Map();
        let starts = 0, stops = 0;
        const watcher = createReversalWatcher(game.target, (id, value) => statuses.set(id, value), assert.fail,
            (ref, metadata, next) => { starts++; subscriptions.set(ref.id, next); return () => { stops++; }; });
        const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
        watcher.update(['a', 'b']); await settle(); assert.equal(starts, 2);
        watcher.update(['b', 'a']); await settle(); assert.equal(starts, 2);
        // a leaves the visible list but is retained in the selected-ID union.
        watcher.update(['b', 'c', 'a']); await settle(); assert.equal(stops, 0);
        const callback = subscriptions.get(await reversalEventId('a'));
        callback({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true });
        assert.equal(statuses.get('a'), true);
        watcher.update(['b', 'c']); assert.equal(stops, 1); assert.equal(statuses.get('a'), undefined);
        callback({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => false });
        assert.equal(statuses.get('a'), undefined);
        watcher.update(['b', 'c', 'pending']); watcher.stop(); await settle();
        assert.equal(starts, 3); assert.equal(stops, 3);
    });
    await check('score edits: classify only real score changes and validate integer input', async () => {
        for (const value of ['', '1.5', '1e3', 'Infinity', '9007199254740992', ' 4 ']) assert.equal(validScore(value), false);
        for (const value of ['0', '-300', '9007199254740991']) assert.equal(validScore(value), true);
        for (const type of ['player_buzzed', 'question_picked', 'surprise_answer_correct', 'surprise_answer_incorrect']) {
            assert.equal(scoreHistoryChange(event(type, 'host', { playerId: 'player', points: 300 })), null);
        }
        assert.equal(scoreHistoryChange(event('answer_incorrect', 'host', { playerId: 'player', points: 0 })), null);
        assert.equal(scoreHistoryChange(event('surprise_wheel_rolled', 'host', { playerId: 'player', points: 300, spinId: 'spin' })), null);
        assert.equal(scoreHistoryChange(event('surprise_wheel_rolled', 'host', { playerId: 'player', points: -300 })).delta, -300);
        assert.equal(scoreHistoryChange(event('score_set', 'host', { playerId: 'player', previousScore: -50, nextScore: 100 })).delta, 150);
        assert.equal(scoreHistoryChange(event('answer_correct', 'host', { playerName: 'Same', points: 300 })), null);
        assert.equal((await reversalEventId('source')).length, 71);
        assert.equal(await reversalEventId('source'), await reversalEventId('source'));
    });
    await check('score edits: unchanged drafts write nothing and invalid saves fail atomically', async () => {
        const before = await read(game.target), history = await entries(game.target);
        await save(game.target);
        for (const delta of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(save(game.target, delta));
        await assert.rejects(save(game.target, 100, [], undefined, 'host'));
        await assert.rejects(save(game.target, 100, ['missing']));
        await assert.rejects(save(game.target, 0, ['missing', 'missing']));
        assert.deepEqual(await read(game.target), before);
        assert.deepEqual(await entries(game.target), history);
    });
    let positive, negative;
    await check('score edits: gameplay award reversal changes points without undoing statistics or turn', async () => {
        await actions.handlePickQuestion(game.target, 'q', 'host', event('question_picked'), {});
        // Simulate the already finalized winning buzz; scoring uses the actual host judgment path.
        await updateDoc(roomRef(seedDb, game.id), { buzzedPlayerId: 'player' });
        positive = event('answer_correct', 'host', { playerId: 'player', questionId: 'q', points: 300 });
        await actions.updateRoom(game.target, { 'players.player.score': 300, answerRevealed: true,
            'questionStates.q': 'done', currentTurn: 'player', history: [positive] });
        const before = await read(game.target), recapBefore = await read(doc(game.target, 'recap', 'summary'));
        await save(game.target, 0, [positive.id]);
        const after = await read(game.target), recap = await read(doc(game.target, 'recap', 'summary'));
        assert.equal(after.players.player.score, 0);
        for (const field of ['currentTurn', 'questionStates', 'activeQuestionId', 'answerRevealed']) assert.deepEqual(after[field], before[field]);
        for (const field of ['correct', 'incorrect', 'streak', 'longestStreak', 'categories']) assert.deepEqual(recap.players.player[field], recapBefore.players.player[field]);
        assert.equal(recap.players.player.adjustments, -300);
        assert.equal((await read(doc(game.target, 'history', positive.id))).type, 'answer_correct');
        const reversal = await read(doc(game.target, 'history', await reversalEventId(positive.id)));
        assert.equal(reversal.details.revertsEventId, positive.id);
        assert.equal(reversal.details.delta, -300);
    });
    await check('score edits: reversal chains, already-reversed conflicts, and same-operation retries', async () => {
        const reversal = await reversalEventId(positive.id);
        await save(game.target, 25, [reversal], 'stable_retry');
        const after = await read(game.target), history = await entries(game.target);
        assert.equal(after.players.player.score, 325);
        await save(game.target, 25, [reversal], 'stable_retry');
        assert.deepEqual(await entries(game.target), history);
        await assert.rejects(save(game.target, 100, [positive.id]), (e) => e.code === 'score-edit-conflict');
        assert.equal((await read(game.target)).players.player.score, 325);
        // Later operations must not make retrying an older save apply it again.
        await save(game.target, -75);
        await save(game.target, 25, [reversal], 'stable_retry');
        assert.equal((await read(game.target)).players.player.score, 250);
        negative = (await entries(game.target)).find((e) => e.details.saveOperationId === `edit_${operation}` && e.details.delta === -75);
        assert.ok(negative);
    });
    await check('score edits: batch intermediate recap totals and meaningful zero-net saves', async () => {
        const before = await read(game.target);
        const seqBefore = (await read(doc(game.target, 'recap', 'summary'))).sequence;
        // Revert -75 (+75), manually subtract 75: record both despite unchanged score.
        await save(game.target, -75, [negative.id], 'zero_net');
        const after = await read(game.target);
        assert.equal(after.players.player.score, before.players.player.score);
        assert.equal(after.lastScoreEdit.operationId, 'zero_net');
        const batch = (await entries(game.target)).filter((e) => e.details.saveOperationId === 'zero_net').sort((a, b) => a.details.batchIndex - b.details.batchIndex);
        assert.equal(batch.length, 2);
        assert.equal(batch[0].details.previousScore, 250);
        assert.equal(batch[0].details.nextScore, 325);
        assert.equal(batch[1].details.previousScore, 325);
        assert.equal(batch[1].details.nextScore, 250);
        assert.deepEqual([...batch].sort(compareHistoryEvents).map((e) => e.details.batchIndex), [1, 0]);
        for (const e of batch) {
            const score = await read(doc(game.target, 'recapScores', e.id));
            assert.equal(score.before, e.details.previousScore);
            assert.equal(score.after, e.details.nextScore);
        }
        assert.equal((await read(doc(game.target, 'recap', 'summary'))).sequence, seqBefore + 2);
    });
    await check('score edits: multiple reversals and concurrent score increments preserve all points', async () => {
        const fresh = await make();
        await save(fresh.target, 100, [], 'source_a');
        await save(fresh.target, -200, [], 'source_b');
        await save(fresh.target, 50, [], 'source_c');
        await Promise.all([save(fresh.target, 20, ['score_edit_source_a', 'score_edit_source_b', 'score_edit_source_c']), save(fresh.target, 300)]);
        assert.equal((await read(fresh.target)).players.player.score, 320);
        const scores = (await getDocs(collection(fresh.target, 'recapScores'))).docs.map((s) => s.data()).sort((a, b) => a.sequence - b.sequence);
        let running = 0;
        for (const score of scores) { assert.equal(score.before, running); running += score.delta; assert.equal(score.after, running); }
        assert.equal(running, 320);
    });
    await check('score edits: concurrent competing reversals and duplicate saves apply exactly once', async () => {
        const fresh = await make();
        await save(fresh.target, 100, [], 'race_source');
        const outcomes = await Promise.allSettled([save(fresh.target, 0, ['score_edit_race_source']), save(fresh.target, 0, ['score_edit_race_source'])]);
        assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
        assert.equal((await read(fresh.target)).players.player.score, 0);
        await Promise.all([save(fresh.target, -100, [], 'duplicate'), save(fresh.target, -100, [], 'duplicate')]);
        assert.equal((await read(fresh.target)).players.player.score, -100);
    });
    await check('score edits: sparse player query excludes unrelated events without scanning general history', async () => {
        const fresh = await make();
        for (const delta of [100, -200, 300, 400]) await save(fresh.target, delta);
        const batch = writeBatch(seedDb);
        for (let i = 0; i < 65; i++) {
            const e = event('player_buzzed', 'player', { playerId: 'player' });
            batch.set(doc(roomRef(seedDb, fresh.id), 'history', e.id), { ...e, recordedAt: new Date(Date.now() + i + 1000) });
        }
        await batch.commit();
        const first = await getDocs(playerScoreHistoryQuery(fresh.target, 'player', Date.now() - SCORE_HISTORY_WINDOW_MS));
        assert.equal(first.size, 3);
        const selected = selectPlayerScoreHistory(first.docs.map((s) => s.data()).sort(compareHistoryEvents), 'player');
        assert.equal(selected.length, 3);
        assert.deepEqual(new Set(selected.map((e) => e.details.delta)), new Set([-200, 300, 400]));
        assert.equal(selectPlayerScoreHistory(selected, 'other').length, 0);
    });
    await check('score edits: selected source remains reversible after aging out and leaving the top three', async () => {
        const fresh = await make();
        await save(fresh.target, 100, [], 'aged_source');
        await updateDoc(doc(roomRef(seedDb, fresh.id), 'history', 'score_edit_aged_source'), {
            recordedAt: Timestamp.fromMillis(Date.now() - SCORE_HISTORY_WINDOW_MS - 1)
        });
        for (let i = 0; i < 4; i++) await save(fresh.target, 10);
        const recent = await getDocs(playerScoreHistoryQuery(fresh.target, 'player', Date.now() - SCORE_HISTORY_WINDOW_MS));
        assert.ok(!recent.docs.some((d) => d.id === 'score_edit_aged_source'));
        await save(fresh.target, 0, ['score_edit_aged_source'], 'aged_reversal');
        await save(fresh.target, 0, ['score_edit_aged_source'], 'aged_reversal');
        assert.equal((await read(fresh.target)).players.player.score, 40);
    });
    await check('score edits: non-host writes and forged reversal/recap chains are denied', async () => {
        await assert.rejects(save(roomRef(playerDb, game.id), 100, [], undefined, 'player', { id: 'player', name: 'Same' }));
        await denied(save(roomRef(spectatorDb, game.id), 100));
        const forged = actions.createHistoryItem({ id: 'forged_reversal', type: 'score_reverted', actorId: 'host', actorName: 'host', message: '',
            details: { playerId: 'player', delta: -999, previousScore: 250, nextScore: -749, revertsEventId: positive.id,
                saveOperationId: 'forged', batchIndex: 0 } });
        await denied(actions.runRoomTransaction(game.target, async (tx, room) => {
            await actions.updateRoomInTransaction(tx, game.target, room, { 'players.player.score': -749,
                lastScoreEdit: { operationId: 'forged', playerId: 'player', eventIds: [forged.id], previousScore: 250, nextScore: -749 }, history: [forged] });
        }));
    });
    await check('score edits: embedded legacy history supports reversals, chains, and retries', async () => {
        const target = roomRef(hostDb, 'score-edit-legacy');
        const original = event('surprise_wheel_rolled', 'host', { playerId: 'player', points: -300 });
        await setDoc(roomRef(seedDb, target.id), { hostId: 'host', status: 'playing', pack,
            players: { host: { name: 'host', isHost: true, score: 0 }, player: { name: 'Same', score: -300, isHost: false } }, history: [original] });
        await save(target, 100, [original.id], 'legacy');
        await save(target, 100, [original.id], 'legacy');
        assert.equal((await read(target)).players.player.score, 100);
        await save(target, 0, [await reversalEventId(original.id)]);
        assert.equal((await read(target)).players.player.score, -200);
        assert.equal((await read(target)).history.length, 4);
        await assert.rejects(save(target, 0, [original.id]), (e) => e.code === 'score-edit-conflict');
    });
    await check('score edits: finished games reject edits without changing history or frozen results', async () => {
        await actions.handleEndGame(game.target, event('game_finished'));
        const before = await read(game.target), history = await entries(game.target);
        await assert.rejects(save(game.target, 100), (e) => e.code === 'score-edit-finished');
        assert.deepEqual(await read(game.target), before);
        assert.deepEqual(await entries(game.target), history);
    });
}
