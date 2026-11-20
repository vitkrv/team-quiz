import { useRef, useState } from 'react';
import { revealTextAssessments, saveTextAssessment, saveTextAnswerVisibility } from '../actions/textAnswerActions';
import { validSignedTextPoints } from '../utils/textAnswerPolicy';

// Shared by the host table and its separate controls panel.
export default function useTextAssessments(room, roomRef, user, t) {
    const round = room.textAnswerRound;
    const session = round?.id;
    const current = useRef(null);
    const [, render] = useState(0);
    if (!current.current || current.current.session !== session) current.current = { session, edits: {}, optimistic: {}, revision: round?.assessmentRevision || 0, busy: false, error: '' };
    const state = current.current;
    if (!state.busy && !Object.keys(state.edits).length && state.visibility === undefined) state.revision = Math.max(state.revision, round?.assessmentRevision || 0);
    const refresh = () => render((n) => n + 1);
    const value = (uid) => state.edits[uid] ?? state.optimistic[uid] ?? String(round?.draftPoints?.[uid] ?? 0);
    const invalid = Object.values(state.edits).some((amount) => !validSignedTextPoints(amount));
    const edit = (uid, amount) => { if (!state.busy) { state.edits[uid] = String(amount); state.error = ''; refresh(); } };
    const persist = async (reveal = false) => {
        if (state.busy || Object.values(state.edits).some((amount) => !validSignedTextPoints(amount))) return;
        state.busy = true; state.error = ''; refresh();
        try {
            for (const [uid, amount] of Object.entries(state.edits)) {
                const result = await saveTextAssessment(roomRef, session, user.uid, state.revision, uid, amount);
                if (result === 'stale') {
                    state.edits = {}; state.optimistic = {}; state.visibility = undefined; state.optimisticVisibility = undefined; state.error = 'textAnswerBulkStale'; return;
                }
                state.revision++;
                state.optimistic[uid] = amount;
                delete state.edits[uid];
                // Keep the local value until the listener catches up, preventing flicker.
            }
            if (state.visibility !== undefined) {
                const result = await saveTextAnswerVisibility(roomRef, session, user.uid, state.revision, state.visibility);
                if (result === 'stale') {
                    state.edits = {}; state.optimistic = {}; state.visibility = undefined; state.optimisticVisibility = undefined; state.error = 'textAnswerBulkStale'; return;
                }
                state.revision++;
                state.optimisticVisibility = state.visibility;
                state.visibility = undefined;
            }
            if (reveal) {
                const result = await revealTextAssessments(roomRef, session,
                    { id: user.uid, name: room.players[user.uid]?.name || t('hostLabel') }, state.revision, t);
                if (result === 'stale') { state.edits = {}; state.optimistic = {}; state.optimisticVisibility = undefined; state.error = 'textAnswerBulkStale'; }
            }
        } catch { state.error = 'textAnswerFailed'; }
        finally { state.busy = false; refresh(); }
    };
    // Once the listener catches up, server values replace optimistic values.
    if (!state.busy && round?.assessmentRevision >= state.revision) {
        state.optimistic = {};
        state.optimisticVisibility = undefined;
    }
    const setShowAnswers = (showAnswers) => {
        if (state.busy || invalid) return;
        state.visibility = showAnswers;
        return persist();
    };
    return { value, edit, persist, invalid, pending: state.busy, error: state.error,
        showAnswers: state.visibility ?? state.optimisticVisibility ?? (round?.showAnswers !== false), setShowAnswers };
}
