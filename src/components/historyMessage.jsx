const formatBuzzDelta = (deltaMs) => `+${(deltaMs / 1000).toFixed(2)}s`;

const PlayerName = ({ children }) => (
    <span className="font-black text-yellow-400 theme-accent">{children}</span>
);

const PointValue = ({ value, showSign = false }) => {
    const numericValue = Number(value) || 0;
    const color = numericValue >= 0 ? 'text-green-400 theme-positive' : 'text-red-400';
    const displayValue = showSign && numericValue > 0 ? `+${numericValue}` : numericValue;

    return <span className={`font-black ${color}`}>{displayValue}</span>;
};

export const HistoryMessage = ({ item, t }) => {
    const details = item.details || {};
    const fallbackName = item.actorName || t('hostLabel');

    switch (item.type) {
        case 'room_created':
            return <><PlayerName>{details.hostName || fallbackName}</PlayerName> {t('historyViewCreatedRoom')}</>;
        case 'game_started':
            return <><PlayerName>{details.actorName || fallbackName}</PlayerName> {t('historyViewStartedGame')} {t('historyViewFirst')} <PlayerName>{details.playerName || t('playerFallback')}</PlayerName></>;
        case 'round_completed':
            return t('roundComplete', { round: details.round });
        case 'round_started':
            return t('roundStarted', { round: details.round });
        case 'game_finished':
            return <><PlayerName>{details.actorName || fallbackName}</PlayerName> {t('historyViewEndedGame')}</>;
        case 'question_picked':
            return <><PlayerName>{details.actorName || fallbackName}</PlayerName> {t('historyViewPicked')} &quot;{details.categoryName || t('question')}&quot; {t('historyViewFor')} <PointValue value={details.points} /></>;
        case 'player_buzzed_early':
            return <><PlayerName>{details.actorName || fallbackName}</PlayerName> {t('recapEarlyBuzz')}</>;
        case 'player_buzzed':
            return <><PlayerName>{details.actorName || fallbackName}</PlayerName> {t('historyViewBuzzed')}</>;
        case 'player_buzzed_late':
            return <><PlayerName>{details.actorName || fallbackName}</PlayerName> {t(details.timingPolicy === 1 ? (details.deltaMs === 0 ? 'historyReactionTie' : 'historyReactionLate') : 'historyViewBuzzedLate', {
                playerName: details.playerName || t('playerFallback'),
                delta: formatBuzzDelta(Number(details.deltaMs) || 0)
            })}</>;
        case 'answer_correct':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewCorrect')}, <PointValue value={details.points} showSign /></>;
        case 'answer_incorrect':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewIncorrect')}{details.points ? <>, <PointValue value={details.points} showSign /></> : null}</>;
        case 'surprise_answer_correct':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewSurpriseCorrect')}</>;
        case 'surprise_answer_incorrect':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewSurpriseIncorrect')}</>;
        case 'surprise_wheel_rolled':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewWheelResult')} <PointValue value={details.points} showSign /></>;
        case 'surprise_table_picked':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewTableResult')} <PointValue value={details.points} showSign /></>;
        case 'question_skipped':
            return <>{t('historyViewSkipped')} &quot;{details.categoryName || t('question')}&quot; {t('historyViewFor')} <PointValue value={details.points} /></>;
        case 'board_resumed':
            return <>{t('historyViewBackToBoard')}</>;
        case 'surprise_wheel_scored':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('recapWheelScored')} <PointValue value={details.points} showSign /></>;
        case 'score_reverted':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> <span className="break-all">{t('scoreHistoryReverted', { eventId: details.revertsEventId })}</span> <PointValue value={details.delta} showSign /> → {details.nextScore}</>;
        case 'score_adjusted':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewScore')} <PointValue value={details.delta} showSign /> → {details.nextScore}</>;
        case 'score_set':
            return <><PlayerName>{details.playerName || t('playerFallback')}</PlayerName> {t('historyViewScore')} {details.previousScore} → {details.nextScore} (<PointValue value={details.delta} showSign />)</>;
        case 'host_rps_completed':
            return <><PlayerName>{details.winnerName || t('playerFallback')}</PlayerName> {t('historyViewHostRpsWon')} <PlayerName>{details.playerAName || t('playerFallback')}</PlayerName> {t('historyViewHostRpsVs')} <PlayerName>{details.playerBName || t('playerFallback')}</PlayerName></>;
        default:
            return item.message;
    }
};

