export const BUZZER_POLICY_VERSION = 1;
export const BUZZ_OPEN_DELAY_MS = 2000;
export const BUZZ_COLLECTION_MS = 2000;
export const BUZZ_LOCAL_GRACE_MS = 1000;
export const EARLY_BUZZ_DELAY_MS = 2500;
export const LATE_BUZZ_WINDOW_MS = 3500;
export const LATE_BUZZ_NOTICE_MS = 3500;
export const ANSWER_WINDOW_MS = 10000;

// Wall time only restores an origin after a reload. Live reaction measurement
// always subtracts monotonic timestamps and is unaffected by clock resync.
export function createReactionOrigin({ savedAt, fallbackAt, wallNow, serverNow, monotonicNow }) {
    const elapsed = savedAt > 0 ? Math.max(0, wallNow - savedAt)
        : fallbackAt > 0 ? Math.max(0, serverNow - fallbackAt) : 0;
    return { wall: wallNow - elapsed, monotonic: monotonicNow - elapsed };
}

export const timestampMillis = (value) => value?.toMillis?.() ?? (Number(value) || 0);
export const personalUnlockAt = (race, uid) => Math.max(
    timestampMillis(race?.openedAt) + (race?.openingDelayMs || 0),
    Number(race?.penalties?.[uid]) || 0
);
export const collectionDeadline = (race) => timestampMillis(race?.firstAcceptedAt) + BUZZ_COLLECTION_MS;

// Local grace only controls input. Firestore still enforces the commit deadline.
export function buzzInputState({ race, uid, eligible, online, pending, submitted, competitive, localPenalty = 0,
    now, monotonicNow, origin }) {
    const active = Boolean(eligible && ['open', 'collecting'].includes(race?.phase)
        && !race.attempts[uid] && !submitted);
    const unlocked = active && now >= Math.max(personalUnlockAt(race, uid), localPenalty);
    const collecting = race?.phase === 'collecting';
    const collectionClosed = collecting && now >= collectionDeadline(race);
    const grace = origin === null || monotonicNow - origin < BUZZ_LOCAL_GRACE_MS;
    const canSubmit = unlocked && (!collectionClosed || grace);
    const canPenalize = active && race.phase === 'open' && competitive && !unlocked
        && !race.penalties[uid] && !localPenalty;
    return { unlocked, canClick: Boolean(online && !pending && (canSubmit || canPenalize)),
        collecting, collectionClosed };
}
export const rankBuzzAttempts = (attempts) => Object.values(attempts).sort((a, b) => (
    a.reactionMs - b.reactionMs
    || timestampMillis(a.acceptedAt) - timestampMillis(b.acceptedAt)
    || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)
));
