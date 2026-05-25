import { arrayUnion, updateDoc } from 'firebase/firestore';
import { generateId } from '../utils/ids';

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

export const handlePickQuestion = async (roomRef, qId, historyItem, extraUpdate = {}) => {
    const update = {
        activeQuestionId: qId,
        answerRevealed: false,
        buzzedPlayerId: null,
        buzzTimestamp: null,
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

export const handleEndGame = async (roomRef, historyItem) => {
    const update = { status: 'finished', mediaPlayback: null };

    if (historyItem) {
        update.history = arrayUnion(historyItem);
    }

    await updateDoc(roomRef, update);
};
