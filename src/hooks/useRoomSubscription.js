import { useCallback, useEffect, useRef, useState } from 'react';
import { onSnapshot, runTransaction } from 'firebase/firestore';
import { createRoomSubscription } from '../utils/roomSubscription';

const EMPTY = { snapshot: null, status: 'connecting', errorCode: null };

export default function useRoomSubscription(roomRef, userId) {
    const [state, setState] = useState(EMPTY);
    const generation = useRef(0);
    const reconnectRef = useRef(null);
    const reconnect = useCallback(() => reconnectRef.current?.(), []);

    useEffect(() => {
        const session = ++generation.current;
        if (!roomRef || !userId) return undefined;
        const controller = createRoomSubscription({
            subscribe: (next, error) => onSnapshot(roomRef, { includeMetadataChanges: true }, next, error),
            // Transaction lookups use BatchGetDocuments instead of the watch
            // stream. No writes, and one attempt bounds each probe's work.
            readServer: () => runTransaction(roomRef.firestore, (tx) => tx.get(roomRef), { maxAttempts: 1 }),
            publish: (update) => {
                if (generation.current !== session) return;
                setState((previous) => ({
                    ...(previous.roomRef === roomRef && previous.userId === userId ? previous : EMPTY),
                    roomRef, userId, ...update
                }));
            }
        });
        reconnectRef.current = controller.reconnect;
        return () => {
            generation.current += 1;
            reconnectRef.current = null;
            controller.dispose();
        };
    }, [roomRef, userId]);

    const current = state.roomRef === roomRef && state.userId === userId ? state : EMPTY;
    return { snapshot: current.snapshot, status: current.status, errorCode: current.errorCode, reconnect };
}
