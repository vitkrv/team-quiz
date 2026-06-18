import { arrayUnion, deleteField, runTransaction, updateDoc } from 'firebase/firestore';
import { generateId } from '../utils/ids';

export const RPS_CHOICES = {
    rock: { emoji: '🪨', beats: 'scissors' },
    paper: { emoji: '📄', beats: 'rock' },
    scissors: { emoji: '✂️', beats: 'paper' }
};

export const RPS_MODES = {
    one: { targetWins: 1 },
    three: { targetWins: 3 }
};

const normalizeRpsMode = (mode) => (RPS_MODES[mode] ? mode : 'one');

const createMatch = (playerAId, playerBId, tieBreaker) => ({
    id: generateId(),
    round: tieBreaker.round,
    playerIds: [playerAId, playerBId],
    targetWins: tieBreaker.targetWins,
    wins: {
        [playerAId]: 0,
        [playerBId]: 0
    },
    choices: {},
    throws: [],
    winnerId: null,
    startedAt: Date.now()
});

export const getChoiceWinner = (playerAId, playerBId, choices) => {
    const choiceA = choices[playerAId];
    const choiceB = choices[playerBId];

    if (!choiceA || !choiceB || choiceA === choiceB) return null;
    return RPS_CHOICES[choiceA]?.beats === choiceB ? playerAId : playerBId;
};

const createHostRps = (playerAId, playerBId, mode) => {
    const normalizedMode = normalizeRpsMode(mode);

    return {
        id: generateId(),
        status: 'active',
        mode: normalizedMode,
        targetWins: RPS_MODES[normalizedMode].targetWins,
        playerIds: [playerAId, playerBId],
        wins: {
            [playerAId]: 0,
            [playerBId]: 0
        },
        choices: {},
        throws: [],
        resultHistoryId: null,
        startedAt: Date.now()
    };
};

const advanceTieBreakerWinner = (tieBreaker, winnerId, loserId) => {
    const nextRoundPlayerIds = [...(tieBreaker.nextRoundPlayerIds || []), winnerId];
    let roundPlayerIds = (tieBreaker.roundPlayerIds || []).filter((playerId) => (
        playerId !== winnerId && playerId !== loserId
    ));
    const eliminatedPlayerIds = [...(tieBreaker.eliminatedPlayerIds || []), loserId];

    if (roundPlayerIds.length === 1) {
        nextRoundPlayerIds.push(roundPlayerIds[0]);
        roundPlayerIds = [];
    }

    if (roundPlayerIds.length === 0) {
        if (nextRoundPlayerIds.length === 1) {
            return {
                ...tieBreaker,
                status: 'champion',
                championId: nextRoundPlayerIds[0],
                roundPlayerIds: [],
                nextRoundPlayerIds: [],
                eliminatedPlayerIds,
                currentMatch: null
            };
        }

        return {
            ...tieBreaker,
            status: 'pairing',
            round: tieBreaker.round + 1,
            roundPlayerIds: nextRoundPlayerIds,
            nextRoundPlayerIds: [],
            eliminatedPlayerIds,
            currentMatch: null
        };
    }

    return {
        ...tieBreaker,
        status: 'pairing',
        roundPlayerIds,
        nextRoundPlayerIds,
        eliminatedPlayerIds,
        currentMatch: null
    };
};

export const createHistoryItem = ({ type, actorId, actorName, message, details = {} }) => ({
    id: generateId(),
    type,
    actorId,
    actorName,
    message,
    details,
    timestamp: Date.now()
});

export const adjustScore = async (roomRef, playerId, currentScore, delta, historyItem) => {
    const update = {
        [`players.${playerId}.score`]: currentScore + delta
    };

    if (historyItem) {
        update.history = arrayUnion(historyItem);
    }

    await updateDoc(roomRef, update);
};

export const setPlayerScore = async (roomRef, playerId, score, historyItem) => {
    const update = {
        [`players.${playerId}.score`]: score
    };

    if (historyItem) {
        update.history = arrayUnion(historyItem);
    }

    await updateDoc(roomRef, {
        ...update
    });
};

export const handlePickQuestion = async (roomRef, qId, historyItem, extraUpdate = {}, now = Date.now) => {
    const update = {
        activeQuestionId: qId,
        answerRevealed: false,
        buzzedPlayerId: null,
        buzzTimestamp: null,
        buzzUnlockAt: now() + 2000,
        buzzAttempts: {},
        incorrectBuzzedIds: [],
        mediaPlayback: null,
        surpriseRound: null,
        ...extraUpdate
    };

    if (historyItem) {
        update.history = arrayUnion(historyItem);
    }

    await updateDoc(roomRef, update);
};

export const handleEndGame = async (roomRef, historyItem, extraUpdate = {}) => {
    const update = { status: 'finished', mediaPlayback: null, ...extraUpdate };

    if (historyItem) {
        update.history = arrayUnion(historyItem);
    }

    await updateDoc(roomRef, update);
};

export const initializeTieBreaker = async (roomRef, playerIds, mode = 'one', historyItem) => {
    const normalizedMode = normalizeRpsMode(mode);
    const uniquePlayerIds = [...new Set(playerIds)];
    const tieBreaker = {
        status: uniquePlayerIds.length === 1 ? 'champion' : 'pairing',
        mode: normalizedMode,
        targetWins: RPS_MODES[normalizedMode].targetWins,
        participants: uniquePlayerIds,
        roundPlayerIds: uniquePlayerIds,
        nextRoundPlayerIds: [],
        eliminatedPlayerIds: [],
        championId: uniquePlayerIds.length === 1 ? uniquePlayerIds[0] : null,
        currentMatch: null,
        matches: [],
        round: 1,
        startedAt: Date.now()
    };
    const update = { tieBreaker };

    if (historyItem) {
        update.history = arrayUnion(historyItem);
    }

    await updateDoc(roomRef, update);
};

export const startHostRps = async (roomRef, playerIds, mode = 'one') => {
    const normalizedMode = normalizeRpsMode(mode);
    const uniquePlayerIds = [...new Set(playerIds)];
    if (uniquePlayerIds.length !== 2) return;

    await runTransaction(roomRef.firestore, async (transaction) => {
        const roomSnap = await transaction.get(roomRef);
        if (!roomSnap.exists()) return;

        const room = roomSnap.data();
        if (room.status !== 'playing' || room.activeQuestionId || room.hostRps?.status) return;

        const [playerAId, playerBId] = uniquePlayerIds;
        if (!room.players?.[playerAId] || !room.players?.[playerBId]) return;

        transaction.update(roomRef, {
            hostRps: createHostRps(playerAId, playerBId, normalizedMode)
        });
    });
};

export const submitHostRpsChoice = async (roomRef, hostRps, playerId, choice) => {
    if (
        hostRps?.status !== 'active'
        || !hostRps.playerIds?.includes(playerId)
        || !RPS_CHOICES[choice]
        || hostRps.choices?.[playerId]
    ) {
        return;
    }

    await updateDoc(roomRef, {
        [`hostRps.choices.${playerId}`]: choice
    });
};

export const resolveHostRpsThrow = async (roomRef, actor, t) => {
    await runTransaction(roomRef.firestore, async (transaction) => {
        const roomSnap = await transaction.get(roomRef);
        if (!roomSnap.exists()) return;

        const room = roomSnap.data();
        const hostRps = room.hostRps;
        if (hostRps?.status !== 'active' || !hostRps.playerIds || hostRps.playerIds.length !== 2) return;

        const [playerAId, playerBId] = hostRps.playerIds;
        const choices = hostRps.choices || {};
        if (!choices[playerAId] || !choices[playerBId]) return;

        const throwWinnerId = getChoiceWinner(playerAId, playerBId, choices);
        const throwItem = {
            id: generateId(),
            choices,
            isTie: !throwWinnerId,
            playedAt: Date.now()
        };
        const throws = [...(hostRps.throws || []), throwItem];

        if (!throwWinnerId) {
            transaction.update(roomRef, {
                'hostRps.choices': {},
                'hostRps.throws': throws
            });
            return;
        }

        const wins = {
            ...(hostRps.wins || {}),
            [throwWinnerId]: (hostRps.wins?.[throwWinnerId] || 0) + 1
        };

        if (wins[throwWinnerId] < hostRps.targetWins) {
            transaction.update(roomRef, {
                'hostRps.choices': {},
                'hostRps.throws': throws,
                'hostRps.wins': wins
            });
            return;
        }

        const winnerName = room.players?.[throwWinnerId]?.name || t('playerFallback');
        const [opponentAId, opponentBId] = hostRps.playerIds;
        const opponentAName = room.players?.[opponentAId]?.name || t('playerFallback');
        const opponentBName = room.players?.[opponentBId]?.name || t('playerFallback');
        const historyItem = createHistoryItem({
            type: 'host_rps_completed',
            actorId: actor.id,
            actorName: actor.name,
            message: t('historyHostRpsCompleted', {
                actorName: actor.name,
                winnerName,
                playerAName: opponentAName,
                playerBName: opponentBName
            }),
            details: {
                actorName: actor.name,
                winnerName,
                playerAName: opponentAName,
                playerBName: opponentBName,
                mode: hostRps.mode
            }
        });

        transaction.update(roomRef, {
            'hostRps.status': 'complete',
            'hostRps.choices': {},
            'hostRps.throws': throws,
            'hostRps.wins': wins,
            'hostRps.resultHistoryId': historyItem.id,
            'hostRps.completedAt': Date.now(),
            history: arrayUnion(historyItem)
        });
    });
};

export const closeHostRps = async (roomRef, hostRps) => {
    if (hostRps?.status !== 'complete') return;

    await updateDoc(roomRef, {
        hostRps: deleteField()
    });
};

export const selectTieBreakerPair = async (roomRef, tieBreaker, playerAId, playerBId) => {
    if (!tieBreaker || tieBreaker.currentMatch || playerAId === playerBId) return;

    const availablePlayerIds = tieBreaker.roundPlayerIds || [];
    if (!availablePlayerIds.includes(playerAId) || !availablePlayerIds.includes(playerBId)) return;

    await updateDoc(roomRef, {
        'tieBreaker.status': 'match',
        'tieBreaker.currentMatch': createMatch(playerAId, playerBId, tieBreaker)
    });
};

export const grantTieBreakerBye = async (roomRef, tieBreaker, playerId) => {
    if (!tieBreaker || tieBreaker.currentMatch || !(tieBreaker.roundPlayerIds || []).includes(playerId)) return;

    let roundPlayerIds = (tieBreaker.roundPlayerIds || []).filter((id) => id !== playerId);
    let nextRoundPlayerIds = [...(tieBreaker.nextRoundPlayerIds || []), playerId];
    let nextTieBreaker = {
        ...tieBreaker,
        roundPlayerIds,
        nextRoundPlayerIds
    };

    if (roundPlayerIds.length === 0) {
        if (nextRoundPlayerIds.length === 1) {
            nextTieBreaker = {
                ...nextTieBreaker,
                status: 'champion',
                championId: nextRoundPlayerIds[0],
                nextRoundPlayerIds: []
            };
        } else {
            nextTieBreaker = {
                ...nextTieBreaker,
                status: 'pairing',
                round: tieBreaker.round + 1,
                roundPlayerIds: nextRoundPlayerIds,
                nextRoundPlayerIds: []
            };
        }
    }

    await updateDoc(roomRef, { tieBreaker: nextTieBreaker });
};

export const submitTieBreakerChoice = async (roomRef, tieBreaker, playerId, choice) => {
    const currentMatch = tieBreaker?.currentMatch;
    if (!currentMatch?.playerIds?.includes(playerId) || !RPS_CHOICES[choice] || currentMatch.choices?.[playerId]) return;

    await updateDoc(roomRef, {
        [`tieBreaker.currentMatch.choices.${playerId}`]: choice
    });
};

export const resolveTieBreakerThrow = async (roomRef, tieBreaker) => {
    const currentMatch = tieBreaker?.currentMatch;
    if (!currentMatch?.playerIds || currentMatch.playerIds.length !== 2) return;

    const [playerAId, playerBId] = currentMatch.playerIds;
    const choices = currentMatch.choices || {};
    if (!choices[playerAId] || !choices[playerBId] || currentMatch.winnerId) return;

    const throwWinnerId = getChoiceWinner(playerAId, playerBId, choices);
    const throwItem = {
        id: generateId(),
        choices,
        winnerId: throwWinnerId,
        isTie: !throwWinnerId,
        playedAt: Date.now()
    };
    const throws = [...(currentMatch.throws || []), throwItem];

    if (!throwWinnerId) {
        await updateDoc(roomRef, {
            'tieBreaker.currentMatch': {
                ...currentMatch,
                choices: {},
                throws
            }
        });
        return;
    }

    const wins = {
        ...(currentMatch.wins || {}),
        [throwWinnerId]: (currentMatch.wins?.[throwWinnerId] || 0) + 1
    };

    if (wins[throwWinnerId] < tieBreaker.targetWins) {
        await updateDoc(roomRef, {
            'tieBreaker.currentMatch': {
                ...currentMatch,
                choices: {},
                throws,
                wins
            }
        });
        return;
    }

    const completedMatch = {
        ...currentMatch,
        choices: {},
        throws,
        wins,
        winnerId: throwWinnerId,
        completedAt: Date.now()
    };

    await updateDoc(roomRef, {
        'tieBreaker.currentMatch': completedMatch
    });
};

export const advanceTieBreakerMatch = async (roomRef, tieBreaker) => {
    const completedMatch = tieBreaker?.currentMatch;
    if (!completedMatch?.winnerId || !completedMatch.playerIds || completedMatch.playerIds.length !== 2) return;

    const [playerAId, playerBId] = completedMatch.playerIds;
    const winnerId = completedMatch.winnerId;
    const loserId = winnerId === playerAId ? playerBId : playerAId;
    const existingMatches = tieBreaker.matches || [];
    const matches = existingMatches.some((match) => match.id === completedMatch.id)
        ? existingMatches
        : [...existingMatches, completedMatch];
    const nextTieBreaker = advanceTieBreakerWinner(
        {
            ...tieBreaker,
            matches
        },
        winnerId,
        loserId
    );
    const updateTieBreaker = nextTieBreaker.status === 'champion'
        ? { ...nextTieBreaker, currentMatch: completedMatch }
        : nextTieBreaker;

    await updateDoc(roomRef, { tieBreaker: updateTieBreaker });
};
