# Changing and diagnosing gameplay

Gameplay behavior is unchanged by this refactor. The tests characterize the
existing standard, competitive and legacy behavior; they are not new security
enforcement. Firestore rules and Emulator tests remain necessary.

## Where a change belongs

| Responsibility | Source |
| --- | --- |
| History-backed transition eligibility and ordinary answer score projection | `src/utils/gameTransitionPolicy.js` |
| Transaction reads, idempotency, history/recap/buzzer writes and retry reconciliation | `src/actions/gameStorage.js` |
| Dedicated room, buzzer, wheel, round and score-edit commands | `src/actions/roomActions.js`, `gameActions.js`, `buzzerActions.js`, `scoreActions.js` |
| Presentation, translated history copy and input handling | `src/views/game/` |
| Opt-in local action/transaction trace | `src/utils/gameplayDiagnostics.js` |

`getTransitionBlockReason(room, event)` returns `null` when the existing
history-backed action can proceed, or a stable reason such as `question_changed`,
`host_required` or `surprise_award_pending`. A blocked action remains a no-op.
These guards apply to `updateRoom` history events, not every command in the app.
Legacy and partially versioned rooms deliberately retain their prior checks.

After eligibility is checked, `projectAnswerScore` uses the transaction's player
score and frozen question points. It ignores UI-supplied points, returns new data
without mutating the room/event, and leaves surprise awards to wheel/table actions.
Run both helpers against the latest transaction snapshot, never a rendered UI
snapshot. Keep all reads before writes, and reuse `readRoomPack` per attempt.

For a rule change, add a scenario to `scripts/gameplay-policy.test.mjs` first,
including an allowed action, a stale/repeated action, host/contestant boundaries,
and applicable legacy behavior. For changed writes or concurrency, extend the
single storage harness or its existing scenario modules. Update the
[gameplay reference](gameplay-reference.md) for intentional product changes.

## Reproducible checks

```powershell
npm run test:gameplay
npm run lint
npm run build
```

`test:gameplay` uses Node's built-in test runner: no browser, credentials, network,
new dependency or Emulator. It covers judgment/board lifecycle, standard and
competitive scoring, stale events, surprise awards, final-round eligibility,
legacy compatibility, immutable inputs and diagnostics isolation.

For actual Firestore rules, competing actions and atomic history/recap behavior,
start the dedicated Emulator as described in
[storage validation](game-storage-validation.md), then run:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080' # Use the dedicated Emulator's port.
npm run test:storage
```

This is the existing single storage entry point, not an additional suite to run
alongside it. It targets only `demo-game-storage` on loopback and also checks that
transaction tracing preserves results/errors without writing data.

No E2E dependency is introduced: this change concerns policy and storage behavior,
which these tests exercise directly. Browser coverage remains separate and
pending; Node tests do not verify visual rendering or real device timing.

## Local diagnostics

In the affected browser tab's developer console, enable tracing and reload:

```js
sessionStorage.setItem('cortex-rush:diagnostics', '1');
location.reload();
```

Reproduce the issue, then inspect or copy the JSON:

```js
console.table(window.cortexRushDiagnostics.read());
JSON.stringify(window.cortexRushDiagnostics.read(), null, 2);
```

Each record contains a local operation number, allowlisted action name, timestamp,
phase and optional reason. `transaction_retried` identifies repeated SDK callbacks;
`permission_retry` means a fresh server read proved the room changed. `skipped`
explains expected no-ops, including already-applied events. `failed` records only
an allowlisted Firebase error code (otherwise `unknown`). `completed` means the
Promise resolved, **not** that it wrote a change. A failed transaction attempt can
be followed by successful reconciliation; use the terminal operation outcome.

Coverage is `updateRoom` and `runRoomTransaction`. Actions using raw
`runTransaction`, listener recovery and browser media activity are not traced by
this recorder. This is not a server audit log, reaction-time measurement or a
render profiler. Include role, language, browser, expected/observed behavior and
reproduction steps with a trace.

Tracing defaults off. At most 200 records are held in tab memory; old records
are evicted. No room/player IDs, names, question/answer text, media URLs, tokens,
error messages or stacks are recorded. Nothing is uploaded or written to
Firestore. Reload clears the buffer; only the opt-in flag uses session storage.
To clear or disable:

```js
window.cortexRushDiagnostics.clear();
window.cortexRushDiagnostics.stop();
sessionStorage.removeItem('cortex-rush:diagnostics');
```

`stop()` clears the buffer and stops this loaded recorder. Removing the flag
prevents tracing after reload; re-enable with the first snippet.

## Pending browser checks

When browser testing is explicitly requested, use isolated disposable data. Check
host/contestant/spectator in English/Ukrainian on desktop/mobile: correct/wrong
judgments in standard/competitive mode, repeated/stale host actions, surprise
award before Continue, final-round tie breaker and a legacy room. Enable tracing,
reproduce a stale action and a failed write, and confirm the recorded reason and
unchanged UI behavior. Disable tracing afterward. Do not infer UI correctness
from the deterministic or Emulator tests alone.
