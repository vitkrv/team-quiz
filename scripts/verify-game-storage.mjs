// Isolated integration checks. Requires a running Firestore Emulator, never production.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { initializeApp, deleteApp } from 'firebase/app';
import {
    collection, connectFirestoreEmulator, deleteDoc, doc, documentId, getDocFromServer,
    getDocs, getFirestore, limit, orderBy, query, runTransaction, serverTimestamp,
    setDoc, startAfter, terminate, updateDoc, writeBatch
} from 'firebase/firestore';

const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(endpoint || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Set FIRESTORE_EMULATOR_HOST to a local emulator');
const projectId = 'demo-game-storage';
const namespace = `storage-check-${Date.now()}`;
const clients = [];
const client = (uid, owner = false) => {
    const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `${namespace}-${uid}`);
    const db = getFirestore(app);
    const [host, port] = endpoint.split(':');
    connectFirestoreEmulator(db, host, Number(port), {
        mockUserToken: owner ? 'owner' : { sub: uid, user_id: uid, firebase: { sign_in_provider: 'google.com' } }
    });
    clients.push({ app, db });
    return db;
};
const hostDb = client('host');
const playerDb = client('player');
const lateDb = client('late');
const spectatorDb = client('spectator');
const adminDb = client('admin');
const seedDb = client('seed', true);
const ref = (db, name, id) => doc(db, 'artifacts', namespace, 'public', 'data', name, id);
const roomRef = (db, id) => ref(db, 'rooms', id);
const eventRef = (db, gameId, id) => doc(roomRef(db, gameId), 'history', id);
const t = (key) => key;
let checks = 0;
async function check(label, fn) {
    await fn();
    checks += 1;
    console.log(`PASS ${label}`);
}
const denied = (promise) => assert.rejects(promise, (error) => error.code === 'permission-denied');

try {
    const response = await fetch(`http://${endpoint}/emulator/v1/projects/${projectId}:securityRules`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: await readFile('firestore.rules', 'utf8') }] } })
    });
    assert.equal(response.ok, true, await response.text());
    // Bundle actual application actions, replacing only the environment-owned Firebase module.
    globalThis.__gameStorageTest = { db: hostDb, appId: namespace };
    await mkdir('.firebase/validation', { recursive: true });
    await build({
        stdin: { contents: "export * from './src/actions/roomActions.js'; export * from './src/actions/gameActions.js'; export * from './src/actions/gameStorage.js';", resolveDir: process.cwd() },
        bundle: true, platform: 'node', format: 'esm', external: ['firebase/firestore'],
        outfile: '.firebase/validation/actions.mjs',
        plugins: [{ name: 'emulator-config', setup(builder) {
            builder.onResolve({ filter: /(^|\/)firebase$/ }, () => ({ path: 'emulator-config', namespace: 'test' }));
            builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const { db, appId } = globalThis.__gameStorageTest;' }));
        } }]
    });
    const actions = await import(pathToFileURL(resolve('.firebase/validation/actions.mjs')));
    const event = (type, uid = 'host', details = {}) => actions.createHistoryItem({ type, actorId: uid, actorName: uid, message: type, details });
    const pack = { ownerId: 'host', isPublic: false, name: 'Initial', iconEmoji: '🧠', categories: [{ id: 'cat', name: 'Category', questions: [{ id: 'q1', text: 'Before start', answer: 'A', points: 100, isSurpriseQuestion: true }] }] };
    await setDoc(ref(hostDb, 'packs', 'pack'), pack);
    await setDoc(doc(seedDb, 'artifacts', namespace, 'users', 'admin'), { admin: true });
    const newRoom = () => actions.createRoom({
        hostId: 'host', packId: 'pack', pack, status: 'lobby', trueCompetitiveMode: false,
        players: { host: { name: 'host', score: 0, isHost: true }, player: { name: 'player', score: 0, isHost: false }, late: { name: 'late', score: 0, isHost: false } },
        questionStates: {}, activeQuestionId: null, answerRevealed: false, buzzedPlayerId: null,
        buzzTimestamp: null, buzzUnlockAt: 0, buzzAttempts: {}, incorrectBuzzedIds: [],
        history: [event('room_created')]
    });
    const id = await newRoom();
    const hostRoom = roomRef(hostDb, id);
    await check('new room and invitation reservation are compact and atomic', async () => {
        const room = (await getDocFromServer(hostRoom)).data();
        assert.equal(room.dataVersion, 2);
        assert.equal(room.packVersionId, null);
        assert.equal('pack' in room || 'history' in room, false);
        assert.equal((await getDocFromServer(ref(hostDb, 'roomCodes', room.roomCode))).data().gameId, id);
        assert.equal((await getDocs(collection(hostRoom, 'history'))).size, 1);
    });
    const creation = (await getDocs(collection(hostRoom, 'history'))).docs[0];
    await check('only host can read/list history, including unrelated admin denial', async () => {
        for (const db of [playerDb, spectatorDb, adminDb]) {
            await denied(getDocFromServer(eventRef(db, id, creation.id)));
            await denied(getDocs(collection(roomRef(db, id), 'history')));
        }
    });
    await check('embedded fields, data-version downgrade and spectator writes are denied', async () => {
        for (const update of [{ pack }, { history: [] }, { dataVersion: 1 }]) await denied(updateDoc(hostRoom, update));
        await denied(setDoc(eventRef(spectatorDb, id, 'fake'), { ...event('room_created', 'spectator'), id: 'fake', recordedAt: serverTimestamp() }));
    });
    const latestPack = { ...pack, name: 'Latest', categories: [{ ...pack.categories[0], questions: [{ ...pack.categories[0].questions[0], text: 'At start' }] }] };
    await updateDoc(ref(hostDb, 'packs', 'pack'), latestPack);
    await check('concurrent starts pin exactly one latest immutable snapshot and event', async () => {
        const starts = await Promise.all([actions.startGame(hostRoom, { id: 'host', name: 'host' }, t), actions.startGame(hostRoom, { id: 'host', name: 'host' }, t)]);
        assert.equal(starts.filter(Boolean).length, 1);
        assert.equal((await getDocs(collection(hostRoom, 'history'))).size, 2);
        const versions = await getDocs(collection(hostDb, 'artifacts', namespace, 'public', 'data', 'gamePackVersions'));
        assert.equal(versions.size, 1);
        assert.deepEqual(versions.docs[0].data().content, latestPack);
    });
    let room = (await getDocFromServer(hostRoom)).data();
    const versionId = room.packVersionId;
    const version = ref(hostDb, 'gamePackVersions', versionId);
    await check('all roles load same snapshot; later source edits do not affect it', async () => {
        await updateDoc(ref(hostDb, 'packs', 'pack'), { name: 'Edited later', categories: [] });
        for (const db of [hostDb, playerDb, spectatorDb]) assert.deepEqual((await getDocFromServer(ref(db, 'gamePackVersions', versionId))).data().content, latestPack);
        await denied(updateDoc(version, { 'content.name': 'Changed' }));
        await denied(deleteDoc(version));
        await denied(updateDoc(hostRoom, { packVersionId: 'other' }));
        await denied(updateDoc(hostRoom, { status: 'finished' }));
    });
    await check('forged or standalone snapshot creation cannot start a game', async () => {
        const pendingId = await newRoom();
        const fakeVersion = ref(hostDb, 'gamePackVersions', 'forged-version');
        const data = { gameId: pendingId, sourcePackId: 'pack', schemaVersion: 1, createdAt: serverTimestamp(), content: latestPack };
        await denied(setDoc(fakeVersion, data));
        const batch = writeBatch(hostDb);
        batch.set(fakeVersion, data);
        batch.update(roomRef(hostDb, pendingId), { status: 'playing', packVersionId: fakeVersion.id });
        await denied(batch.commit()); // Source was edited: this is no longer its current content.
        assert.equal((await getDocFromServer(roomRef(hostDb, pendingId))).data().status, 'lobby');
        assert.equal((await getDocFromServer(fakeVersion)).exists(), false);
    });
    await updateDoc(hostRoom, { status: 'playing' });
    await check('surprise draw transactions read the separated snapshot', async () => {
        assert.equal(await actions.beginSurprisePlayerDraw(hostRoom, 'q1', 'host', 'player'), true);
        room = (await getDocFromServer(hostRoom)).data();
        assert.equal(await actions.completeSurprisePlayerDraw(hostRoom, room.surprisePlayerDraw.id, 'host', event('question_picked')), true);
    });
    await updateDoc(hostRoom, { activeQuestionId: null, surpriseRound: null });
    await actions.handlePickQuestion(hostRoom, 'q1', 'host', event('question_picked'), {}, () => 1000);
    const buzz = async (db, uid, clickedAt, type) => runTransaction(db, async (transaction) => {
        const target = roomRef(db, id);
        const before = (await transaction.get(target)).data();
        actions.updateRoomInTransaction(transaction, target, before, {
            ...(type === 'player_buzzed' ? { buzzedPlayerId: uid, buzzTimestamp: clickedAt } : {}),
            buzzAttempts: { ...before.buzzAttempts, [uid]: { clickedAt, questionId: 'q1' } },
            history: [event(type, uid, { actorName: uid, ...(type === 'player_buzzed_late' ? { playerName: 'player', deltaMs: clickedAt - before.buzzTimestamp } : {}) })]
        });
    });
    await check('accepted and late player buzzes append history without history read permission', async () => {
        await buzz(playerDb, 'player', 3100, 'player_buzzed');
        await buzz(lateDb, 'late', 3200, 'player_buzzed_late');
        await denied(getDocs(collection(roomRef(playerDb, id), 'history')));
        await denied(actions.updateRoom(roomRef(playerDb, id), { history: [event('player_buzzed', 'player', { actorName: 'player' })] }));
        await denied(actions.updateRoom(roomRef(playerDb, id), { history: [event('score_set', 'player')] }));
        await denied(buzz(lateDb, 'late', 8000, 'player_buzzed_late'));
    });
    await check('player surprise table and wheel events retain gameplay permissions', async () => {
        await updateDoc(hostRoom, { answerRevealed: true, surpriseRound: { questionId: 'q1', answererId: 'player', judgeResult: 'correct', scoringMechanic: 'table', tablePickedCellId: null, tableCells: [{ id: 'cell', value: 100, icon: '🧠' }] } });
        await actions.updateRoom(roomRef(playerDb, id), { 'players.player.score': 100, currentTurn: 'player', 'surpriseRound.tablePickedCellId': 'cell', 'surpriseRound.tablePickedBy': 'player', 'surpriseRound.tablePickedAt': 4000, 'surpriseRound.scoreAppliedAt': 4000, history: [event('surprise_table_picked', 'player', { playerName: 'player', points: 100, cellIndex: 0 })] });
        await denied(actions.updateRoom(roomRef(playerDb, id), { history: [event('surprise_table_picked', 'player', { playerName: 'player', points: 100, cellIndex: 0 })] }));
        await updateDoc(hostRoom, { surpriseRound: { questionId: 'q1', answererId: 'player', judgeResult: 'correct', wheelValues: [100, -100], rollResult: null } });
        await actions.updateRoom(roomRef(playerDb, id), { 'surpriseRound.rollResult': -100, 'surpriseRound.rolledBy': 'player', 'surpriseRound.rolledAt': 5000, 'surpriseRound.scoreAppliedAt': null, history: [event('surprise_wheel_rolled', 'player', { playerName: 'player', points: -100 })] });
    });
    await check('host score edits and paginated history preserve all events', async () => {
        for (let i = 0; i < 55; i++) await actions.adjustScore(hostRoom, 'player', 100 + i, 1, event('score_adjusted'));
        const base = query(collection(hostRoom, 'history'), orderBy('recordedAt', 'desc'), orderBy(documentId(), 'desc'));
        const first = await getDocs(query(base, limit(50)));
        const rest = await getDocs(query(base, startAfter(first.docs.at(-1)), limit(50)));
        assert.equal(first.size, 50);
        assert.ok(rest.size > 0);
        assert.equal(new Set([...first.docs, ...rest.docs].map((item) => item.id)).size, first.size + rest.size);
        await denied(updateDoc(creation.ref, { message: 'edited' }));
        await denied(deleteDoc(creation.ref));
    });
    await check('host RPS completion records exactly one event', async () => {
        await updateDoc(hostRoom, { activeQuestionId: null });
        await actions.startHostRps(hostRoom, ['host', 'player']);
        const rps = (await getDocFromServer(hostRoom)).data().hostRps;
        await actions.submitHostRpsChoice(hostRoom, rps, 'host', 'rock');
        await actions.submitHostRpsChoice(roomRef(playerDb, id), rps, 'player', 'scissors');
        const count = (await getDocs(collection(hostRoom, 'history'))).size;
        await actions.resolveHostRpsThrow(hostRoom, { id: 'host', name: 'host' }, t);
        await actions.resolveHostRpsThrow(hostRoom, { id: 'host', name: 'host' }, t);
        assert.equal((await getDocs(collection(hostRoom, 'history'))).size, count + 1);
        const result = (await getDocFromServer(hostRoom)).data().hostRps;
        assert.equal(result.status, 'complete');
        assert.equal((await getDocFromServer(eventRef(hostDb, id, result.resultHistoryId))).data().type, 'host_rps_completed');
    });
    await check('finishing atomically removes snapshot and retains results and host history', async () => {
        const beforeCount = (await getDocs(collection(hostRoom, 'history'))).size;
        await Promise.all([actions.handleEndGame(hostRoom, event('game_finished')), actions.handleEndGame(hostRoom, event('game_finished'))]);
        assert.equal((await getDocFromServer(version)).exists(), false);
        const final = (await getDocFromServer(roomRef(spectatorDb, id))).data();
        assert.equal(final.status, 'finished');
        assert.equal(final.players.player.score, 155);
        assert.equal('history' in final || 'pack' in final, false);
        const count = (await getDocs(collection(hostRoom, 'history'))).size;
        assert.equal(count, beforeCount + 1);
        await actions.handleEndGame(hostRoom, event('game_finished'));
        assert.equal((await getDocs(collection(hostRoom, 'history'))).size, count);
        await denied(setDoc(version, { gameId: id, content: latestPack }));
    });
    await check('missing or invalid source leaves lobby unchanged without orphan snapshot', async () => {
        const invalidId = await newRoom();
        await updateDoc(ref(hostDb, 'packs', 'pack'), { categories: null });
        await assert.rejects(actions.startGame(roomRef(hostDb, invalidId), { id: 'host', name: 'host' }, t));
        await deleteDoc(ref(hostDb, 'packs', 'pack'));
        await assert.rejects(actions.startGame(roomRef(hostDb, invalidId), { id: 'host', name: 'host' }, t));
        assert.equal((await getDocFromServer(roomRef(hostDb, invalidId))).data().status, 'lobby');
        assert.equal((await getDocs(collection(hostDb, 'artifacts', namespace, 'public', 'data', 'gamePackVersions'))).size, 0);
    });
    await check('legacy room history and pack remain compatible', async () => {
        const legacy = roomRef(hostDb, '123456');
        await setDoc(roomRef(seedDb, '123456'), { hostId: 'host', status: 'playing', pack, players: { host: { isHost: true }, player: { score: 0 } }, history: [] });
        await actions.adjustScore(legacy, 'player', 0, 100, event('score_adjusted'));
        const old = (await getDocFromServer(legacy)).data();
        assert.equal(old.history.length, 1);
        assert.deepEqual(old.pack, pack);
        await actions.handleEndGame(legacy, event('game_finished'));
        assert.equal((await getDocFromServer(legacy)).data().history.length, 2);
    });
    await check('revoked public-pack access prevents start without changing the lobby', async () => {
        await setDoc(ref(seedDb, 'packs', 'pack'), { ...pack, ownerId: 'author', isPublic: true });
        const pendingId = await newRoom();
        await updateDoc(ref(seedDb, 'packs', 'pack'), { isPublic: false });
        await denied(actions.startGame(roomRef(hostDb, pendingId), { id: 'host', name: 'host' }, t));
        assert.equal((await getDocFromServer(roomRef(hostDb, pendingId))).data().status, 'lobby');
    });
    console.log(`${checks} scenario groups passed. Namespace: ${namespace}`);
} finally {
    await Promise.all(clients.map(async ({ db, app }) => { await terminate(db); await deleteApp(app); }));
    delete globalThis.__gameStorageTest;
}
