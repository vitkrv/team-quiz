import assert from 'node:assert/strict';
import { getPackRounds, getRoundPointStep } from '../src/utils/packRounds.js';
import { getSurprisePointValues, pruneSurprisePointValues } from '../src/utils/surprisePoints.js';

const question = { surpriseMinPoints: 100, surpriseMaxPoints: 500 };
const magnitudes = [[100, 200, 300, 400, 500], [100, 300, 500], [100, 500]];
for (const [roundIndex, expected] of magnitudes.entries()) {
    assert.equal(getRoundPointStep(roundIndex), [100, 200, 400][roundIndex]);
    assert.deepEqual(getSurprisePointValues(question, roundIndex), expected.flatMap((value) => [value, -value]));
    for (const isCorrect of [true, false]) {
        const values = pruneSurprisePointValues(question, isCorrect, roundIndex);
        assert.deepEqual(values.filter((value) => Math.sign(value) === (isCorrect ? 1 : -1)).map(Math.abs), expected);
        assert.deepEqual(values.filter((value) => Math.sign(value) === (isCorrect ? -1 : 1)).map(Math.abs), [100]);
    }
    assert.deepEqual(pruneSurprisePointValues({ surpriseMinPoints: 300, surpriseMaxPoints: 300 }, true, roundIndex), [300, -300]);
    assert.deepEqual(pruneSurprisePointValues({ surpriseMinPoints: 300, surpriseMaxPoints: 300 }, false, roundIndex), [300, -300]);
}
assert.deepEqual(getSurprisePointValues({ ...question, surpriseMaxPoints: 400 }, 1), [100, -100, 300, -300]);
assert.deepEqual(getSurprisePointValues({ points: 300 }), [100, -100, 200, -200, 300, -300]);
assert.deepEqual(getSurprisePointValues({}), magnitudes[0].flatMap((value) => [value, -value]));
assert.deepEqual(getSurprisePointValues({ surpriseMinPoints: 250, surpriseMaxPoints: 150 }), [300, -300]);

const pack = { rounds: magnitudes.map((_, index) => ({ id: `round-${index}`, categories: [{ questions: [{ ...question }] }] })) };
const savedAfterRemoval = JSON.parse(JSON.stringify({ rounds: pack.rounds.slice(1) }));
for (const [roundIndex, round] of getPackRounds(savedAfterRemoval).entries()) {
    const savedQuestion = round.categories[0].questions[0];
    assert.deepEqual(savedQuestion, question);
    assert.deepEqual(getSurprisePointValues(savedQuestion, roundIndex), magnitudes[roundIndex].flatMap((value) => [value, -value]));
}
assert.equal(getPackRounds({ categories: [] }).length, 1);
console.log('Surprise points passed: three rounds, bounds, pruning, legacy defaults, and round removal/save/reload.');
