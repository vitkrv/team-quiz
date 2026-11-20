export const SURPRISE_DEFAULT_MIN_POINTS = 100;
export const SURPRISE_DEFAULT_MAX_POINTS = 500;
export const POINT_STEP = 100;

export const normalizePoints = (value, fallback = POINT_STEP) => {
    const parsedValue = Number.parseInt(value, 10);
    if (Number.isNaN(parsedValue)) return fallback;

    return Math.max(POINT_STEP, Math.round(parsedValue / POINT_STEP) * POINT_STEP);
};

export const getSurpriseMinPoints = (question) => normalizePoints(question.surpriseMinPoints, SURPRISE_DEFAULT_MIN_POINTS);
export const getSurpriseMaxPoints = (question) => Math.max(
    getSurpriseMinPoints(question),
    normalizePoints(question.surpriseMaxPoints ?? question.points, SURPRISE_DEFAULT_MAX_POINTS)
);
export const getSurpriseDisplayPoints = (question) => normalizePoints(
    question.surpriseDisplayPoints,
    getSurpriseMaxPoints(question)
);
export const cleanMediaForSave = (media) => {
    if (!media) return null;
    const savedMedia = { ...media };
    delete savedMedia.previewUrl;
    delete savedMedia.pendingFile;
    delete savedMedia.previousMedia;
    return savedMedia;
};

const normalizeQuestionText = (text = '') => text.replace(/\r\n?/g, '\n');

export const stripPendingCategories = (categories) => categories.map((category) => ({
    ...category,
    questions: category.questions.map((question) => {
        const isSurpriseQuestion = Boolean(question.isSurpriseQuestion);
        const surpriseMinPoints = getSurpriseMinPoints(question);
        const surpriseMaxPoints = getSurpriseMaxPoints(question);
        const nextQuestion = {
            id: question.id,
            points: isSurpriseQuestion ? surpriseMaxPoints : normalizePoints(question.points),
            text: normalizeQuestionText(question.text),
            answer: question.answer
        };

        if (Object.hasOwn(question, 'hostHint')) nextQuestion.hostHint = question.hostHint;
        if (question.isTextAnswerQuestion) nextQuestion.isTextAnswerQuestion = true;
        if (question.isTextAnswerQuestion && question.assessAllAtOnce) nextQuestion.assessAllAtOnce = true;

        if (isSurpriseQuestion) {
            nextQuestion.isSurpriseQuestion = true;
            nextQuestion.surpriseMinPoints = surpriseMinPoints;
            nextQuestion.surpriseMaxPoints = surpriseMaxPoints;
            nextQuestion.surpriseDisplayPoints = getSurpriseDisplayPoints(question);
        }

        const questionMedia = cleanMediaForSave(question.questionMedia);
        const answerMedia = cleanMediaForSave(question.answerMedia);

        if (questionMedia) {
            nextQuestion.questionMedia = questionMedia;
        } else {
            delete nextQuestion.questionMedia;
        }

        if (answerMedia) {
            nextQuestion.answerMedia = answerMedia;
        } else {
            delete nextQuestion.answerMedia;
        }

        return nextQuestion;
    })
}));

