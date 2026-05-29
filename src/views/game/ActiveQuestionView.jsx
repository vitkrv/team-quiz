import { useEffect, useMemo, useState } from 'react';
import { arrayUnion, increment, updateDoc } from 'firebase/firestore';
import { Check, Play, RotateCw, X } from 'lucide-react';
import { useLanguage } from '../../useLanguage';
import { createHistoryItem } from '../../actions/gameActions';
import HoldToConfirmButton from '../../components/HoldToConfirmButton';
import QuestionMedia from '../../components/QuestionMedia';
import { getMediaKind, MEDIA_KINDS, MEDIA_SLOTS } from '../../services/imageStorage';

const POINT_STEP = 100;
const SURPRISE_DEFAULT_MIN_POINTS = 100;
const SURPRISE_DEFAULT_MAX_POINTS = 500;
const WHEEL_ANIMATION_MS = 6000;
const SURPRISE_BACKGROUND_EMOJIS = ['🍿', '🎉', '🥳', '🎁', '🍾', '🎂', '✨', '🪄'];
const SURPRISE_BACKGROUND_EMOJI_COUNT = 80;

const normalizePoints = (value, fallback = POINT_STEP) => {
    const parsedValue = Number.parseInt(value, 10);
    if (Number.isNaN(parsedValue)) return fallback;

    return Math.max(POINT_STEP, Math.round(parsedValue / POINT_STEP) * POINT_STEP);
};

const getSurpriseMinPoints = (question) => normalizePoints(question.surpriseMinPoints, SURPRISE_DEFAULT_MIN_POINTS);
const getSurpriseMaxPoints = (question) => Math.max(
    getSurpriseMinPoints(question),
    normalizePoints(question.surpriseMaxPoints ?? question.points, SURPRISE_DEFAULT_MAX_POINTS)
);

const getFullSurpriseWheelValues = (question) => {
    const values = [];
    const minPoints = getSurpriseMinPoints(question);
    const maxPoints = getSurpriseMaxPoints(question);

    for (let points = minPoints; points <= maxPoints; points += POINT_STEP) {
        values.push(points, -points);
    }

    return values;
};

const shuffleWheelValues = (values) => {
    const shuffledValues = [...values];

    for (let index = shuffledValues.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffledValues[index], shuffledValues[swapIndex]] = [shuffledValues[swapIndex], shuffledValues[index]];
    }

    return shuffledValues;
};

const pruneSurpriseWheelValues = (question, isCorrect) => {
    const values = getFullSurpriseWheelValues(question);
    const removedSign = isCorrect ? -1 : 1;
    const valuesToPrune = values
        .filter((value) => Math.sign(value) === removedSign)
        .sort((a, b) => Math.abs(b) - Math.abs(a));
    const removeCount = Math.min(valuesToPrune.length - 1, Math.floor(valuesToPrune.length * 0.8));
    const removedValues = new Set(valuesToPrune.slice(0, Math.max(0, removeCount)));
    return shuffleWheelValues(values.filter((value) => !removedValues.has(value)));
};

const polarToCartesian = (center, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
    return {
        x: center + (radius * Math.cos(angleInRadians)),
        y: center + (radius * Math.sin(angleInRadians))
    };
};

const describeSlice = (center, radius, startAngle, endAngle) => {
    const start = polarToCartesian(center, radius, startAngle);
    const end = polarToCartesian(center, radius, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
};

const createSurpriseBackgroundItems = () => Array.from({ length: SURPRISE_BACKGROUND_EMOJI_COUNT }, (_, index) => ({
    id: index,
    emoji: SURPRISE_BACKGROUND_EMOJIS[Math.floor(Math.random() * SURPRISE_BACKGROUND_EMOJIS.length)],
    left: Math.random() * 100,
    top: Math.random() * 100,
    rotation: (Math.random() * 80) - 40,
    size: 1 + (Math.random() * 2),
    opacity: 0.08 + (Math.random() * 0.14)
}));

function SurprisePartyBackground({ items }) {
    return (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-screen w-screen -translate-x-1/2 -translate-y-1/2 overflow-hidden">
            {items.map((item) => (
                <span
                    key={item.id}
                    className="absolute select-none"
                    style={{
                        left: `${item.left}%`,
                        top: `${item.top}%`,
                        fontSize: `${item.size}rem`,
                        opacity: item.opacity,
                        transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`
                    }}
                >
                    {item.emoji}
                </span>
            ))}
        </div>
    );
}

function PointsWheel({ values, result, rolledAt, t }) {
    const [rotation, setRotation] = useState(0);
    const [isResultVisible, setIsResultVisible] = useState(false);
    const size = 320;
    const center = size / 2;
    const radius = 150;
    const sliceAngle = values.length > 0 ? 360 / values.length : 360;
    const resultIndex = result === null || result === undefined ? -1 : values.findIndex((value) => value === result);

    useEffect(() => {
        if (resultIndex < 0) {
            setRotation(0);
            setIsResultVisible(false);
            return undefined;
        }

        setRotation(0);
        setIsResultVisible(false);
        const frame = window.requestAnimationFrame(() => {
            const targetCenterAngle = resultIndex * sliceAngle + (sliceAngle / 2);
            setRotation((360 * 6) - targetCenterAngle);
        });
        const timeoutId = window.setTimeout(() => {
            setIsResultVisible(true);
        }, WHEEL_ANIMATION_MS);

        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(timeoutId);
        };
    }, [resultIndex, rolledAt, sliceAngle]);

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="relative h-80 w-80">
                <div className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 border-l-[16px] border-r-[16px] border-t-[28px] border-l-transparent border-r-transparent border-t-yellow-300 drop-shadow-lg" />
                <svg
                    viewBox={`0 0 ${size} ${size}`}
                    className="h-full w-full drop-shadow-2xl"
                    style={{
                        transform: `rotate(${rotation}deg)`,
                        transition: resultIndex >= 0 ? `transform ${WHEEL_ANIMATION_MS}ms cubic-bezier(0.12, 0.72, 0.16, 1)` : 'none'
                    }}
                >
                    {values.map((value, index) => {
                        const startAngle = index * sliceAngle;
                        const endAngle = startAngle + sliceAngle;
                        const labelAngle = startAngle + (sliceAngle / 2);
                        const labelPoint = polarToCartesian(center, radius * 0.66, labelAngle);
                        const isPositive = value > 0;

                        return (
                            <g key={`${value}:${index}`}>
                                <path
                                    d={describeSlice(center, radius, startAngle, endAngle)}
                                    fill={isPositive ? '#16a34a' : '#dc2626'}
                                    stroke="#020617"
                                    strokeWidth="3"
                                />
                                <text
                                    x={labelPoint.x}
                                    y={labelPoint.y}
                                    fill="white"
                                    fontSize="20"
                                    fontWeight="900"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    transform={`rotate(${labelAngle} ${labelPoint.x} ${labelPoint.y})`}
                                >
                                    {value > 0 ? `+${value}` : value}
                                </text>
                            </g>
                        );
                    })}
                    <circle cx={center} cy={center} r="34" fill="#0f172a" stroke="#facc15" strokeWidth="5" />
                </svg>
            </div>
            {isResultVisible && result !== null && result !== undefined && (
                <div className={`rounded-lg px-5 py-2 text-3xl font-black ${result >= 0 ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                    {t('wheelResult', { points: result > 0 ? `+${result}` : result })}
                </div>
            )}
        </div>
    );
}

function SpaceBuzzHandler({ enabled, onBuzz }) {
    useEffect(() => {
        if (!enabled) return undefined;

        const handleSpaceBuzz = (event) => {
            if (event.repeat || document.hidden) return;
            if (event.code !== 'Space' && event.key !== ' ') return;

            event.preventDefault();
            onBuzz();
        };

        window.addEventListener('keydown', handleSpaceBuzz, true);
        return () => window.removeEventListener('keydown', handleSpaceBuzz, true);
    }, [enabled, onBuzz]);

    return null;
}

export default function ActiveQuestionView({ room, roomRef, user, isHost }) {
    const { t } = useLanguage();
    const [timeLeft, setTimeLeft] = useState(10);
    const [isRolling, setIsRolling] = useState(false);
    const surpriseBackgroundItems = useMemo(() => createSurpriseBackgroundItems(), [room.activeQuestionId]);

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

    const isSurpriseQuestion = Boolean(activeQ.isSurpriseQuestion);
    const surpriseRound = room.surpriseRound?.questionId === activeQ.id ? room.surpriseRound : null;
    const surpriseAnswererId = surpriseRound?.answererId || null;
    const surpriseAnswerer = surpriseAnswererId ? room.players[surpriseAnswererId] : null;
    const surpriseWheelValues = surpriseRound?.wheelValues || [];
    const isSurpriseJudged = Boolean(surpriseRound?.judgeResult);
    const isSurpriseRolled = surpriseRound?.rollResult !== null && surpriseRound?.rollResult !== undefined;
    const isSurpriseScoreApplied = Boolean(surpriseRound?.scoreAppliedAt);
    const canContinueQuestion = !isSurpriseQuestion || !isSurpriseJudged || (isSurpriseRolled && isSurpriseScoreApplied);
    const isAnswerRevealed = Boolean(room.answerRevealed);
    const canRollSurpriseWheel = isSurpriseQuestion
        && isAnswerRevealed
        && isSurpriseJudged
        && !isSurpriseRolled
        && !isRolling
        && (user.uid === surpriseAnswererId || isHost);
    const hasBuzzed = !!room.buzzedPlayerId;
    const amIIncorrect = (room.incorrectBuzzedIds || []).includes(user.uid);
    const canIBuzz = !isSurpriseQuestion && !isHost && !hasBuzzed && !amIIncorrect;
    const didIBuzz = room.buzzedPlayerId === user.uid;
    const buzzedPlayer = room.buzzedPlayerId ? room.players[room.buzzedPlayerId] : null;
    const buzzedPlayerName = buzzedPlayer ? buzzedPlayer.name : '';
    const buzzedPlayerAvatar = buzzedPlayer ? buzzedPlayer.avatar : '';
    const actorName = room.players[user.uid]?.name || user.displayName || t('playerFallback');
    const hasQuestionText = Boolean(activeQ.text?.trim());
    const hasAnswerText = Boolean(activeQ.answer?.trim());
    const shouldShowQuestionContext = isHost || !isAnswerRevealed;
    const questionMediaKind = getMediaKind(activeQ.questionMedia);
    const hasGatedQuestionMedia = [MEDIA_KINDS.AUDIO, MEDIA_KINDS.VIDEO].includes(questionMediaKind);
    const questionContainerClassName = isSurpriseQuestion
        ? 'w-full rounded-3xl border-4 border-yellow-400 bg-yellow-950/40 p-6 shadow-2xl shadow-yellow-950/40 md:p-10'
        : 'w-full bg-blue-900 border-4 border-blue-600 rounded-3xl p-6 md:p-10 shadow-2xl shadow-blue-900/50';
    const mediaPlayback = room.mediaPlayback || null;
    const isQuestionMediaStarted = Boolean(
        hasGatedQuestionMedia
        && mediaPlayback?.questionId === activeQ.id
        && mediaPlayback?.slot === MEDIA_SLOTS.QUESTION
        && mediaPlayback?.status === 'started'
    );
    const questionMediaStartAt = mediaPlayback?.startedAt || 0;

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
        if (!isHost) return;

        if (isSurpriseQuestion) {
            if (!surpriseAnswererId) return;

            const playerName = room.players[surpriseAnswererId]?.name || t('playerFallback');
            await updateDoc(roomRef, {
                answerRevealed: true,
                buzzedPlayerId: null,
                buzzTimestamp: null,
                currentTurn: surpriseAnswererId,
                [`questionStates.${activeQ.id}`]: 'done',
                surpriseRound: {
                    ...surpriseRound,
                    judgeResult: isCorrect ? 'correct' : 'incorrect',
                    wheelValues: pruneSurpriseWheelValues(activeQ, isCorrect),
                    rollResult: null,
                    rolledAt: null,
                    rolledBy: null,
                    scoreAppliedAt: null
                },
                history: arrayUnion(createHistoryItem({
                    type: isCorrect ? 'surprise_answer_correct' : 'surprise_answer_incorrect',
                    actorId: user.uid,
                    actorName,
                    message: isCorrect
                        ? t('historySurpriseAnswerCorrect', { playerName })
                        : t('historySurpriseAnswerIncorrect', { playerName }),
                    details: { playerName }
                }))
            });
            return;
        }

        if (!room.buzzedPlayerId) return;

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
            mediaPlayback: null,
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
            mediaPlayback: null,
            surpriseRound: null,
            history: arrayUnion(createHistoryItem({
                type: 'board_resumed',
                actorId: user.uid,
                actorName,
                message: t('historyBoardResumed', { actorName }),
                details: { actorName }
            }))
        });
    };

    const handleRollSurpriseWheel = async () => {
        if (!canRollSurpriseWheel || surpriseWheelValues.length === 0 || !surpriseAnswererId) return;

        setIsRolling(true);
        const result = surpriseWheelValues[Math.floor(Math.random() * surpriseWheelValues.length)];
        const player = room.players[surpriseAnswererId];
        const rolledAt = Date.now();

        try {
            await updateDoc(roomRef, {
                surpriseRound: {
                    ...surpriseRound,
                    rollResult: result,
                    rolledAt,
                    rolledBy: user.uid,
                    scoreAppliedAt: null
                },
                history: arrayUnion(createHistoryItem({
                    type: 'surprise_wheel_rolled',
                    actorId: user.uid,
                    actorName,
                    message: t('historySurpriseWheelRolled', {
                        playerName: player?.name || t('playerFallback'),
                        points: result > 0 ? `+${result}` : result
                    }),
                    details: {
                        playerName: player?.name || t('playerFallback'),
                        points: result
                    }
                }))
            });

            window.setTimeout(async () => {
                try {
                    await updateDoc(roomRef, {
                        [`players.${surpriseAnswererId}.score`]: increment(result),
                        currentTurn: surpriseAnswererId,
                        'surpriseRound.scoreAppliedAt': Date.now()
                    });
                } catch (err) {
                    console.error('Failed to apply surprise wheel score:', err);
                }
            }, WHEEL_ANIMATION_MS);
        } finally {
            setIsRolling(false);
        }
    };

    const handleStartQuestionMedia = async () => {
        if (!isHost || !hasGatedQuestionMedia || isQuestionMediaStarted) return;
        await updateDoc(roomRef, {
            mediaPlayback: {
                questionId: activeQ.id,
                slot: MEDIA_SLOTS.QUESTION,
                status: 'started',
                startedAt: Date.now() + 600,
                startedBy: user.uid
            }
        });
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-start max-w-4xl mx-auto w-full text-center relative z-10">
            <SpaceBuzzHandler enabled={canIBuzz} onBuzz={handleBuzzIn} />
            {isSurpriseQuestion && <SurprisePartyBackground items={surpriseBackgroundItems} />}

            {shouldShowQuestionContext && (
                <div className="absolute top-0 w-full flex justify-between text-slate-400 font-bold uppercase tracking-widest text-sm">
                    <span>{activeCatName}</span>
                    <span className="text-yellow-500">{t('pointsShort', { points: activeQ.points })}</span>
                </div>
            )}

            {shouldShowQuestionContext && (
                <div className={`mt-10 flex w-full min-h-0 flex-col items-center ${isHost ? 'gap-5' : 'gap-6'}`}>
                    {hasQuestionText && (
                        <div className={questionContainerClassName}>
                            <h2
                                className="break-words font-black leading-tight text-white drop-shadow-lg"
                                style={{
                                    fontSize: 'clamp(1.35rem, 4vw, 2.5rem)',
                                    textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                                }}
                            >
                                {activeQ.text}
                            </h2>
                        </div>
                    )}
                    {activeQ.questionMedia && (
                        <QuestionMedia
                            media={activeQ.questionMedia}
                            alt={t('questionMediaAlt')}
                            variant={isHost ? 'host' : 'player'}
                            className={hasQuestionText ? '' : 'max-h-[52vh]'}
                            t={t}
                            locked={hasGatedQuestionMedia && !isHost && !isQuestionMediaStarted}
                            unlocked={!hasGatedQuestionMedia || isQuestionMediaStarted}
                            shouldStart={hasGatedQuestionMedia && isQuestionMediaStarted}
                            startAt={questionMediaStartAt}
                        />
                    )}
                    {isHost && hasGatedQuestionMedia && !isQuestionMediaStarted && (
                        <button
                            type="button"
                            onClick={handleStartQuestionMedia}
                            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-lg font-bold text-white shadow-lg shadow-blue-900 transition-colors hover:bg-blue-500"
                        >
                            <Play size={22} /> {t('startMediaForEveryone')}
                        </button>
                    )}
                </div>
            )}

            {(isHost || isAnswerRevealed) && (
                <div className={`${shouldShowQuestionContext ? 'mt-6' : 'mt-10'} ${isHost ? 'bg-slate-800 border border-slate-700 p-5 rounded-xl max-w-2xl' : 'p-2 md:p-4 max-w-4xl'} w-full`}>
                    <p className="text-sm text-slate-400 uppercase tracking-widest font-bold mb-2">
                        {isAnswerRevealed ? t('correctAnswer') : t('hiddenAnswer')}
                    </p>
                    {hasAnswerText && <p className="text-2xl font-black text-green-400">{activeQ.answer}</p>}
                    {activeQ.answerMedia && (
                        <div className={hasAnswerText ? 'mt-4 flex justify-center' : 'flex justify-center'}>
                            <QuestionMedia media={activeQ.answerMedia} alt={t('answerMediaAlt')} variant={isHost ? 'host' : 'player'} t={t} />
                        </div>
                    )}
                </div>
            )}

            {isAnswerRevealed && (
                <div className="mt-6 flex flex-col items-center gap-4">
                    {isSurpriseQuestion && isSurpriseJudged && surpriseWheelValues.length > 0 && (
                        <PointsWheel
                            values={surpriseWheelValues}
                            result={surpriseRound.rollResult}
                            rolledAt={surpriseRound.rolledAt}
                            t={t}
                        />
                    )}
                    {canRollSurpriseWheel && (
                        <button
                            onClick={handleRollSurpriseWheel}
                            className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-8 py-4 text-xl font-black text-slate-950 shadow-lg shadow-yellow-900 transition-colors hover:bg-yellow-400 disabled:opacity-60"
                            disabled={isRolling}
                        >
                            <RotateCw size={24} /> {isHost && user.uid !== surpriseAnswererId ? t('forceRollWheel') : t('rollTheWheel')}
                        </button>
                    )}
                    {!canRollSurpriseWheel && isSurpriseQuestion && isSurpriseJudged && !isSurpriseRolled && (
                        <div className="text-slate-400 font-bold text-lg">
                            {t('waitingForWheelRoll', { playerName: surpriseAnswerer?.name || t('playerFallback') })}
                        </div>
                    )}
                    {!isHost && canContinueQuestion && (
                        <div className="text-slate-400 font-bold text-lg">
                            {t('waitingForHostContinue')}
                        </div>
                    )}
                    {isHost && canContinueQuestion && (
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
            {isSurpriseQuestion && !isAnswerRevealed && (
                <div className="mt-6 flex flex-col items-center animate-in zoom-in duration-200">
                    <div className="mb-5 flex items-center gap-3 text-xl text-slate-300">
                        <span className="text-3xl">{surpriseAnswerer?.avatar}</span>
                        <span className="font-black text-2xl text-yellow-400">{surpriseAnswerer?.name || t('playerFallback')}</span>
                        <span>{t('playerIsAnswering', { playerName: '' }).trim()}</span>
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

                    {user.uid === surpriseAnswererId && !isHost && (
                        <div className="text-2xl font-bold text-blue-400 animate-pulse mt-4">
                            {t('speakAnswer')}
                        </div>
                    )}

                    {user.uid !== surpriseAnswererId && !isHost && (
                        <div className="rounded-xl border-2 border-dashed border-slate-700 p-8 text-xl font-bold text-slate-500">
                            {t('surpriseOnlySelectedPlayer')}
                        </div>
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

            {hasBuzzed && !isAnswerRevealed && !isSurpriseQuestion && (
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
            {!hasBuzzed && !isAnswerRevealed && !isSurpriseQuestion && (
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
