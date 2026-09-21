import useBuzzer from '../../hooks/useBuzzer';
import useSurpriseWheel from '../../hooks/useSurpriseWheel';
import { WHEEL_ANIMATION_MS, wheelEasing } from '../../utils/wheelPolicy';
import { ANSWER_WINDOW_MS, EARLY_BUZZ_DELAY_MS, LATE_BUZZ_NOTICE_MS, LATE_BUZZ_WINDOW_MS, timestampMillis } from '../../utils/buzzerPolicy';
import { updateRoom, updateRoomInTransaction } from '../../actions/gameStorage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { arrayUnion, increment, runTransaction } from 'firebase/firestore';
import { Check, Disc3, Grid2X2, Play, RotateCw, Sparkles, X } from 'lucide-react';
import { ANIMAL_AVATARS, normalizeSurpriseScoringMechanic, SURPRISE_SCORING_MECHANICS } from '../../constants';
import { useLanguage } from '../../useLanguage';
import { createHistoryItem, startSurpriseWheel } from '../../actions/gameActions';
import FloatingEmojiBackground from '../../components/FloatingEmojiBackground';
import HoldToConfirmButton from '../../components/HoldToConfirmButton';
import QuestionMedia from '../../components/QuestionMedia';
import { preloadMedia } from '../../hooks/useRetryableImage';
import { getMediaKind, MEDIA_KINDS, MEDIA_SLOTS } from '../../services/imageStorage';
import { createFloatingBackgroundItems } from '../../utils/floatingBackground';
import { generateId } from '../../utils/ids';

const POINT_STEP = 100;
const SURPRISE_DEFAULT_MIN_POINTS = 100;
const SURPRISE_DEFAULT_MAX_POINTS = 500;
const ACTIVE_QUESTION_ENTRANCE_MS = 750;
const SURPRISE_BACKGROUND_EMOJIS = ['\u{1F37F}', '\u{1F389}', '\u{1F973}', '\u{1F381}', '\u{1F37E}', '\u{1F382}', '\u{2728}', '\u{1FA84}'];
const NORMAL_BACKGROUND_EMOJIS = ['\u{2754}'];
const QUESTION_BACKGROUND_EMOJI_COUNT = 80;

const getStoredEarlyBuzzUnlockAt = (storageKey) => {
    try {
        return Number(window.localStorage.getItem(storageKey)) || 0;
    } catch {
        return 0;
    }
};

const setStoredEarlyBuzzUnlockAt = (storageKey, unlockAt) => {
    try {
        window.localStorage.setItem(storageKey, String(unlockAt));
    } catch {
        // localStorage can be unavailable; in-memory state still handles this tab.
    }
};

const clearStoredEarlyBuzzUnlockAt = (storageKey) => {
    try {
        window.localStorage.removeItem(storageKey);
    } catch {
        // Ignore storage cleanup failures.
    }
};

const formatBuzzDelta = (deltaMs) => `+${(deltaMs / 1000).toFixed(2)}s`;

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

const shuffleItems = (items) => {
    const shuffledItems = [...items];

    for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffledItems[index], shuffledItems[swapIndex]] = [shuffledItems[swapIndex], shuffledItems[index]];
    }

    return shuffledItems;
};

const pruneSurpriseWheelValues = (question, isCorrect) => {
    const values = getFullSurpriseWheelValues(question);
    const removedSign = isCorrect ? -1 : 1;
    const valuesToPrune = values
        .filter((value) => Math.sign(value) === removedSign)
        .sort((a, b) => Math.abs(b) - Math.abs(a));
    const removeCount = Math.min(valuesToPrune.length - 1, Math.floor(valuesToPrune.length * 0.8));
    const removedValues = new Set(valuesToPrune.slice(0, Math.max(0, removeCount)));
    return shuffleItems(values.filter((value) => !removedValues.has(value)));
};

const createSurpriseTable = (values) => {
    const columns = Math.max(1, Math.ceil(Math.sqrt(values.length)));
    const rows = Math.max(1, Math.ceil(values.length / columns));
    const shuffledValues = shuffleItems(values);
    const shuffledAnimalAvatars = shuffleItems(ANIMAL_AVATARS);

    return {
        rows,
        columns,
        cells: shuffledValues.map((value, index) => ({
            id: generateId(),
            value,
            icon: shuffledAnimalAvatars[index % shuffledAnimalAvatars.length]
        }))
    };
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

function PointsWheel({ values, result, rolledAt, scoreAppliedAt, serverNow, clockReady, t }) {
    const [now, setNow] = useState(() => serverNow());
    const size = 320;
    const center = size / 2;
    const radius = 150;
    const sliceAngle = values.length > 0 ? 360 / values.length : 360;
    const resultIndex = result === null || result === undefined ? -1 : values.findIndex((value) => value === result);
    const startedAt = timestampMillis(rolledAt);
    const progress = scoreAppliedAt ? 1 : startedAt && clockReady
        ? Math.max(0, Math.min(1, (now - startedAt) / WHEEL_ANIMATION_MS)) : 0;
    const rotation = resultIndex < 0 ? 0
        : ((360 * 6) - (resultIndex * sliceAngle + sliceAngle / 2)) * wheelEasing(progress);
    const isResultVisible = progress === 1;

    useEffect(() => {
        if (resultIndex < 0 || !startedAt || !clockReady || scoreAppliedAt) return undefined;
        let frame;
        const tick = () => {
            const current = serverNow();
            setNow(current);
            if (current < startedAt + WHEEL_ANIMATION_MS) frame = window.requestAnimationFrame(tick);
        };
        tick();
        return () => window.cancelAnimationFrame(frame);
    }, [resultIndex, startedAt, scoreAppliedAt, serverNow, clockReady]);

    return (
        <div className="flex w-full flex-col items-center gap-5">
            <div className="surprise-wheel">
                <div className="surprise-wheel__pointer" />
                <svg
                    viewBox={`0 0 ${size} ${size}`}
                    className="h-full w-full"
                    role="img"
                    aria-label={t('surpriseMechanicWheel')}
                    style={{
                        transform: `rotate(${rotation}deg)`
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
                                    fill={isPositive ? (index % 2 ? '#115e59' : '#134e4a') : (index % 2 ? '#881337' : '#701a35')}
                                    stroke="#0f172a"
                                    strokeWidth="2"
                                />
                                <text
                                    x={labelPoint.x}
                                    y={labelPoint.y}
                                    fill={isPositive ? '#ccfbf1' : '#ffe4e6'}
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
                    {isResultVisible && resultIndex >= 0 && (
                        <path
                            d={describeSlice(center, radius, resultIndex * sliceAngle, (resultIndex + 1) * sliceAngle)}
                            fill="none"
                            stroke="#facc15"
                            strokeWidth="3"
                            strokeLinejoin="round"
                            pointerEvents="none"
                            aria-hidden="true"
                        />
                    )}
                    <circle cx={center} cy={center} r="29" fill="#0f172a" stroke="#475569" strokeWidth="2" />
                </svg>
                <span className="surprise-wheel__hub" aria-hidden="true"><Sparkles size={24} /></span>
            </div>
            {isResultVisible && result !== null && result !== undefined && (
                <div role="status" className={`surprise-score-result ${result >= 0 ? 'surprise-score-result--positive' : 'surprise-score-result--negative'}`}>
                    {t('wheelResult', { points: result > 0 ? `+${result}` : result })}
                </div>
            )}
        </div>
    );
}

function SurprisePointsTable({ cells, rows, columns, pickedCellId, canPick, onPick, t }) {
    const isRevealed = Boolean(pickedCellId);
    const pickedCell = cells.find((cell) => cell.id === pickedCellId);
    const slots = Array.from({ length: rows * columns }, (_, index) => cells[index] || null);

    return (
        <div className="flex w-full flex-col items-center gap-5">
            {canPick && !isRevealed && <p className="text-sm text-slate-300">{t('pickTableCell')}</p>}
            <div className="w-full overflow-x-auto p-1">
                <div
                    className="surprise-table"
                    style={{ gridTemplateColumns: `repeat(${columns}, minmax(3.5rem, 1fr))`, minWidth: `${columns * 4.125 - 0.625}rem` }}
                >
                    {slots.map((cell, index) => {
                        if (!cell) {
                            return (
                                <div
                                    key={`blank-${index}`}
                                    className="rounded-xl border border-dashed border-slate-800/70"
                                    aria-hidden="true"
                                />
                            );
                        }

                        const isPicked = pickedCellId === cell.id;
                        const valueClassName = cell.value >= 0 ? 'text-emerald-300' : 'text-rose-300';
                        const cellClassName = isPicked
                            ? 'surprise-table__cell--picked'
                            : isRevealed ? 'surprise-table__cell--revealed' : '';

                        return (
                            <button
                                key={cell.id}
                                type="button"
                                onClick={() => onPick(cell.id)}
                                disabled={!canPick || isRevealed}
                                className={`surprise-table__cell ${cellClassName}`}
                                aria-label={isRevealed ? `${cell.icon}: ${cell.value > 0 ? '+' : ''}${cell.value}` : `${t('pickTableCell')} ${cell.icon}`}
                                aria-pressed={isPicked}
                                title={!isRevealed && canPick ? t('pickTableCell') : undefined}
                            >
                                {isPicked && <Check size={14} className="absolute right-2 top-2 text-yellow-300" aria-hidden="true" />}
                                <span aria-hidden="true" className={`text-4xl leading-none transition-all duration-300 motion-reduce:transition-none md:text-[2.625rem] ${isRevealed ? '-translate-y-4 scale-75 opacity-0' : 'scale-100 opacity-100'}`}>
                                    {cell.icon}
                                </span>
                                <span aria-hidden="true" className={`absolute inset-0 flex items-center justify-center px-1 text-lg font-black tabular-nums transition-all duration-300 motion-reduce:transition-none sm:text-2xl ${valueClassName} ${isRevealed ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}>
                                    {isRevealed ? (cell.value > 0 ? `+${cell.value}` : cell.value) : null}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
            {pickedCell && (
                <div role="status" className={`surprise-score-result ${pickedCell.value >= 0 ? 'surprise-score-result--positive' : 'surprise-score-result--negative'}`}>
                    <span aria-hidden="true">{pickedCell.icon}</span>
                    {t('surpriseTableResult', { points: pickedCell.value > 0 ? `+${pickedCell.value}` : pickedCell.value })}
                </div>
            )}
        </div>
    );
}

function SpaceBuzzHandler({ enabled, onBuzz }) {
    useEffect(() => {
        if (!enabled) return undefined;

        const handleSpaceBuzz = (event) => {
            if (event.repeat || document.hidden || event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
            if (event.code !== 'Space' && event.key !== ' ') return;

            event.preventDefault();
            onBuzz();
        };

        window.addEventListener('keydown', handleSpaceBuzz, true);
        return () => window.removeEventListener('keydown', handleSpaceBuzz, true);
    }, [enabled, onBuzz]);

    return null;
}

export default function ActiveQuestionView({ room, roomCode, roomRef, user, isHost, isSpectator = false, serverNow = Date.now, clockSyncKey = 0, resumedQuestion = false, clockQuality = {} }) {
    const { t } = useLanguage();
    const buzzer = useBuzzer({ room, roomRef, uid: user.uid, isHost, isSpectator, serverNow, resumedQuestion });
    const earlyBuzzDelayStorageKey = `cortex-rush:early-buzz:${roomCode || 'room'}:${room.activeQuestionId || 'question'}:${user.uid}`;
    const [timeLeft, setTimeLeft] = useState(ANSWER_WINDOW_MS / 1000);
    const [buzzUnlockNow, setBuzzUnlockNow] = useState(() => serverNow());
    const [earlyBuzzDelayUnlockAt, setEarlyBuzzDelayUnlockAt] = useState(() => getStoredEarlyBuzzUnlockAt(earlyBuzzDelayStorageKey));
    const [isRolling, setIsRolling] = useState(false);
    const [wheelStartError, setWheelStartError] = useState(false);
    const [buzzMediaPauseSignal, setBuzzMediaPauseSignal] = useState(0);
    const [isEntranceContentVisible, setIsEntranceContentVisible] = useState(false);
    const [earlyBuzzNoticeQuestionId, setEarlyBuzzNoticeQuestionId] = useState(null);
    const [lateBuzzNotice, setLateBuzzNotice] = useState(null);
    const shownBuzzRace = useRef(null);
    const buzzUnlockAt = Number(room.buzzUnlockAt) || 0;
    const effectiveBuzzUnlockAt = Math.max(buzzUnlockAt, earlyBuzzDelayUnlockAt);

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

    const isSurpriseQuestion = Boolean(activeQ?.isSurpriseQuestion);
    const questionBackgroundItems = useMemo(
        () => createFloatingBackgroundItems({
            seed: room.activeQuestionId || 'question',
            count: QUESTION_BACKGROUND_EMOJI_COUNT,
            emojis: isSurpriseQuestion ? SURPRISE_BACKGROUND_EMOJIS : NORMAL_BACKGROUND_EMOJIS,
            sizeMin: 1,
            sizeRange: 2,
            opacityRange: 0.14,
            rotationRange: 80
        }),
        [room.activeQuestionId, isSurpriseQuestion]
    );

    // Timer logic
    useEffect(() => {
        let interval;
        if (room.buzzedPlayerId && room.buzzTimestamp) {
            interval = setInterval(() => {
                const elapsed = (serverNow() - timestampMillis(room.buzzTimestamp)) / 1000;
                const remaining = Math.max(0, ANSWER_WINDOW_MS / 1000 - elapsed);
                setTimeLeft(remaining);
            }, 100);
        } else {
            setTimeLeft(ANSWER_WINDOW_MS / 1000);
        }
        return () => clearInterval(interval);
    }, [room.buzzedPlayerId, room.buzzTimestamp, serverNow]);

    useEffect(() => {
        setIsEntranceContentVisible(false);
        setEarlyBuzzNoticeQuestionId(null);
        setLateBuzzNotice(null);
        const storedUnlockAt = getStoredEarlyBuzzUnlockAt(earlyBuzzDelayStorageKey);
        if (storedUnlockAt > serverNow()) {
            setEarlyBuzzDelayUnlockAt(storedUnlockAt);
        } else {
            setEarlyBuzzDelayUnlockAt(0);
            clearStoredEarlyBuzzUnlockAt(earlyBuzzDelayStorageKey);
        }
        const timeoutId = window.setTimeout(() => {
            setIsEntranceContentVisible(true);
        }, ACTIVE_QUESTION_ENTRANCE_MS);

        return () => window.clearTimeout(timeoutId);
    }, [earlyBuzzDelayStorageKey, room.activeQuestionId, serverNow]);

    useEffect(() => {
        if (!lateBuzzNotice) return undefined;

        const timeoutId = window.setTimeout(() => setLateBuzzNotice(null), LATE_BUZZ_NOTICE_MS);
        return () => window.clearTimeout(timeoutId);
    }, [lateBuzzNotice]);

    useEffect(() => {
        if (!room.activeQuestionId || !effectiveBuzzUnlockAt || room.buzzedPlayerId || room.answerRevealed) {
            setBuzzUnlockNow(serverNow());
            return undefined;
        }

        const remainingMs = effectiveBuzzUnlockAt - serverNow();
        if (remainingMs <= 0) {
            setBuzzUnlockNow(serverNow());
            return undefined;
        }

        const timeoutId = window.setTimeout(() => setBuzzUnlockNow(Math.max(serverNow(), effectiveBuzzUnlockAt)), remainingMs);
        return () => window.clearTimeout(timeoutId);
    }, [clockSyncKey, effectiveBuzzUnlockAt, room.activeQuestionId, room.answerRevealed, room.buzzedPlayerId, serverNow]);

    useEffect(() => {
        if (!activeQ?.answerMedia) return;

        preloadMedia(activeQ.answerMedia, isHost ? 'host' : 'game').catch(() => {});
    }, [activeQ?.answerMedia, isHost]);

    useEffect(() => {
        if (!buzzer.enabled || !room.buzzedPlayerId || room.answerRevealed || shownBuzzRace.current === room.buzzerRoundId) return;
        const attempt = room.buzzAttempts?.[user.uid];
        if (!attempt || room.buzzedPlayerId === user.uid || attempt.deltaMs > LATE_BUZZ_WINDOW_MS) return;
        shownBuzzRace.current = room.buzzerRoundId;
        setLateBuzzNotice({ questionId: room.activeQuestionId, playerName: room.players[room.buzzedPlayerId]?.name,
            delta: formatBuzzDelta(attempt.deltaMs), tied: attempt.deltaMs === 0 });
    }, [buzzer.enabled, room.buzzerRoundId, room.buzzedPlayerId, room.answerRevealed, room.activeQuestionId, room.buzzAttempts, room.players, user.uid]);

    const actorName = room.players[user.uid]?.name || user.displayName || t('playerFallback');
    const wheelRecovery = useSurpriseWheel({ roomRef, round: room.surpriseRound, questionId: room.activeQuestionId,
        actorId: user.uid, actorName,
        canComplete: !isSpectator && (isHost || user.uid === room.surpriseRound?.answererId),
        serverNow, clockReady: Boolean(clockQuality.ready), t });

    if (!activeQ) return null;

    const surpriseScoringMechanic = normalizeSurpriseScoringMechanic(room.pack?.surpriseScoringMechanic);
    const isSurpriseTableMechanic = surpriseScoringMechanic === SURPRISE_SCORING_MECHANICS.table;
    const isSurpriseWheelMechanic = surpriseScoringMechanic === SURPRISE_SCORING_MECHANICS.wheel;
    const surpriseRound = room.surpriseRound?.questionId === activeQ.id ? room.surpriseRound : null;
    const surpriseAnswererId = surpriseRound?.answererId || null;
    const surpriseAnswerer = surpriseAnswererId ? room.players[surpriseAnswererId] : null;
    const surpriseWheelValues = surpriseRound?.wheelValues || [];
    const surpriseTableCells = surpriseRound?.tableCells || [];
    const surpriseTableRows = Number(surpriseRound?.tableRows) || 0;
    const surpriseTableColumns = Number(surpriseRound?.tableColumns) || 0;
    const surpriseTablePickedCellId = surpriseRound?.tablePickedCellId || null;
    const isSurpriseJudged = Boolean(surpriseRound?.judgeResult);
    const isSurpriseRolled = surpriseRound?.rollResult !== null && surpriseRound?.rollResult !== undefined;
    const isSurpriseTablePicked = Boolean(surpriseTablePickedCellId);
    const isSurpriseScoreApplied = Boolean(surpriseRound?.scoreAppliedAt);
    const isSurpriseScoringComplete = isSurpriseWheelMechanic
        ? isSurpriseRolled && isSurpriseScoreApplied
        : isSurpriseTablePicked && isSurpriseScoreApplied;
    const canContinueQuestion = !isSurpriseQuestion || !isSurpriseJudged || isSurpriseScoringComplete;
    const isAnswerRevealed = Boolean(room.answerRevealed);
    const canRollSurpriseWheel = isSurpriseQuestion
        && isSurpriseWheelMechanic
        && isAnswerRevealed
        && isSurpriseJudged
        && !isSurpriseRolled
        && !isRolling
        && !isSpectator
        && (user.uid === surpriseAnswererId || isHost);
    const canPickSurpriseTableCell = isSurpriseQuestion
        && isSurpriseTableMechanic
        && isAnswerRevealed
        && isSurpriseJudged
        && !isSurpriseTablePicked
        && !isSpectator
        && (user.uid === surpriseAnswererId || isHost);
    const hasBuzzed = !!room.buzzedPlayerId;
    const amIIncorrect = (room.incorrectBuzzedIds || []).includes(user.uid);
    const isBuzzUnlocked = buzzer.enabled ? buzzer.unlocked : !effectiveBuzzUnlockAt || buzzUnlockNow >= effectiveBuzzUnlockAt;
    const canAttemptBuzz = !isSurpriseQuestion && !isHost && !isSpectator && !hasBuzzed && !amIIncorrect;
    const canIBuzz = buzzer.enabled ? buzzer.canClick && buzzer.unlocked : canAttemptBuzz && isBuzzUnlocked;
    const canClickBuzzButton = buzzer.enabled ? buzzer.canClick : canIBuzz || (room.trueCompetitiveMode && canAttemptBuzz);
    const shouldShowBuzzButton = !isHost && !isSpectator && !amIIncorrect;
    const didIBuzz = room.buzzedPlayerId === user.uid;
    const buzzedPlayer = room.buzzedPlayerId ? room.players[room.buzzedPlayerId] : null;
    const buzzedPlayerName = buzzedPlayer ? buzzedPlayer.name : '';
    const buzzedPlayerAvatar = buzzedPlayer ? buzzedPlayer.avatar : '';

    const hasQuestionText = Boolean(activeQ.text?.trim());
    const hasAnswerText = Boolean(activeQ.answer?.trim());
    const shouldShowQuestionContext = isHost || !isAnswerRevealed;
    const isAnswerFocused = isAnswerRevealed && !shouldShowQuestionContext;
    const hasAnswerMedia = Boolean(activeQ.answerMedia);
    const answerTextClassName = isAnswerFocused
        ? `${hasAnswerMedia ? 'text-2xl md:text-3xl lg:text-4xl' : 'text-3xl md:text-5xl lg:text-6xl'} max-w-full whitespace-pre-line break-words font-black leading-tight text-green-300 drop-shadow-lg`
        : 'break-words whitespace-pre-line text-xl font-black text-green-400 md:text-2xl';
    const questionMediaKind = getMediaKind(activeQ.questionMedia);
    const hasGatedQuestionMedia = [MEDIA_KINDS.AUDIO, MEDIA_KINDS.VIDEO].includes(questionMediaKind);
    const questionContainerClassName = isSurpriseQuestion
        ? 'w-full rounded-2xl border-4 border-yellow-400 bg-yellow-950/40 p-4 shadow-2xl shadow-yellow-950/40 md:rounded-3xl md:p-10'
        : 'w-full rounded-2xl border-4 border-blue-600 bg-blue-900 p-4 shadow-2xl shadow-blue-900/50 md:rounded-3xl md:p-10';
    const mediaPlayback = room.mediaPlayback || null;
    const isQuestionMediaStarted = Boolean(
        hasGatedQuestionMedia
        && mediaPlayback?.questionId === activeQ.id
        && mediaPlayback?.slot === MEDIA_SLOTS.QUESTION
        && mediaPlayback?.status === 'started'
    );
    const questionMediaStartAt = mediaPlayback?.startedAt || 0;

    const handleBuzzIn = async () => {
        if (!canClickBuzzButton) return;
        if (buzzer.enabled) {
            if (buzzer.unlocked) setBuzzMediaPauseSignal((signal) => signal + 1);
            await buzzer.press();
            return;
        }
        const clickedAt = serverNow();
        let didRegisterBuzzAttempt = false;
        const historyId = generateId();
        let nextLateBuzzNotice = null;

        if (!isBuzzUnlocked) {
            if (room.trueCompetitiveMode && !earlyBuzzDelayUnlockAt && buzzUnlockAt) {
                const nextEarlyBuzzDelayUnlockAt = buzzUnlockAt + EARLY_BUZZ_DELAY_MS;
                setEarlyBuzzDelayUnlockAt(nextEarlyBuzzDelayUnlockAt);
                setStoredEarlyBuzzUnlockAt(earlyBuzzDelayStorageKey, nextEarlyBuzzDelayUnlockAt);
                setEarlyBuzzNoticeQuestionId(activeQ.id);
            }
            if (room.recapVersion === 1) await updateRoom(roomRef, {
                history: [createHistoryItem({ id: historyId, type: 'player_buzzed_early', actorId: user.uid, actorName,
                    message: t('recapEarlyBuzz'), details: { actorName, clickedAt, questionId: activeQ.id } })]
            });
            return;
        }

        await runTransaction(roomRef.firestore, async (transaction) => {
            const roomSnap = await transaction.get(roomRef);
            if (!roomSnap.exists()) return;

            const latestRoom = roomSnap.data();
            if (
                latestRoom.activeQuestionId !== activeQ.id
                || latestRoom.answerRevealed
                || (latestRoom.buzzUnlockAt && clickedAt < latestRoom.buzzUnlockAt)
                || !latestRoom.players?.[user.uid]
                || latestRoom.players?.[user.uid]?.isHost
                || (latestRoom.incorrectBuzzedIds || []).includes(user.uid)
            ) {
                return;
            }

            const buzzAttempts = latestRoom.buzzAttempts || {};
            const existingAttempt = buzzAttempts[user.uid];
            const hasEarlierAttempt = existingAttempt?.questionId === activeQ.id
                && Number(existingAttempt.clickedAt) <= clickedAt;

            if (!latestRoom.buzzedPlayerId) {
                await updateRoomInTransaction(transaction, roomRef, latestRoom, {
                    buzzedPlayerId: user.uid,
                    buzzTimestamp: clickedAt,
                    buzzAttempts: {
                        ...buzzAttempts,
                        [user.uid]: { clickedAt, questionId: activeQ.id }
                    },
                    history: [createHistoryItem({
                        id: historyId, type: 'player_buzzed',
                        actorId: user.uid,
                        actorName,
                        message: t('historyPlayerBuzzed', { actorName }),
                        details: { actorName }
                    })]
                });
                didRegisterBuzzAttempt = true;
                return;
            }

            if (
                latestRoom.buzzedPlayerId === user.uid
                || !latestRoom.buzzTimestamp
                || hasEarlierAttempt
            ) {
                return;
            }

            const buzzDelta = clickedAt - latestRoom.buzzTimestamp;
            if (buzzDelta > 0 && buzzDelta <= LATE_BUZZ_WINDOW_MS) {
                const firstBuzzPlayerName = latestRoom.players?.[latestRoom.buzzedPlayerId]?.name || t('playerFallback');
                const delta = formatBuzzDelta(buzzDelta);
                await updateRoomInTransaction(transaction, roomRef, latestRoom, {
                    buzzAttempts: {
                        ...buzzAttempts,
                        [user.uid]: { clickedAt, questionId: activeQ.id }
                    },
                    history: [createHistoryItem({
                        id: historyId, type: 'player_buzzed_late',
                        actorId: user.uid,
                        actorName,
                        message: t('historyPlayerBuzzedLate', {
                            actorName,
                            playerName: firstBuzzPlayerName,
                            delta
                        }),
                        details: {
                            actorName,
                            playerName: firstBuzzPlayerName,
                            deltaMs: buzzDelta
                        }
                    })]
                });
                nextLateBuzzNotice = { questionId: activeQ.id, playerName: firstBuzzPlayerName, delta };
                didRegisterBuzzAttempt = true;
            }
        });

        if (didRegisterBuzzAttempt) {
            setBuzzMediaPauseSignal((signal) => signal + 1);
        }
        if (nextLateBuzzNotice) {
            setLateBuzzNotice(nextLateBuzzNotice);
        }
    };

    const handleJudge = async (isCorrect) => {
        if (!isHost) return;

        if (isSurpriseQuestion) {
            if (!surpriseAnswererId) return;

            const playerName = room.players[surpriseAnswererId]?.name || t('playerFallback');
            const pointValues = pruneSurpriseWheelValues(activeQ, isCorrect);
            const surpriseTable = createSurpriseTable(pointValues);
            const surpriseScoringUpdate = isSurpriseTableMechanic
                ? {
                    wheelValues: null,
                    rollResult: null,
                    rolledAt: null,
                    rolledBy: null,
                    tableRows: surpriseTable.rows,
                    tableColumns: surpriseTable.columns,
                    tableCells: surpriseTable.cells,
                    tablePickedCellId: null,
                    tablePickedAt: null,
                    tablePickedBy: null,
                    scoreAppliedAt: null
                }
                : {
                    wheelValues: pointValues,
                    rollResult: null,
                    rolledAt: null,
                    rolledBy: null,
                    tableRows: null,
                    tableColumns: null,
                    tableCells: null,
                    tablePickedCellId: null,
                    tablePickedAt: null,
                    tablePickedBy: null,
                    scoreAppliedAt: null
                };
            await updateRoom(roomRef, {
                answerRevealed: true,
                buzzedPlayerId: null,
                buzzTimestamp: null,
                buzzUnlockAt: null,
                currentTurn: surpriseAnswererId,
                [`questionStates.${activeQ.id}`]: 'done',
                surpriseRound: {
                    ...surpriseRound,
                    judgeResult: isCorrect ? 'correct' : 'incorrect',
                    scoringMechanic: surpriseScoringMechanic,
                    ...surpriseScoringUpdate
                },
                history: [createHistoryItem({
                    type: isCorrect ? 'surprise_answer_correct' : 'surprise_answer_incorrect',
                    actorId: user.uid,
                    actorName,
                    message: isCorrect
                        ? t('historySurpriseAnswerCorrect', { playerName })
                        : t('historySurpriseAnswerIncorrect', { playerName }),
                    details: { playerName, playerId: surpriseAnswererId, questionId: activeQ.id }
                })]
            });
            return;
        }

        if (!room.buzzedPlayerId) return;

        if (isCorrect) {
            // Award points and reveal the answer before returning to the board.
            const pId = room.buzzedPlayerId;
            const currentScore = room.players[pId].score || 0;
            await updateRoom(roomRef, {
                [`players.${pId}.score`]: currentScore + activeQ.points,
                answerRevealed: true,
                buzzUnlockAt: null,
                currentTurn: pId,
                [`questionStates.${activeQ.id}`]: 'done',
                history: [createHistoryItem({
                    type: 'answer_correct',
                    actorId: user.uid,
                    actorName,
                    message: t('historyAnswerCorrect', {
                        playerName: room.players[pId]?.name || t('playerFallback'),
                        points: activeQ.points
                    }),
                    details: {
                        playerId: pId, questionId: activeQ.id,
                        playerName: room.players[pId]?.name || t('playerFallback'),
                        points: activeQ.points
                    }
                })]
            });
        } else {
            // Mark incorrect, reset buzz
            const penalty = room.trueCompetitiveMode ? Number(activeQ.points) || 0 : 0;
            const historyDetails = { playerId: room.buzzedPlayerId, questionId: activeQ.id, playerName: buzzedPlayerName || t('playerFallback') };
            if (penalty) {
                historyDetails.points = -penalty;
            }
            const update = {
                buzzedPlayerId: null,
                buzzTimestamp: null,
                buzzAttempts: {},
                incorrectBuzzedIds: arrayUnion(room.buzzedPlayerId),
                history: [createHistoryItem({
                    type: 'answer_incorrect',
                    actorId: user.uid,
                    actorName,
                    message: penalty
                        ? t('historyAnswerIncorrectPenalty', {
                            playerName: buzzedPlayerName || t('playerFallback'),
                            points: -penalty
                        })
                        : t('historyAnswerIncorrect', {
                            playerName: buzzedPlayerName || t('playerFallback')
                        }),
                    details: historyDetails
                })]
            };
            if (penalty) {
                update[`players.${room.buzzedPlayerId}.score`] = increment(-penalty);
            }
            await updateRoom(roomRef, update);
        }
    };

    const handleSkip = async () => {
        if (!isHost) return;
        await updateRoom(roomRef, {
            answerRevealed: true,
            buzzedPlayerId: null,
            buzzTimestamp: null,
            buzzUnlockAt: null,
            buzzAttempts: {},
            mediaPlayback: null,
            surprisePlayerDraw: null,
            [`questionStates.${activeQ.id}`]: 'done',
            history: [createHistoryItem({
                type: 'question_skipped',
                actorId: user.uid,
                actorName,
                message: t('historyQuestionSkipped', {
                    categoryName: activeCatName,
                    points: activeQ.points
                }),
                details: {
                    questionId: activeQ.id,
                    categoryName: activeCatName,
                    points: activeQ.points
                }
            })]
        });
    };

    const handleContinue = async () => {
        if (!isHost) return;
        await updateRoom(roomRef, {
            activeQuestionId: null,
            answerRevealed: false,
            buzzedPlayerId: null,
            buzzTimestamp: null,
            buzzUnlockAt: null,
            buzzAttempts: {},
            incorrectBuzzedIds: [],
            mediaPlayback: null,
            surprisePlayerDraw: null,
            surpriseRound: null,
            history: [createHistoryItem({
                type: 'board_resumed',
                actorId: user.uid,
                actorName,
                message: t('historyBoardResumed', { actorName }),
                details: { actorName, questionId: activeQ.id }
            })]
        });
    };

    const handleRollSurpriseWheel = async () => {
        if (!canRollSurpriseWheel) return;
        setIsRolling(true);
        setWheelStartError(false);
        try {
            const outcome = await startSurpriseWheel(roomRef, activeQ.id, { id: user.uid, name: actorName }, t);
            setWheelStartError(outcome === 'stale');
        } catch {
            setWheelStartError(true);
        } finally {
            setIsRolling(false);
        }
    };

    const handlePickSurpriseTableCell = async (cellId) => {
        if (!canPickSurpriseTableCell || !cellId || !surpriseAnswererId) return;
        const historyId = generateId();

        await runTransaction(roomRef.firestore, async (transaction) => {
            const roomSnap = await transaction.get(roomRef);
            if (!roomSnap.exists()) return;

            const latestRoom = roomSnap.data();
            const latestRound = latestRoom.surpriseRound;
            if (
                latestRoom.status !== 'playing'
                || latestRoom.activeQuestionId !== activeQ.id
                || !latestRoom.answerRevealed
                || latestRound?.questionId !== activeQ.id
                || latestRound.scoringMechanic !== SURPRISE_SCORING_MECHANICS.table
                || !latestRound.judgeResult
                || latestRound.tablePickedCellId
                || latestRound.scoreAppliedAt
                || latestRound.answererId !== surpriseAnswererId
                || (user.uid !== surpriseAnswererId && user.uid !== latestRoom.hostId)
            ) {
                return;
            }

            const pickedCell = (latestRound.tableCells || []).find((cell) => cell.id === cellId);
            if (!pickedCell || typeof pickedCell.value !== 'number') return;

            const player = latestRoom.players?.[surpriseAnswererId];
            const pickedAt = Date.now();
            const historyItem = createHistoryItem({
                id: historyId, type: 'surprise_table_picked',
                actorId: user.uid,
                actorName,
                message: t('historySurpriseTablePicked', {
                    playerName: player?.name || t('playerFallback'),
                    points: pickedCell.value > 0 ? `+${pickedCell.value}` : pickedCell.value
                }),
                details: {
                    playerName: player?.name || t('playerFallback'),
                    points: pickedCell.value,
                    cellIndex: latestRound.tableCells.findIndex((cell) => cell.id === cellId)
                }
            });

            await updateRoomInTransaction(transaction, roomRef, latestRoom, {
                [`players.${surpriseAnswererId}.score`]: increment(pickedCell.value),
                currentTurn: surpriseAnswererId,
                'surpriseRound.tablePickedCellId': cellId,
                'surpriseRound.tablePickedAt': pickedAt,
                'surpriseRound.tablePickedBy': user.uid,
                'surpriseRound.scoreAppliedAt': pickedAt,
                history: [historyItem]
            });
        });
    };

    const handleStartQuestionMedia = async () => {
        if (!isHost || !hasGatedQuestionMedia || isQuestionMediaStarted) return;
        await updateRoom(roomRef, {
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
        <>
            {(buzzer.enabled ? buzzer.penalized : earlyBuzzNoticeQuestionId === activeQ.id && !isBuzzUnlocked) && (
                <div className="pointer-events-none fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-red-500/40 bg-red-950/95 px-4 py-3 text-sm font-bold text-red-100 shadow-2xl shadow-black/40">
                    {t('buzzClickedTooEarly')}
                </div>
            )}
            {lateBuzzNotice?.questionId === activeQ.id && (
                <div className="pointer-events-none fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-yellow-400/40 bg-yellow-950/95 px-4 py-3 text-sm font-bold text-yellow-100 shadow-2xl shadow-black/40">
                    {t(lateBuzzNotice.tied ? 'buzzReactionTie' : buzzer.enabled ? 'buzzReactionLater' : 'buzzClickedLater', {
                        playerName: lateBuzzNotice.playerName,
                        delta: lateBuzzNotice.delta
                    })}
                </div>
            )}
            <div
                key={room.activeQuestionId}
                className={`active-question-enter-shell ${isSurpriseQuestion ? 'active-question-enter-shell--surprise' : ''} relative z-10 mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center justify-start pb-4 text-center`}
            >
            <SpaceBuzzHandler enabled={buzzer.enabled ? canClickBuzzButton : canIBuzz} onBuzz={handleBuzzIn} />
            <FloatingEmojiBackground
                items={questionBackgroundItems}
                className={`left-1/2 top-1/2 -z-10 h-screen w-screen -translate-x-1/2 -translate-y-1/2 ${isSurpriseQuestion ? '' : 'grayscale brightness-50'}`}
            />

            <div className={`active-question-enter-content relative z-10 flex min-h-0 w-full flex-1 flex-col items-center ${isAnswerFocused ? 'justify-center' : 'justify-start'} ${isEntranceContentVisible ? 'active-question-enter-content--visible' : ''}`}>
            {shouldShowQuestionContext && (
                <div className="absolute top-0 flex w-full justify-between gap-3 text-xs font-bold uppercase tracking-widest text-slate-400 md:text-sm">
                    <span className="min-w-0 truncate text-left">{activeCatName}</span>
                    <span className="text-yellow-500">{t('pointsShort', { points: activeQ.points })}</span>
                </div>
            )}

            {shouldShowQuestionContext && (
                <div className={`mt-8 flex w-full min-h-0 flex-col items-center md:mt-10 ${isHost ? 'gap-4 md:gap-5' : 'gap-4 md:gap-6'}`}>
                    {hasQuestionText && (
                        <div className={questionContainerClassName}>
                            <h2
                                className="whitespace-pre-line break-words text-xl font-black leading-tight text-white drop-shadow-lg md:text-4xl"
                                style={{
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
                            pauseSignal={buzzMediaPauseSignal}
                        />
                    )}
                    {isHost && hasGatedQuestionMedia && !isQuestionMediaStarted && (
                        <button
                            type="button"
                            onClick={handleStartQuestionMedia}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-base font-bold text-white shadow-lg shadow-blue-900 transition-colors hover:bg-blue-500 md:px-6 md:text-lg"
                        >
                            <Play size={22} /> {t('startMediaForEveryone')}
                        </button>
                    )}
                </div>
            )}

            {(isHost || isAnswerRevealed) && (
                <div className={`${isAnswerFocused ? 'flex w-full max-w-5xl flex-col items-center justify-center gap-4 py-4 md:gap-6 md:py-6' : `${shouldShowQuestionContext ? 'mt-4 md:mt-6' : 'mt-8 md:mt-10'} ${isHost ? 'max-w-2xl rounded-xl border border-slate-700 bg-slate-800 p-4 md:p-5' : 'max-w-4xl p-2 md:p-4'} w-full`}`}>
                    <p className={`${isAnswerFocused ? 'text-sm md:text-base' : 'mb-2 text-xs md:text-sm'} font-bold uppercase tracking-widest text-slate-400`}>
                        {isAnswerRevealed ? t('correctAnswer') : t('hiddenAnswer')}
                    </p>
                    {hasAnswerText && <p className={answerTextClassName}>{activeQ.answer}</p>}
                    {activeQ.answerMedia && (
                        <div className={isAnswerFocused ? 'flex w-full justify-center' : hasAnswerText ? 'mt-4 flex justify-center' : 'flex justify-center'}>
                            <QuestionMedia media={activeQ.answerMedia} alt={t('answerMediaAlt')} variant={isAnswerFocused ? 'answer' : isHost ? 'host' : 'player'} t={t} />
                        </div>
                    )}
                </div>
            )}

            {isAnswerRevealed && (
                <div className="mt-4 flex w-full flex-col items-center gap-4 md:mt-6">
                    {isSurpriseQuestion && isSurpriseJudged && (
                        <section className="surprise-scoring" aria-labelledby="surprise-scoring-title">
                            <header className="surprise-scoring__header">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-2.5 text-yellow-300" aria-hidden="true">
                                        {isSurpriseTableMechanic ? <Grid2X2 size={20} /> : <Disc3 size={20} />}
                                    </span>
                                    <h2 id="surprise-scoring-title" className="text-left text-base font-bold text-slate-100 sm:text-lg">
                                        {t(isSurpriseTableMechanic ? 'surpriseMechanicTable' : 'surpriseMechanicWheel')}
                                    </h2>
                                </div>
                                <div className="flex min-w-0 items-center gap-2 rounded-full border border-slate-700/70 bg-slate-950/50 px-3 py-1.5 text-sm text-slate-200">
                                    <span aria-hidden="true">{surpriseAnswerer?.avatar}</span>
                                    <span className="truncate">{surpriseAnswerer?.name || t('playerFallback')}</span>
                                </div>
                            </header>
                            <div className="surprise-scoring__body">
                                {isSurpriseQuestion && isSurpriseJudged && isSurpriseWheelMechanic && surpriseWheelValues.length > 0 && (
                                    <PointsWheel
                                        key={surpriseRound.spinId || activeQ.id}
                                        values={surpriseWheelValues}
                                        result={surpriseRound.rollResult}
                                        rolledAt={surpriseRound.rolledAt}
                                        scoreAppliedAt={surpriseRound.scoreAppliedAt}
                                        serverNow={serverNow}
                                        clockReady={Boolean(clockQuality.ready)}
                                        t={t}
                                    />
                                )}
                                {isSurpriseQuestion && isSurpriseJudged && isSurpriseTableMechanic && surpriseTableCells.length > 0 && (
                                    <SurprisePointsTable
                                        cells={surpriseTableCells}
                                        rows={surpriseTableRows}
                                        columns={surpriseTableColumns}
                                        pickedCellId={surpriseTablePickedCellId}
                                        canPick={canPickSurpriseTableCell}
                                        onPick={handlePickSurpriseTableCell}
                                        t={t}
                                    />
                                )}
                                {canRollSurpriseWheel && (
                                    <button
                                        onClick={handleRollSurpriseWheel}
                                        className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-yellow-400 px-5 py-3 text-base font-bold text-slate-950 transition-colors hover:bg-yellow-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-300 disabled:opacity-60"
                                        disabled={isRolling}
                                    >
                                        <RotateCw size={24} /> {isHost && user.uid !== surpriseAnswererId ? t('forceRollWheel') : t('rollTheWheel')}
                                    </button>
                                )}
                                {isSurpriseWheelMechanic && isSurpriseRolled && !isSurpriseScoreApplied && (
                                    <div role="status" className="rounded-xl border border-slate-700/60 bg-slate-950/40 px-4 py-3 text-center text-sm text-slate-300">
                                        {t(wheelRecovery.error ? 'wheelScoreFailed' : 'wheelScorePending')}
                                        {wheelRecovery.error && (
                                            <button onClick={wheelRecovery.retry} className="ml-2 underline">{t('wheelRetry')}</button>
                                        )}
                                    </div>
                                )}
                                {wheelStartError && !isSurpriseRolled && <p role="alert" className="text-red-300">{t('wheelStartFailed')}</p>}
                                {!canRollSurpriseWheel && isSurpriseQuestion && isSurpriseWheelMechanic && isSurpriseJudged && !isSurpriseRolled && (
                                    <div role="status" className="text-center text-sm text-slate-400">
                                        {t('waitingForWheelRoll', { playerName: surpriseAnswerer?.name || t('playerFallback') })}
                                    </div>
                                )}
                                {!canPickSurpriseTableCell && isSurpriseQuestion && isSurpriseTableMechanic && isSurpriseJudged && !isSurpriseTablePicked && (
                                    <div role="status" className="text-center text-sm text-slate-400">
                                        {t('waitingForTablePick', { playerName: surpriseAnswerer?.name || t('playerFallback') })}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}
                    {!isHost && canContinueQuestion && (
                        <div className="text-base font-bold text-slate-400 md:text-lg">
                            {t('waitingForHostContinue')}
                        </div>
                    )}
                    {isHost && canContinueQuestion && (
                        <button
                            onClick={handleContinue}
                            className="rounded-xl bg-blue-600 px-6 py-3 text-lg font-bold text-white shadow-lg shadow-blue-900 transition-colors hover:bg-blue-500 md:px-8 md:py-4 md:text-xl"
                        >
                            {t('continue')}
                        </button>
                    )}
                </div>
            )}

            {/* State: Someone buzzed */}
            {isSurpriseQuestion && !isAnswerRevealed && (
                <div className="mt-4 flex w-full flex-col items-center animate-in zoom-in duration-200 md:mt-6">
                    <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-base text-slate-300 md:mb-5 md:gap-3 md:text-xl">
                        <span className="text-2xl md:text-3xl">{surpriseAnswerer?.avatar}</span>
                        <span className="font-black text-xl text-yellow-400 md:text-2xl">{surpriseAnswerer?.name || t('playerFallback')}</span>
                        <span>{t('playerIsAnswering', { playerName: '' }).trim()}</span>
                    </div>

                    {isHost && (
                        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row md:gap-4">
                            <button onClick={() => handleJudge(true)} className="flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-base font-bold text-white shadow-lg shadow-green-900 hover:bg-green-500 md:px-8 md:py-4 md:text-xl">
                                <Check size={28}/> {t('correct')}
                            </button>
                            <button onClick={() => handleJudge(false)} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-base font-bold text-white shadow-lg shadow-red-900 hover:bg-red-500 md:px-8 md:py-4 md:text-xl">
                                <X size={28}/> {t('incorrect')}
                            </button>
                        </div>
                    )}

                    {user.uid === surpriseAnswererId && !isHost && !isSpectator && (
                        <div className="mt-4 animate-pulse text-xl font-bold text-blue-400 md:text-2xl">
                            {t('speakAnswer')}
                        </div>
                    )}

                    {isSpectator ? (
                        <div className="rounded-xl border-2 border-dashed border-slate-700 p-5 text-base font-bold text-slate-500 md:p-8 md:text-xl">
                            {t('spectatorWatching')}
                        </div>
                    ) : user.uid !== surpriseAnswererId && !isHost && (
                        <div className="rounded-xl border-2 border-dashed border-slate-700 p-5 text-base font-bold text-slate-500 md:p-8 md:text-xl">
                            {t('surpriseOnlySelectedPlayer')}
                        </div>
                    )}

                    {isHost && (
                        <HoldToConfirmButton
                            onConfirm={handleSkip}
                            durationMs={2000}
                            fillClassName="bg-slate-700"
                            title={t('holdToConfirmAction', { action: t('skipRevealAnswer') })}
                            className="mt-8 rounded-lg border border-slate-600 bg-transparent px-6 py-2 font-bold text-slate-400 transition-colors hover:text-white"
                        >
                            {t('skipRevealAnswer')}
                        </HoldToConfirmButton>
                    )}
                </div>
            )}

            {hasBuzzed && !isAnswerRevealed && !isSurpriseQuestion && (
                <div className="mt-4 flex w-full flex-col items-center animate-in zoom-in duration-200 md:mt-6">
                    <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-base text-slate-300 md:text-xl">
                        <span className="text-2xl md:text-3xl">{buzzedPlayerAvatar}</span>
                        <span className="font-black text-xl text-yellow-400 md:text-2xl">{buzzedPlayerName}</span> {t('playerIsAnswering', { playerName: '' }).trim()}
                    </div>

                    <div className="relative mb-6 h-24 w-24 md:mb-8 md:h-32 md:w-32">
                        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90 transform">
                            <circle cx="64" cy="64" r="60" className="stroke-slate-700 fill-none" strokeWidth="8"/>
                            <circle cx="64" cy="64" r="60" className={`fill-none stroke-blue-500 transition-all duration-100 ${timeLeft < 3 ? 'stroke-red-500' : ''}`} strokeWidth="8"
                                    strokeDasharray="377" strokeDashoffset={377 - (377 * timeLeft / (ANSWER_WINDOW_MS / 1000))}
                            />
                        </svg>
                        <div className={`absolute inset-0 flex items-center justify-center font-mono text-3xl font-black md:text-4xl ${timeLeft < 3 ? 'text-red-400' : 'text-blue-400'}`}>
                            {Math.ceil(timeLeft)}
                        </div>
                    </div>

                    {isHost && (
                        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row md:gap-4">
                            <button onClick={() => handleJudge(true)} className="flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-base font-bold text-white shadow-lg shadow-green-900 hover:bg-green-500 md:px-8 md:py-4 md:text-xl">
                                <Check size={28}/> {t('correct')}
                            </button>
                            <button onClick={() => handleJudge(false)} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-base font-bold text-white shadow-lg shadow-red-900 hover:bg-red-500 md:px-8 md:py-4 md:text-xl">
                                <X size={28}/> {t('incorrect')}
                            </button>
                        </div>
                    )}

                    {didIBuzz && !isHost && !isSpectator && (
                        <div className="mt-4 animate-pulse text-xl font-bold text-blue-400 md:text-2xl">
                            {t('speakAnswer')}
                        </div>
                    )}
                </div>
            )}

            {/* State: Waiting for buzz */}
            {!hasBuzzed && !isAnswerRevealed && !isSurpriseQuestion && (
                <div className="mt-4 flex w-full max-w-md shrink-0 flex-col items-center md:mt-6">
                    {isHost ? (
                        !buzzer.collecting && <div className="mb-4 text-slate-400 md:mb-6">{t('waitingForBuzz')}</div>
                    ) : isSpectator ? (
                        <div className="w-full rounded-xl border-2 border-dashed border-slate-700 p-5 text-lg font-bold text-slate-500 md:p-8 md:text-xl">
                            {t('spectatorWatching')}
                        </div>
                    ) : (
                        shouldShowBuzzButton ? (
                            <button
                                type="button"
                                onClick={handleBuzzIn}
                                disabled={!canClickBuzzButton}
                                className={`h-36 w-36 rounded-full border-[6px] text-2xl font-black transition-all md:h-48 md:w-48 md:border-8 md:text-4xl ${
                                    canIBuzz
                                        ? 'border-red-800 bg-red-600 text-white shadow-[0_8px_0_0_#7f1d1d,inset_0_10px_20px_rgba(255,255,255,0.3)] hover:bg-red-500 active:translate-y-[8px] active:shadow-[0_0px_0_0_#7f1d1d,inset_0_10px_20px_rgba(255,255,255,0.3)] md:shadow-[0_10px_0_0_#7f1d1d,inset_0_10px_20px_rgba(255,255,255,0.3)] md:active:translate-y-[10px]'
                                        : `${canClickBuzzButton ? '' : 'cursor-not-allowed '}border-slate-700 bg-slate-600 text-slate-300 shadow-[0_8px_0_0_#334155,inset_0_10px_20px_rgba(255,255,255,0.08)] md:shadow-[0_10px_0_0_#334155,inset_0_10px_20px_rgba(255,255,255,0.08)]`
                                }`}
                            >
                                {t('buzz')}
                            </button>
                        ) : (
                            <div className="w-full rounded-xl border-2 border-dashed border-slate-700 p-5 text-lg font-bold text-slate-500 md:p-8 md:text-xl">
                                {t('answeredIncorrectly')}
                            </div>
                        )
                    )}

                    {isHost && (
                        <HoldToConfirmButton
                            onConfirm={handleSkip}
                            durationMs={2000}
                            fillClassName="bg-slate-700"
                            title={t('holdToConfirmAction', { action: t('skipRevealAnswer') })}
                            className="mt-8 rounded-lg border border-slate-600 bg-transparent px-6 py-2 font-bold text-slate-400 transition-colors hover:text-white"
                        >
                            {t('skipRevealAnswer')}
                        </HoldToConfirmButton>
                    )}
                </div>
            )}

            {buzzer.enabled && !isSurpriseQuestion && !isAnswerRevealed && (
                <div className="mt-3 shrink-0 text-center text-sm text-slate-400" role="status" aria-live="polite">
                    {buzzer.error ? <p className="text-red-300">{t(buzzer.error)}</p> : null}
                    {!buzzer.online ? <p>{t('buzzOffline')}</p> : !clockQuality.ready ? <p>{t('buzzClockSyncing')}</p>
                        : Date.now() - clockQuality.lastSyncedAt > 6 * 60 * 1000 ? <p>{t('buzzClockStale')}</p>
                        : clockQuality.roundTripMs > 750 ? <p>{t('buzzConnectionSlow')}</p> : null}
                    {buzzer.pending ? <p>{t('buzzSubmitting')}</p> : null}
                    {buzzer.collecting ? <p className="font-bold">{t(buzzer.waitingForHost ? 'buzzWaitingHost' : 'buzzCollecting')}</p> : null}
                </div>
            )}

            </div>
        </div>
        </>
    );
}
