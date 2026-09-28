import { useState } from 'react';
import { Play } from 'lucide-react';
import { handleEndGame, createHistoryItem, startNextRound } from '../../actions/gameActions';
import { getParticipantEntries } from '../../utils/gameResults';
import { useLanguage } from '../../useLanguage';
import HoldToConfirmButton from '../../components/HoldToConfirmButton';

export default function RoundBreakView({ room, roomRef, isHost, actor }) {
    const { t } = useLanguage();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const nextRound = room.currentRoundIndex + 2;
    const run = async (finish = false) => {
        if (!isHost || pending) return;
        setPending(true); setError('');
        try {
            if (finish) await handleEndGame(roomRef, createHistoryItem({ type: 'game_finished', actorId: actor.id,
                actorName: actor.name, message: t('historyGameEnded', { actorName: actor.name }), details: { actorName: actor.name } }));
            else await startNextRound(roomRef, room.currentRoundIndex, actor, t);
        } catch { setError(t(finish ? 'recapFinishFailed' : 'roundTransitionFailed')); }
        finally { setPending(false); }
    };
    return <section className="m-auto w-full max-w-xl space-y-6 rounded-2xl border border-slate-700 bg-slate-900/90 p-6 text-center text-white">
        <h1 className="text-3xl font-black text-yellow-400">{t('roundComplete', { round: room.currentRoundIndex + 1 })}</h1>
        <h2 className="font-bold text-slate-300">{t('roundStandings')}</h2>
        <ol className="space-y-2 text-left">
            {getParticipantEntries(room.players).sort(([, a], [, b]) => (Number(b.score) || 0) - (Number(a.score) || 0))
                .map(([id, player]) => <li key={id} className="flex justify-between gap-4 rounded-xl bg-slate-800 p-3">
                    <span className="break-words">{player.name}</span><strong className="shrink-0">{Number(player.score) || 0}</strong>
                </li>)}
        </ol>
        {isHost ? <div className="space-y-4">
            <button disabled={pending} onClick={() => run()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 p-4 font-bold text-slate-900 disabled:opacity-50">
                <Play size={20} />{t('startNextRound', { round: nextRound })}
            </button>
            {!pending && <HoldToConfirmButton ariaLabel={t('endGameEarly')} onConfirm={() => run(true)}
                className="rounded-lg border border-red-400/50 px-4 py-2 text-red-400" title={t('holdToConfirmAction', { action: t('endGameEarly') })}>
                {t('endGameEarly')}
            </HoldToConfirmButton>}
        </div> : <p className="text-slate-300">{t('nextRoundWaiting', { round: nextRound })}</p>}
        {error && <p role="alert" className="text-red-400">{error}</p>}
    </section>;
}
