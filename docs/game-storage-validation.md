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

## Release verification

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
