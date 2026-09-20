# Game storage validation

The focused integration harness exercises the actual room/game action modules and
`firestore.rules` against a local Firestore Emulator. It uses existing Firebase and
Vite/esbuild dependencies; no production credentials or new packages are required.
It is not a general unit or browser test suite.

## Run

Install the repository dependencies. Start a **dedicated** Firestore Emulator with
Java and the Firebase CLI installed:

```sh
firebase emulators:start --only firestore --project demo-game-storage
```

In a second terminal, run from the repository root (use the port printed by the emulator):

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
node scripts/verify-game-storage.mjs
```

Or in a POSIX shell:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/verify-game-storage.mjs
```

The script requires a loopback endpoint and hardcodes the `demo-game-storage` project.
It loads this checkout's rules into that emulator project, creates a unique fixture
namespace per run, and writes temporary bundles under ignored `.firebase/validation`.
Do not run it against an emulator shared with other active tests: rule loading affects
the whole emulator project. Fixture data is disposable and can be discarded by stopping
the dedicated emulator without exporting it. Permission-denied log messages are
expected for negative cases; a failed assertion gives a nonzero exit code.

On Windows, Java may fail to initialize its local socket when its temporary path is
unsuitable. Point `jdk.net.unixdomain.tmpdir` and `java.io.tmpdir` at a short, writable
directory when starting Java. This validation used the standalone Firestore Emulator
1.19.8 with Java 17 and localhost port 8089; the portable tools stayed under ignored
`.firebase/validation`, without modifying project dependencies or global installations.

## Covered cases

- Compact new-room creation and atomic invitation reservation.
- Host-only history reads, including player, spectator and unrelated-admin denials.
- Embedded-field reintroduction, storage-version downgrade and spectator-write denials.
- Concurrent starts: exactly one snapshot of the latest saved pack and one start event.
- Shared snapshot reads; unchanged content after source edits; mutation, early deletion,
  reference replacement and finish-without-deletion denials.
- Forged/standalone snapshot creation rejected without partially starting a game.
- Surprise selection transactions using the separated pack.
- Player accepted/late buzz events without history read permission; forged events denied.
- Player surprise-table and wheel events with matching action state.
- Host score changes, cursor pagination, event update/delete denials and RPS completion.
- Concurrent/repeated finish: one final event, snapshot deletion and retained results.
- Missing, invalid or newly private source packs leave the lobby unchanged.
- Legacy embedded-pack/history compatibility.

## Recap and profile achievement checks

The same command also runs `scripts/verify-game-recap.mjs`. New rooms opt into
`recapVersion: 1`; older v2 and legacy rooms are not migrated. Recap data lives in
`rooms/{gameId}/recap/summary` and `recapScores/{eventId}`. Private history remains
host-only. Summary and score projections use the room's existing authenticated
read policy. Question/answer text and media are not copied into recap storage.

Finishing freezes the summary, writes awarded players' immutable
`users/{playerId}/gameAchievements/{gameId}` records, and deletes the frozen pack in
one transaction. Each profile record stores award IDs/values/details, the stable
game ID, invitation code, and a server completion timestamp. Only the profile owner
and administrators can read those profile records. No profile controls or backfill
are included.

`updateRoomInTransaction` is now asynchronous: always await it, before any other
writes when the action can project recap data. It may read the summary and frozen
pack for category/point metadata before issuing writes. Start/finalize perform their
own reads before writes and have no additional projection reads for their events.

Additional coverage includes achievement ties/thresholds, duplicate names, early
attempt deduplication, buzz-round resets, penalties, repeat-safe judgments and
manual adjustments, actual wheel scoring, 20 offline award
recipients, finalization rollback and concurrency, immutable records, unauthorized
access, and results surviving source/snapshot deletion and invitation-code reuse.

## Release verification

### Item 03: wheel recovery and quiz transitions

The combined entry point also runs `scripts/verify-wheel.mjs`; do not run it separately.
New scenarios use only current-format rooms (`dataVersion: 2`, `recapVersion: 1`,
`buzzerPolicyVersion: 1`). Existing legacy scenarios remain unchanged.

Coverage includes concurrent starts, server rejection of early host/player completion,
immutable spin fields, a fresh-client recovery race, duplicate completion, concurrent
manual adjustments (including retrying batches whose first event was a no-op), positive/negative awards, stale Continue/completion calls, pending
award finish rejection, missing-recap rollback, and transaction-derived quiz scores.
Fixture-only owner writes move the spin clock past its deadline for recovery cases;
authenticated early-write denials still exercise the deployed-rule boundary.

User-run browser checks: host, player, and spectator; English/Ukrainian; desktop/mobile.
Start a spin and confirm the result label stays hidden and the score stays unchanged
until the wheel settles. Refresh during and after the spin, delay delivery, background
and restore a tab, disconnect the initiator, and race two host tabs with the player.
Confirm one award/history/recap entry, recovery without rerolling, visible retry feedback,
and no Continue/Finish before the award commits. Check normal/table scoring and manual
adjustments as regressions. Browser verification remains pending; the user-run
Emulator results below do not verify animation or responsive presentation.

Release the updated rules and frontend together only when authorized, and have clients
reload. This change does not migrate older rooms or recover pre-update spins.

User-reported verification on 2026-09-20: the combined harness passed all **39 scenario
groups**, including all five new wheel/quiz groups, with **exit code 0**. Namespace:
`storage-check-1789917747731`. Expected permission-denied messages accompanied negative
cases. This is the user's Emulator run, not an agent-run check. Agent-run lint/build
passed; browser checks remain pending and nothing was deployed.

Earlier failed runs led to updated buzzer fixtures for the expected-question Continue
contract, reduced repeated rule validation, and bounded retries when a fresh server
read confirms a concurrent room change. The successful run above supersedes those
failed validation attempts.

Run `npm run lint` and `npm run build`. Check the host/player/spectator experience with
isolated data: lobby/start, refresh and late spectator entry, ordinary and surprise
questions, history loading/older pages, judging, score editing, and final results after
snapshot deletion. Confirm the room payload itself has no `history` or `pack` fields.

Deploy the rules and frontend as one coordinated release only when authorized. Old
clients must reload to create new rooms. Existing rooms are not migrated and still
expose their embedded history; full pack answers remain shared. No new indexes or
TTL configuration are needed. Abandoned-game cleanup and external media retention
remain deferred.

## Verified on 2026-09-18

- ESLint and production build passed (Vite reports its existing large-chunk warning).
- All 15 Emulator scenario groups passed, including real concurrent start/finish writes.
- An isolated browser harness using the real game components and Emulator data verified
  the host's 50 + 25 history pages, ordinary player buzz/judgment/reveal, surprise selection
  and player wheel scoring, spectator entry/refresh, and final standings for all three
  roles after finishing. Player and spectator refreshes retained the final 300-point score.
- These browser checks used simulated Google identities. Production Google sign-in,
  Firebase Hosting links and external media integrations were not exercised. Nothing
  was deployed.

### Item 23 verification (2026-09-18)

- ESLint and production build passed; the existing Vite large-chunk warning remains.
- All 22 Emulator scenario groups passed, retaining the original 15 storage checks.
  The 20-player finalization case passed the actual rules access-call limits.
- An isolated browser fixture verified English desktop and Ukrainian 390px layouts,
  the avatar to the trophy's right, long names, tied recipients, and score progression.
- The actual host/player components completed question selection, player buzz,
  correct judgment, answer reveal, game finish, and player refresh. Direct authenticated
  reads confirmed two earned profile awards, the invitation code, and completion date.
- These were Emulator identities, not production Google sign-in. Production Hosting
  links and external media playback/storage were not exercised. No deployment occurred.

### Scope update: achievements and performance only

The question-review section has been removed together with its snapshot writes,
loading/pagination, media rendering, translations, and Firestore access rules.
Player achievements, profile persistence, and performance recap remain supported.
Previously stored review documents are not migrated or deleted; the application no
longer reads or writes them, and the updated rules provide no client access.

After this removal, ESLint, the production build, and all 22 Emulator scenario
groups passed again. The existing Vite large-chunk warning remains. No deployment
or production-data cleanup was performed.

## Buzzer policy v1

The same command also runs `scripts/verify-buzzer.mjs` against the checked-in rules and real action modules. New rooms are asserted to have the immutable policy marker. The original storage/recap fixtures explicitly remove that marker using the isolated seed identity, preserving compatibility coverage for rooms created before this policy.

The buzzer checks cover local-clock restoration, server-stamped opening, reordered arrivals, fixed penalties, immutable/idempotent submissions, strict deadline rejection, duplicate host finalization, exact ties, host-only history, wrong-answer reopening, cancellation, surprise exclusion, forged writes, and recap integration. Twenty clients submit concurrently against the real two-second window; contention can legitimately exclude late commits. A separate seeded 20-accepted-attempt fixture verifies maximum-size atomic finalization and rule access limits, without claiming that every contended request must arrive within two seconds.

Validation on 2026-09-19: all 34 scenario groups passed, along with ESLint and production build (existing Vite large-chunk warning). Browser checks used the actual game components, simulated Google identities, isolated Emulator data, and a test-only 1.5-second submission delay. English/Ukrainian mobile-width sessions and desktop controls covered refresh, early Space, collection, winner/judging/history, host-reconnect resolution with a fresh answer timer, and immediate pause of a silent local audio fixture. Separate loopback endpoints avoided sharing one browser HTTP connection pool among simulated clients. Production sign-in, deployed routing, external media, and physical multi-device latency were not exercised.

Release the rules and frontend together when deployment is authorized. Existing rooms are not migrated. No new indexes, Functions, or Worker deployment are required. Device reaction durations and host ranking are intentionally trusted; Firestore commits determine acceptance deadlines. A connected host app is required to finalize after the deadline.
