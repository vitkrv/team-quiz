import { useEffect, useMemo, useRef, useState } from 'react';
import { SURPRISE_PLAYER_DRAW_MS } from '../actions/gameActions';

const BALL_COLORS = ['#facc15', '#38bdf8', '#fb7185', '#22c55e', '#a78bfa', '#f97316', '#f8fafc', '#f472b6'];
const EMPTY_CANDIDATES = [];

export default function SurprisePlayerDraw({ draw, players, serverNow, t }) {
    const trackRef = useRef(null);
    const mountedAt = useRef(serverNow());
    const startedAt = Number(draw.startedAt) || mountedAt.current;
    const durationMs = Number(draw.durationMs) || SURPRISE_PLAYER_DRAW_MS;
    const [isResultVisible, setIsResultVisible] = useState(() => serverNow() >= startedAt + durationMs);
    const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // Keep every candidate slot, even if a player's details disappear mid-draw.
    const candidateIds = draw.candidatePlayerIds || EMPTY_CANDIDATES;
    const winnerIndex = candidateIds.indexOf(draw.answererId);
    const hasWinner = winnerIndex !== -1;
    const stationary = reducedMotion || candidateIds.length <= 1 || !hasWinner;
    const startIndex = 2;
    const reel = useMemo(() => {
        if (!candidateIds.length) return { slots: [], endIndex: startIndex };
        const cycles = Math.ceil(18 / candidateIds.length);
        // Land on the stored winner's next occurrence after the full cycles.
        const endIndex = startIndex + cycles * candidateIds.length
            + (winnerIndex - (startIndex % candidateIds.length) + candidateIds.length) % candidateIds.length;
        return {
            endIndex,
            slots: Array.from({ length: endIndex + 5 }, (_, index) => candidateIds[index % candidateIds.length])
        };
    }, [candidateIds, winnerIndex]);

    useEffect(() => {
        const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
        const updatePreference = () => setReducedMotion(preference.matches);
        preference.addEventListener('change', updatePreference);
        return () => preference.removeEventListener('change', updatePreference);
    }, []);

    useEffect(() => {
        let frameId;
        let resultVisible;
        const update = () => {
            const progress = Math.min(1, Math.max(0, (serverNow() - startedAt) / durationMs));
            const finished = progress >= 1;
            const eased = 1 - (1 - progress) ** 3;
            const offset = stationary ? startIndex : startIndex + (reel.endIndex - startIndex) * eased;
            trackRef.current?.style.setProperty('--reel-offset', offset);
            if (finished !== resultVisible) {
                resultVisible = finished;
                setIsResultVisible(finished);
            }
            if (!finished) frameId = window.requestAnimationFrame(update);
        };
        update();
        return () => window.cancelAnimationFrame(frameId);
    }, [durationMs, reel.endIndex, serverNow, startedAt, stationary]);

    const selectedPlayer = players[draw.answererId];
    const selectedName = selectedPlayer?.name || t('playerFallback');
    const progress = Math.min(1, Math.max(0, (serverNow() - startedAt) / durationMs));
    const initialOffset = stationary ? startIndex : startIndex + (reel.endIndex - startIndex) * (1 - (1 - progress) ** 3);

    return (
        <div className="surprise-reel-overlay">
            <section className={`surprise-reel ${isResultVisible ? 'surprise-reel--result' : ''}`} role="dialog" aria-modal="true" aria-labelledby="surprise-reel-title">
                <h2 id="surprise-reel-title" className="surprise-reel__title">
                    {isResultVisible ? t('surpriseDrawPickedTitle') : t('surpriseDrawTitle')}
                </h2>
                <div className="surprise-reel__stage" aria-hidden="true">
                    <div className="surprise-reel__spotlight" />
                    <div className="surprise-reel__marker" />
                    {stationary ? (
                        <div className="surprise-reel__stationary">
                            <div className={`surprise-reel__ball ${isResultVisible ? 'surprise-reel__ball--selected' : ''}`} style={{ '--ball-color': BALL_COLORS[Math.max(0, winnerIndex) % BALL_COLORS.length] }}>
                                <span>{isResultVisible ? selectedPlayer?.avatar || '?' : '?'}</span>
                            </div>
                        </div>
                    ) : (
                        <div ref={trackRef} className="surprise-reel__track" style={{ '--reel-offset': initialOffset }}>
                            {reel.slots.map((playerId, index) => (
                                <div className="surprise-reel__slot" key={index}>
                                    <div
                                        className={`surprise-reel__ball ${index === reel.endIndex ? 'surprise-reel__ball--selected' : ''}`}
                                        style={{ '--ball-color': BALL_COLORS[(index % candidateIds.length) % BALL_COLORS.length] }}
                                    >
                                        <span>{players[playerId]?.avatar || '?'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="surprise-reel__caption">
                    <div className="surprise-reel__status">
                        {isResultVisible ? t('surpriseDrawPickedLabel') : t(candidateIds.length ? 'surpriseDrawInProgress' : 'surpriseDrawNoPlayers')}
                    </div>
                    {/* Reserve the full name's wrapped height before making it visible. */}
                    <div className="surprise-reel__name" aria-hidden="true">{selectedName}</div>
                </div>
                <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                    {isResultVisible ? `${t('surpriseDrawPickedLabel')}: ${selectedName}` : ''}
                </div>
            </section>
        </div>
    );
}
