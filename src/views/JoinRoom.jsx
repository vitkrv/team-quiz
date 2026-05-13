import { useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import { ANIMAL_AVATARS } from '../constants';
import { appId, db } from '../firebase';

export default function JoinRoom({ initialCode = '', setView, user, setCurrentRoomCode, setError, onCodeConsumed }) {
    const [code, setCode] = useState(initialCode);
    const [playerName, setPlayerName] = useState('');
    const [isJoining, setIsJoining] = useState(false);

    const handleJoin = async (e) => {
        e.preventDefault();
        if (!code.trim() || !playerName.trim()) return;
        setIsJoining(true);

        try {
            const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', code.trim().toUpperCase());
            const roomSnap = await getDoc(roomRef);

            if (!roomSnap.exists()) {
                setError("Room not found. Check the code.");
                setIsJoining(false);
                return;
            }

            const rData = roomSnap.data();
            if (rData.status !== 'lobby') {
                setError("Game has already started or finished.");
                setIsJoining(false);
                return;
            }

            const playerCount = Object.keys(rData.players).length;
            if (playerCount >= 21) { // 20 players + 1 host
                setError("Room is full (max 20 players).");
                setIsJoining(false);
                return;
            }

            const usedAvatars = Object.values(rData.players).map(p => p.avatar);
            const availableAvatars = ANIMAL_AVATARS.filter(a => !usedAvatars.includes(a));
            const playerAvatar = availableAvatars.length > 0
                ? availableAvatars[Math.floor(Math.random() * availableAvatars.length)]
                : ANIMAL_AVATARS[Math.floor(Math.random() * ANIMAL_AVATARS.length)];

            // Add player to room
            await updateDoc(roomRef, {
                [`players.${user.uid}`]: { name: playerName.substring(0, 15), score: 0, isHost: false, avatar: playerAvatar }
            });

            setCurrentRoomCode(code.trim().toUpperCase());
            onCodeConsumed?.();
            setView('room');
        } catch (err) {
            console.error("Join error:", err);
            setError("Failed to join room.");
        }
        setIsJoining(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
            <div className="w-full max-w-sm">
                <button onClick={() => setView('menu')} className="mb-6 text-slate-400 hover:text-white flex items-center gap-2 transition-colors">
                    <ArrowLeft size={20} /> Back to Menu
                </button>

                <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl">
                    <h2 className="text-2xl font-bold mb-6 text-center">Join Game</h2>
                    <form onSubmit={handleJoin} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Room Code</label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                placeholder="6-DIGIT CODE"
                                maxLength={6}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-4 text-center text-2xl font-mono tracking-widest text-white outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Your Name</label>
                            <input
                                type="text"
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                placeholder="Enter nickname"
                                maxLength={15}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none focus:border-blue-500"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isJoining || !code || !playerName}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-4 rounded-xl font-bold text-lg mt-4 transition-all"
                        >
                            {isJoining ? 'Joining...' : 'Enter Room'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
