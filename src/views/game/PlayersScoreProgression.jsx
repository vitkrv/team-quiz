import { useState } from 'react';

const colors = ['#60a5fa', '#fb923c', '#4ade80', '#f472b6', '#facc15', '#a78bfa', '#22d3ee', '#f87171', '#a3e635', '#e879f9', '#2dd4bf', '#fbbf24', '#818cf8', '#fb7185', '#34d399', '#c084fc', '#38bdf8', '#bef264', '#fdba74', '#f0abfc'];

export default function PlayersScoreProgression({ players, scores, t, number }) {
    const [highlighted, setHighlighted] = useState(null);
    // Every line uses the same committed event timeline, carrying unchanged scores forward.
    const series = Object.entries(players).sort(([a], [b]) => a.localeCompare(b)).map(([id, player], index) => {
        let current = player.startingScore;
        const values = [current, ...scores.map((score) => {
            if (score.playerId === id) current = score.after;
            return current;
        })];
        if (!scores.length) values.push(current);
        return { id, player, values, color: colors[index % colors.length] };
    });
    let min = 0, max = 1;
    for (const { values } of series) for (const value of values) {
        min = Math.min(min, value);
        max = Math.max(max, value);
    }
    const y = (value) => 180 - (value - min) / (max - min) * 160;
    const toggle = (id) => setHighlighted((previous) => previous === id ? null : id);
    return <>
        <p className="text-sm text-slate-400 mb-3">{t('recapChartHint')}</p>
        <svg viewBox="0 0 600 220" role="group" aria-label={t('recapAllProgression')} className="w-full rounded-lg bg-slate-950">
            {[min, (min + max) / 2, max].map((value) => <g key={value}>
                <line x1="72" x2="580" y1={y(value)} y2={y(value)} stroke="#334155" strokeDasharray="4 4" />
                <text x="64" y={y(value) + 4} textAnchor="end" fill="#94a3b8" fontSize="12">{number(value)}</text>
            </g>)}
            <text x="72" y="207" fill="#94a3b8" fontSize="12">{t('recapChartStart')}</text>
            <text x="580" y="207" textAnchor="end" fill="#94a3b8" fontSize="12">{t('recapChartLatest')}</text>
            {[...series].sort((a, b) => Number(a.id === highlighted) - Number(b.id === highlighted)).map(({ id, player, values, color }) => {
                const points = values.map((value, index) => `${72 + index / (values.length - 1) * 508},${y(value)}`).join(' ');
                return <g key={id} role="button" tabIndex={0} aria-label={t('recapHighlightPlayer', { player: player.name })} aria-pressed={highlighted === id}
                    className="cursor-pointer focus:outline focus:outline-2 focus:outline-white" onClick={() => toggle(id)} onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(id); }
                    }}>
                    <title>{t('recapHighlightPlayer', { player: player.name })}</title>
                    <polyline points={points} fill="none" stroke={color} strokeWidth={highlighted === id ? 4 : 2} opacity={highlighted && highlighted !== id ? 0.2 : 1} pointerEvents="none" />
                    <polyline points={points} fill="none" stroke="transparent" strokeWidth="16" pointerEvents="stroke" />
                </g>;
            })}
        </svg>
        <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label={t('recapChartLegend')}>
            {series.map(({ id, player, color, values }) => <button key={id} type="button" onClick={() => toggle(id)} aria-pressed={highlighted === id}
                aria-label={t('recapHighlightPlayer', { player: player.name })}
                className={`flex items-center gap-2 min-w-0 max-w-full rounded-lg border px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${highlighted === id ? 'border-white bg-slate-700 font-bold' : 'border-slate-600'} ${highlighted && highlighted !== id ? 'opacity-50' : ''}`}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="break-words min-w-0">{player.avatar} {player.name} <span className="text-slate-300">{t('scorePts', { score: number(values.at(-1)) })}</span></span>
            </button>)}
        </div>
    </>;
}
