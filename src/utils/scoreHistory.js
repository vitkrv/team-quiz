const pointEvents = new Set(['answer_correct', 'answer_incorrect', 'surprise_table_picked', 'surprise_wheel_scored']);
const manualEvents = new Set(['score_set', 'score_adjusted', 'score_reverted']);

// Never identify a contestant by display name: names are not unique.
export function scoreHistoryChange(event) {
    const d = event.details || {};
    if (!d.playerId) return null;
    let delta;
    if (manualEvents.has(event.type)) {
        delta = Number.isSafeInteger(d.delta) ? d.delta
            : Number.isSafeInteger(d.previousScore) && Number.isSafeInteger(d.nextScore) ? d.nextScore - d.previousScore : null;
    } else if (pointEvents.has(event.type)) delta = d.points;
    // Old wheel awards predate the separate start/award events and spin identity.
    else if (event.type === 'surprise_wheel_rolled' && !d.spinId) delta = d.delta ?? d.points;
    if (!Number.isSafeInteger(delta) || delta === 0) return null;
    return { playerId: d.playerId, delta };
}

export async function reversalEventId(eventId) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(eventId));
    return 'revert_' + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const validScore = (value) => /^-?\d+$/.test(String(value)) && Number.isSafeInteger(Number(value));

export const selectPlayerScoreHistory = (events, playerId) => events
    .filter((event) => scoreHistoryChange(event)?.playerId === playerId).slice(0, 3);

export function compareHistoryEvents(a, b) {
    const time = a.recordedAt || b.recordedAt
        ? (b.recordedAt?.seconds || 0) - (a.recordedAt?.seconds || 0)
            || (b.recordedAt?.nanoseconds || 0) - (a.recordedAt?.nanoseconds || 0)
        : (b.timestamp || 0) - (a.timestamp || 0);
    if (time) return time;
    if (a.details?.saveOperationId && a.details.saveOperationId === b.details?.saveOperationId) {
        return b.details.batchIndex - a.details.batchIndex;
    }
    const aGroup = a.details?.saveOperationId ? 'score_edit_' + a.details.saveOperationId : a.id;
    const bGroup = b.details?.saveOperationId ? 'score_edit_' + b.details.saveOperationId : b.id;
    return aGroup < bGroup ? 1 : aGroup > bGroup ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}
