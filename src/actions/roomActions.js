import { collection, doc, getDocFromServer, runTransaction } from 'firebase/firestore';
import { appId, db } from '../firebase';
import { generateRoomCode } from '../utils/ids';

const MAX_CODE_ATTEMPTS = 10;
const dataCollection = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);

// Keep legacy numeric document IDs reserved forever so old results URLs stay valid.
export async function createRoom(roomData) {
    const roomRef = doc(dataCollection('rooms'));
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const roomCode = generateRoomCode();
        const codeRef = doc(dataCollection('roomCodes'), roomCode);
        const created = await runTransaction(db, async (transaction) => {
            const room = await transaction.get(roomRef);
            if (room.exists()) throw new Error('Game ID already exists');
            const legacy = await transaction.get(doc(dataCollection('rooms'), roomCode));
            const reservation = await transaction.get(codeRef);
            if (legacy.exists()) return false;
            if (reservation.exists()) {
                const previous = await transaction.get(doc(dataCollection('rooms'), reservation.data().gameId));
                if (!previous.exists() || previous.data().status !== 'finished') return false;
            }
            transaction.set(roomRef, { ...roomData, roomCode });
            transaction.set(codeRef, { gameId: roomRef.id });
            return true;
        });
        if (created) return roomRef.id;
    }
    throw new Error('Room code reservation attempts exhausted');
}

// Resolve inside the join transaction as well, so code reuse cannot race a join.
export async function getRoomByCode(code, read = getDocFromServer) {
    if (!/^\d{6}$/.test(code)) throw new Error('Invalid room code');
    const legacy = await read(doc(dataCollection('rooms'), code));
    if (legacy.exists()) return legacy;
    const reservation = await read(doc(dataCollection('roomCodes'), code));
    if (!reservation.exists()) return legacy;
    const gameId = reservation.data().gameId;
    if (!/^[A-Za-z0-9]{20}$/.test(gameId)) throw new Error('Invalid game ID');
    return read(doc(dataCollection('rooms'), gameId));
}
