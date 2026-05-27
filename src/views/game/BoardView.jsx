import { useState } from 'react';
import { X } from 'lucide-react';
import { createHistoryItem, handleEndGame, handlePickQuestion } from '../../actions/gameActions';
import HoldToConfirmButton from '../../components/HoldToConfirmButton';
import { useLanguage } from '../../useLanguage';

const getBoardPoints = (question) => (
    question.isSurpriseQuestion
        ? (question.surpriseDisplayPoints ?? question.points)
        : question.points
);

function SurprisePlayerModal({ players, question, onPick, onClose, t }) {
    const playerEntries = Object.entries(players).filter(([, player]) => !player.isHost);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full max-w-md rounded-xl border border-yellow-500/50 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 p-5">
                    <h2 className="text-xl font-bold text-white">{t('selectSurprisePlayer')}</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white">
                        <X size={22} />
                    </button>
                </div>
                <div className="space-y-3 p-5">
                    <div className="rounded-lg border border-yellow-500/30 bg-yellow-950/20 p-3 text-sm font-bold text-yellow-200">
                        {t('surpriseMaxPoints', { points: question.points })}
                    </div>
                    {playerEntries.map(([playerId, player]) => (
                        <button
                            key={playerId}
                            onClick={() => onPick(playerId)}
                            className="flex w-full items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-4 text-left font-bold text-slate-100 hover:border-yellow-500/60 hover:bg-slate-800"
                        >
                            <span className="text-2xl">{player.avatar}</span>
                            <span className="truncate">{player.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function BoardView({ room, roomRef, user, isHost }) {
    const { t } = useLanguage();
    const [pendingSurpriseQuestion, setPendingSurpriseQuestion] = useState(null);
    const isMyTurn = room.currentTurn === user.uid;
    const categories = room.pack.categories;
    const actorName = room.players[user.uid]?.name || user.displayName || t('playerFallback');

    // Check if all questions are done
    const allDone = Object.values(room.questionStates).every(state => state === 'done');
    const handleHostEndGame = () => handleEndGame(roomRef, createHistoryItem({
        type: 'game_finished',
        actorId: user.uid,
        actorName,
        message: t('historyGameEnded', { actorName }),
        details: { actorName }
    }));
    const createQuestionPickedHistory = (cat, q, pickerName) => createHistoryItem({
        type: 'question_picked',
        actorId: user.uid,
        actorName: pickerName,
        message: t('historyQuestionPicked', {
            actorName: pickerName,
            categoryName: cat.name,
            points: q.points
        }),
        details: {
            actorName: pickerName,
            categoryName: cat.name,
            points: q.points
        }
    });
    const pickQuestion = async (cat, q, answererId = null) => {
        const pickerName = room.players[user.uid]?.name || actorName;
        const extraUpdate = q.isSurpriseQuestion ? {
            surpriseRound: {
                questionId: q.id,
                pickerId: user.uid,
                answererId,
                judgeResult: null,
                wheelValues: null,
                rollResult: null,
                rolledAt: null
            }
        } : {};

        await handlePickQuestion(roomRef, q.id, createQuestionPickedHistory(cat, q, pickerName), extraUpdate);
        setPendingSurpriseQuestion(null);
    };

    return (
        <div className="flex-1 flex flex-col h-full">
            {pendingSurpriseQuestion && (
                <SurprisePlayerModal
                    players={room.players}
                    question={pendingSurpriseQuestion.q}
                    t={t}
                    onClose={() => setPendingSurpriseQuestion(null)}
                    onPick={(playerId) => pickQuestion(pendingSurpriseQuestion.cat, pendingSurpriseQuestion.q, playerId)}
                />
            )}
            {!allDone && (
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-black text-slate-300">
                        {isHost ? t('hostAwaitingSelection') : isMyTurn ? t('yourTurnPickQuestion') : t('waitingForPick')}
                    </h2>
                    {isHost && (
                        <HoldToConfirmButton
                            onConfirm={handleHostEndGame}
                            className="rounded border border-red-500/30 bg-red-600/20 px-4 py-2 text-sm font-bold text-red-400 transition-colors hover:text-white"
                        >
                            {t('endGameEarly')}
                        </HoldToConfirmButton>
                    )}
                </div>
            )}

            {allDone ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                    <h2 className="text-4xl font-bold text-white mb-6">
                        {isHost ? t('boardEmpty') : t('boardCompleteWaitingResults')}
                    </h2>
                    {isHost && (
                        <button
                            onClick={handleHostEndGame}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-4 rounded-xl font-black text-2xl shadow-lg shadow-purple-600/30 transition-transform transform hover:scale-105"
                        >
                            {t('showFinalResults')}
                        </button>
                    )}
                </div>
            ) : (
                <div
                    className="flex-1 grid gap-4 h-full"
                    style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(0, 1fr))` }}
                >
                    {categories.map((cat, i) => (
                        <div key={cat.id || i} className="flex min-h-0 flex-col gap-4">
                            <div className="bg-blue-900 border-2 border-blue-500 text-center p-3 rounded-lg flex items-center justify-center min-h-[4rem] shadow-md shadow-black/50">
                                <span className="font-bold text-sm md:text-base text-blue-100 uppercase tracking-wide leading-tight drop-shadow-md">
                                    {cat.name}
                                </span>
                            </div>

                            <div className="flex min-h-0 flex-1 flex-col gap-4">
                                {(cat.questions || []).map((q) => {
                                    const state = room.questionStates[q.id];
                                    const isAvailable = state === 'available';
                                    const canPick = isAvailable && (isMyTurn || isHost); // Host can force pick

                                    return (
                                        <button
                                            key={q.id}
                                            disabled={!canPick}
                                            onClick={() => {
                                                if (q.isSurpriseQuestion && isHost) {
                                                    setPendingSurpriseQuestion({ cat, q });
                                                    return;
                                                }

                                                pickQuestion(cat, q, q.isSurpriseQuestion ? user.uid : null);
                                            }}
                                            className={`
                                                flex-1 rounded-lg flex items-center justify-center text-2xl md:text-4xl font-black font-mono transition-all
                                                ${isAvailable
                                                    ? (canPick
                                                        ? 'bg-blue-800 hover:bg-blue-700 text-yellow-400 cursor-pointer shadow-[inset_0_-4px_0_0_rgba(0,0,0,0.3)] shadow-black hover:-translate-y-1'
                                                        : 'bg-blue-900/50 text-yellow-500/50 cursor-not-allowed border border-blue-800/30')
                                                    : 'bg-gray-400/10 border-2 border-slate-500/10 text-transparent cursor-default'
                                                }
                                            `}
                                        >
                                            {isAvailable && getBoardPoints(q)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
