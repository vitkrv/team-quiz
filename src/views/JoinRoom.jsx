import { useEffect, useState } from 'react';
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import PackTitle from '../components/PackTitle';
import { ANIMAL_AVATARS, HOST_AVATAR } from '../constants';
import { appId, db } from '../firebase';
import { trackEvent } from '../services/analytics';
import { useLanguage } from '../useLanguage';

export default function JoinRoom({ initialCode = '', setView, user, setCurrentRoomCode, setError, onCodeConsumed }) {
    const { t } = useLanguage();
    const [code, setCode] = useState(() => initialCode.replace(/\D/g, '').slice(0, 6));
    const [playerName, setPlayerName] = useState(() => (user.displayName || user.email?.split('@')[0] || '').substring(0, 18));
    const [isJoining, setIsJoining] = useState(false);
    const [roomPreview, setRoomPreview] = useState({ loading: false, pack: null, status: null });

    useEffect(() => {
        const normalizedCode = code.trim().toUpperCase();
        if (normalizedCode.length !== 6) {
            setRoomPreview({ loading: false, pack: null, status: null });
            return undefined;
        }

        let isCancelled = false;
        setRoomPreview({ loading: true, pack: null, status: null });

        const timeoutId = window.setTimeout(async () => {
            try {
                const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', normalizedCode);
                const roomSnap = await getDoc(roomRef);
                if (isCancelled) return;

                setRoomPreview({
                    loading: false,
                    pack: roomSnap.exists() ? roomSnap.data().pack || null : null,
                    status: roomSnap.exists() ? roomSnap.data().status || null : null
                });
            } catch (err) {
                console.error("Room preview error:", err);
                if (!isCancelled) {
                    setRoomPreview({ loading: false, pack: null, status: null });
                }
            }
        }, 250);

        return () => {
            isCancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [code]);

    const handleJoin = async (e) => {
        e.preventDefault();
        if (!code.trim()) return;
        setIsJoining(true);

        try {
            const normalizedCode = code.trim().toUpperCase();
            const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', normalizedCode);

            const joinResult = await runTransaction(db, async (transaction) => {
                const roomSnap = await transaction.get(roomRef);

                if (!roomSnap.exists()) {
                    return { error: t('roomNotFound') };
                }

                const roomData = roomSnap.data();
                if (roomData.status !== 'lobby') {
                    if (roomData.status === 'playing' || roomData.status === 'finished') {
                        return { ok: true, spectating: true };
                    }

                    return { error: t('roomClosed') };
                }

                if (!playerName.trim()) {
                    return { error: t('nicknameRequired') };
                }

                const players = roomData.players || {};
                const existingPlayer = players[user.uid];
                const playerCount = Object.keys(players).length;
                if (!existingPlayer && playerCount >= 21) { // 20 players + 1 host
                    return { error: t('roomFull') };
                }

                const usedAvatars = new Set(Object.entries(players)
                    .filter(([playerId, player]) => playerId !== user.uid && !player.isHost)
                    .map(([, player]) => player.avatar)
                    .filter(Boolean));
                const availableAvatars = ANIMAL_AVATARS.filter((avatar) => !usedAvatars.has(avatar));
                const canReuseExistingAvatar = existingPlayer?.avatar && ANIMAL_AVATARS.includes(existingPlayer.avatar);
                if (!existingPlayer?.isHost && !canReuseExistingAvatar && availableAvatars.length === 0) {
                    return { error: t('roomFull') };
                }

                const playerAvatar = existingPlayer?.isHost
                    ? HOST_AVATAR
                    : canReuseExistingAvatar
                        ? existingPlayer.avatar
                        : availableAvatars[Math.floor(Math.random() * availableAvatars.length)];

                transaction.update(roomRef, {
                    [`players.${user.uid}`]: {
                        name: playerName.substring(0, 18),
                        score: existingPlayer?.score || 0,
                        isHost: existingPlayer?.isHost || false,
                        avatar: playerAvatar
                    }
                });

                return { ok: true };
            });

            if (joinResult.error) {
                setError(joinResult.error);
                setIsJoining(false);
                return;
            }

            setCurrentRoomCode(normalizedCode, { remember: !joinResult.spectating });
            trackEvent('room_joined', { spectating: joinResult.spectating ? 'yes' : 'no' });
            onCodeConsumed?.();
            setView('room');
        } catch (err) {
            console.error("Join error:", err);
            setError(t('failedToJoinRoom'));
        }
        setIsJoining(false);
    };

    const isSpectatorPreview = roomPreview.status === 'playing' || roomPreview.status === 'finished';
    const submitLabel = isSpectatorPreview ? t('watchGame') : t('enterRoom');

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
            <div className="w-full max-w-sm">
                <button onClick={() => setView('menu')} className="mb-6 text-slate-400 hover:text-white flex items-center gap-2 transition-colors">
                    <ArrowLeft size={20} /> {t('backToMenu')}
                </button>

                <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl">
                    <h2 className="text-2xl font-bold mb-6 text-center">{t('joinGameTitle')}</h2>
                    <form onSubmit={handleJoin} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">{t('roomCode')}</label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder={t('codePlaceholder')}
                                maxLength={6}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                autoComplete="one-time-code"
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-4 text-center text-2xl font-mono tracking-widest text-white outline-none focus:border-blue-500"
                            />
                            {(roomPreview.loading || roomPreview.pack) && (
                                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                                    <div className="mb-1 text-xs font-black uppercase tracking-widest text-slate-500">
                                        {t('pickedQuestionPack')}
                                    </div>
                                    {roomPreview.loading ? (
                                        <div className="text-sm font-medium text-slate-400">{t('loadingQuestionPack')}</div>
                                    ) : (
                                        <div className="text-base font-bold text-blue-300">
                                            <PackTitle pack={roomPreview.pack} iconClassName="text-lg" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">{t('yourName')}</label>
                            <input
                                type="text"
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                placeholder={t('enterNickname')}
                                maxLength={18}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none focus:border-blue-500"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isJoining || !code || (!isSpectatorPreview && !playerName)}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-4 rounded-xl font-bold text-lg mt-4 transition-all"
                        >
                            {isJoining ? t('joining') : submitLabel}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
