import { useEffect, useState } from 'react';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Check, Copy, Link, Play, PlusCircle, MinusCircle, Users, SlidersHorizontal, ScrollText, X } from 'lucide-react';
import { appId, db } from '../../firebase';
import { useLanguage } from '../../useLanguage';
import { adjustScore, createHistoryItem } from '../../actions/gameActions';
import ActiveQuestionView from './ActiveQuestionView';
import BoardView from './BoardView';
import ResultsView from './ResultsView';

const ANSWER_WINDOW_MS = 10000;
const LATE_BUZZ_WINDOW_MS = 2000;

const getPlayerEntries = (players) => Object.entries(players).filter(([, player]) => !player.isHost);

const formatBuzzDelta = (deltaMs) => `+${(deltaMs / 1000).toFixed(2)}s`;

const getPlayerNameStyle = (name = '') => {
    const characterCount = Array.from(name).length;
    if (characterCount <= 14) return undefined;

    return {
        fontSize: `${Math.max(12, Math.min(16, 224 / characterCount))}px`
    };
};

const getBuzzDeltaLabel = (room, playerId, now) => {
    if (
        !room.activeQuestionId
        || room.answerRevealed
        || !room.buzzedPlayerId
        || !room.buzzTimestamp
        || room.buzzedPlayerId === playerId
    ) {
        return null;
    }

    const answerElapsed = now - room.buzzTimestamp;
    if (answerElapsed < 0 || answerElapsed > ANSWER_WINDOW_MS) return null;

    const attempt = room.buzzAttempts?.[playerId];
    if (attempt?.questionId !== room.activeQuestionId) return null;

    const deltaMs = Number(attempt.clickedAt) - room.buzzTimestamp;
    if (deltaMs <= 0 || deltaMs > LATE_BUZZ_WINDOW_MS) return null;

    return formatBuzzDelta(deltaMs);
};

function ScoreEditorModal({ players, roomRef, host, onClose, t }) {
    const playerEntries = getPlayerEntries(players);
    const [scores, setScores] = useState(() => Object.fromEntries(
        playerEntries.map(([playerId, player]) => [playerId, String(player.score || 0)])
    ));
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        const update = {};
        const historyItems = [];

        playerEntries.forEach(([playerId, player]) => {
            const nextScore = Number.parseInt(scores[playerId], 10);
            const normalizedScore = Number.isNaN(nextScore) ? 0 : nextScore;
            const previousScore = player.score || 0;

            if (normalizedScore !== previousScore) {
                update[`players.${playerId}.score`] = normalizedScore;
                historyItems.push(createHistoryItem({
                    type: 'score_set',
                    actorId: host.id,
                    actorName: host.name,
                    message: t('historyScoreSet', {
                        actorName: host.name,
                        playerName: player.name,
                        previousScore,
                        nextScore: normalizedScore
                    }),
                    details: {
                        actorName: host.name,
                        playerName: player.name,
                        previousScore,
                        nextScore: normalizedScore,
                        delta: normalizedScore - previousScore
                    }
                }));
            }
        });

        if (historyItems.length === 0) {
            onClose();
            return;
        }

        setIsSaving(true);
        await updateDoc(roomRef, {
            ...update,
            history: arrayUnion(...historyItems)
        });
        setIsSaving(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 p-5">
                    <h2 className="text-xl font-bold text-white">{t('advancedScoreEditor')}</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white">
                        <X size={22} />
                    </button>
                </div>
                <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
                    {playerEntries.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-slate-500">
                            {t('noPlayersForScoreEditor')}
                        </div>
                    ) : (
                        playerEntries.map(([playerId, player]) => (
                            <label key={playerId} className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
                                <span className="flex min-w-0 items-center gap-3">
                                    <span className="text-2xl">{player.avatar}</span>
                                    <span className="truncate font-bold text-slate-100">{player.name}</span>
                                </span>
                                <input
                                    type="number"
                                    value={scores[playerId] ?? '0'}
                                    onChange={(event) => setScores({ ...scores, [playerId]: event.target.value })}
                                    className="w-28 rounded-lg border border-slate-700 bg-slate-900 p-2 text-right font-mono text-yellow-400 outline-none focus:border-blue-500"
                                />
                            </label>
                        ))
                    )}
                </div>
                <div className="flex justify-end gap-3 border-t border-slate-800 p-5">
                    <button onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 font-bold text-slate-300 hover:bg-slate-800">
                        {t('cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || playerEntries.length === 0}
                        className="rounded-lg bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500"
                    >
                        {isSaving ? t('saving') : t('saveScores')}
                    </button>
                </div>
            </div>
        </div>
    );
}

const PlayerName = ({ children }) => (
    <span className="font-black text-yellow-400">{children}</span>
);

const PointValue = ({ value, showSign = false }) => {
    const numericValue = Number(value) || 0;
    const color = numericValue >= 0 ? 'text-green-400' : 'text-red-400';
    const displayValue = showSign && numericValue > 0 ? `+${numericValue}` : numericValue;

    return <span className={`font-black ${color}`}>{displayValue}</span>;
};

const renderHistoryMessage = (item, t) => {
    const details = item.details || {};
    const fallbackName = item.actorName || t('hostLabel');

    switch (item.type) {
        case 'room_created':
            return <><PlayerName>{details.hostName || fallbackName}</PlayerName> {t('historyViewCreatedRoom')}</>;
        case 'game_started':
            return <><PlayerName>{details.actorName || fallbackName}</PlayerName> {t('historyViewStartedGame')} {t('historyViewFirst')} <PlayerName>{details.playerName || t('playerFallback')}</PlayerName></>;
        case 'game_finished':
            return <><PlayerName>{details.actorName || fallbackName}</PlayerName> {t('historyViewEndedGame')}</>;
        case 'question_picked':
            return <><PlayerName>{details.actorName || fallbackName}</PlayerName> {t('historyViewPicked')} &quot;{details.categoryName || t('question')}&quot; {t('historyViewFor')} <PointValue value={details.points} /></>;
        case 'player_buzzed':
            return <><PlayerName>{details.actorName || fallbackName}</PlayerName> {t('historyViewBuzzed')}</>;
        case 'answer_correct':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewCorrect')}, <PointValue value={details.points} showSign /></>;
        case 'answer_incorrect':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewIncorrect')}</>;
        case 'surprise_answer_correct':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewSurpriseCorrect')}</>;
        case 'surprise_answer_incorrect':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewSurpriseIncorrect')}</>;
        case 'surprise_wheel_rolled':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewWheelResult')} <PointValue value={details.points} showSign /></>;
        case 'question_skipped':
            return <>{t('historyViewSkipped')} &quot;{details.categoryName || t('question')}&quot; {t('historyViewFor')} <PointValue value={details.points} /></>;
        case 'board_resumed':
            return <>{t('historyViewBackToBoard')}</>;
        case 'score_adjusted':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewScore')} <PointValue value={details.delta} showSign /> → {details.nextScore}</>;
        case 'score_set':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewScore')} {details.previousScore} → {details.nextScore} (<PointValue value={details.delta} showSign />)</>;
        default:
            return item.message;
    }
};

function HistoryModal({ history, onClose, t }) {
    const sortedHistory = [...(history || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 p-5">
                    <h2 className="text-xl font-bold text-white">{t('gameHistory')}</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white">
                        <X size={22} />
                    </button>
                </div>
                <div className="max-h-[65vh] overflow-y-auto p-5">
                    {sortedHistory.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-slate-500">
                            {t('historyEmpty')}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {sortedHistory.map((item) => (
                                <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                                    <div className="mb-1 flex items-center justify-between gap-4 text-xs uppercase tracking-widest text-slate-500">
                                        <span>{item.actorName || t('hostLabel')}</span>
                                        <time dateTime={new Date(item.timestamp || 0).toISOString()}>
                                            {new Date(item.timestamp || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </time>
                                    </div>
                                    <div className="text-sm font-medium text-slate-200">{renderHistoryMessage(item, t)}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function GameRoom({ room, roomCode, user, onLeaveRoom }) {
    const { t } = useLanguage();
    const isHost = user.uid === room.hostId;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode);
    const [now, setNow] = useState(() => Date.now());
    const [copiedRoomCode, setCopiedRoomCode] = useState(false);
    const [copiedJoinLink, setCopiedJoinLink] = useState(false);
    const [isScoreEditorOpen, setIsScoreEditorOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const hostName = room.players[user.uid]?.name || user.displayName || t('hostLabel');
    const host = { id: user.uid, name: hostName };

    useEffect(() => {
        if (!room.buzzedPlayerId || !room.buzzTimestamp || room.answerRevealed) {
            setNow(Date.now());
            return undefined;
        }

        const intervalId = window.setInterval(() => setNow(Date.now()), 100);
        return () => window.clearInterval(intervalId);
    }, [room.answerRevealed, room.buzzedPlayerId, room.buzzTimestamp]);

    const leaveRoom = async () => {
        onLeaveRoom();
    };

    const handleStartGame = async () => {
        // Pick a random player to start (not host)
        const playerIds = Object.keys(room.players).filter(id => !room.players[id].isHost);
        const starterId = playerIds.length > 0 ? playerIds[Math.floor(Math.random() * playerIds.length)] : user.uid;

        await updateDoc(roomRef, {
            status: 'playing',
            currentTurn: starterId,
            history: arrayUnion(createHistoryItem({
                type: 'game_started',
                actorId: user.uid,
                actorName: hostName,
                message: t('historyGameStarted', {
                    actorName: hostName,
                    playerName: room.players[starterId]?.name || t('hostLabel')
                }),
                details: {
                    actorName: hostName,
                    playerName: room.players[starterId]?.name || t('hostLabel')
                }
            }))
        });
    };

    const createScoreAdjustmentHistory = (player, delta, nextScore) => createHistoryItem({
        type: 'score_adjusted',
        actorId: user.uid,
        actorName: hostName,
        message: t('historyScoreAdjusted', {
            actorName: hostName,
            playerName: player.name,
            delta: delta > 0 ? `+${delta}` : delta,
            nextScore
        }),
        details: {
            actorName: hostName,
            playerName: player.name,
            delta,
            nextScore
        }
    });

    const handleCopyRoomCode = async () => {
        try {
            await navigator.clipboard.writeText(roomCode);
            setCopiedRoomCode(true);
            window.setTimeout(() => setCopiedRoomCode(false), 1600);
        } catch (err) {
            console.error("Copy room code error:", err);
        }
    };

    const handleCopyJoinLink = async () => {
        try {
            const joinUrl = new URL(window.location.href);
            joinUrl.searchParams.delete('game');
            joinUrl.searchParams.set('room', roomCode);
            await navigator.clipboard.writeText(joinUrl.toString());
            setCopiedJoinLink(true);
            window.setTimeout(() => setCopiedJoinLink(false), 1600);
        } catch (err) {
            console.error("Copy join link error:", err);
        }
    };

    if (room.status === 'lobby') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black">
                {isHost && isHistoryOpen && <HistoryModal history={room.history} onClose={() => setIsHistoryOpen(false)} t={t} />}
                <div className="absolute top-4 left-4">
                    <button onClick={leaveRoom} className="text-slate-400 hover:text-white flex items-center gap-2">
                        <ArrowLeft size={20} /> {t('leave')}
                    </button>
                </div>

                <div className="text-center mb-12">
                    <h2 className="text-slate-400 uppercase tracking-widest text-sm mb-2 font-bold">{t('roomCode')}</h2>
                    <div className="flex items-center justify-center">
                        <div className="text-7xl font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 bg-slate-800 px-6 py-5 rounded-2xl border border-slate-700 shadow-2xl">
                            {roomCode}
                        </div>
                    </div>
                    <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
                        <button
                            onClick={handleCopyRoomCode}
                            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-5 py-3 rounded-xl font-bold inline-flex items-center justify-center gap-2 transition-colors shadow-lg"
                        >
                            {copiedRoomCode ? (
                                <>
                                    <Check size={20} className="text-green-400" /> {t('roomCodeCopied')}
                                </>
                            ) : (
                                <>
                                    <Copy size={20} /> {t('copyRoomCode')}
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleCopyJoinLink}
                            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-5 py-3 rounded-xl font-bold inline-flex items-center justify-center gap-2 transition-colors shadow-lg"
                        >
                            {copiedJoinLink ? (
                                <>
                                    <Check size={20} className="text-green-400" /> {t('joinLinkCopied')}
                                </>
                            ) : (
                                <>
                                    <Link size={20} /> {t('copyJoinLink')}
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div className="w-full max-w-2xl bg-slate-800/50 p-6 rounded-2xl border border-slate-700 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-6 border-b border-slate-700 pb-4">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <Users className="text-blue-400" /> {t('playersCount', { count: Object.keys(room.players).length - 1 })}
                        </h3>
                        {isHost && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsHistoryOpen(true)}
                                    className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-700"
                                    title={t('gameHistory')}
                                >
                                    <ScrollText size={18} />
                                </button>
                                <button
                                    onClick={handleStartGame}
                                    disabled={Object.keys(room.players).length < 2} // need at least 1 player + host
                                    className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg shadow-green-600/20"
                                >
                                    <Play size={18} /> {t('startGame')}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {Object.values(room.players).map((p, i) => (
                            <div key={i} className={`px-4 py-2 rounded-full border font-medium flex items-center gap-2 ${p.isHost ? 'bg-purple-900/50 border-purple-500/50 text-purple-200' : 'bg-slate-700 border-slate-600 text-white'}`}>
                                <span className="text-xl">{p.avatar}</span> {p.name} {p.isHost && <span className="text-xs ml-1 opacity-70">({t('hostLabel')})</span>}
                            </div>
                        ))}
                        {Object.keys(room.players).length === 1 && (
                            <div className="w-full text-center p-8 text-slate-500 italic">
                                {t('waitingForPlayers')}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (room.status === 'playing') {
        return (
            <div className="min-h-screen flex flex-col bg-slate-900 overflow-hidden">
                {isHost && isScoreEditorOpen && (
                    <ScoreEditorModal
                        players={room.players}
                        roomRef={roomRef}
                        host={host}
                        onClose={() => setIsScoreEditorOpen(false)}
                        t={t}
                    />
                )}
                {isHost && isHistoryOpen && <HistoryModal history={room.history} onClose={() => setIsHistoryOpen(false)} t={t} />}
                {/* Header bar */}
                <header className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center z-10 shadow-md">
                    <div className="flex items-center gap-4">
                        <button onClick={leaveRoom} className="text-slate-500 hover:text-slate-300"><ArrowLeft size={20}/></button>
                        <h1 className="font-bold text-xl text-blue-400 truncate max-w-xs">{room.pack.name}</h1>
                        <span className="bg-slate-800 px-3 py-1 rounded-full text-xs font-mono text-slate-400">{t('codeLabel', { roomCode })}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm font-medium text-slate-300">
                        {room.currentTurn && room.players[room.currentTurn] && (
                            <span>{t('currentPick')} <span className="text-yellow-400 font-bold">{room.players[room.currentTurn].name}</span></span>
                        )}
                        {isHost && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsScoreEditorOpen(true)}
                                    className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
                                    title={t('advancedScoreEditor')}
                                >
                                    <SlidersHorizontal size={18} />
                                </button>
                                <button
                                    onClick={() => setIsHistoryOpen(true)}
                                    className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
                                    title={t('gameHistory')}
                                >
                                    <ScrollText size={18} />
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar - Players & Scores */}
                    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col overflow-y-auto">
                        <div className="p-4 bg-slate-950/50 sticky top-0 border-b border-slate-800">
                            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">{t('leaderboard')}</h2>
                        </div>
                        <div className="p-2 space-y-1">
                            {Object.entries(room.players)
                                .filter(([_, p]) => !p.isHost)
                                .sort((a, b) => b[1].score - a[1].score)
                                .map(([pid, p]) => {
                                    const buzzDeltaLabel = getBuzzDeltaLabel(room, pid, now);
                                    const playerNameStyle = getPlayerNameStyle(p.name);

                                    return (
                                        <div key={pid} className={`p-3 rounded-lg border ${room.currentTurn === pid ? 'bg-blue-900/30 border-blue-500/50 shadow-[inset_2px_0_0_0_#3b82f6]' : 'bg-slate-800/50 border-transparent'} flex items-center justify-between group`}>
                                            <div className="min-w-0 pr-2 flex items-center gap-2">
                                                <span className="relative flex h-8 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-transparent">
                                                    <span className={`absolute inset-0 flex items-center justify-center text-2xl transition-all duration-200 ${buzzDeltaLabel ? 'scale-90 opacity-0' : 'scale-100 opacity-100'}`}>
                                                        {p.avatar}
                                                    </span>
                                                    <span className={`absolute inset-0 flex items-center justify-center rounded-lg bg-yellow-400/10 px-1 font-mono text-xs font-black text-yellow-300 ring-1 ring-inset ring-yellow-300/25 transition-all duration-200 ${buzzDeltaLabel ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}>
                                                        {buzzDeltaLabel}
                                                    </span>
                                                </span>
                                                <div className="min-w-0">
                                                    <div
                                                        className={`font-bold leading-tight ${playerNameStyle ? 'whitespace-nowrap' : 'truncate'} ${room.currentTurn === pid ? 'text-blue-300' : 'text-slate-200'}`}
                                                        style={playerNameStyle}
                                                    >
                                                        {p.name}
                                                    </div>
                                                    <div className="text-sm font-mono text-yellow-400">{t('scorePts', { score: p.score })}</div>
                                                </div>
                                            </div>
                                            {isHost && (
                                                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => adjustScore(roomRef, pid, p.score, 100, createScoreAdjustmentHistory(p, 100, p.score + 100))}
                                                        className="text-slate-400 hover:text-green-400"
                                                    >
                                                        <PlusCircle size={14}/>
                                                    </button>
                                                    <button
                                                        onClick={() => adjustScore(roomRef, pid, p.score, -100, createScoreAdjustmentHistory(p, -100, p.score - 100))}
                                                        className="text-slate-400 hover:text-red-400"
                                                    >
                                                        <MinusCircle size={14}/>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    </aside>

                    {/* Main Play Area */}
                    <main className="flex-1 relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-950 to-slate-900 p-6 overflow-hidden flex flex-col">
                        {room.activeQuestionId ? (
                            <ActiveQuestionView room={room} roomRef={roomRef} user={user} isHost={isHost} />
                        ) : (
                            <BoardView room={room} roomRef={roomRef} user={user} isHost={isHost} />
                        )}
                    </main>
                </div>
            </div>
        );
    }

    if (room.status === 'finished') {
        return <ResultsView room={room} leaveRoom={leaveRoom} />;
    }

    return null;
}
