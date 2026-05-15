import { createHistoryItem, handleEndGame, handlePickQuestion } from '../../actions/gameActions';
import { useLanguage } from '../../useLanguage';

export default function BoardView({ room, roomRef, user, isHost }) {
    const { t } = useLanguage();
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

    return (
        <div className="flex-1 flex flex-col h-full">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-slate-300">
                    {isHost ? t('hostAwaitingSelection') : isMyTurn ? t('yourTurnPickQuestion') : t('waitingForPick')}
                </h2>
                {isHost && (
                    <button
                        onClick={handleHostEndGame}
                        className="bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white px-4 py-2 rounded font-bold border border-red-500/30 transition-colors text-sm"
                    >
                        {t('endGameEarly')}
                    </button>
                )}
            </div>

            {allDone ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                    <h2 className="text-4xl font-bold text-white mb-6">{t('boardEmpty')}</h2>
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
                        <div key={i} className="flex flex-col gap-4">
                            {/* Category Header */}
                            <div className="bg-blue-900 border-2 border-blue-500 text-center p-3 rounded-lg flex items-center justify-center min-h-[4rem] shadow-md shadow-black/50">
                <span className="font-bold text-sm md:text-base text-blue-100 uppercase tracking-wide leading-tight drop-shadow-md">
                  {cat.name}
                </span>
                            </div>

                            {/* Questions Stack */}
                            {cat.questions.map((q) => {
                                const state = room.questionStates[q.id];
                                const isAvailable = state === 'available';
                                const canPick = isAvailable && (isMyTurn || isHost); // Host can force pick

                                const pickerName = room.players[user.uid]?.name || actorName;

                                return (
                                    <button
                                        key={q.id}
                                        disabled={!canPick}
                                        onClick={() => handlePickQuestion(roomRef, q.id, createHistoryItem({
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
                                        }))}
                                        className={`
                      flex-1 rounded-lg flex items-center justify-center text-2xl md:text-4xl font-black font-mono transition-all
                      ${isAvailable
                                            ? (canPick
                                                ? 'bg-blue-800 hover:bg-blue-700 text-yellow-400 cursor-pointer shadow-[inset_0_-4px_0_0_rgba(0,0,0,0.3)] shadow-black hover:-translate-y-1'
                                                : 'bg-blue-900/50 text-yellow-500/50 cursor-not-allowed border border-blue-800/30')
                                            : 'bg-transparent border-2 border-slate-800/30 text-transparent cursor-default'
                                        }
                    `}
                                    >
                                        {isAvailable && q.points}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
