import { getRoundPointStep } from './packRounds.js';

const normalizePoints = (value, fallback) => {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isNaN(parsedValue) ? fallback : Math.max(100, Math.round(parsedValue / 100) * 100);
};

export const getSurprisePointValues = (question, roundIndex = 0) => {
    const minPoints = normalizePoints(question.surpriseMinPoints, 100);
    const maxPoints = Math.max(minPoints, normalizePoints(question.surpriseMaxPoints ?? question.points, 500));
    const values = [];
    for (let points = minPoints; points <= maxPoints; points += getRoundPointStep(roundIndex)) {
        values.push(points, -points);
    }
    return values;
};

export const pruneSurprisePointValues = (question, isCorrect, roundIndex = 0) => {
    const values = getSurprisePointValues(question, roundIndex);
    const removedSign = isCorrect ? -1 : 1;
    const valuesToPrune = values
        .filter((value) => Math.sign(value) === removedSign)
        .sort((a, b) => Math.abs(b) - Math.abs(a));
    const removeCount = Math.min(valuesToPrune.length - 1, Math.floor(valuesToPrune.length * 0.8));
    const removedValues = new Set(valuesToPrune.slice(0, Math.max(0, removeCount)));
    return values.filter((value) => !removedValues.has(value));
};
