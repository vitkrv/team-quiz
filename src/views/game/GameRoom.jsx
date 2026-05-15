import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Check, Copy, Link, Play, PlusCircle, MinusCircle, Users } from 'lucide-react';
import { appId, db } from '../../firebase';
import { useLanguage } from '../../useLanguage';
import { adjustScore } from '../../actions/gameActions';
import ActiveQuestionView from './ActiveQuestionView';
import BoardView from './BoardView';
import ResultsView from './ResultsView';

export default function GameRoom({ room, roomCode, user, onLeaveRoom }) {
    const { t } = useLanguage();
    const isHost = user.uid === room.hostId;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode);
    const [copiedRoomCode, setCopiedRoomCode] = useState(false);
    const [copiedJoinLink, setCopiedJoinLink] = useState(false);

    const leaveRoom = async () => {
        onLeaveRoom();
    };

    const handleStartGame = async () => {
        // Pick a random player to start (not host)
        const playerIds = Object.keys(room.players).filter(id => !room.players[id].isHost);
        const starterId = playerIds.length > 0 ? playerIds[Math.floor(Math.random() * playerIds.length)] : user.uid;

        await updateDoc(roomRef, {
            status: 'playing',
            currentTurn: starterId
        });
    };

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
                            <button
                                onClick={handleStartGame}
                                disabled={Object.keys(room.players).length < 2} // need at least 1 player + host
                                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg shadow-green-600/20"
                            >
                                <Play size={18} /> {t('startGame')}
                            </button>
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
                {/* Header bar */}
                <header className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center z-10 shadow-md">
                    <div className="flex items-center gap-4">
                        <button onClick={leaveRoom} className="text-slate-500 hover:text-slate-300"><ArrowLeft size={20}/></button>
                        <h1 className="font-bold text-xl text-blue-400 truncate max-w-xs">{room.pack.name}</h1>
                        <span className="bg-slate-800 px-3 py-1 rounded-full text-xs font-mono text-slate-400">{t('codeLabel', { roomCode })}</span>
                    </div>
                    <div className="text-sm font-medium text-slate-300">
                        {room.currentTurn && room.players[room.currentTurn] && (
                            <span>{t('currentPick')} <span className="text-yellow-400 font-bold">{room.players[room.currentTurn].name}</span></span>
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
                                .map(([pid, p]) => (
                                    <div key={pid} className={`p-3 rounded-lg border ${room.currentTurn === pid ? 'bg-blue-900/30 border-blue-500/50 shadow-[inset_2px_0_0_0_#3b82f6]' : 'bg-slate-800/50 border-transparent'} flex items-center justify-between group`}>
                                        <div className="truncate pr-2 flex items-center gap-2">
                                            <span className="text-2xl">{p.avatar}</span>
                                            <div>
                                                <div className={`font-bold truncate ${room.currentTurn === pid ? 'text-blue-300' : 'text-slate-200'}`}>{p.name}</div>
                                                <div className="text-sm font-mono text-yellow-400">{t('scorePts', { score: p.score })}</div>
                                            </div>
                                        </div>
                                        {isHost && (
                                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => adjustScore(roomRef, pid, p.score, 100)} className="text-slate-400 hover:text-green-400"><PlusCircle size={14}/></button>
                                                <button onClick={() => adjustScore(roomRef, pid, p.score, -100)} className="text-slate-400 hover:text-red-400"><MinusCircle size={14}/></button>
                                            </div>
                                        )}
                                    </div>
                                ))}
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
