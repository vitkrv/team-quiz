import { doc, getDocFromServer } from 'firebase/firestore';
import { createHistoryItem } from './gameActions';
import { runRoomTransaction, updateRoomInTransaction } from './gameStorage';
import { reversalEventId, scoreHistoryChange } from '../utils/scoreHistory';

const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id);
const failure = (code) => Object.assign(new Error(code), { code });

export async function savePlayerScore(roomRef, { playerId, operationId, manualDelta, sourceEventIds, actor }) {
    if (!validId(playerId) || !validId(operationId) || !actor?.id || !Number.isSafeInteger(manualDelta)
        || !Array.isArray(sourceEventIds) || sourceEventIds.length > 3
        || !sourceEventIds.every(validId) || new Set(sourceEventIds).size !== sourceEventIds.length) throw failure('score-edit-invalid');
    const reverseIds = await Promise.all(sourceEventIds.map(reversalEventId));
    const eventIds = [...reverseIds, ...(manualDelta ? ['score_edit_' + operationId] : [])];
    if (!eventIds.length) return;
    const isCommitted = (events) => eventIds.every((id) => events.some((e) => e?.id === id
        && e.actorId === actor.id && e.details?.saveOperationId === operationId));
    try {
        return await runRoomTransaction(roomRef, async (transaction, room) => {
            if (!room || room.hostId !== actor.id) throw failure('score-edit-forbidden');
            const legacy = room.dataVersion !== 2;
            const ids = [...new Set([...eventIds, ...sourceEventIds])];
            const events = legacy ? room.history || [] : (await Promise.all(ids.map((id) => transaction.get(doc(roomRef, 'history', id)))))
                .filter((s) => s.exists()).map((s) => ({ ...s.data(), id: s.id }));
            if (isCommitted(events)) return;
            if (room.status === 'finished') throw failure('score-edit-finished');
            const player = room.players?.[playerId];
            if (!player || player.isHost) throw failure('score-edit-invalid');
            if (eventIds.some((id) => events.some((e) => e.id === id))) throw failure('score-edit-conflict');
            let score = Number(room.players[playerId].score) || 0;
            const previousScore = score;
            const history = sourceEventIds.map((id, index) => {
                const source = events.find((e) => e.id === id);
                const change = source && scoreHistoryChange(source);
                if (!change || change.playerId !== playerId) throw failure('score-edit-invalid');
                return { id: reverseIds[index], type: 'score_reverted', delta: -change.delta, revertsEventId: id };
            });
            if (manualDelta) history.push({ id: 'score_edit_' + operationId, type: 'score_adjusted', delta: manualDelta });
            const items = history.map((item, index) => {
                const before = score;
                score += item.delta;
                if (!Number.isSafeInteger(score)) throw failure('score-edit-invalid');
                return createHistoryItem({ id: item.id, type: item.type, actorId: actor.id, actorName: actor.name,
                    message: '', details: { playerId, playerName: player.name, delta: item.delta,
                        previousScore: before, nextScore: score, saveOperationId: operationId, batchIndex: index,
                        ...(item.revertsEventId ? { revertsEventId: item.revertsEventId } : {}) } });
            });
            await updateRoomInTransaction(transaction, roomRef, room, {
                [`players.${playerId}.score`]: score,
                lastScoreEdit: { operationId, playerId, eventIds, previousScore, nextScore: score }, history: items
            });
        });
    } catch (error) {
        // An immutable-event race may be rejected before the SDK retries.
        if (error.code === 'permission-denied') {
            const room = (await getDocFromServer(roomRef)).data();
            if (room?.hostId === actor.id) {
                const events = room.dataVersion === 2
                    ? (await Promise.all(eventIds.map((id) => getDocFromServer(doc(roomRef, 'history', id)))))
                        .filter((s) => s.exists()).map((s) => ({ ...s.data(), id: s.id })) : room.history || [];
                if (isCommitted(events)) return;
                if (reverseIds.some((id) => events.some((e) => e.id === id))) throw failure('score-edit-conflict');
            }
        }
        throw error;
    }
}
