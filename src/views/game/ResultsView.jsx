import { Trophy } from 'lucide-react';
import { useLanguage } from '../../useLanguage';

export default function ResultsView({ room, leaveRoom }) {
    const { t } = useLanguage();
    const championId = room.tieBreaker?.championId || null;
    const playerEntries = Object.entries(room.players)
        .filter(([, player]) => !player.isHost)
        .sort((a, b) => {
            if (championId) {
                if (a[0] === championId) return -1;
                if (b[0] === championId) return 1;
            }

            return (b[1].score || 0) - (a[1].score || 0);
        });
    const winnerEntry = championId && room.players[championId] && !room.players[championId].isHost
        ? [championId, room.players[championId]]
        : playerEntries[0];
    const winner = winnerEntry?.[1];

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
                    {playerEntries.map(([playerId, p], i) => (
                        <div key={playerId} className="flex justify-between items-center gap-4 p-4 bg-slate-900 rounded-xl">
                            <div className="min-w-0 flex items-center gap-4">
                                <span className={`font-black text-xl w-10 text-center shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-600'}`}>
                                    #{i + 1}
                                </span>
                                <span className="text-2xl shrink-0">{p.avatar}</span>
                                <span className="min-w-0">
                                    <span className="block truncate text-lg font-bold text-white">{p.name}</span>
                                    {championId === playerId && (
                                        <span className="mt-1 inline-flex rounded-full bg-yellow-400/10 px-2 py-0.5 text-xs font-black uppercase tracking-widest text-yellow-300">
                                            {t('rpsChampionBadge')}
                                        </span>
                                    )}
                                </span>
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
