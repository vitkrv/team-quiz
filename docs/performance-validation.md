# Performance and recovery validation

These changes preserve scoring, turn order, buzzer ranking and server deadlines,
legacy rooms, frozen content, and host judging. No dependencies or versions change.

## Changes

- Deadline-driven buzzer and scoreboard updates replace periodic React updates.
  `AnswerTimer` owns its visual ticks; it pauses when hidden and stops at zero/reveal.
- Room and buzzer listeners share recovery/error classification and a room/user
  reconnect group. Only the room performs periodic idle probes. Stable content is
  separated from metadata/status; unchanged freshness reads retain data identity.
  Memoized gameplay and stable callbacks prevent connection-only updates from
  redrawing the whole game.
- Worker async failures return structured JSON. Authorization, deletion, uploads,
  response parsing and upstream body reads have bounded failure handling. Existing
  Firebase ownership and ImageKit path validation remain in place.
- Media preloading uses at most three concurrent loads (one with data saving),
  prioritizes visible content, shares duplicate requests, cancels queued background
  work on board departure, and retains at most 64 settled cache entries once pending
  work drains. Failed entries expire after five seconds; displayed failed images
  retry on online/focus/visibility recovery. Eviction releases playable media.
- Major screens load lazily, with localized loading/reload feedback. Join/host setup
  prefetches gameplay. An initial build reduced main JS from 1.34 MB / 356 KB gzip
  to about 985 KB / 267 KB gzip; this is bundle output, not a device timing result.
- Recap score reads page only beyond a committed summary sequence checkpoint.
  Results stay visible during incremental refresh. Session caches retain 12 games
  and clear on auth identity changes. First profile load still scans every award in
  pages of 100 to preserve the correct best awards; later loads query inclusively
  from the last completion timestamp. Only best-award records are retained.
- Frozen pack reads share a promise within one transaction attempt/path, never
  across SDK retries. Index exemptions target large fields that the app does not
  query; existing history indexes, score sequence and achievement completion-time
  indexes remain enabled.

## Non-browser checks

From the repository root:

```powershell
npm run lint
npm run build
node scripts/verify-client-performance.mjs
node scripts/verify-server-clock.mjs
node scripts/verify-surprise-points.mjs
git -c core.autocrlf=false diff --check
```

For transaction and query regression coverage run the single dedicated Emulator
workflow in [game-storage-validation.md](game-storage-validation.md). It includes
the Worker ownership fixtures, transaction-attempt pack-read reuse, multi-page
result/achievement loading, timestamp ties, and shared recovery behavior.
Expected permission-denied errors in negative fixtures are not failures; inspect
the final scenario count and exit code.

The Emulator does not validate production index readiness or quantify index
fanout savings. Confirm deployed queries and indexes before applying exemptions.

## Release

No deployment is performed by these checks. This change includes
`imagekit-auth-worker/worker.js` and `firestore.indexes.json`. When explicitly
authorized, deploy the Worker from its directory with `wrangler deploy`, index
configuration with `firebase deploy --only firestore:indexes`, and the built
frontend with `firebase deploy --only hosting`. Security rules and stored formats
are unchanged; no data migration is needed.

The previous media-reference/cleanup consistency and active-game asset-retention
limitations remain separate work. Transport failures now settle, but external
storage operations are still not atomic with Firestore writes.

## Browser verification status

The 2026-11-17 isolated browser run covered desktop (1440 × 900) host and
contestant lobby/board navigation, a Ukrainian contestant board, and opening an
ordinary question. These are tester-reported observations; no screenshot or
profiling artifact was retained. The profiler tool stalled, so countdown render
isolation and performance gains remain unverified in a browser. Mobile,
spectators, buzzer deadlines, recovery, media and repeated results/profile visits
remain pending. No confirmed application failure was reported.

The detailed local report is retained at
`.firebase/validation/perf-browser-report.md` (ignored, not shipped). Its fixture
isolates Firebase and disables Analytics, but does not isolate ImageKit. Before
media verification, configure a disposable Worker/storage target or local mock
and isolate uploads as well. Automatic emulator sign-in does not test OAuth.

## Browser handoff prompt (remaining checks)

Use GPT-6.1 Sol with Medium reasoning for this task:

> Browser-test the current uncommitted changes in C:\_Git\team-quiz. Read AGENTS.md
> and docs/performance-validation.md first. Browser verification is authorized for
> this handoff; do not deploy, commit, or change production data. Use disposable
> test accounts/packs/rooms on an isolated configured environment. If suitable
> credentials/services are unavailable, report the blocker rather than using
> production data. Run a production build/preview for loading checks. Verify English
> and Ukrainian at desktop and approximately 390px mobile widths, using host,
> contestant, and spectator sessions. Check:
>
> 1. Direct ?room and ?game links, login, lazy screen navigation, loading/error
>    fallback, retry after a blocked chunk, and sign-out/account switching.
> 2. Standard/competitive buzzer unlock, early penalty, delayed-client grace,
>    wrong-answer reopening, accepted/late feedback, and the ten-second visual
>    countdown. Use React profiling or equivalent evidence to confirm idle questions
>    no longer render every 50ms and countdown ticks do not redraw the full game.
> 3. Offline/online, tab background/resume, stale cached snapshots, and explicit
>    reconnect. A failed buzzer must not enable input from stale data; reconnect
>    should restore both streams without changing reaction origin or deadline.
> 4. Image-heavy boards and audio/video answers: limited concurrent preloads,
>    visible-content priority, recovery after failed loads, cancellation of queued
>    background work, and memory behavior across multiple rounds/games.
> 5. Disposable media uploads/replacements/deletions, including malformed responses,
>    dropped connections, timeouts and denied ownership. The editor must leave its
>    busy state and show useful localized feedback. Check frontend and Worker.
> 6. Results with more than 100 score events, repeated results/profile visits,
>    new achievements including equal timestamps and value ties, and switching
>    accounts. Charts/best awards must remain correct without complete repeat reads.
> 7. Legacy rooms, surprise wheel/table, round breaks, host history/score editing,
>    finish and shared results. Scoring and role boundaries must remain unchanged.
>
> Report each check with role, language, viewport, steps, observed behavior and
> evidence. Separate passes, failures and blocked checks; do not claim performance
> improvements from bundle size alone. Do not make code changes during verification.
