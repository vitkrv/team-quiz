import { updateDoc } from 'firebase/firestore';

export const adjustScore = async (roomRef, playerId, currentScore, delta) => {
    await updateDoc(roomRef, {
        [`players.${playerId}.score`]: currentScore + delta
    });
};

export const handlePickQuestion = async (roomRef, qId) => {
    await updateDoc(roomRef, {
        activeQuestionId: qId,
        answerRevealed: false,
        buzzedPlayerId: null,
        buzzTimestamp: null,
        incorrectBuzzedIds: []
    });
};

export const handleEndGame = async (roomRef) => {
    await updateDoc(roomRef, { status: 'finished' });
};
