export const MAX_PACK_ROUNDS = 3;

// Legacy documents are interpreted without rewriting saved packs or active games.
export const getPackRounds = (pack) => Array.isArray(pack?.rounds)
    ? pack.rounds : [{ id: 'legacy-round', categories: pack?.categories || [] }];
export const getAllCategories = (pack) => getPackRounds(pack).flatMap((round) => round.categories || []);
export const getRoundCategories = (pack, index = 0) => getPackRounds(pack)[index]?.categories || [];
export const getAllQuestions = (pack) => getAllCategories(pack).flatMap((category) => category.questions || []);
export const getPackMedia = (pack) => [
    pack?.prize?.hiddenMedia, pack?.prize?.revealedMedia,
    ...getAllQuestions(pack).flatMap((question) => [question.questionMedia, question.answerMedia])
].filter((media) => media?.fileId);
export const isRoundComplete = (pack, index, states = {}) => {
    const questions = getRoundCategories(pack, index).flatMap((category) => category.questions || []);
    return questions.length > 0 && questions.every((question) => states[question.id] === 'done');
};

export function validatePackRounds(pack) {
    if (!pack || (Object.hasOwn(pack, 'rounds') && !Array.isArray(pack.rounds))) return { roundIndex: 0, key: 'invalidPackRounds' };
    const rounds = getPackRounds(pack);
    if (!rounds.length || rounds.length > MAX_PACK_ROUNDS) return { roundIndex: 0, key: 'invalidPackRounds' };
    const roundIds = new Set();
    const categoryIds = new Set();
    const questionIds = new Set();
    for (const [roundIndex, round] of rounds.entries()) {
        if (!round || typeof round.id !== 'string' || !round.id || roundIds.has(round.id) || !Array.isArray(round.categories) || !round.categories.length) {
            return { roundIndex, key: 'invalidPackRounds' };
        }
        roundIds.add(round.id);
        for (const category of round.categories) {
            if (!category || typeof category.id !== 'string' || !category.id || categoryIds.has(category.id) || !Array.isArray(category.questions) || !category.questions.length) {
                return { roundIndex, key: 'invalidPackRounds' };
            }
            categoryIds.add(category.id);
            for (const question of category.questions) {
                if (!question || typeof question.id !== 'string' || !question.id || questionIds.has(question.id)) {
                    return { roundIndex, key: 'invalidPackRounds' };
                }
                questionIds.add(question.id);
            }
        }
    }
    return null;
}
