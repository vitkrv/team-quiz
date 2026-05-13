import { useEffect, useState } from 'react';
import { arrayUnion, updateDoc } from 'firebase/firestore';
import { Check, X } from 'lucide-react';

export default function ActiveQuestionView({ room, roomRef, user, isHost }) {
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

    const handleBuzzIn = async () => {
        if (!canIBuzz) return;
        await updateDoc(roomRef, {
            buzzedPlayerId: user.uid,
            buzzTimestamp: Date.now()
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
                [`questionStates.${activeQ.id}`]: 'done'
            });
        } else {
            // Mark incorrect, reset buzz
            await updateDoc(roomRef, {
                buzzedPlayerId: null,
                buzzTimestamp: null,
                incorrectBuzzedIds: arrayUnion(room.buzzedPlayerId)
            });
        }
    };

    const handleSkip = async () => {
        if (!isHost) return;
        await updateDoc(roomRef, {
            answerRevealed: true,
            buzzedPlayerId: null,
            buzzTimestamp: null,
            [`questionStates.${activeQ.id}`]: 'done'
        });
    };

    const handleContinue = async () => {
        if (!isHost) return;
        await updateDoc(roomRef, {
            activeQuestionId: null,
            answerRevealed: false,
            buzzedPlayerId: null,
            buzzTimestamp: null,
            incorrectBuzzedIds: []
        });
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full text-center relative z-10">

            <div className="absolute top-0 w-full flex justify-between text-slate-400 font-bold uppercase tracking-widest text-sm">
                <span>{activeCatName}</span>
                <span className="text-yellow-500">{activeQ.points} PTS</span>
            </div>

            <div className="w-full bg-blue-900 border-4 border-blue-600 rounded-3xl p-10 md:p-16 shadow-2xl shadow-blue-900/50 mb-12 mt-10">
                <h2 className="text-3xl md:text-5xl font-black text-white leading-tight drop-shadow-lg" style={{textShadow: '2px 2px 4px rgba(0,0,0,0.5)'}}>
                    {activeQ.text}
                </h2>
            </div>

            {(isHost || isAnswerRevealed) && (
                <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl w-full max-w-2xl mb-8">
                    <p className="text-sm text-slate-400 uppercase tracking-widest font-bold mb-2">
                        {isAnswerRevealed ? 'Correct Answer' : 'Hidden Answer'}
                    </p>
                    <p className="text-2xl font-black text-green-400">{activeQ.answer}</p>
                </div>
            )}

            {isAnswerRevealed && (
                <div className="flex flex-col items-center gap-4">
                    {!isHost && (
                        <div className="text-slate-400 font-bold text-lg">
                            Waiting for host to continue...
                        </div>
                    )}
                    {isHost && (
                        <button
                            onClick={handleContinue}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold text-xl shadow-lg shadow-blue-900 transition-colors"
                        >
                            Continue
                        </button>
                    )}
                </div>
            )}

            {/* State: Someone buzzed */}
            {hasBuzzed && !isAnswerRevealed && (
                <div className="flex flex-col items-center animate-in zoom-in duration-200">
                    <div className="text-xl text-slate-300 mb-4 flex items-center gap-2">
                        <span className="text-3xl">{buzzedPlayerAvatar}</span>
                        <span className="font-black text-2xl text-yellow-400">{buzzedPlayerName}</span> is answering!
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
                                <Check size={28}/> Correct
                            </button>
                            <button onClick={() => handleJudge(false)} className="bg-red-600 hover:bg-red-500 text-white px-8 py-4 rounded-xl font-bold text-xl flex items-center gap-2 shadow-lg shadow-red-900">
                                <X size={28}/> Incorrect
                            </button>
                        </div>
                    )}

                    {didIBuzz && !isHost && (
                        <div className="text-2xl font-bold text-blue-400 animate-pulse mt-4">
                            Speak your answer loudly!
                        </div>
                    )}
                </div>
            )}

            {/* State: Waiting for buzz */}
            {!hasBuzzed && !isAnswerRevealed && (
                <div className="flex flex-col items-center w-full max-w-md">
                    {isHost ? (
                        <div className="text-slate-400 mb-6">Waiting for players to buzz...</div>
                    ) : (
                        canIBuzz ? (
                            <button
                                onClick={handleBuzzIn}
                                className="w-48 h-48 rounded-full bg-red-600 hover:bg-red-500 border-8 border-red-800 text-white font-black text-4xl shadow-[0_10px_0_0_#7f1d1d,inset_0_10px_20px_rgba(255,255,255,0.3)] active:shadow-[0_0px_0_0_#7f1d1d,inset_0_10px_20px_rgba(255,255,255,0.3)] active:translate-y-[10px] transition-all"
                            >
                                BUZZ
                            </button>
                        ) : (
                            <div className="text-slate-500 font-bold text-xl p-8 border-2 border-dashed border-slate-700 rounded-xl w-full">
                                {amIIncorrect ? "You answered incorrectly." : "Waiting..."}
                            </div>
                        )
                    )}

                    {isHost && (
                        <button
                            onClick={handleSkip}
                            className="mt-8 text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 px-6 py-2 rounded-lg font-bold transition-colors"
                        >
                            Skip / Reveal Answer
                        </button>
                    )}
                </div>
            )}

        </div>
    );
}
