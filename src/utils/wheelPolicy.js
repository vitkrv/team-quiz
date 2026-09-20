export const WHEEL_ANIMATION_MS = 6000;

export const hasPendingSurpriseAward = (room) => Boolean(
    room.surpriseRound?.judgeResult && !room.surpriseRound?.scoreAppliedAt
);

export const isCurrentGame = (room) => room.dataVersion === 2
    && room.recapVersion === 1 && room.buzzerPolicyVersion === 1;

// Evaluate the existing CSS cubic-bezier(0.12, 0.72, 0.16, 1) at shared elapsed time.
export function wheelEasing(progress) {
    const p = Math.max(0, Math.min(1, progress));
    const bezier = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
    let low = 0, high = 1;
    for (let i = 0; i < 20; i++) {
        const mid = (low + high) / 2;
        if (bezier(mid, 0.12, 0.16) < p) low = mid;
        else high = mid;
    }
    return p === 0 || p === 1 ? p : bezier((low + high) / 2, 0.72, 1);
}
