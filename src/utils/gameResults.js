export const getParticipantEntries = (players = {}) => (
    Object.entries(players).filter(([, player]) => !player.isHost)
);

export const getStandingsEntries = (players = {}, championId = null) => (
    getParticipantEntries(players).sort(([aId, a], [bId, b]) => {
        const championOrder = Number(bId === championId) - Number(aId === championId);
        const scoreOrder = (Number(b.score) || 0) - (Number(a.score) || 0);
        // Snapshot map order can change; immutable IDs keep equal scores stable.
        return championOrder || scoreOrder || (aId < bId ? -1 : aId > bId ? 1 : 0);
    })
);

export const getTopTiedPlayerIds = (players = {}) => {
    const playerEntries = getParticipantEntries(players);
    if (playerEntries.length < 2) return [];

    const topScore = Math.max(...playerEntries.map(([, player]) => Number(player.score) || 0));
    const topPlayerIds = playerEntries
        .filter(([, player]) => (Number(player.score) || 0) === topScore)
        .map(([playerId]) => playerId);

    return topPlayerIds.length > 1 ? topPlayerIds : [];
};

export const areAllQuestionsDone = (questionStates = {}) => (
    Object.values(questionStates).every((state) => state === 'done')
);

export const hasDefinedFinalResults = (room) => {
    if (!room) return false;
    if (room.status === 'finished') return true;
    if (
        room.status !== 'playing'
        || (room.currentRoundIndex || 0) < (room.roundCount || 1) - 1
        || room.activeQuestionId
        || room.answerRevealed
        || !areAllQuestionsDone(room.questionStates)
    ) {
        return false;
    }

    const topTiedPlayerIds = getTopTiedPlayerIds(room.players);
    return topTiedPlayerIds.length <= 1 || Boolean(room.tieBreaker?.championId);
};
