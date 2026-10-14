import assert from 'node:assert/strict';
import { verifyMediaPlayback } from './verify-media-playback.mjs';
import { getDocFromServer, setDoc, updateDoc } from 'firebase/firestore';
import { formatMediaTime, getMediaStops, parseMediaTime, pruneMediaStops, validMediaStops } from '../src/utils/mediaStops.js';

// Invoked through verify-game-storage.mjs only; does not launch a browser.
export async function verifyMediaStops({ actions, check, denied, hostDb, playerDb, spectatorDb, seedDb, ref, roomRef, event, t }) {
    await verifyMediaPlayback(check);
    const read = async (target) => (await getDocFromServer(target)).data();
    const media = { kind: 'video', fileId: 'stops-video', url: 'https://example.invalid/video.mp4', durationSeconds: 60, stopPoints: [10, 20, 30, 40, 50] };
    const pack = { ownerId: 'host', name: 'Media stops', isPublic: false, categories: [{ id: 'stops-category', name: 'Media', questions: [
        { id: 'stops-question', text: 'Q', answer: 'A', points: 100, questionMedia: media },
        { id: 'stops-audio', text: 'Q', answer: 'A', points: 100, questionMedia: { ...media, kind: 'audio', fileId: 'stops-audio', stopPoints: [10] } },
        { id: 'plain-media', text: 'Q', answer: 'A', points: 100, questionMedia: { kind: 'audio', fileId: 'plain', url: 'https://example.invalid/audio.mp3' } }
    ] }] };
    await check('media stops: parsing, ordering, bounds, cap and replacement pruning', async () => {
        assert.equal(parseMediaTime('1:02.25'), 62.25);
        assert.equal(parseMediaTime('12.50'), 12.5);
        for (const value of ['', '-1', 'Infinity', '1:60', '1e2', '1.234', '1:2:3']) assert.equal(Number.isNaN(parseMediaTime(value)), true);
        assert.equal(formatMediaTime(62.25), '1:02.25');
        assert.equal(formatMediaTime(59.999), '1:00');
        assert.equal(validMediaStops(media.stopPoints, 60), true);
        for (const stops of [[0], [60], [-1], [10, 10], [20, 10], [1, 2, 3, 4, 5, 6], [NaN]]) assert.equal(validMediaStops(stops, 60), false);
        assert.deepEqual(pruneMediaStops(media.stopPoints, 30), [10, 20]);
        assert.deepEqual(pruneMediaStops(media.stopPoints, 80), media.stopPoints);
        assert.deepEqual(pruneMediaStops(media.stopPoints, NaN), []);
        assert.deepEqual(getMediaStops({ ...media, kind: 'image' }), []);
    });
    await setDoc(ref(hostDb, 'packs', 'media-stops-pack'), pack);
    const id = await actions.createRoom({ hostId: 'host', packId: 'media-stops-pack', pack, status: 'lobby', trueCompetitiveMode: false,
        players: { host: { name: 'host', isHost: true, score: 0 }, player: { name: 'player', isHost: false, score: 0 } },
        activeQuestionId: null, answerRevealed: false, buzzedPlayerId: null, buzzTimestamp: null,
        buzzUnlockAt: 0, buzzAttempts: {}, incorrectBuzzedIds: [], history: [event('room_created')] });
    const host = roomRef(hostDb, id);
    const player = roomRef(playerDb, id);
    const spectator = roomRef(spectatorDb, id);
    await check('media stops: frozen metadata survives source changes', async () => {
        await actions.startGame(host, { id: 'host', name: 'host' }, t);
        const room = await read(host);
        const frozen = await read(ref(hostDb, 'gamePackVersions', room.packVersionId));
        assert.deepEqual(frozen.content.categories[0].questions[0].questionMedia, media);
        await updateDoc(ref(hostDb, 'packs', 'media-stops-pack'), { categories: [{ ...pack.categories[0], questions: [] }] });
        assert.deepEqual((await read(ref(hostDb, 'gamePackVersions', room.packVersionId))).content.categories[0].questions[0].questionMedia, media);
        await updateDoc(host, { status: 'playing' });
        assert.equal(await actions.handlePickQuestion(host, 'stops-question', 'host', event('question_picked')), true);
    });
    await check('media stops: start is host-only, scoped and idempotent', async () => {
        assert.equal(await actions.startQuestionMedia(player, 'player', 'stops-question'), false);
        assert.equal(await actions.startQuestionMedia(host, 'host', 'wrong-question'), false);
        const outcomes = await Promise.all([actions.startQuestionMedia(host, 'host', 'stops-question'), actions.startQuestionMedia(host, 'host', 'stops-question')]);
        assert.equal(outcomes.filter(Boolean).length, 1);
        const state = (await read(host)).mediaPlayback;
        assert.equal(state.policyVersion, 1);
        assert.equal(state.mediaId, media.fileId);
        assert.equal(state.releasedStopCount, 0);
        assert.equal(typeof state.sessionId, 'string');
        for (const target of [player, spectator]) await denied(updateDoc(target, { mediaPlayback: { ...state, releasedStopCount: 5 } }));
        await denied(updateDoc(player, { 'mediaPlayback.releasedStopCount': 1 }));
        await denied(updateDoc(player, { mediaPlayback: null }));
    });
    const playback = (await read(host)).mediaPlayback;
    await check('media stops: concurrent and duplicate continues release exactly one stop', async () => {
        const advance = () => actions.continueQuestionMedia(host, 'host', 'stops-question', playback.sessionId, 0);
        const outcomes = await Promise.all([advance(), advance()]);
        assert.equal(outcomes.filter(Boolean).length, 1);
        assert.equal((await read(host)).mediaPlayback.releasedStopCount, 1);
        assert.equal(await advance(), false);
        assert.equal(await actions.continueQuestionMedia(player, 'player', 'stops-question', playback.sessionId, 1), false);
        assert.equal(await actions.continueQuestionMedia(host, 'host', 'stops-question', 'stale-session', 1), false);
        assert.equal(await actions.continueQuestionMedia(host, 'host', 'wrong-question', playback.sessionId, 1), false);
        for (let count = 1; count < 5; count++) assert.equal(await actions.continueQuestionMedia(host, 'host', 'stops-question', playback.sessionId, count), true);
        assert.equal(await actions.continueQuestionMedia(host, 'host', 'stops-question', playback.sessionId, 5), false);
    });
    await check('media stops: reveal rejects release, board and question changes reset sessions', async () => {
        // Seed a paused intermediate state to exercise reveal without judging a buzzer.
        await updateDoc(roomRef(seedDb, id), { 'mediaPlayback.releasedStopCount': 1 });
        await actions.updateRoom(host, { answerRevealed: true, 'questionStates.stops-question': 'done', history: [event('question_skipped', 'host', { questionId: 'stops-question' })] });
        assert.equal(await actions.continueQuestionMedia(host, 'host', 'stops-question', playback.sessionId, 1), false);
        assert.equal(await actions.startQuestionMedia(host, 'host', 'stops-question'), false);
        await actions.updateRoom(host, { activeQuestionId: null, answerRevealed: false, mediaPlayback: null, history: [event('board_resumed', 'host', { questionId: 'stops-question' })] });
        assert.equal((await read(host)).mediaPlayback, null);
        assert.equal(await actions.handlePickQuestion(host, 'stops-audio', 'host', event('question_picked')), true);
        assert.equal(await actions.startQuestionMedia(host, 'host', 'stops-audio'), true);
        assert.notEqual((await read(host)).mediaPlayback.sessionId, playback.sessionId);
        assert.equal(await actions.continueQuestionMedia(host, 'host', 'stops-audio', playback.sessionId, 0), false);
        await actions.handleEndGame(host, event('game_finished'));
        assert.equal((await read(host)).mediaPlayback, null);
    });
    await check('media stops: legacy embedded packs retain start and release support', async () => {
        const legacy = roomRef(hostDb, 'media-stops-legacy');
        await setDoc(roomRef(seedDb, legacy.id), { hostId: 'host', status: 'playing', pack, players: { host: { isHost: true } }, activeQuestionId: 'stops-question', answerRevealed: false });
        assert.equal(await actions.startQuestionMedia(legacy, 'host', 'stops-question'), true);
        const state = (await read(legacy)).mediaPlayback;
        assert.equal(await actions.continueQuestionMedia(legacy, 'host', 'stops-question', state.sessionId, 0), true);
        await updateDoc(legacy, { activeQuestionId: 'plain-media', mediaPlayback: null });
        assert.equal(await actions.startQuestionMedia(legacy, 'host', 'plain-media'), true);
        assert.equal((await read(legacy)).mediaPlayback.policyVersion, undefined);
    });
}
