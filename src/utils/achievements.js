export const emptyPlayerRecap = (player) => ({
    name: player.name, avatar: player.avatar || '', startingScore: Number(player.score) || 0,
    correct: 0, incorrect: 0, buzzes: 0, early: 0, late: 0, streak: 0, longestStreak: 0,
    closestLate: null, lastEarlyQuestionId: null, lastBuzzRound: null, categories: {}, adjustments: 0
});

export function createRecapSummary(players) {
    return { version: 1, sequence: 0, finalized: false, awards: [], profileAwards: {},
        players: Object.fromEntries(Object.entries(players).filter(([, p]) => !p.isHost)
            .map(([id, p]) => [id, emptyPlayerRecap(p)])) };
}

export function getAchievements(summary) {
    if (!summary) return [];
    if (summary.finalized) return summary.awards;
    const entries = Object.entries(summary.players || {}).sort(([a], [b]) => a.localeCompare(b));
    const awards = [];
    const add = (id, value, eligible, unit = 'count', minimum = false) => {
        const candidates = entries.filter(([, p]) => eligible(p));
        if (!candidates.length) return;
        const best = (minimum ? Math.min : Math.max)(...candidates.map(([, p]) => value(p)));
        const playerIds = candidates.filter(([, p]) => value(p) === best).map(([pid]) => pid);
        awards.push({ id, value: best, unit, playerIds, details: Object.fromEntries(playerIds.map((pid) => {
            const p = summary.players[pid];
            return [pid, id === 'accuracy' ? { correct: p.correct, answered: p.correct + p.incorrect }
                : id === 'closestLate' ? p.closestLate : {}];
        })) });
    };
    for (const [id, field] of [['correct', 'correct'], ['incorrect', 'incorrect'], ['buzzes', 'buzzes'], ['early', 'early'], ['late', 'late']]) {
        add(id, (p) => p[field], (p) => p[field] > 0);
    }
    add('closestLate', (p) => p.closestLate.deltaMs, (p) => p.closestLate?.deltaMs > 0, 'ms', true);
    add('accuracy', (p) => p.correct / (p.correct + p.incorrect), (p) => p.correct > 0 && p.correct + p.incorrect >= 3, 'ratio');
    add('streak', (p) => p.longestStreak, (p) => p.longestStreak >= 2);
    return awards;
}
