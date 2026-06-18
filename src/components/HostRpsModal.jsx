import { useEffect, useMemo, useState } from 'react';
import { Check, Trophy, X } from 'lucide-react';
import { getChoiceWinner, RPS_CHOICES } from '../actions/gameActions';
import { HOST_AVATAR } from '../constants';
import FloatingEmojiBackground from './FloatingEmojiBackground';
import { createFloatingBackgroundItems } from '../utils/floatingBackground';

const CHOICE_ORDER = ['rock', 'paper', 'scissors'];
const TROPHY_BACKGROUND_COUNT = 20;
const TROPHY_BACKGROUND_EMOJIS = ['\u{1F3C6}'];

const getPlayer = (players, playerId) => players[playerId] || {};
const getPlayerName = (players, playerId, t) => getPlayer(players, playerId).name || t('playerFallback');
const getPlayerAvatar = (players, playerId) => (getPlayer(players, playerId).isHost ? HOST_AVATAR : getPlayer(players, playerId).avatar) || '🙂';
const getLatestThrow = (hostRps) => {
    const throws = hostRps?.throws || [];
    return throws.length > 0 ? throws[throws.length - 1] : null;
};
const getHostRpsWinnerId = (hostRps) => (
    hostRps?.status === 'complete'
        ? hostRps.playerIds?.find((playerId) => (hostRps.wins?.[playerId] || 0) >= hostRps.targetWins) || null
        : null
);

const getPlayerThrowResult = (latestThrow, playerId) => {
    if (!latestThrow?.choices?.[playerId]) return null;
    if (latestThrow.isTie) return 'tie';

    const [playerAId, playerBId] = Object.keys(latestThrow.choices);
    const throwWinnerId = getChoiceWinner(playerAId, playerBId, latestThrow.choices);
    return throwWinnerId === playerId ? 'winner' : 'loser';
};

const getResultPanelClassName = (result) => {
    if (result === 'winner') return 'border-green-500/45 bg-green-500/15 ring-1 ring-green-400/20';
    if (result === 'loser') return 'border-red-500/45 bg-red-500/15 ring-1 ring-red-400/20';
    if (result === 'tie') return 'border-yellow-500/45 bg-yellow-500/15 ring-1 ring-yellow-400/20';
    return 'border-slate-800 bg-slate-950';
};

const getResultTextClassName = (result, hasChoice) => {
    if (result === 'winner') return 'text-green-300';
    if (result === 'loser') return 'text-red-300';
    if (result === 'tie') return 'text-yellow-300';
    return hasChoice ? 'text-green-300' : 'text-slate-500';
};

function PlayerSelectButton({ player, isSelected, disabled, onClick, t }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                isSelected
                    ? 'border-yellow-400 bg-yellow-400/10 text-yellow-100'
                    : 'border-slate-800 bg-slate-950 text-slate-100 hover:border-slate-600 hover:bg-slate-800'
            } disabled:cursor-not-allowed disabled:opacity-60`}
        >
            <span className="text-2xl">{player.isHost ? HOST_AVATAR : player.avatar}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{player.name || t('playerFallback')}</span>
            {isSelected && <Check size={18} className="shrink-0 text-yellow-300" />}
        </button>
    );
}

function SetupView({ players, onStart, onClose, t }) {
    const [selectedPair, setSelectedPair] = useState([]);
    const [mode, setMode] = useState('one');
    const playerEntries = Object.entries(players || {});

    const togglePlayer = (playerId) => {
        if (selectedPair.includes(playerId)) {
            setSelectedPair(selectedPair.filter((id) => id !== playerId));
            return;
        }

        setSelectedPair([...selectedPair, playerId].slice(-2));
    };

    return (
        <>
            <div className="border-b border-slate-800 p-5">
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-black text-white">{t('hostRpsSetupTitle')}</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white" aria-label={t('hostRpsCloseSetup')}>
                        <X size={22} />
                    </button>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-400">{t('hostRpsSetupDescription')}</p>
            </div>
            <div className="space-y-5 p-5">
                <div>
                    <div className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">{t('hostRpsPickPlayers')}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {playerEntries.map(([playerId, player]) => (
                            <PlayerSelectButton
                                key={playerId}
                                playerId={playerId}
                                player={player}
                                isSelected={selectedPair.includes(playerId)}
                                disabled={false}
                                onClick={() => togglePlayer(playerId)}
                                t={t}
                            />
                        ))}
                    </div>
                </div>
                <div>
                    <div className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">{t('rpsModeTitle')}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {[
                            ['one', t('rpsModeOne')],
                            ['three', t('rpsModeThree')]
                        ].map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setMode(value)}
                                className={`rounded-lg border p-4 text-left font-black transition-colors ${
                                    mode === value
                                        ? 'border-yellow-400 bg-yellow-400/10 text-yellow-100'
                                        : 'border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-600'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onStart(selectedPair, mode)}
                    disabled={selectedPair.length !== 2}
                    className="w-full rounded-xl bg-yellow-500 px-5 py-3 font-black text-slate-950 hover:bg-yellow-400 disabled:bg-slate-700 disabled:text-slate-500"
                >
                    {t('hostRpsStart')}
                </button>
            </div>
        </>
    );
}

function ChoiceStatus({ players, hostRps, playerId, latestThrow, winnerId, trophyItems, t }) {
    const choices = hostRps.choices || {};
    const hasPendingChoices = Object.keys(choices).length > 0;
    const choice = choices[playerId];
    const latestChoice = hasPendingChoices ? null : latestThrow?.choices?.[playerId];
    const result = hasPendingChoices ? null : getPlayerThrowResult(latestThrow, playerId);
    const isWinner = winnerId === playerId;
    const statusLabel = isWinner
        ? t('hostRpsWinnerBadge')
        : result === 'winner'
            ? t('rpsThrowWon')
            : result === 'loser'
                ? t('rpsThrowLost')
                : result === 'tie'
                    ? t('rpsThrowTied')
                    : choice
                        ? t('rpsPicked')
                        : t('rpsNotPicked');

    return (
        <div className={`relative flex min-w-0 flex-1 flex-col items-center overflow-hidden rounded-xl border p-4 text-center ${getResultPanelClassName(isWinner ? 'winner' : result)}`}>
            {isWinner && <FloatingEmojiBackground items={trophyItems} className="inset-0" />}
            <div className="relative mb-2 text-4xl">{getPlayerAvatar(players, playerId)}</div>
            <div className="relative max-w-full truncate text-lg font-black text-white">{getPlayerName(players, playerId, t)}</div>
            <div className="relative mt-4 flex h-20 w-20 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-5xl">
                {latestChoice ? RPS_CHOICES[latestChoice].emoji : '?'}
            </div>
            <div className={`relative mt-3 text-sm font-black ${isWinner ? 'text-green-300' : getResultTextClassName(result, Boolean(choice || latestChoice))}`}>
                {statusLabel}
            </div>
        </div>
    );
}

function ActiveView({ players, hostRps, userId, isHost, isSpectator, onSubmitChoice, onCloseResult, trophyItems, t }) {
    const [playerAId, playerBId] = hostRps.playerIds;
    const choices = hostRps.choices || {};
    const bothPicked = choices[playerAId] && choices[playerBId];
    const winnerId = getHostRpsWinnerId(hostRps);
    const latestThrow = getLatestThrow(hostRps);
    const isCurrentPlayer = !isSpectator && hostRps.playerIds.includes(userId);
    const hasPicked = Boolean(choices[userId]);

    return (
        <>
            <div className="flex items-center justify-between border-b border-slate-800 p-5">
                <h2 className="text-xl font-black text-white">{t('hostRpsTitle')}</h2>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase tracking-widest text-yellow-300">
                    {hostRps.targetWins === 3 ? t('rpsModeThree') : t('rpsModeOne')}
                </span>
            </div>
            <div className="space-y-5 p-5">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-center">
                    <div className="mt-1 text-lg font-black text-white">
                        {getPlayerName(players, playerAId, t)} <span className="text-slate-500">vs</span> {getPlayerName(players, playerBId, t)}
                    </div>
                    <div className="mt-2 font-mono text-xl font-black text-yellow-300">
                        {(hostRps.wins?.[playerAId] || 0)} : {(hostRps.wins?.[playerBId] || 0)}
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-400">{t('rpsTargetWins', { count: hostRps.targetWins })}</div>
                </div>
                {winnerId && (
                    <div className="rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-5 text-center">
                        <Trophy className="mx-auto mb-2 text-yellow-300" size={40} />
                        <div className="text-xs font-black uppercase tracking-widest text-yellow-200">{t('hostRpsWinnerTitle')}</div>
                        <div className="mt-1 text-2xl font-black text-white">{getPlayerName(players, winnerId, t)}</div>
                    </div>
                )}
                <div className="flex flex-col gap-3 sm:flex-row">
                    <ChoiceStatus players={players} hostRps={hostRps} playerId={playerAId} latestThrow={latestThrow} winnerId={winnerId} trophyItems={trophyItems} t={t} />
                    <ChoiceStatus players={players} hostRps={hostRps} playerId={playerBId} latestThrow={latestThrow} winnerId={winnerId} trophyItems={trophyItems} t={t} />
                </div>
                {bothPicked && !winnerId ? (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-center font-black text-blue-200">
                        {isHost ? t('rpsResolving') : t('rpsWaitingForReveal')}
                    </div>
                ) : winnerId && isHost ? (
                    <button
                        type="button"
                        onClick={onCloseResult}
                        className="w-full rounded-xl bg-purple-600 px-5 py-3 font-black text-white hover:bg-purple-500"
                    >
                        {t('hostRpsCloseForEveryone')}
                    </button>
                ) : winnerId ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-center font-bold text-slate-400">
                        {t('hostRpsWaitingForHostClose')}
                    </div>
                ) : isCurrentPlayer && !hasPicked && !bothPicked ? (
                    <div>
                        <div className="mb-2 text-center text-xs font-black uppercase tracking-widest text-slate-500">{t('rpsPickYourChoice')}</div>
                        <div className="grid grid-cols-3 gap-2">
                            {CHOICE_ORDER.map((choice) => (
                                <button
                                    key={choice}
                                    type="button"
                                    onClick={() => onSubmitChoice(choice)}
                                    className="flex flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-950 p-4 font-black text-slate-100 hover:border-yellow-400 hover:bg-yellow-400/10"
                                >
                                    <span className="text-4xl">{RPS_CHOICES[choice].emoji}</span>
                                    <span className="mt-2 text-xs uppercase tracking-widest">{t(`rpsChoice${choice[0].toUpperCase()}${choice.slice(1)}`)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-center font-bold text-slate-400">
                        {isCurrentPlayer && hasPicked ? t('rpsWaitingForOpponent') : t('rpsWatchingMatch')}
                    </div>
                )}
            </div>
        </>
    );
}

export default function HostRpsModal({
    players,
    hostRps = null,
    userId,
    isHost,
    isSpectator = false,
    isSetupOpen = false,
    onCloseSetup,
    onStart,
    onSubmitChoice,
    onResolveThrow,
    onCloseResult,
    t
}) {
    const [resolvingKey, setResolvingKey] = useState(null);
    const currentChoicesKey = hostRps?.playerIds
        ? `${hostRps.id}:${hostRps.throws?.length || 0}:${hostRps.choices?.[hostRps.playerIds[0]] || ''}:${hostRps.choices?.[hostRps.playerIds[1]] || ''}`
        : '';
    const winnerId = getHostRpsWinnerId(hostRps);
    const trophyItems = useMemo(
        () => createFloatingBackgroundItems({
            seed: `${winnerId || 'host-rps'}:${hostRps?.id || ''}`,
            count: TROPHY_BACKGROUND_COUNT,
            emojis: TROPHY_BACKGROUND_EMOJIS
        }),
        [hostRps?.id, winnerId]
    );

    useEffect(() => {
        if (!isHost || !hostRps?.playerIds || hostRps.status !== 'active' || resolvingKey === currentChoicesKey) return;

        const [playerAId, playerBId] = hostRps.playerIds;
        if (!hostRps.choices?.[playerAId] || !hostRps.choices?.[playerBId]) return;

        setResolvingKey(currentChoicesKey);
        onResolveThrow();
    }, [currentChoicesKey, hostRps, isHost, onResolveThrow, resolvingKey]);

    if (!isSetupOpen && !hostRps) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                {isSetupOpen && !hostRps ? (
                    <SetupView players={players} onStart={onStart} onClose={onCloseSetup} t={t} />
                ) : (
                    <ActiveView
                        players={players}
                        hostRps={hostRps}
                        userId={userId}
                        isHost={isHost}
                        isSpectator={isSpectator}
                        onSubmitChoice={onSubmitChoice}
                        onCloseResult={onCloseResult}
                        trophyItems={trophyItems}
                        t={t}
                    />
                )}
            </div>
        </div>
    );
}
