export const getParticipantEntries = (players = {}) => (
    Object.entries(players).filter(([, player]) => !player.isHost)
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
        || room.activeQuestionId
        || room.answerRevealed
        || !areAllQuestionsDone(room.questionStates)
    ) {
        return false;
    }

    const topTiedPlayerIds = getTopTiedPlayerIds(room.players);
    return topTiedPlayerIds.length <= 1 || Boolean(room.tieBreaker?.championId);
};
