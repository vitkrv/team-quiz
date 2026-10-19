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

The same entry point runs `verify-media-stops.mjs`, including non-browser
playback-event checks from `verify-media-playback.mjs`. These cover timestamp parsing,
ordering/bounds/the five-stop limit, replacement pruning, frozen metadata,
host-only start/release, concurrent/duplicate continuation, stale sessions,
reveal/board/question/finish resets, and legacy/no-stop media compatibility.
Plain event targets and a controlled timer exercise the actual playback policy:
boundary clamping without seek loops, released stops for slower clients, seek/speed
blocking, buzz pause and refresh, autoplay failure, foreground correction,
per-client completion, unrestricted previews, and cleanup. No browser is launched;
these checks do not verify browser-specific native media behavior.

Question-media replay checks cover enabled/disabled/missing preferences saved on
question media and frozen at start, participant/spectator reads, source edits after
start, and rejected non-owner pack/frozen-snapshot writes. There is no game-wide
preference or host setter. Legacy games and concurrent shared replays are covered;
replay creates one fresh session and resets stop permissions. Non-browser playback
checks exercise first-playback locking with and without stops, completion recovery,
and fresh-session resets. Disabled participant controls are checked before and after
completion, against local/native replay and seeking attempts, across refresh, and
through a fresh host-authorized playback. Unrestricted previews remain unaffected.

### Question-media replay browser checklist (pending)

Use host, contestant, and spectator sessions in English and Ukrainian at desktop
and mobile widths. Browser checks require an explicit user request for agent execution.

1. In Form and Table editors, attach audio/video to a question. Confirm the media
   checkbox defaults to checked, can be changed independently per question, and
   survives Save/reopen, mode switching, and audio/video replacement. Removing and
   attaching anew should restore the default. Images and answer-media panels must
   have no checkbox; their previews stay unrestricted.
2. Open the question-mark help in both editors, including the Table question dialog.
   Check focus containment/restoration, Escape closing only the help, backdrop/icon
   dismissal, sticky title/close icon, and mobile scrolling. The example follows
   the intro, before the detailed cases; no footer Close button is present.
3. Start a game with checked, unchecked, and older/missing-value media. The host
   must have no checkbox/help control and should see the host-control notice
   only when unchecked. Later source-pack edits must not alter the active game.
4. With checked ordinary media, participant controls unlock only after their full
   playback. When unchecked, controls must stay locked before, during, and after
   playback, both with and without stops. Confirm participant/spectator play/pause,
   replay and seeking cannot unlock after completion or refresh; volume and limited
   recovery Resume remain available. Shared host replay must still play from zero.
5. Verify shared host Start/Replay resets everyone from zero. With stops, only
   Start/Continue appears during first playback, Continue is visibly disabled until
   the host reaches the boundary. When the mode is unchecked, shared Replay after
   completion resets stop releases and host question timelines stay read-only with
   no local playback buttons/native video controls. When checked, shared Replay is
   hidden and the host gets regular local Play/Pause, seeking, and video controls
   beneath the media after their first full playback. Confirm local replay does not
   restart participant playback. Check local recovery Resume after interruption.
6. Refresh during initial playback and after completion, join as a new spectator,
   and reveal audio/video answers. Verify documented recovery and unchanged answer
   controls, image display, and pack previews under both saved settings.

### Stop-point browser checklist (pending)

Agent execution requires a separate explicit browser-testing request. Use disposable
packs and host, two contestants, and spectator roles. Repeat audio/video with one
and five stops in English/Ukrainian at desktop and mobile widths; record roles,
language, viewport/device, steps, and observed behavior.

1. In Form and Table editors, add/edit/remove stops, test seconds and `mm:ss`
   fractions, duplicate/out-of-order/zero/end timestamps, and the five-stop cap.
   Check the new-input time placeholder, Cancel/Escape dismissal, ignored backdrop
   clicks, focus containment/restoration, Save/reopen, and
   unrestricted marked previews. Answer media and images must have no stop editor.
2. Replace with shorter/longer media and an image, remove the attachment, and
   simulate metadata/upload/save errors. Check pruning notices, retained valid
   times, original-media recovery, and frozen content after source edits.
3. Start from the host, check every boundary and disabled seeking/speed controls,
   and release each stop. A delayed client must cross already-released stops
   without jumping forward. Try double-clicking Continue and reconnecting.
4. Test autoplay rejection and limited Resume, accepted buzz pause, release while
   locally paused, refresh before/during/at a stop and after completion, and a new
   spectator joining mid-question. Check saved position and independent completion.
5. Try pointer/touch/keyboard/native seek paths, buffering, background/foreground,
   and browser media interruptions. Confirm the next boundary remains enforced.
6. Finish playback, then seek backward/forward and replay without active stops.
   Reveal early, return to the board, change questions, and finish the game; gated
   playback must stop and old permissions must not apply to the next session.

Release the frontend and Firestore rules together when deployment is explicitly
authorized, and reload clients before stop-point games. The feature adds no Worker
API change, new dependency, migration, or index.

The buzzer checks also cover collection-time input, one-second local grace boundaries,
winner/cancellation interruption, refresh timing, personal penalties, explicit submission
outcomes, delayed acknowledgments after resolution, deadline rejection without state changes,
and recovery that preserves genuine write/read failures. These non-browser checks run only
through `scripts/verify-game-storage.mjs`, including the actual action modules and checked-in rules.

Browser verification for the Buzz flow uses this checklist, requiring an explicit
browser-testing request for agent execution. Use a host and two contestants; record the
language, device/viewport, steps, and observed behavior:

- Open a question; after one contestant presses, confirm the other can still use Buzz or
  Space before collection closes, and a later-arriving faster reaction can win.
- Delay question/race delivery to one contestant until less than one second remains.
  Confirm local input lasts one second from activation unless a winner is announced first;
  a press committed after the deadline shows neutral too-late/ended feedback.
- Refresh during collection/grace, check competitive penalties and wrong-answer reopening,
  and confirm neither refresh nor repeated snapshots restart existing timing.
- Test offline/reconnect and failed submissions: show error feedback only for genuine
  failures, clear it when the press is confirmed, and offer retry only while collection permits it.
- Compare button and Space, including repeated Space and editable fields; check received/waiting,
  accepted-loser and tie feedback in English/Ukrainian at desktop/mobile widths.

Local browser verification on 2026-10-06 used the production active-question component
and buzzer hook in an isolated Emulator-backed harness, with host/two contestant roles,
English/Ukrainian, 1440×900 desktop and 390×844 mobile viewports. Collection-time mouse/Space
presses, delayed unlock/grace expiration, neutral deadline rejection, winner interruption,
penalty persistence through refresh, offline/reconnect, and listener retry exhaustion passed.
Snapshot delay and listener failures were injected by the harness. The checks found and fixed
stale submission-map contention, repeated input after a confirmed deadline rejection, and
stale collection status after winner announcement. This does not verify production sign-in
or physical-device browser behavior.

The same entry point includes `scripts/verify-pack-rounds.mjs`; do not run it as a
separate suite. Round checks cover legacy normalization, one/two/three-round starts,
invalid or empty rounds, duplicate IDs, frozen content, current-round selection,
negative-score carryover, spectator/reconnect state, repeated/concurrent transitions,
cumulative streaks/category statistics, skipped questions, pending surprise awards,
final-result gating, early finish, and snapshot cleanup. Worker fixtures use mocked
HTTP responses to check nested/legacy media authorization without external services.

New pack content uses `rounds: [{ id, categories }]`; legacy `categories` is one round.
Newly started rooms store `currentRoundIndex`, `roundCount`, and
`currentRoundQuestionIds`; question states remain game-wide. `round_break` persists
the intermediate screen. Host advancement validates the expected index transactionally,
preserves scores/turn/recap, and appends one start event. Rules protect advancement and
current-round question selection. Host actions validate completion; rules do not
independently adjudicate every question or score.

Breaks retain the frozen snapshot. Finishing during a break atomically finalizes
recap/profile achievements and deletes the snapshot. Coordinate rules, frontend,
and ImageKit Worker releases: deploy the compatible Worker and rules first, then
the frontend, and reload older clients. No migration or new indexes are needed.
No deployment is part of validation. Browser/UI checks remain pending as described
in the [gameplay reference](gameplay-reference.md#pack-rounds-and-intermediate-standings).

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
