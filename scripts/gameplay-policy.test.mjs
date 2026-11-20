import { stripPendingCategories } from '../src/utils/packSerialization.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTransitionBlockReason as block, projectAnswerScore } from '../src/utils/gameTransitionPolicy.js';
import { createGameplayDiagnostics } from '../src/utils/gameplayDiagnostics.js';
import { moveTextAnswer, createTextAnswerRound, normalizeTextAnswer, projectTextAnswerScore, textAnswerBlockReason, validTextPoints } from '../src/utils/textAnswerPolicy.js';
import { getRoundPointStep, validatePackRounds } from '../src/utils/packRounds.js';
import { bulkTextAnswerBlockReason, textAssessmentDecision, textAssessmentShortcut, validSignedTextPoints } from '../src/utils/textAnswerPolicy.js';
import { compareHistoryEvents } from '../src/utils/scoreHistory.js';
import { getStandingsEntries } from '../src/utils/gameResults.js';

test('standings: equal scores stay stable across reordered snapshots and unrelated updates', () => {
    const players = {
        host: { isHost: true, score: 1000 },
        bob: { name: 'Same', score: 200 },
        alice: { name: 'Same', score: 200 },
        charlie: { score: -100 },
        dana: { score: 0 },
    };
    const ids = (roster, champion) => getStandingsEntries(roster, champion).map(([id]) => id);
    const reordered = Object.fromEntries(Object.entries(players).reverse());
    reordered.bob = { ...reordered.bob, avatar: 'new', name: 'Changed' };
    assert.deepEqual(ids(players), ['alice', 'bob', 'dana', 'charlie']);
    assert.deepEqual(ids(reordered), ids(players));
    assert.deepEqual(ids(reordered, 'bob'), ['bob', 'alice', 'dana', 'charlie']);
    assert.deepEqual(ids(reordered, 'host'), ids(players));
    assert.deepEqual(ids({ ...reordered, bob: { score: 300 } }), ['bob', 'alice', 'dana', 'charlie']);
    assert.deepEqual(ids({}), []);
    assert.deepEqual(Object.keys(players), ['host', 'bob', 'alice', 'charlie', 'dana']);
});

test('bulk text assessments: signed values, shortcuts, sign-based decisions and guards', () => {
    for (const value of [-123, 0, '007', '-42', Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) assert.equal(validSignedTextPoints(value), true);
    for (const value of ['', '-', '1e3', 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(validSignedTextPoints(value), false);
    assert.deepEqual([-1, 0, 1].map(textAssessmentDecision), ['deny', 'skip', 'accept']);
    const events = [2, 11, 0].map((batchIndex) => ({ id: `text_s_${batchIndex}`, type: 'text_answer_accepted', timestamp: 1, details: { sessionId: 's', batchIndex } }));
    assert.deepEqual(events.sort(compareHistoryEvents).map((e) => e.details.batchIndex), [11, 2, 0]);
    assert.deepEqual([textAssessmentShortcut(true, 300, false), textAssessmentShortcut(false, 300, false), textAssessmentShortcut(false, 300, true)], [300, 0, -300]);
    const categories = [{ id: 'c', questions: [{ id: 'q', text: 'Q', answer: 'A', points: 100, isTextAnswerQuestion: true, assessAllAtOnce: true }] }];
    assert.equal(stripPendingCategories(JSON.parse(JSON.stringify(stripPendingCategories(categories))))[0].questions[0].assessAllAtOnce, true);
    categories[0].questions[0].isTextAnswerQuestion = false;
    assert.equal(stripPendingCategories(categories)[0].questions[0].assessAllAtOnce, undefined);
    const current = room({ players: { host: { isHost: true, score: 0 }, alice: { isHost: false, score: 100 } } });
    assert.equal(createTextAnswerRound(current, 'q', 's').assessAllAtOnce, undefined);
    current.textAnswerRound = createTextAnswerRound(current, 'q', 's', 0, 0, true);
    assert.deepEqual(current.textAnswerRound.draftPoints, { alice: 0 });
    assert.equal(bulkTextAnswerBlockReason(current, 's', 'host', 0), 'stale');
    current.textAnswerRound.phase = 'reviewing';
    assert.equal(bulkTextAnswerBlockReason(current, 's', 'host', 0), null);
    for (const [session, actor, revision] of [['old', 'host', 0], ['s', 'alice', 0], ['s', 'host', 1]]) assert.equal(bulkTextAnswerBlockReason(current, session, actor, revision), 'stale');
    assert.equal(textAnswerBlockReason(current, 's', 'host', 'reveal', 0), 'stale');
    current.textAnswerRound.phase = 'complete';
    assert.equal(bulkTextAnswerBlockReason(current, 's', 'host', 0), 'stale');
});

test('text answers: trim, Unicode limits, multiline rejection and point validation', () => {
    assert.equal(normalizeTextAnswer('  Kyiv  '), 'Kyiv');
    assert.equal(normalizeTextAnswer('😀'.repeat(40)), '😀'.repeat(40));
    for (const value of ['', '   ', '\u00a0', '😀'.repeat(41), 'a\nb', '\na', 'a\rb', 'a\u2028b', 'a\u2029b', null]) assert.equal(normalizeTextAnswer(value), null);
    for (const value of [0, '0', 123, '001', Number.MAX_SAFE_INTEGER]) assert.equal(validTextPoints(value), true);
    for (const value of ['', ' ', -1, 0.5, '1e3', Number.MAX_SAFE_INTEGER + 1]) assert.equal(validTextPoints(value), false);
    assert.deepEqual([0, 1, 2].map(getRoundPointStep), [100, 200, 400]);
    assert.equal(validatePackRounds({ categories: [{ id: 'c', questions: [{ id: 'q', isSurpriseQuestion: true, isTextAnswerQuestion: true }] }] }).key, 'invalidQuestionMode');
});

test('text answers: roster, role, phase and expected-review guards', () => {
    const current = room({ players: { host: { isHost: true, score: 0 }, bob: { isHost: false, score: 0 }, alice: { isHost: false, score: 200 } } });
    current.textAnswerRound = createTextAnswerRound(current, 'q', 'session');
    assert.deepEqual(current.textAnswerRound.playerIds, ['alice', 'bob']);
    assert.deepEqual(current.textAnswerRound.answers, { alice: '', bob: '' });
    assert.equal(textAnswerBlockReason(current, 'session', 'alice', 'submit'), null);
    for (const uid of ['host', 'spectator']) assert.equal(textAnswerBlockReason(current, 'session', uid, 'submit'), 'ineligible');
    assert.equal(textAnswerBlockReason(current, 'old', 'alice', 'submit'), 'stale');
    assert.equal(textAnswerBlockReason(current, 'session', 'alice', 'close'), 'host_required');
    assert.equal(block(current, event('answer_correct')), 'text_answer_action_required');
    assert.equal(block(current, event('question_skipped')), 'text_answer_action_required');
    current.textAnswerRound.phase = 'reviewing';
    assert.equal(textAnswerBlockReason(current, 'session', 'alice', 'submit'), 'ineligible');
    assert.equal(textAnswerBlockReason(current, 'session', 'host', 'judge', 0), 'answer_hidden');
    assert.equal(textAnswerBlockReason(current, 'session', 'host', 'reveal', 0), null);
    current.textAnswerRound.answerVisible = true;
    assert.equal(textAnswerBlockReason(current, 'session', 'host', 'judge', 0), null);
    assert.equal(textAnswerBlockReason(current, 'session', 'host', 'judge', 1), 'stale');
});

test('text answers: custom and zero judgments, Skip neutrality, safe-score boundaries', () => {
    for (const competitive of [false, true]) {
        const current = room({ trueCompetitiveMode: competitive });
        for (const amount of [0, 123, 400]) {
            assert.deepEqual(projectTextAnswerScore(current, 'alice', 'accept', amount), { previousScore: 200, nextScore: 200 + amount, delta: amount });
            assert.equal(projectTextAnswerScore(current, 'alice', 'deny', amount).delta, competitive && amount ? -amount : 0);
            assert.equal(current.currentTurn, undefined);
        }
        assert.equal(projectTextAnswerScore(current, 'alice', 'skip', 0)?.delta ?? null, competitive ? 0 : null);
        assert.equal(projectTextAnswerScore(current, 'alice', 'accept', Number.MAX_SAFE_INTEGER), null);
        assert.equal(projectTextAnswerScore(current, 'alice', 'accept', ''), null);
    }
});

const room = (extra = {}) => ({
    dataVersion: 2, recapVersion: 1, buzzerPolicyVersion: 1,
    status: 'playing', hostId: 'host', activeQuestionId: 'q', answerRevealed: false,
    buzzedPlayerId: 'alice', players: { host: { isHost: true, score: 0 }, alice: { score: 200 } },
    questionStates: { q: 'active' }, ...extra
});
const event = (type, details = {}, actorId = 'host') => ({
    type, actorId, details: { questionId: 'q', playerId: 'alice', ...details }
});
const freeze = (value) => {
    Object.freeze(value);
    Object.values(value).forEach((child) => { if (child && typeof child === 'object') freeze(child); });
    return value;
};

for (const type of ['answer_correct', 'answer_incorrect', 'surprise_answer_correct', 'surprise_answer_incorrect',
    'question_skipped', 'board_resumed', 'score_set', 'score_adjusted']) {
    test(`${type}: contestant and spectator cannot perform current-game host actions`, () => {
        for (const actor of ['alice', 'spectator']) assert.equal(block(room(), event(type, {}, actor)), 'host_required');
    });
}

test('ordinary answer lifecycle: award once, reveal then return to board', () => {
    const current = freeze(room());
    const judgment = freeze(event('answer_correct'));
    assert.equal(block(current, judgment), null);
    assert.deepEqual(projectAnswerScore(current, judgment, { points: 300 }), {
        score: { playerId: 'alice', delta: 300, total: 500 }
    });
    assert.equal(block(current, event('board_resumed')), 'answer_not_revealed');
    const revealed = room({ answerRevealed: true });
    assert.equal(block(revealed, judgment), 'answer_already_revealed');
    assert.equal(block(revealed, event('question_skipped')), 'answer_already_revealed');
    assert.equal(block(revealed, event('board_resumed')), null);
    assert.equal(block(room({ activeQuestionId: null }), judgment), 'question_changed');
});

test('standard wrong answer preserves score; competitive wrong answer deducts frozen points', () => {
    for (const competitive of [false, true]) {
        for (const score of [-1000, 0, 2500]) {
            for (const points of [100, 500, 1000]) {
                const current = freeze(room({ trueCompetitiveMode: competitive, players: { alice: { score } } }));
                const judgment = freeze(event('answer_incorrect', { points: 99999 }));
                const projection = projectAnswerScore(current, judgment, { points });
                assert.equal(projection.score.total, score - (competitive ? points : 0));
                assert.equal(projection.score.delta, competitive ? -points : 0);
            }
        }
    }
});

test('stale judgments cannot score another question, answerer or the host', () => {
    for (const [extra, reason] of [
        [{ activeQuestionId: 'other' }, 'question_changed'],
        [{ buzzedPlayerId: null }, 'answerer_changed'],
        [{ buzzedPlayerId: 'bob' }, 'answerer_changed'],
        [{ players: {} }, 'answerer_changed'],
        [{ players: { alice: { isHost: true } } }, 'answerer_changed']
    ]) assert.equal(block(room(extra), event('answer_correct')), reason);
});

test('frozen question type must match judgment; surprise scoring is deferred', () => {
    assert.equal(projectAnswerScore(room(), event('answer_correct'), undefined).reason, 'question_type_changed');
    assert.equal(projectAnswerScore(room(), event('answer_correct'), { isSurpriseQuestion: true }).reason, 'question_type_changed');
    assert.equal(projectAnswerScore(room(), event('surprise_answer_correct'), { points: 100 }).reason, 'question_type_changed');
    assert.deepEqual(projectAnswerScore(room(), event('surprise_answer_correct'), { isSurpriseQuestion: true }), { score: null });
    assert.equal(block(room({ buzzedPlayerId: null, surpriseRound: { answererId: 'alice' } }), event('surprise_answer_correct')), null);
});

test('surprise reveal cannot bypass a pending wheel/table award', () => {
    assert.equal(block(room({ answerRevealed: true, surpriseRound: { judgeResult: 'correct' } }), event('board_resumed')), 'surprise_award_pending');
    assert.equal(block(room({ answerRevealed: true, surpriseRound: { judgeResult: 'correct', scoreAppliedAt: 1 } }), event('board_resumed')), null);
    for (const type of ['surprise_wheel_rolled', 'surprise_wheel_scored']) {
        assert.equal(block(room(), event(type)), 'dedicated_wheel_action_required');
    }
});

test('finished games reject all history actions; score edits remain available in round breaks', () => {
    for (const type of ['answer_correct', 'score_set', 'board_resumed', 'player_buzzed_early']) {
        assert.equal(block(room({ status: 'finished' }), event(type)), 'game_finished');
    }
    assert.equal(block(room({ status: 'round_break' }), event('score_set')), null);
    assert.equal(block(room({ status: 'round_break' }), event('answer_correct')), 'game_not_playing');
});

test('tie breaker requires final completed board', () => {
    const complete = room({ activeQuestionId: null, questionStates: { q: 'done' }, roundCount: 2, currentRoundIndex: 1 });
    assert.equal(block(complete, event('tie_breaker_started')), null);
    for (const extra of [{ currentRoundIndex: 0 }, { status: 'round_break' }, { activeQuestionId: 'q' }, { questionStates: { q: 'active' } }]) {
        assert.equal(block({ ...complete, ...extra }, event('tie_breaker_started')), 'board_not_complete');
    }
});

test('legacy and partially versioned rooms preserve their existing guard behavior', () => {
    for (const extra of [{ dataVersion: 1 }, { recapVersion: undefined }, { buzzerPolicyVersion: undefined }]) {
        const legacy = room(extra);
        assert.equal(block(legacy, event('board_resumed')), null);
        assert.equal(block(legacy, event('surprise_wheel_rolled')), null);
        assert.equal(block({ ...legacy, activeQuestionId: 'other' }, event('answer_correct')), 'question_changed');
        assert.equal(block({ ...legacy, surpriseRound: { rollResult: 100 } }, event('surprise_wheel_rolled')), 'wheel_changed');
        assert.equal(block({ ...legacy, surpriseRound: { rollResult: 100, rolledAt: 10 } }, event('surprise_wheel_scored', { points: 100, rolledAt: 10 })), null);
        assert.equal(block({ ...legacy, surpriseRound: { rollResult: 100, rolledAt: 10 } }, event('surprise_wheel_scored', { points: 100, rolledAt: 11 })), 'wheel_changed');
    }
});

test('early buzz keeps compatibility when no question ID is provided', () => {
    assert.equal(block(room(), event('player_buzzed_early', { questionId: 'old' })), 'question_changed');
    assert.equal(block(room(), event('player_buzzed_early', { questionId: undefined })), null);
});

test('diagnostics are opt-in, bounded, redact errors and preserve results/rejections', async () => {
    const disabled = createGameplayDiagnostics();
    assert.equal(await disabled.trace((trace) => { trace('skipped', 'game_finished'); return 42; }), 42);
    assert.deepEqual(disabled.read(), []);
    const diagnostics = createGameplayDiagnostics({ enabled: true, now: () => 123 });
    const error = Object.assign(new Error('secret answer and token'), { code: 'permission-denied', room: room() });
    await assert.rejects(diagnostics.trace(() => { throw error; }, 'private custom action'), (caught) => caught === error);
    assert.deepEqual(diagnostics.read().at(-1), { operation: 1, action: 'room_update', at: 123, phase: 'failed', reason: 'permission-denied' });
    assert.ok(!JSON.stringify(diagnostics.read()).includes('secret'));
    for (let i = 0; i < 120; i++) await diagnostics.trace(() => {});
    assert.equal(diagnostics.read().length, 200);
    const snapshot = diagnostics.read(); snapshot[0].phase = 'tampered';
    assert.notEqual(diagnostics.read()[0].phase, 'tampered');
    diagnostics.clear(); assert.deepEqual(diagnostics.read(), []);
    diagnostics.stop(); await diagnostics.trace(() => {}); assert.deepEqual(diagnostics.read(), []);
});

test('concurrent diagnostics correlate retries and no-ops without claiming writes', async () => {
    const diagnostics = createGameplayDiagnostics({ enabled: true });
    let release;
    const first = diagnostics.trace(async (trace) => {
        await new Promise((done) => { release = done; });
        trace('transaction_retried'); trace('skipped', 'already_applied');
    }, 'answer_correct');
    await diagnostics.trace(() => {}, 'board_resumed'); release(); await first;
    const firstEntries = diagnostics.read().filter((entry) => entry.operation === 1);
    assert.deepEqual(firstEntries.map((entry) => entry.phase), ['started', 'transaction_retried', 'skipped', 'completed']);
    assert.ok(firstEntries.every((entry) => entry.action === 'answer_correct'));
});


test('host hints: optional strings, length limits and legacy/round pack validation', () => {
    for (const target of ['category', 'question']) {
        for (const rounds of [false, true]) {
            for (const [value, valid] of [[undefined, true], ['', true], ['   ', true], ['Read slowly\nAccept synonyms', true], ['x'.repeat(200), true], ['😀'.repeat(100), true], ['x'.repeat(201), false], ['😀'.repeat(101), false], [null, false], [7, false], [{}, false]]) {
                const question = { id: 'q' };
                const category = { id: 'c', questions: [question] };
                if (value !== undefined) (target === 'category' ? category : question).hostHint = value;
                const pack = rounds ? { rounds: [{ id: 'r', categories: [category] }] } : { categories: [category] };
                assert.equal(validatePackRounds(pack)?.key ?? null, valid ? null : 'invalidHostHint', target + ': ' + String(value));
            }
        }
    }
});


test('question hints survive editor serialization, repeated saves and JSON reload', () => {
    for (const mode of [{}, { isSurpriseQuestion: true }, { isTextAnswerQuestion: true }]) {
        for (const hint of ['', '   ', 'Accept synonyms\nRead slowly', 'x'.repeat(200)]) {
            const categories = [{ id: 'c', hostHint: 'Category note', questions: [{
                id: 'q', points: 100, text: 'Question', answer: 'Answer', hostHint: hint, ...mode,
                questionMedia: { url: 'image.png', previewUrl: 'blob:preview', pendingFile: {}, previousMedia: {} }
            }] }];
            const saved = stripPendingCategories(categories);
            const reloaded = JSON.parse(JSON.stringify(stripPendingCategories(saved)));
            assert.equal(reloaded[0].questions[0].hostHint, hint);
            assert.equal(reloaded[0].hostHint, 'Category note');
            assert.deepEqual(reloaded[0].questions[0].questionMedia, { url: 'image.png' });
            reloaded[0].questions[0].hostHint = '';
            assert.equal(stripPendingCategories(reloaded)[0].questions[0].hostHint, '');
        }
    }
    const legacy = stripPendingCategories([{ id: 'c', questions: [{ id: 'q', text: '', answer: '', points: 100 }] }]);
    assert.equal(Object.hasOwn(legacy[0].questions[0], 'hostHint'), false);
    const invalid = stripPendingCategories([{ id: 'c', questions: [{ id: 'q', hostHint: 'x'.repeat(201) }] }]);
    assert.equal(validatePackRounds({ categories: invalid }).key, 'invalidHostHint');
});

test('text answers: reorder only unpresented answers against the expected queue', () => {
    const round = { phase: 'reviewing', playerIds: ['a', 'b', 'c', 'd'], reviewIndex: 0, answerVisible: false };
    const move = (id, direction, expected = round.playerIds) => moveTextAnswer(round, id, direction, expected);
    assert.deepEqual(move('b', -1), ['b', 'a', 'c', 'd']);
    for (const [id, direction] of [['a', -1], ['d', 1], ['missing', 1], ['b', 0]]) assert.equal(move(id, direction), null);
    assert.equal(move('b', -1, ['b', 'a', 'c', 'd']), null);
    round.answerVisible = true;
    assert.equal(move('b', -1), null);
    assert.equal(move('a', 1), null);
    assert.deepEqual(move('c', -1), ['a', 'c', 'b', 'd']);
    round.reviewIndex = 2;
    assert.equal(move('d', -1), null);
    round.phase = 'complete';
    assert.equal(move('d', -1), null);
    round.phase = 'answering';
    assert.equal(move('d', -1), null);
});
