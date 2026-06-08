import { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { RPS_CHOICES } from '../actions/gameActions';
import FloatingEmojiBackground from './FloatingEmojiBackground';
import { createFloatingBackgroundItems } from '../utils/floatingBackground';

const CHOICE_ORDER = ['rock', 'paper', 'scissors'];
const TROPHY_BACKGROUND_COUNT = 20;
const TROPHY_BACKGROUND_EMOJIS = ['\u{1F3C6}'];

const getPlayer = (players, playerId) => players[playerId] || {};

const getPlayerName = (players, playerId, t) => getPlayer(players, playerId).name || t('playerFallback');

const getPlayerAvatar = (players, playerId) => getPlayer(players, playerId).avatar || '🙂';

const getLatestThrow = (match) => {
    const throws = match?.throws || [];
    return throws.length > 0 ? throws[throws.length - 1] : null;
};

const getPlayerThrowResult = (latestThrow, playerId) => {
    if (!latestThrow?.choices?.[playerId]) return null;
    if (latestThrow.isTie) return 'tie';
    return latestThrow.winnerId === playerId ? 'winner' : 'loser';
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

function PlayerChip({ players, playerId, t, isSelected, onClick, disabled }) {
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
            <span className="text-2xl">{getPlayerAvatar(players, playerId)}</span>
            <span className="truncate font-bold">{getPlayerName(players, playerId, t)}</span>
        </button>
    );
}

function SetupView({ participantIds, players, isHost, onStart, onClose, t }) {
    const [mode, setMode] = useState('one');

    return (
        <>
            <div className="border-b border-slate-800 p-5">
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-black text-white">{t('rpsSetupTitle')}</h2>
                    {onClose && (
                        <button onClick={onClose} className="text-slate-500 hover:text-white" aria-label={t('closeMedia')}>
                            <X size={22} />
                        </button>
                    )}
                </div>
                <p className="mt-2 text-sm font-medium text-slate-400">{t('rpsSetupDescription')}</p>
            </div>
            <div className="space-y-5 p-5">
                <div>
                    <div className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">{t('rpsTiedPlayers')}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {participantIds.map((playerId) => (
                            <div key={playerId} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                                <span className="text-2xl">{getPlayerAvatar(players, playerId)}</span>
                                <span className="truncate font-bold text-slate-100">{getPlayerName(players, playerId, t)}</span>
                            </div>
                        ))}
                    </div>
                </div>
                {isHost ? (
                    <>
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
                            onClick={() => onStart(mode)}
                            className="w-full rounded-xl bg-yellow-500 px-5 py-3 font-black text-slate-950 hover:bg-yellow-400"
                        >
                            {t('rpsStartTieBreaker')}
                        </button>
                    </>
                ) : (
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-center font-bold text-slate-400">
                        {t('rpsWaitingForHostSetup')}
                    </div>
                )}
            </div>
        </>
    );
}

function PairingView({ tieBreaker, players, isHost, selectedPair, setSelectedPair, onSelectPair, onGrantBye, t }) {
    const availableIds = tieBreaker.roundPlayerIds || [];
    const advancedIds = tieBreaker.nextRoundPlayerIds || [];
    const togglePlayer = (playerId) => {
        if (!isHost) return;
        if (selectedPair.includes(playerId)) {
            setSelectedPair(selectedPair.filter((id) => id !== playerId));
            return;
        }
        setSelectedPair([...selectedPair, playerId].slice(-2));
    };

    return (
        <div className="space-y-5 p-5">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500">{t('rpsRoundLabel', { round: tieBreaker.round })}</div>
                <div className="mt-1 text-lg font-black text-white">{t('rpsPairingTitle')}</div>
                <p className="mt-1 text-sm font-medium text-slate-400">
                    {isHost ? t('rpsHostPickPair') : t('rpsWaitingForHostPair')}
                </p>
            </div>
            {advancedIds.length > 0 && (
                <div>
                    <div className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">{t('rpsAdvanced')}</div>
                    <div className="flex flex-wrap gap-2">
                        {advancedIds.map((playerId) => (
                            <span key={playerId} className="inline-flex min-w-0 items-center gap-2 rounded-full bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
                                <Check size={15} />
                                <span className="truncate">{getPlayerName(players, playerId, t)}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
                {availableIds.map((playerId) => (
                    <PlayerChip
                        key={playerId}
                        players={players}
                        playerId={playerId}
                        t={t}
                        isSelected={selectedPair.includes(playerId)}
                        onClick={() => togglePlayer(playerId)}
                        disabled={!isHost}
                    />
                ))}
            </div>
            {isHost && (
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                        type="button"
                        onClick={() => onSelectPair(selectedPair[0], selectedPair[1])}
                        disabled={selectedPair.length !== 2}
                        className="flex-1 rounded-xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500"
                    >
                        {t('rpsStartMatch')}
                    </button>
                    {availableIds.length === 1 && (
                        <button
                            type="button"
                            onClick={() => onGrantBye(availableIds[0])}
                            className="flex-1 rounded-xl border border-green-500/40 bg-green-500/10 px-5 py-3 font-black text-green-200 hover:bg-green-500/20"
                        >
                            {t('rpsGrantBye', { playerName: getPlayerName(players, availableIds[0], t) })}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function ChoiceStatus({ playerId, players, match, latestThrow, celebrationPlayerId, championId, trophyItems, t }) {
    const choices = match.choices || {};
    const bothPicked = match.playerIds.every((id) => choices[id]);
    const choice = choices[playerId];
    const hasPendingChoices = Object.keys(choices).length > 0;
    const isCompleteMatch = Boolean(match.winnerId);
    const shouldShowLatestThrow = (!hasPendingChoices || isCompleteMatch) && Boolean(latestThrow);
    const latestChoice = latestThrow?.choices?.[playerId];
    const displayedChoice = bothPicked ? choice : shouldShowLatestThrow ? latestChoice : null;
    const result = bothPicked || (hasPendingChoices && !isCompleteMatch) ? null : getPlayerThrowResult(latestThrow, playerId);
    const hasChoice = Boolean(choice || displayedChoice);
    const isCelebrated = celebrationPlayerId === playerId;
    const isChampion = championId === playerId;
    const statusLabel = result === 'winner'
        ? t('rpsThrowWon')
        : result === 'loser'
            ? t('rpsThrowLost')
            : result === 'tie'
                ? t('rpsThrowTied')
                : choice
                    ? t('rpsPicked')
                    : t('rpsNotPicked');

    return (
        <div className={`relative flex min-w-0 flex-1 flex-col items-center overflow-hidden rounded-xl border p-4 text-center ${getResultPanelClassName(result)}`}>
            {isCelebrated && <FloatingEmojiBackground items={trophyItems} className="inset-0" />}
            <div className="relative mb-2 text-4xl">{getPlayerAvatar(players, playerId)}</div>
            <div className="relative max-w-full truncate text-lg font-black text-white">{getPlayerName(players, playerId, t)}</div>
            <div className="relative mt-4 flex h-20 w-20 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-5xl">
                {displayedChoice ? RPS_CHOICES[displayedChoice].emoji : '?'}
            </div>
            <div className={`relative mt-3 text-sm font-black ${getResultTextClassName(result, hasChoice)}`}>
                {statusLabel}
            </div>
            {isChampion && (
                <div className="relative mt-2 rounded-full bg-yellow-400/15 px-3 py-1 text-xs font-black uppercase tracking-widest text-yellow-200">
                    {t('rpsChampionBadge')}
                </div>
            )}
        </div>
    );
}

function MatchView({ tieBreaker, players, userId, isHost, onSubmitChoice, onAdvanceMatch, onFinish, trophyItems, t }) {
    const match = tieBreaker.currentMatch;
    const [playerAId, playerBId] = match.playerIds;
    const choices = match.choices || {};
    const bothPicked = choices[playerAId] && choices[playerBId];
    const isCompleteMatch = Boolean(match.winnerId);
    const isChampionState = tieBreaker.status === 'champion';
    const celebrationPlayerId = tieBreaker.championId || match.winnerId || null;
    const isCurrentPlayer = match.playerIds.includes(userId);
    const hasPicked = Boolean(choices[userId]);
    const latestThrow = getLatestThrow(match);

    return (
        <div className="space-y-5 p-5">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-center">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500">{t('rpsRoundLabel', { round: tieBreaker.round })}</div>
                <div className="mt-1 text-lg font-black text-white">
                    {getPlayerName(players, playerAId, t)} <span className="text-slate-500">vs</span> {getPlayerName(players, playerBId, t)}
                </div>
                <div className="mt-2 font-mono text-xl font-black text-yellow-300">
                    {(match.wins?.[playerAId] || 0)} : {(match.wins?.[playerBId] || 0)}
                </div>
                <div className="mt-1 text-sm font-bold text-slate-400">{t('rpsTargetWins', { count: tieBreaker.targetWins })}</div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
                <ChoiceStatus playerId={playerAId} players={players} match={match} latestThrow={latestThrow} celebrationPlayerId={celebrationPlayerId} championId={tieBreaker.championId} trophyItems={trophyItems} t={t} />
                <ChoiceStatus playerId={playerBId} players={players} match={match} latestThrow={latestThrow} celebrationPlayerId={celebrationPlayerId} championId={tieBreaker.championId} trophyItems={trophyItems} t={t} />
            </div>
            {bothPicked && !isCompleteMatch && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-center font-black text-blue-200">
                    {isHost ? t('rpsResolving') : t('rpsWaitingForReveal')}
                </div>
            )}
            {isCompleteMatch && isHost && isChampionState ? (
                <button
                    type="button"
                    onClick={onFinish}
                    className="w-full rounded-xl bg-purple-600 px-5 py-3 font-black text-white hover:bg-purple-500"
                >
                    {t('showFinalResults')}
                </button>
            ) : isCompleteMatch && isHost ? (
                <button
                    type="button"
                    onClick={onAdvanceMatch}
                    className="w-full rounded-xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-500"
                >
                    {t('rpsEndRound')}
                </button>
            ) : isCompleteMatch ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-center font-bold text-slate-400">
                    {isChampionState ? t('rpsWaitingForFinalResults') : t('rpsWaitingForHostEndRound')}
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
    );
}

export default function RockPaperScissorsManager({
    players,
    participantIds = [],
    tieBreaker,
    userId,
    isHost,
    onClose,
    onStart,
    onSelectPair,
    onGrantBye,
    onSubmitChoice,
    onResolveThrow,
    onAdvanceMatch,
    onFinish,
    t
}) {
    const [selectedPair, setSelectedPair] = useState([]);
    const [resolvingMatchId, setResolvingMatchId] = useState(null);
    const currentMatch = tieBreaker?.currentMatch;
    const trophyItems = useMemo(
        () => createFloatingBackgroundItems({
            seed: `${tieBreaker?.championId || 'rps'}:${currentMatch?.id || ''}`,
            count: TROPHY_BACKGROUND_COUNT,
            emojis: TROPHY_BACKGROUND_EMOJIS
        }),
        [currentMatch?.id, tieBreaker?.championId]
    );
    const choicesKey = useMemo(() => {
        if (!currentMatch?.playerIds) return '';
        const [playerAId, playerBId] = currentMatch.playerIds;
        return `${currentMatch.id}:${currentMatch.throws?.length || 0}:${currentMatch.choices?.[playerAId] || ''}:${currentMatch.choices?.[playerBId] || ''}`;
    }, [currentMatch]);

    useEffect(() => {
        setSelectedPair([]);
    }, [tieBreaker?.round, tieBreaker?.currentMatch?.id]);

    useEffect(() => {
        if (!isHost || !currentMatch?.playerIds || resolvingMatchId === choicesKey) return;

        const [playerAId, playerBId] = currentMatch.playerIds;
        if (!currentMatch.choices?.[playerAId] || !currentMatch.choices?.[playerBId]) return;

        setResolvingMatchId(choicesKey);
        onResolveThrow();
    }, [choicesKey, currentMatch, isHost, onResolveThrow, resolvingMatchId]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                {!tieBreaker && (
                    <SetupView
                        participantIds={participantIds}
                        players={players}
                        isHost={isHost}
                        onStart={onStart}
                        onClose={onClose}
                        t={t}
                    />
                )}
                {tieBreaker?.status === 'pairing' && (
                    <>
                        <div className="flex items-center justify-between border-b border-slate-800 p-5">
                            <h2 className="text-xl font-black text-white">{t('rpsTitle')}</h2>
                            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase tracking-widest text-yellow-300">
                                {tieBreaker.targetWins === 3 ? t('rpsModeThree') : t('rpsModeOne')}
                            </span>
                        </div>
                        <PairingView
                            tieBreaker={tieBreaker}
                            players={players}
                            isHost={isHost}
                            selectedPair={selectedPair}
                            setSelectedPair={setSelectedPair}
                            onSelectPair={onSelectPair}
                            onGrantBye={onGrantBye}
                            t={t}
                        />
                    </>
                )}
                {(tieBreaker?.status === 'match' || tieBreaker?.status === 'champion') && currentMatch && (
                    <>
                        <div className="flex items-center justify-between border-b border-slate-800 p-5">
                            <h2 className="text-xl font-black text-white">{t('rpsTitle')}</h2>
                            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase tracking-widest text-yellow-300">
                                {tieBreaker.targetWins === 3 ? t('rpsModeThree') : t('rpsModeOne')}
                            </span>
                        </div>
                        <MatchView
                            tieBreaker={tieBreaker}
                            players={players}
                            userId={userId}
                            isHost={isHost}
                            onSubmitChoice={onSubmitChoice}
                            onAdvanceMatch={onAdvanceMatch}
                            onFinish={onFinish}
                            trophyItems={trophyItems}
                            t={t}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
