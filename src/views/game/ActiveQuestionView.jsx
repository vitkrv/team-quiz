import { useEffect, useState } from 'react';
import { arrayUnion, updateDoc } from 'firebase/firestore';
import { Check, X } from 'lucide-react';
import { useLanguage } from '../../useLanguage';
import { createHistoryItem } from '../../actions/gameActions';
import HoldToConfirmButton from '../../components/HoldToConfirmButton';
import QuestionImage from '../../components/QuestionImage';

export default function ActiveQuestionView({ room, roomRef, user, isHost }) {
    const { t } = useLanguage();
    const [timeLeft, setTimeLeft] = useState(10);

    // Find the active question data
    let activeQ = null;
    let activeCatName = "";
    for (const cat of room.pack.categories) {
        const q = cat.questions.find(q => q.id === room.activeQuestionId);
        if (q) {
            activeQ = q;
            activeCatName = cat.name;
            break;
        }
    }

    // Timer logic
    useEffect(() => {
        let interval;
        if (room.buzzedPlayerId && room.buzzTimestamp) {
            interval = setInterval(() => {
                const elapsed = (Date.now() - room.buzzTimestamp) / 1000;
                const remaining = Math.max(0, 10 - elapsed);
                setTimeLeft(remaining);
            }, 100);
        } else {
            setTimeLeft(10);
        }
        return () => clearInterval(interval);
    }, [room.buzzedPlayerId, room.buzzTimestamp]);

    if (!activeQ) return null;

    const hasBuzzed = !!room.buzzedPlayerId;
    const amIIncorrect = room.incorrectBuzzedIds.includes(user.uid);
    const canIBuzz = !isHost && !hasBuzzed && !amIIncorrect;
    const didIBuzz = room.buzzedPlayerId === user.uid;
    const buzzedPlayer = room.buzzedPlayerId ? room.players[room.buzzedPlayerId] : null;
    const buzzedPlayerName = buzzedPlayer ? buzzedPlayer.name : '';
    const buzzedPlayerAvatar = buzzedPlayer ? buzzedPlayer.avatar : '';
    const isAnswerRevealed = Boolean(room.answerRevealed);
    const actorName = room.players[user.uid]?.name || user.displayName || t('playerFallback');
    const hasQuestionText = Boolean(activeQ.text?.trim());
    const hasAnswerText = Boolean(activeQ.answer?.trim());
    const shouldShowQuestionContext = isHost || !isAnswerRevealed;

    const handleBuzzIn = async () => {
        if (!canIBuzz) return;
        await updateDoc(roomRef, {
            buzzedPlayerId: user.uid,
            buzzTimestamp: Date.now(),
            history: arrayUnion(createHistoryItem({
                type: 'player_buzzed',
                actorId: user.uid,
                actorName,
                message: t('historyPlayerBuzzed', { actorName }),
                details: { actorName }
            }))
        });
    };

    const handleJudge = async (isCorrect) => {
        if (!isHost || !room.buzzedPlayerId) return;

        if (isCorrect) {
            // Award points and reveal the answer before returning to the board.
            const pId = room.buzzedPlayerId;
            const currentScore = room.players[pId].score || 0;
            await updateDoc(roomRef, {
                [`players.${pId}.score`]: currentScore + activeQ.points,
                answerRevealed: true,
                currentTurn: pId,
                [`questionStates.${activeQ.id}`]: 'done',
                history: arrayUnion(createHistoryItem({
                    type: 'answer_correct',
                    actorId: user.uid,
                    actorName,
                    message: t('historyAnswerCorrect', {
                        playerName: room.players[pId]?.name || t('playerFallback'),
                        points: activeQ.points
                    }),
                    details: {
                        playerName: room.players[pId]?.name || t('playerFallback'),
                        points: activeQ.points
                    }
                }))
            });
        } else {
            // Mark incorrect, reset buzz
            await updateDoc(roomRef, {
                buzzedPlayerId: null,
                buzzTimestamp: null,
                incorrectBuzzedIds: arrayUnion(room.buzzedPlayerId),
                history: arrayUnion(createHistoryItem({
                    type: 'answer_incorrect',
                    actorId: user.uid,
                    actorName,
                    message: t('historyAnswerIncorrect', {
                        playerName: buzzedPlayerName || t('playerFallback')
                    }),
                    details: {
                        playerName: buzzedPlayerName || t('playerFallback')
                    }
                }))
            });
        }
    };

    const handleSkip = async () => {
        if (!isHost) return;
        await updateDoc(roomRef, {
            answerRevealed: true,
            buzzedPlayerId: null,
            buzzTimestamp: null,
            [`questionStates.${activeQ.id}`]: 'done',
            history: arrayUnion(createHistoryItem({
                type: 'question_skipped',
                actorId: user.uid,
                actorName,
                message: t('historyQuestionSkipped', {
                    categoryName: activeCatName,
                    points: activeQ.points
                }),
                details: {
                    categoryName: activeCatName,
                    points: activeQ.points
                }
            }))
        });
    };

    const handleContinue = async () => {
        if (!isHost) return;
        await updateDoc(roomRef, {
            activeQuestionId: null,
            answerRevealed: false,
            buzzedPlayerId: null,
            buzzTimestamp: null,
            incorrectBuzzedIds: [],
            history: arrayUnion(createHistoryItem({
                type: 'board_resumed',
                actorId: user.uid,
                actorName,
                message: t('historyBoardResumed', { actorName }),
                details: { actorName }
            }))
        });
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-start max-w-4xl mx-auto w-full text-center relative z-10">

            {shouldShowQuestionContext && (
                <div className="absolute top-0 w-full flex justify-between text-slate-400 font-bold uppercase tracking-widest text-sm">
                    <span>{activeCatName}</span>
                    <span className="text-yellow-500">{t('pointsShort', { points: activeQ.points })}</span>
                </div>
            )}

            {shouldShowQuestionContext && (
                <div className={`mt-10 flex w-full min-h-0 flex-col items-center ${isHost ? 'gap-5' : 'gap-6'}`}>
                    {hasQuestionText && (
                        <div className="w-full bg-blue-900 border-4 border-blue-600 rounded-3xl p-6 md:p-10 shadow-2xl shadow-blue-900/50">
                            <h2 className="text-3xl md:text-5xl font-black text-white leading-tight drop-shadow-lg" style={{textShadow: '2px 2px 4px rgba(0,0,0,0.5)'}}>
                                {activeQ.text}
                            </h2>
                        </div>
                    )}
                    {activeQ.questionImage && (
                        <QuestionImage
                            image={activeQ.questionImage}
                            alt={t('questionImageAlt')}
                            variant={isHost ? 'host' : 'player'}
                            className={hasQuestionText ? '' : 'max-h-[52vh]'}
                        />
                    )}
                </div>
            )}

            {(isHost || isAnswerRevealed) && (
                <div className={`${shouldShowQuestionContext ? 'mt-6' : 'mt-10'} ${isHost ? 'bg-slate-800 border border-slate-700 p-5 rounded-xl max-w-2xl' : 'p-2 md:p-4 max-w-4xl'} w-full`}>
                    <p className="text-sm text-slate-400 uppercase tracking-widest font-bold mb-2">
                        {isAnswerRevealed ? t('correctAnswer') : t('hiddenAnswer')}
                    </p>
                    {hasAnswerText && <p className="text-2xl font-black text-green-400">{activeQ.answer}</p>}
                    {activeQ.answerImage && (
                        <div className={hasAnswerText ? 'mt-4 flex justify-center' : 'flex justify-center'}>
                            <QuestionImage image={activeQ.answerImage} alt={t('answerImageAlt')} variant={isHost ? 'host' : 'player'} />
                        </div>
                    )}
                </div>
            )}

            {isAnswerRevealed && (
                <div className="mt-6 flex flex-col items-center gap-4">
                    {!isHost && (
                        <div className="text-slate-400 font-bold text-lg">
                            {t('waitingForHostContinue')}
                        </div>
                    )}
                    {isHost && (
                        <button
                            onClick={handleContinue}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold text-xl shadow-lg shadow-blue-900 transition-colors"
                        >
                            {t('continue')}
                        </button>
                    )}
                </div>
            )}

            {/* State: Someone buzzed */}
            {hasBuzzed && !isAnswerRevealed && (
                <div className="mt-6 flex flex-col items-center animate-in zoom-in duration-200">
                    <div className="text-xl text-slate-300 mb-4 flex items-center gap-2">
                        <span className="text-3xl">{buzzedPlayerAvatar}</span>
                        <span className="font-black text-2xl text-yellow-400">{buzzedPlayerName}</span> {t('playerIsAnswering', { playerName: '' }).trim()}
                    </div>

                    <div className="relative w-32 h-32 mb-8">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="64" cy="64" r="60" className="stroke-slate-700 fill-none" strokeWidth="8"/>
                            <circle cx="64" cy="64" r="60" className={`fill-none stroke-blue-500 transition-all duration-100 ${timeLeft < 3 ? 'stroke-red-500' : ''}`} strokeWidth="8"
                                    strokeDasharray="377" strokeDashoffset={377 - (377 * timeLeft / 10)}
                            />
                        </svg>
                        <div className={`absolute inset-0 flex items-center justify-center text-4xl font-black font-mono ${timeLeft < 3 ? 'text-red-400' : 'text-blue-400'}`}>
                            {Math.ceil(timeLeft)}
                        </div>
                    </div>

                    {isHost && (
                        <div className="flex gap-4">
                            <button onClick={() => handleJudge(true)} className="bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-xl font-bold text-xl flex items-center gap-2 shadow-lg shadow-green-900">
                                <Check size={28}/> {t('correct')}
                            </button>
                            <button onClick={() => handleJudge(false)} className="bg-red-600 hover:bg-red-500 text-white px-8 py-4 rounded-xl font-bold text-xl flex items-center gap-2 shadow-lg shadow-red-900">
                                <X size={28}/> {t('incorrect')}
                            </button>
                        </div>
                    )}

                    {didIBuzz && !isHost && (
                        <div className="text-2xl font-bold text-blue-400 animate-pulse mt-4">
                            {t('speakAnswer')}
                        </div>
                    )}
                </div>
            )}

            {/* State: Waiting for buzz */}
            {!hasBuzzed && !isAnswerRevealed && (
                <div className="mt-6 flex shrink-0 flex-col items-center w-full max-w-md">
                    {isHost ? (
                        <div className="text-slate-400 mb-6">{t('waitingForBuzz')}</div>
                    ) : (
                        canIBuzz ? (
                            <button
                                onClick={handleBuzzIn}
                                className="w-48 h-48 rounded-full bg-red-600 hover:bg-red-500 border-8 border-red-800 text-white font-black text-4xl shadow-[0_10px_0_0_#7f1d1d,inset_0_10px_20px_rgba(255,255,255,0.3)] active:shadow-[0_0px_0_0_#7f1d1d,inset_0_10px_20px_rgba(255,255,255,0.3)] active:translate-y-[10px] transition-all"
                            >
                                {t('buzz')}
                            </button>
                        ) : (
                            <div className="text-slate-500 font-bold text-xl p-8 border-2 border-dashed border-slate-700 rounded-xl w-full">
                                {amIIncorrect ? t('answeredIncorrectly') : t('waiting')}
                            </div>
                        )
                    )}

                    {isHost && (
                        <HoldToConfirmButton
                            onConfirm={handleSkip}
                            durationMs={2000}
                            fillClassName="bg-slate-700"
                            className="mt-8 rounded-lg border border-slate-600 bg-transparent px-6 py-2 font-bold text-slate-400 transition-colors hover:text-white"
                        >
                            {t('skipRevealAnswer')}
                        </HoldToConfirmButton>
                    )}
                </div>
            )}

        </div>
    );
}
