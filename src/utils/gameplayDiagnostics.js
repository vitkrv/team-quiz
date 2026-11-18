const CAPACITY = 200;
const ERROR_CODES = new Set(['permission-denied', 'unavailable', 'deadline-exceeded', 'aborted',
    'not-found', 'unauthenticated', 'resource-exhausted', 'failed-precondition', 'cancelled']);
const ACTIONS = new Set(['room_transaction', 'room_update', 'answer_correct', 'answer_incorrect',
    'surprise_answer_correct', 'surprise_answer_incorrect', 'board_resumed', 'question_skipped',
    'score_set', 'score_adjusted', 'player_buzzed_early', 'surprise_wheel_rolled',
    'surprise_wheel_scored', 'tie_breaker_started']);

// Only explicit scalar fields are recorded. Never retain rooms, names, tokens,
// question/answer content, document paths, error messages or stack traces.
export function createGameplayDiagnostics({ enabled = false, now = Date.now } = {}) {
    let entries = [], sequence = 0;
    const record = (operation, action, phase, reason) => {
        if (!enabled) return;
        entries.push({ operation, action, at: now(), phase, ...(reason ? { reason } : {}) });
        if (entries.length > CAPACITY) entries.splice(0, entries.length - CAPACITY);
    };
    return {
        read: () => entries.map((entry) => ({ ...entry })),
        clear: () => { entries = []; },
        stop: () => { enabled = false; entries = []; },
        async trace(task, action = 'room_transaction') {
            if (!enabled) return task(() => {});
            const operation = ++sequence;
            const safeAction = ACTIONS.has(action) ? action : 'room_update';
            const trace = (phase, reason) => record(operation, safeAction, phase, reason);
            trace('started');
            try {
                const result = await task(trace);
                // Completion can include an intentional no-op; it is not proof
                // that a transaction wrote or committed a gameplay change.
                trace('completed');
                return result;
            } catch (error) {
                trace('failed', ERROR_CODES.has(error?.code) ? error.code : 'unknown');
                throw error;
            }
        }
    };
}

let enabled = false;
try { enabled = typeof window !== 'undefined' && window.sessionStorage.getItem('cortex-rush:diagnostics') === '1'; }
catch { /* Storage restrictions must not affect gameplay. */ }
export const gameplayDiagnostics = createGameplayDiagnostics({ enabled });
if (enabled) window.cortexRushDiagnostics = Object.freeze({
    read: gameplayDiagnostics.read, clear: gameplayDiagnostics.clear, stop: gameplayDiagnostics.stop
});
