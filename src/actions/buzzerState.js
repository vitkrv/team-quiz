import { doc, serverTimestamp } from 'firebase/firestore';
import { generateId } from '../utils/ids';
import { BUZZ_OPEN_DELAY_MS } from '../utils/buzzerPolicy';

export const buzzerRef = (roomRef) => doc(roomRef, 'buzzer', 'current');

// Prepare all reads before the storage/recap helpers begin writing.
export async function prepareBuzzerLifecycle(transaction, roomRef, room, update, readPack) {
    if (room.buzzerPolicyVersion !== 1) return () => {};
    const newQuestion = update.activeQuestionId && update.activeQuestionId !== room.activeQuestionId;
    const reopen = update.history?.some((event) => event.type === 'answer_incorrect');
    const cancel = update.status === 'finished' || update.answerRevealed === true
        || (Object.hasOwn(update, 'activeQuestionId') && update.activeQuestionId === null);
    if (!newQuestion && !reopen && !(cancel && room.buzzerRoundId)) return () => {};
    const ref = buzzerRef(roomRef);
    const previous = (await transaction.get(ref)).data();
    if (cancel) return () => {
        if (previous) transaction.update(ref, { phase: 'cancelled' });
    };
    const pack = await readPack(transaction, roomRef, room);
    const questionId = newQuestion ? update.activeQuestionId : room.activeQuestionId;
    const categoryIndex = pack.categories.findIndex((c) => c.questions.some((q) => q.id === questionId));
    const questionIndex = pack.categories[categoryIndex]?.questions.findIndex((q) => q.id === questionId);
    const question = pack.categories[categoryIndex]?.questions[questionIndex];
    if (!question) throw new Error('Question is unavailable');
    if (question.isSurpriseQuestion) {
        update.buzzerRoundId = null;
        return () => { if (previous) transaction.update(ref, { phase: 'cancelled' }); };
    }
    const raceId = generateId();
    update.buzzerRoundId = raceId;
    return () => transaction.set(ref, {
        raceId, questionId, categoryIndex, questionIndex, phase: 'open',
        openedAt: serverTimestamp(), openingDelayMs: reopen ? 0 : BUZZ_OPEN_DELAY_MS,
        firstAcceptedAt: null, attempts: {}, earlyOperations: reopen ? (previous?.earlyOperations || {}) : {}, penalties: reopen ? (previous?.penalties || {}) : {}
    });
}
