import { Trophy } from 'lucide-react';
import { useLanguage } from '../../useLanguage';

export default function ResultsView({ room, leaveRoom }) {
    const { t } = useLanguage();
    const players = Object.values(room.players).filter(p => !p.isHost).sort((a, b) => b.score - a.score);
    const winner = players[0];

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center p-6 pt-16">
            <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 mb-12 drop-shadow-lg text-center">
                {t('gameOver')}
            </h1>

            {winner ? (
                <div className="flex flex-col items-center mb-14 animate-in slide-in-from-bottom-10 duration-700">
                    <div className="flex flex-col items-center gap-4 mb-5">
                        <Trophy size={88} className="text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.5)]" />
                        <div className="h-16 w-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-4xl shadow-lg shadow-black/30">
                            {winner.avatar}
                        </div>
                    </div>
                    <h2 className="text-4xl font-bold text-white mb-2 text-center">{winner.name}</h2>
                    <p className="text-2xl font-mono text-yellow-400">{t('scorePts', { score: winner.score })}</p>
                </div>
            ) : (
                <div className="text-2xl text-slate-400 mb-16">{t('noPlayersParticipated')}</div>
            )}

            <div className="w-full max-w-2xl bg-slate-800 rounded-2xl border border-slate-700 p-6 mb-12">
                <h3 className="text-xl font-bold text-slate-400 mb-6 uppercase tracking-widest text-center">{t('finalStandings')}</h3>
                <div className="space-y-3">
                    {players.map((p, i) => (
                        <div key={i} className="flex justify-between items-center gap-4 p-4 bg-slate-900 rounded-xl">
                            <div className="min-w-0 flex items-center gap-4">
                                <span className={`font-black text-xl w-10 text-center shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-600'}`}>
                                    #{i + 1}
                                </span>
                                <span className="text-2xl shrink-0">{p.avatar}</span>
                                <span className="font-bold text-lg text-white truncate">{p.name}</span>
                            </div>
                            <span className="font-mono text-yellow-500 font-bold shrink-0">{p.score}</span>
                        </div>
                    ))}
                </div>
            </div>

            <button
                onClick={leaveRoom}
                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold text-xl shadow-lg transition-all transform hover:scale-105"
            >
                {t('backToMainMenu')}
            </button>
        </div>
    );
}
