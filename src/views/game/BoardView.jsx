import { useState } from 'react';
import { Shuffle, X } from 'lucide-react';
import {
    advanceTieBreakerMatch,
    createHistoryItem,
    grantTieBreakerBye,
    handleEndGame,
    handlePickQuestion,
    initializeTieBreaker,
    resolveTieBreakerThrow,
    selectTieBreakerPair,
    submitTieBreakerChoice
} from '../../actions/gameActions';
import HoldToConfirmButton from '../../components/HoldToConfirmButton';
import RockPaperScissorsManager from '../../components/RockPaperScissorsManager';
import { useLanguage } from '../../useLanguage';
import { areAllQuestionsDone, getTopTiedPlayerIds } from '../../utils/gameResults';

const getBoardPoints = (question) => (
    question.isSurpriseQuestion
        ? (question.surpriseDisplayPoints ?? question.points)
        : question.points
);

const getSurprisePlayerEntries = (players = {}) => (
    Object.entries(players).filter(([, player]) => !player.isHost)
);

const pickRandomPlayerId = (playerEntries) => {
    if (!playerEntries.length) return null;

    const randomIndex = Math.floor(Math.random() * playerEntries.length);
    return playerEntries[randomIndex][0];
};

function SurprisePlayerModal({ players, question, onPick, onClose, t }) {
    const playerEntries = getSurprisePlayerEntries(players);
    const handleRandomPick = () => {
        const playerId = pickRandomPlayerId(playerEntries);
        if (playerId) onPick(playerId);
    };

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
                    <button
                        type="button"
                        onClick={handleRandomPick}
                        disabled={playerEntries.length === 0}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500 px-4 py-3 font-black text-slate-950 transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                    >
                        <Shuffle size={18} />
                        {t('surpriseRandomPlayer')}
                    </button>
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

export default function BoardView({ room, roomRef, user, isHost, isSpectator = false, serverNow = Date.now }) {
    const { t } = useLanguage();
    const [pendingSurpriseQuestion, setPendingSurpriseQuestion] = useState(null);
    const [isTieBreakerSetupOpen, setIsTieBreakerSetupOpen] = useState(false);
    const isMyTurn = room.currentTurn === user.uid;
    const categories = room.pack.categories;
    const maxQuestionCount = Math.max(0, ...categories.map((cat) => cat.questions?.length || 0));
    const actorName = room.players[user.uid]?.name || user.displayName || t('playerFallback');
    const surprisePlayerEntries = getSurprisePlayerEntries(room.players);

    // Check if all questions are done
    const allDone = areAllQuestionsDone(room.questionStates);
    const topTiedPlayerIds = getTopTiedPlayerIds(room.players);
    const hasTopScoreTie = topTiedPlayerIds.length > 1;
    const shouldShowTieBreaker = Boolean(room.tieBreaker?.status) || isTieBreakerSetupOpen;
    const handleHostEndGame = () => handleEndGame(roomRef, createHistoryItem({
        type: 'game_finished',
        actorId: user.uid,
        actorName,
        message: t('historyGameEnded', { actorName }),
        details: { actorName }
    }));
    const handleFinishTieBreakerGame = () => handleEndGame(roomRef, createHistoryItem({
        type: 'game_finished',
        actorId: user.uid,
        actorName,
        message: t('historyGameEnded', { actorName }),
        details: {
            actorName,
            tieBreakerChampionName: room.players[room.tieBreaker?.championId]?.name || t('playerFallback')
        }
    }));
    const handleStartTieBreaker = async (mode) => {
        await initializeTieBreaker(roomRef, topTiedPlayerIds, mode, createHistoryItem({
            type: 'tie_breaker_started',
            actorId: user.uid,
            actorName,
            message: t('historyTieBreakerStarted', { actorName }),
            details: { actorName, mode }
        }));
        setIsTieBreakerSetupOpen(false);
    };
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

        await handlePickQuestion(roomRef, q.id, createQuestionPickedHistory(cat, q, pickerName), extraUpdate, serverNow);
        setPendingSurpriseQuestion(null);
    };

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col">
            {shouldShowTieBreaker && (
                <RockPaperScissorsManager
                    players={room.players}
                    participantIds={topTiedPlayerIds}
                    tieBreaker={room.tieBreaker || null}
                    userId={user.uid}
                    isHost={isHost}
                    isSpectator={isSpectator}
                    onClose={() => setIsTieBreakerSetupOpen(false)}
                    onStart={handleStartTieBreaker}
                    onSelectPair={(playerAId, playerBId) => selectTieBreakerPair(roomRef, room.tieBreaker, playerAId, playerBId)}
                    onGrantBye={(playerId) => grantTieBreakerBye(roomRef, room.tieBreaker, playerId)}
                    onSubmitChoice={(choice) => submitTieBreakerChoice(roomRef, room.tieBreaker, user.uid, choice)}
                    onResolveThrow={() => resolveTieBreakerThrow(roomRef, room.tieBreaker)}
                    onAdvanceMatch={() => advanceTieBreakerMatch(roomRef, room.tieBreaker)}
                    onFinish={handleFinishTieBreakerGame}
                    t={t}
                />
            )}
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
                <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between md:mb-6">
                    <h2 className="text-xl font-black leading-tight text-slate-300 md:text-2xl">
                        {isHost ? t('hostAwaitingSelection') : isSpectator ? t('spectatorWaitingForPick') : isMyTurn ? t('yourTurnPickQuestion') : t('waitingForPick')}
                    </h2>
                    {isHost && (
                        <HoldToConfirmButton
                            onConfirm={handleHostEndGame}
                            title={t('holdToConfirmAction', { action: t('endGameEarly') })}
                            className="w-full rounded border border-red-500/30 bg-red-600/20 px-4 py-2 text-sm font-bold text-red-400 transition-colors hover:text-white sm:w-auto"
                        >
                            {t('endGameEarly')}
                        </HoldToConfirmButton>
                    )}
                </div>
            )}

            {allDone ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                    <h2 className="mb-6 text-2xl font-bold text-white md:text-4xl">
                        {isHost ? t('boardEmpty') : t('boardCompleteWaitingResults')}
                    </h2>
                    {isHost && (
                        <button
                            onClick={hasTopScoreTie ? () => setIsTieBreakerSetupOpen(true) : handleHostEndGame}
                            className="rounded-xl bg-purple-600 px-6 py-3 text-lg font-black text-white shadow-lg shadow-purple-600/30 transition-transform hover:scale-105 hover:bg-purple-500 md:px-8 md:py-4 md:text-2xl"
                        >
                            {hasTopScoreTie ? t('determineWinner') : t('showFinalResults')}
                        </button>
                    )}
                </div>
            ) : (
                <div className="-mx-3 min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-3 md:mx-0 md:px-0">
                    <div
                        className="grid h-full min-w-max gap-2 [grid-template-columns:repeat(var(--category-count),minmax(9rem,1fr))] md:min-w-0 md:gap-4 md:[grid-template-columns:repeat(var(--category-count),minmax(0,1fr))]"
                        style={{ '--category-count': categories.length }}
                    >
                        {categories.map((cat, i) => (
                            <div key={cat.id || i} className="flex min-h-0 flex-col gap-2 md:gap-4">
                                <div className="flex h-16 items-center justify-center rounded-lg border-2 border-blue-500 bg-blue-900 p-2 text-center shadow-md shadow-black/50 md:h-24 md:p-3">
                                    <span className="text-xs font-bold uppercase leading-tight tracking-wide text-blue-100 drop-shadow-md md:text-base">
                                        {cat.name}
                                    </span>
                                </div>

                                <div
                                    className="grid min-h-0 flex-1 gap-2 md:gap-4"
                                    style={{ gridTemplateRows: `repeat(${maxQuestionCount}, minmax(0, 1fr))` }}
                                >
                                    {(cat.questions || []).map((q) => {
                                        const state = room.questionStates[q.id];
                                        const isAvailable = state === 'available';
                                        const canPick = isAvailable && !isSpectator && (isMyTurn || isHost); // Host can force pick

                                        return (
                                            <button
                                                key={q.id}
                                                disabled={!canPick}
                                                onClick={() => {
                                                    if (q.isSurpriseQuestion && isHost) {
                                                        setPendingSurpriseQuestion({ cat, q });
                                                        return;
                                                    }

                                                    pickQuestion(
                                                        cat,
                                                        q,
                                                        q.isSurpriseQuestion ? pickRandomPlayerId(surprisePlayerEntries) : null
                                                    );
                                                }}
                                                className={`
                                                    flex min-h-14 items-center justify-center rounded-lg font-mono text-xl font-black transition-all duration-200 md:min-h-0 md:text-4xl
                                                    ${isAvailable
                                                        ? (canPick
                                                            ? 'bg-blue-800 hover:bg-blue-700 text-yellow-400 cursor-pointer shadow-[inset_0_-4px_0_0_rgba(0,0,0,0.3)] shadow-black hover:shadow-[0_0_18px_3px_rgba(59,130,246,0.55),inset_0_-4px_0_0_rgba(0,0,0,0.3)]'
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
                </div>
            )}
        </div>
    );
}
