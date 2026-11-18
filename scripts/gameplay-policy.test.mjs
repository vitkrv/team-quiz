import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTransitionBlockReason as block, projectAnswerScore } from '../src/utils/gameTransitionPolicy.js';
import { createGameplayDiagnostics } from '../src/utils/gameplayDiagnostics.js';

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
