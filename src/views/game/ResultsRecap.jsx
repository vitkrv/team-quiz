import { useState } from 'react';
import { Award, CheckCircle, XCircle, MousePointerClick, Timer, Clock, Zap, Target, Flame, ChevronDown } from 'lucide-react';
import { useLanguage } from '../../useLanguage';
import useGameRecap from '../../hooks/useGameRecap';
import { getAchievements } from '../../utils/achievements';
import PlayersScoreProgression from './PlayersScoreProgression';

const icons = { correct: CheckCircle, incorrect: XCircle, buzzes: MousePointerClick, early: Timer, late: Clock, closestLate: Zap, accuracy: Target, streak: Flame };
const panel = 'w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-800 p-4 md:p-6 mb-6';

function ScoreProgression({ scores, player, t }) {
    const values = [player.startingScore, ...scores.map((s) => s.after)];
    const min = Math.min(0, ...values), max = Math.max(1, ...values);
    const points = values.map((v, i) => `${20 + i / Math.max(1, values.length - 1) * 560},${140 - (v - min) / (max - min) * 120}`).join(' ');
    return <>
        <h4 className="font-bold mt-5">{t('recapProgression')}</h4>
        <svg viewBox="0 0 600 160" role="img" aria-label={t('recapProgression')} className="w-full mt-2 rounded-lg bg-slate-950">
            <polyline points={points} fill="none" stroke="#60a5fa" strokeWidth="3" />
        </svg>
    </>;
}

export default function ResultsRecap({ room, gameId, playerEntries }) {
    const { t, language } = useLanguage();
    const [performanceOpen, setPerformanceOpen] = useState(false);
    const [selected, setSelected] = useState(playerEntries[0]?.[0] || '');
    const recap = useGameRecap(gameId, room.recapVersion === 1);
    const number = (value) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
    const retry = <button className="px-4 py-2 rounded-lg bg-blue-600" onClick={recap.retry}>{t('gameDataRetry')}</button>;
    if (recap.error) return <section className={panel}><p className="mb-3">{t('recapLoadFailed')}</p>{retry}</section>;
    if (!recap.summary) return <p className="text-slate-400 mb-6" role="status">{t('gameDataLoading')}</p>;
    const summary = recap.summary;
    const awards = getAchievements(summary);
    const player = summary.players[selected];
    return <>
        <section className={panel}>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Award aria-hidden="true" />{t('recapAchievements')}</h3>
            {!awards.length && <p className="text-slate-400">{t('recapNoAwards')}</p>}
            <div className="grid gap-3 sm:grid-cols-2">{awards.map((award) => {
                const Icon = icons[award.id];
                const value = award.unit === 'ratio' ? `${number(award.value * 100)}%` : award.unit === 'ms' ? t('recapMilliseconds', { value: number(award.value) }) : t('recapCount', { count: number(award.value) });
                return <article key={award.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-3 rounded-xl bg-slate-900 p-4">
                    <div className="text-center min-w-0"><Icon size={32} className="mx-auto text-yellow-400 mb-2" aria-hidden="true" /><h4 className="font-bold break-words">{t(`achievement_${award.id}`)}</h4><p className="text-yellow-300 mt-1">{value}</p></div>
                    <div className="space-y-3">{award.playerIds.map((id) => <div key={id} className="text-center min-w-0">
                        <div className="text-3xl" aria-hidden="true">{summary.players[id].avatar}</div><p className="font-bold break-words text-sm mt-1">{summary.players[id].name}</p>
                        {award.id === 'accuracy' && <p className="text-xs text-slate-400">{number(award.details[id].correct)}/{number(award.details[id].answered)}</p>}
                        {award.id === 'closestLate' && <p className="text-xs text-slate-400 break-words">{award.details[id].categoryName}{award.details[id].questionPoints != null ? ` · ${t('scorePts', { score: number(award.details[id].questionPoints) })}` : ''}</p>}
                    </div>)}</div>
                </article>;
            })}</div>
            <p className="text-xs text-slate-400 mt-4">{t(room.buzzerPolicyVersion === 1 ? 'recapReactionTimingNote' : 'recapTimingNote')}</p>
        </section>
        <section className={panel}>
            <h3 className="text-xl font-bold mb-4">{t('recapAllProgression')}</h3>
            {recap.scoresError ? <div>{t('recapLoadFailed')} {retry}</div> : recap.scores ? <PlayersScoreProgression key={gameId} players={summary.players} scores={recap.scores} t={t} number={number} /> : <p role="status">{t('gameDataLoading')}</p>}
        </section>
        <details className={panel} onToggle={(e) => setPerformanceOpen(e.currentTarget.open)}>
            <summary className="cursor-pointer font-bold text-xl">{t('recapPerformance')}</summary>
            {performanceOpen && <div className="mt-4">
                <label className="block">
                    {t('recapPlayer')}
                    <span className="relative mt-2 block">
                        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="block w-full appearance-none rounded-lg bg-slate-900 py-3 pl-3 pr-10">
                            {playerEntries.map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
                        </select>
                        <ChevronDown size={18} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" />
                    </span>
                </label>
                {player && <>
                    <dl className="grid grid-cols-2 gap-3 mt-4">{['correct', 'incorrect', 'buzzes', 'early', 'late'].map((key) => <div key={key}><dt className="text-sm text-slate-400">{t(`recapStat_${key}`)}</dt><dd className="text-xl font-bold">{number(player[key])}</dd></div>)}
                        <div><dt className="text-sm text-slate-400">{t('recapAccuracy')}</dt><dd>{player.correct + player.incorrect ? `${number(player.correct / (player.correct + player.incorrect) * 100)}%` : '—'}</dd></div>
                    </dl>
                    <h4 className="font-bold mt-5">{t('recapCategoryPoints')}</h4>
                    {Object.entries(player.categories).map(([id, c]) => <p key={id} className="flex justify-between gap-3"><span>{c.name}</span><span>{number(c.points)}</span></p>)}
                    <p className="flex justify-between gap-3"><span>{t('recapAdjustments')}</span><span>{number(player.adjustments)}</span></p>
                    {recap.scoresError ? <div className="mt-3">{t('recapLoadFailed')} {retry}</div> : recap.scores ? <ScoreProgression scores={recap.scores.filter((s) => s.playerId === selected)} player={player} t={t} /> : <p role="status">{t('gameDataLoading')}</p>}
                </>}
            </div>}
        </details>
    </>;
}
