import { useCallback, useEffect, useRef, useState } from 'react';
import { onSnapshot, runTransaction } from 'firebase/firestore';
import { createRoomSubscription } from '../utils/roomSubscription';

const EMPTY = { snapshot: null, data: null, status: 'connecting', errorCode: null };
const recoveryGroups = new Map();

export default function useRoomSubscription(roomRef, userId, { probeIdle = true, recoveryGroup = roomRef?.path } = {}) {
    const [state, setState] = useState(EMPTY);
    const generation = useRef(0);
    const reconnectRef = useRef(null);
    const reconnect = useCallback(() => reconnectRef.current?.(), []);

    useEffect(() => {
        const session = ++generation.current;
        if (!roomRef || !userId) return undefined;
        const controller = createRoomSubscription({
            probeIdle,
            subscribe: (next, error) => onSnapshot(roomRef, { includeMetadataChanges: true }, next, error),
            // Transaction lookups use BatchGetDocuments instead of the watch
            // stream. No writes, and one attempt bounds each probe's work.
            readServer: () => runTransaction(roomRef.firestore, (tx) => tx.get(roomRef), { maxAttempts: 1 }),
            publish: (update) => {
                if (generation.current !== session) return;
                setState((previous) => {
                    const base = previous.roomRef === roomRef && previous.userId === userId ? previous : EMPTY;
                    const next = { ...base, roomRef, userId, ...update };
                    if (Object.hasOwn(update, 'snapshot')) {
                        const data = update.snapshot?.data() ?? null;
                        const fingerprint = JSON.stringify(data);
                        next.data = fingerprint === base.fingerprint ? base.data : data;
                        next.fingerprint = fingerprint;
                        // Metadata is separate from data. Unchanged freshness reads
                        // must not invalidate the gameplay tree or navigation effects.
                        if (fingerprint === base.fingerprint && base.snapshot && update.snapshot
                            && base.snapshot.metadata.fromCache === update.snapshot.metadata.fromCache
                            && base.snapshot.metadata.hasPendingWrites === update.snapshot.metadata.hasPendingWrites) {
                            next.snapshot = base.snapshot;
                        }
                    }
                    return Object.keys(next).every((key) => next[key] === base[key]) ? previous : next;
                });
            }
        });
        const groupKey = `${roomRef.firestore.app.name}/${userId}/${recoveryGroup}`;
        const group = recoveryGroups.get(groupKey) || new Set();
        recoveryGroups.set(groupKey, group);
        group.add(controller);
        reconnectRef.current = () => group.forEach((member) => member.reconnect());
        return () => {
            generation.current += 1;
            reconnectRef.current = null;
            controller.dispose();
            group.delete(controller);
            if (!group.size) recoveryGroups.delete(groupKey);
        };
    }, [roomRef, userId, probeIdle, recoveryGroup]);

    const current = state.roomRef === roomRef && state.userId === userId ? state : EMPTY;
    return { snapshot: current.snapshot, data: current.data, status: current.status, errorCode: current.errorCode, reconnect };
}
