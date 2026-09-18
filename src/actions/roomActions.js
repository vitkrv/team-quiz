import { createRecapSummary } from '../utils/achievements';
import { recapRef } from './gameRecap';
import { collection, doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { appendHistory, getPackSummary, packVersionRef, updateRoomInTransaction } from './gameStorage';
import { createHistoryItem } from './gameActions';
import { appId, db } from '../firebase';
import { generateRoomCode } from '../utils/ids';

const MAX_CODE_ATTEMPTS = 10;
const dataCollection = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);

// Keep legacy numeric document IDs reserved forever so old results URLs stay valid.
export async function createRoom(roomData) {
    const roomRef = doc(dataCollection('rooms'));
    const { pack, history = [], ...liveData } = roomData;
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
            transaction.set(roomRef, {
                ...liveData, roomCode, dataVersion: 2, recapVersion: 1,
                packSummary: getPackSummary(pack), packVersionId: null, questionStates: {}
            });
            transaction.set(codeRef, { gameId: roomRef.id });
            appendHistory(transaction, roomRef, history);
            return true;
        });
        if (created) return roomRef.id;
    }
    throw new Error('Room code reservation attempts exhausted');
}

export async function startGame(roomRef, actor, t) {
    const versionRef = doc(dataCollection('gamePackVersions'));
    const eventId = doc(collection(roomRef, 'history')).id;
    return runTransaction(roomRef.firestore, async (transaction) => {
        const snapshot = await transaction.get(roomRef);
        if (!snapshot.exists()) throw new Error('Room no longer exists');
        const room = snapshot.data();
        if (room.hostId !== actor.id) throw new Error('Only the host can start');
        if (room.status !== 'lobby') return false;
        let pack = room.pack;
        if (room.dataVersion === 2) {
            const source = await transaction.get(doc(dataCollection('packs'), room.packId));
            if (!source.exists()) throw new Error('Pack no longer exists');
            pack = source.data();
            if (pack.ownerId !== actor.id && pack.isPublic !== true) throw new Error('Pack is private');
        }
        if (!Array.isArray(pack?.categories)) throw new Error('Invalid pack');
        const questionStates = {};
        for (const category of pack.categories) {
            if (!Array.isArray(category.questions)) throw new Error('Invalid category');
            for (const question of category.questions) {
                if (typeof question.id !== 'string' || !question.id || Object.hasOwn(questionStates, question.id)) {
                    throw new Error('Invalid or duplicate question ID');
                }
                questionStates[question.id] = 'available';
            }
        }
        const playerIds = Object.keys(room.players).filter((id) => !room.players[id].isHost);
        const starterId = playerIds.length ? playerIds[Math.floor(Math.random() * playerIds.length)] : actor.id;
        const update = {
            status: pack.categories.length ? 'category_preview' : 'playing',
            categoryPreviewIndex: 0, currentTurn: starterId, questionStates,
            history: [createHistoryItem({
                id: eventId, type: 'game_started', actorId: actor.id, actorName: actor.name,
                message: t('historyGameStarted', { actorName: actor.name, playerName: room.players[starterId]?.name || t('hostLabel') }),
                details: { actorName: actor.name, playerName: room.players[starterId]?.name || t('hostLabel') }
            })]
        };
        if (room.recapVersion === 1) transaction.set(recapRef(roomRef), createRecapSummary(room.players));
        if (room.dataVersion === 2) {
            transaction.set(packVersionRef(roomRef, versionRef.id), {
                gameId: roomRef.id, sourcePackId: room.packId, schemaVersion: 1,
                createdAt: serverTimestamp(), content: pack
            });
            update.packVersionId = versionRef.id;
            update.packSummary = getPackSummary(pack);
        }
        await updateRoomInTransaction(transaction, roomRef, room, update);
        return { pack, players: room.players };
    }).catch(async (error) => {
        // Rules can reject a losing concurrent start before Firestore retries it.
        if (error.code === 'permission-denied') {
            const current = await getDocFromServer(roomRef);
            if (current.exists() && current.data().hostId === actor.id && current.data().status !== 'lobby') return false;
        }
        throw error;
    });
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
