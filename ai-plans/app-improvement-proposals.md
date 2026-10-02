# Cortex Rush improvement proposals

Reviewed: 2026-09-20 against the working tree at `051f004` (app version `4.2.0`). All 24 items were reassessed against source, including the new storage, recap, and buzzer modules. This is a source review, not a new runtime verification or deployment check. Earlier validation records below are historical reports preserved from this plan; they were not rerun or independently confirmed during this update.

Numbers are unique across both sections and can be used as backlog references. **Priority:** P1 = address first, P2 = next iteration, P3 = optional expansion. Benefits describe expected outcomes, not measured results. Preserve the existing game mode as the default when adding optional rules.

**Status summary:** 3 implemented (04, 13, 23); 6 partially implemented (01, 03, 05, 06, 07, 12); 15 open. Implemented items remain as references and are no longer new implementation tasks. Partially implemented items describe only the remaining work under **Change**. Item 04's original server-receipt winner proposal is superseded by the implemented local-reaction policy; item 23's removed question-review scope remains out of scope.

New rooms use `dataVersion: 2`, `recapVersion: 1`, and `buzzerPolicyVersion: 1`. Older rooms can lack one or more markers and retain their corresponding older behavior; do not assume new guarantees apply retroactively. Product context: [app baseline](../docs/app-overview.md), [gameplay reference](../docs/gameplay-reference.md).

## Tech improvements

### 01. Enforce host and player permissions in the data layer — P1 — Partially implemented

- **Now:** Rules protect room identity/version fields, storage lifecycle, private history, recap records, and policy-v1 buzzer submissions and lifecycle. They still broadly permit participant updates outside those restrictions; `canJoinLobby` does not enforce unchanged existing player entries or the UI's 21-member capacity. Scores and every host-only action are not independently validated by rules.
- **Change:** Extend action-specific field allowlists and invariants to score changes, player records, admission/capacity, leaving, and remaining host tools. Build on the existing storage/buzzer checks rather than replacing them; define the policy for older rooms explicitly.
- **User benefit:** Players cannot bypass UI controls to alter scores or disrupt another player's game.
- **Code basis:** `firestore.rules` (`roomParticipantOrHost`, `canJoinLobby`, room update rule).

### 02. Keep unrevealed answers and secret choices out of player snapshots — P1 — Open

- **Now:** New live rooms no longer embed packs, but their separate frozen packs still contain full answers and permit Google-authenticated reads. RPS choices and surprise-table values remain shared room data. Legacy rooms embed full packs. Storage separation has not implemented answer secrecy.
- **Change:** Separate host-only answer data and private submissions from the public game state. Publish answers and RPS choices only at the appropriate reveal stage; resolve hidden surprise values through a trusted action. Define explicit participant and spectator read access. Public packs remain studyable, so offer private packs for competitive sessions.
- **User benefit:** Fewer spoilers and stronger confidence in fair play, especially with private competitive packs.
- **Code basis:** `src/actions/roomActions.js` (`startGame`), `src/hooks/useGamePack.js`, `firestore.rules`, `src/actions/gameActions.js`, `src/views/game/ActiveQuestionView.jsx`.

### 03. Make scoring and round completion atomic and repeat-safe — P1 — Partially implemented

- **Implemented scope (2026-09-20):** Current-format wheel spins persist a unique identity, selected value, server start time, and six-second duration without awarding points. Shared animation progress survives refresh/late delivery; result labels remain hidden until the wheel settles. After the deadline, the host or selected contestant can atomically complete score/history/recap updates using a stable completion event ID. Mounted clients recover after reconnect and show localized pending/retry feedback. Firestore validates spin immutability and rejects early or incomplete award writes for both roles.
- **Quiz safeguards:** Judgments derive points from the frozen pack and current transactional score. Host-event deduplication checks all batch event IDs, including when the first score edit was filtered as a no-op; manual adjustments retain transactional recalculation. Continue checks the expected question and completed surprise scoring inside the transaction; explicit Finish rejects an unresolved judged surprise award before recap finalization or snapshot deletion.
- **Change remaining:** RPS transition hardening is explicitly deferred. Keep this item **Partially implemented** until that work is completed; the wheel/quiz scope above is implemented. Only current-format rooms (`dataVersion: 2`, `recapVersion: 1`, `buzzerPolicyVersion: 1`) are supported by this change. Legacy recovery, compatibility adapters, backfills, and pre-update spin recovery are out of scope.
- **Validation:** Agent-run ESLint and production build passed (existing Vite large-chunk warning). The user-run combined Emulator harness passed all **39 scenario groups**, including all five new wheel/quiz groups, with **exit code 0** on 2026-09-20 (namespace `storage-check-1789917747731`). This covers concurrent starts/completions, deadline/immutability denials, fresh-client recovery, positive/negative awards, concurrent adjustments, stale transitions, pending-award finish rejection, and rollback. Browser animation/responsiveness checks remain pending; see [validation guidance](../docs/game-storage-validation.md#item-03-wheel-recovery-and-quiz-transitions). Nothing was deployed. Coordinate frontend/rules releases and reload clients.
- **User benefit:** Refreshing, repeated clicks, or simultaneous host tabs will be less likely to lose, duplicate, or overwrite points or leave a round unfinished.
- **Code basis:** `src/actions/gameStorage.js` (`updateRoom`), `src/actions/gameRecap.js` (`prepareRecap`), `src/actions/gameActions.js` (`startSurpriseWheel`, `completeSurpriseWheel`), `src/hooks/useSurpriseWheel.js`, `src/utils/wheelPolicy.js`, `src/views/game/ActiveQuestionView.jsx`, `firestore.rules`, and `scripts/verify-wheel.mjs` through the combined storage entry point.

### 04. Give buzzer timing one authoritative policy — P1 — Implemented — local reaction collection

- **Current disposition:** No longer an open implementation task. The original proposal to choose winners by server receipt order is superseded by the implemented local-reaction ranking described below. Do not silently replace that gameplay decision when hardening item 01.
- **User benefit:** Shared eligibility and penalties, consistent button/Space behavior, recoverable finalization, and clearer close-race feedback.

- **Before:** The first Firestore transaction claimed the buzzer; eligibility and late gaps used client timestamps, competitive penalties lived in browser storage, and timing constants were duplicated.
- **Implemented (2026-09-19):** New rooms opt into immutable `buzzerPolicyVersion: 1`. A bounded current-race document accepts one immutable submission per contestant. The first Firestore commit starts a strict two-second collection window. Normal clients stop accepting new input when they observe collection; already captured in-flight presses can still arrive before the deadline. The host resolves the lowest device-reported reaction duration, breaking ties by server acceptance time and player ID. No latency estimate or new backend service is used.
- **Timing and recovery:** Shared constants retain the two-second opening delay, fixed 2.5-second competitive penalty, 3.5-second losing-feedback threshold/notice duration, and ten-second visual answer timer. Button and Space share early-press behavior. Recorded penalties survive refresh/devices; repeated early presses do not extend penalties or recap counts. Reaction time starts at personal availability, including after a penalty. Refresh restores elapsed time, with shared unlock as fallback. Wrong answers open a fresh race immediately; reveal/finish cancel unresolved races. Host reconnect resolves the original closed window, and the answer timer begins at winner finalization.
- **Recent-feature integration:** Winner selection, private host history, and recap/achievement projections commit atomically. Losing feedback describes reported reaction gaps; exact ties have explicit feedback and cannot earn a zero-gap closest-late award. Existing pre-policy rooms retain their previous behavior without migration. English/Ukrainian connection, clock, pending, and failure feedback is included; a captured eligible press pauses local question media immediately.
- **Trust boundary:** Rules enforce ownership, current eligibility, recorded penalties, immutable submissions, and server commit deadlines. Local reaction measurements, reporting of early presses, in-flight-only client behavior, and host ranking remain trusted. The two-second limit governs collection, not guaranteed end-to-end display latency. Broader gameplay authorization remains item 01.
- **Validation:** ESLint and production build passed (existing Vite large-chunk warning). All 34 isolated Emulator scenario groups passed, including 12 buzzer groups covering reordered arrivals, retries, penalties, deadlines, ties, lifecycle cancellation, 20-player finalization, and compatibility. Browser checks with emulated identities covered English/Ukrainian mobile layouts, desktop player controls, delayed submissions, early Space, refresh, collection, host judging, history, host-reconnect resolution with a fresh answer timer, and immediate pause of a silent local audio fixture before submission completed. Production Google sign-in, deployed URLs, external media, and real multi-device latency were not tested. Rules and frontend require a coordinated release; nothing was deployed.
- **Code basis:** `src/actions/buzzerActions.js`, `src/actions/buzzerState.js`, `src/hooks/useBuzzer.js`, `src/utils/buzzerPolicy.js`, existing storage/recap helpers, and `firestore.rules`. See [gameplay rules](../docs/gameplay-reference.md#4-ordinary-question-sequence) and [validation guidance](../docs/game-storage-validation.md).

### 05. Add focused automated regression checks — P1 — Partially implemented

- **Now:** A focused Firestore Emulator harness exists: `scripts/verify-game-storage.mjs` includes storage, recap, and buzzer scenarios covering permissions, concurrency, repeat-safe actions, and compatibility. There is still no general unit/e2e test script or checked-in GitHub Actions workflow.
- **Change:** Extend the existing harness for unresolved permission and interrupted-wheel cases, then add targeted utility and browser smoke coverage where useful. Consider CI integration as separate implementation work. Under current repository policy, agents may run lint/build, but other checks remain user-run unless explicitly requested.
- **User benefit:** Fewer broken games and accidental permission regressions after releases.
- **Code basis:** `package.json`, `scripts/verify-game-storage.mjs`, `scripts/verify-game-recap.mjs`, `scripts/verify-buzzer.mjs`, [validation guidance](../docs/game-storage-validation.md). Use the combined storage entry point rather than running its modules separately.

### 06. Make connection health and recovery visible — P2 — Partially implemented

- **Now:** Remembered rooms and server reconciliation remain. Policy-v1 buzzing now shows offline, pending, failure, syncing, stale-clock, and slow-sample feedback, and host finalization resumes after reconnect. Pack/history/recap loaders expose retry paths. These are not a room-wide presence system or a confirmation that every action reached the server.
- **Change:** Extend pending/confirmed/retry feedback to remaining host actions and add a shared connection indicator plus expiring presence separate from membership. Reuse the existing buzzer and loading feedback instead of duplicating it.
- **User benefit:** Players know whether a buzz or host action was accepted, and hosts can distinguish a disconnected player from someone still thinking.
- **Code basis:** `src/App.jsx`, `src/hooks/useBuzzer.js`, `src/views/game/ActiveQuestionView.jsx`, `src/hooks/useGamePack.js`, `src/hooks/useGameHistory.js`, `src/hooks/useGameRecap.js`.

### 07. Separate live room state from growing history and pack data — P2 — Partially implemented; core separation complete

- **Now:** Live v2 rooms contain pack metadata/reference and interaction state, with separate history and frozen pack content as detailed below. Pack-library screens still fetch full matching packs and sort locally, so the original proposal is only partially complete.
- **Implemented (2026-09-18):** New rooms use `dataVersion: 2` and contain display metadata plus a pinned pack-version reference. History is stored as individual events in `rooms/{gameId}/history/{eventId}`, readable exclusively by the host; players and spectators receive no history in shared room payloads. The host loads the latest 50 events and older pages on demand. Existing gameplay actions append their events atomically, including validated player buzz and surprise-scoring events without history read access.
- **Buzzer integration update:** For policy-v1 rooms, contestants submit to the separate current-race document; the host writes accepted winner/loser history and recap during finalization. Early-penalty and surprise events retain their validated atomic write paths.
- **Pack lifecycle:** Start Game atomically freezes the latest accessible source pack in `gamePackVersions/{versionId}` and initializes the board. All participants use that immutable version. Explicitly finishing atomically deletes it and retains standings/champion data for results links. Concurrent starts/finishes do not duplicate their snapshot or final events.
- **Compatibility and deferred scope:** Only new rooms use this format; existing rooms keep embedded history/packs and their previous data visibility. Full pack answers remain shared; item 02's secrecy work is not implemented here. Pack-library summaries/pagination, broader room retention, abandoned-game cleanup and media-file retention remain deferred.
- **Change:** Keep the implemented history/pack separation. Add lightweight paginated pack-library queries and an explicit abandoned-game retention policy that preserves results. Coordinate external-file retention with item 09. No migration, extra index, or TTL setup is required for the current implementation; cleanup would be new work.
- **User benefit:** Live updates already avoid resending growing history/full packs and source edits cannot change a running new-format game. The remaining library and cleanup work would reduce browsing load and retained abandoned-game data.
- **Code basis:** `src/actions/gameStorage.js`, `src/actions/roomActions.js`, `src/actions/gameActions.js`, `src/hooks/useGamePack.js`, `src/hooks/useGameHistory.js`, `firestore.rules`.
- **Validation:** ESLint and production build passed. All 15 isolated Firestore Emulator scenario groups passed, including permissions, concurrent start/finish, immutable content, player events, RPS, pagination, legacy behavior and revoked pack access. Browser checks using real game components with Emulator identities covered history pagination, player buzz/judgment, surprise selection/wheel scoring, spectator entry/refresh and final standings after snapshot deletion. Production authentication, hosted URL routing and external media were not exercised. No deployment was performed. See [validation commands and limitations](../docs/game-storage-validation.md).

### 08. Recover drafts and detect conflicting pack edits — P2 — Open

- **Now:** Text edits live in React state until saving or certain media-related writes; media actions can persist pack data immediately. Back navigation does not check for unsaved edits, and saves do not compare a revision.
- **Change:** Add recoverable drafts, visible saved/unsaved status, and a navigation warning for unpersisted work. Use revision checks for simultaneous editing and separate draft content from the saved pack frozen at Start Game. Running games are already insulated from later text edits; draft protection is still needed for authors and future starts.
- **User benefit:** Authors lose less work and avoid accidentally publishing incomplete edits or overwriting another browser's changes.
- **Code basis:** `src/views/PackCreator.jsx` (`handleBack`, `ensurePackForMediaAction`, `handleSave`).

### 09. Make media cleanup recoverable and protect existing games — P1 — Open

- **Now:** Uploads, pack writes, and media deletion remain separate operations; pack deletion removes files before deleting the pack document. Frozen packs preserve file references, not the external files, so source-pack replacement/deletion can break active games. Finished recaps deliberately retain no question/answer content or media.
- **Change:** Track pending uploads and retryable cleanup jobs, stage deletion safely, and retain files referenced by active frozen packs and supported legacy rooms. Define how those references expire with item 07; do not introduce finished-question media retention for the removed review feature in item 23.
- **User benefit:** Fewer broken question images/videos and fewer confusing partial-save or partial-delete outcomes.
- **Code basis:** `src/views/PackCreator.jsx`, `src/views/PackManager.jsx` (`handleDeletePack`), `imagekit-auth-worker/worker.js`, `src/actions/roomActions.js`, `src/actions/gameActions.js` (`handleEndGame`).

### 10. Improve media preparation and synchronized playback — P2 — Open

- **Now:** Images have optional compression; audio/video still upload original files. Playback schedules a local `play()` using `Date.now()` and handles autoplay blocking without playback-position reconciliation. The new buzzer immediately pauses media on the pressing contestant's device, but does not synchronize every device's playback or readiness.
- **Change:** Build on the existing [audio/video compression plan](browser-side-audio-video-compression-ffmpeg-wasm.md), with cancellation and original-file fallback. Add media readiness reporting, use the shared clock for start time, and catch up playback after reconnects without preloading secret answer media.
- **User benefit:** Shorter uploads, less waiting, and more consistent audio/video questions across devices.
- **Code basis:** `src/services/imageStorage.js`, `src/components/QuestionMedia.jsx`, `src/hooks/useServerClock.js`.

### 11. Standardize accessible dialogs and gameplay feedback — P2 — Open

- **Now:** Space and button buzzing now share policy-v1 behavior. Results charts support keyboard selection, and the media lightbox has labeled close controls. Some dialogs and reduced-motion styles exist, but dialog focus trapping/restoration, Escape handling, and status announcements are still not consistently shared.
- **Change:** Introduce a reusable accessible dialog with focus trapping/restoration and appropriate dismissal rules. Label icon controls, announce important game state changes, and extend reduced-motion behavior to scripted celebrations.
- **User benefit:** More reliable keyboard and screen-reader use, with a more comfortable experience for motion-sensitive players.
- **Code basis:** `src/views/game/GameRoom.jsx`, `src/components/MediaLightbox.jsx`, `src/components/EmojiPicker.jsx`, `src/views/game/PlayersScoreProgression.jsx`, `src/index.css`.

### 12. Centralize game transitions and useful failure reporting — P2 — Partially implemented

- **Now:** Room creation/start, storage/history, recap, and buzzer logic have dedicated modules. Views use shared write helpers, but still assemble judging and wheel transitions. Buzzer/load failures have localized feedback; other failures, including delayed wheel scoring, can still be console-only. Analytics remains product-event oriented.
- **Change:** Extract the remaining view-owned transitions into focused actions, standardize explicit outcomes and state contracts, and report recoverable errors consistently. Add structured diagnostics without answer content or personal data; preserve the existing atomic history/recap/buzzer integration.
- **User benefit:** Faster diagnosis of failed actions and more predictable behavior as gameplay features expand.
- **Code basis:** `src/actions/roomActions.js`, `src/actions/gameStorage.js`, `src/actions/gameRecap.js`, `src/actions/buzzerActions.js`, `src/views/game/ActiveQuestionView.jsx`, `src/services/analytics.js`.

### 13. Reserve room codes without collisions — P2 — Implemented

- **Now:** Room creation reserves a six-digit code atomically with a stable game ID, retries up to 10 candidates, and only reuses mappings to finished games. Legacy numeric room IDs stay reserved. Joining resolves the code transactionally, while results links and remembered rooms use stable IDs.
- **Change:** None required for this proposal; preserve these identity and compatibility guarantees. It is no longer an open collision-prevention task.
- **User benefit:** More dependable room creation and durable results links as more games are created.
- **Code basis:** `src/actions/roomActions.js` (`createRoom`, `getRoomByCode`), `src/views/JoinRoom.jsx`, `src/App.jsx`, `firestore.rules`, `scripts/verify-game-storage.mjs`.
- **Implemented (2026-09-17):** Room creation atomically writes a stable Firestore-generated game ID and a six-digit `roomCodes` reservation, trying up to 10 candidates on collisions. Codes mapped to finished games can be reused without overwriting those games or their results. Legacy numeric room IDs stay reserved. Joining resolves the code inside its transaction; invitation UI still uses six digits, while remembered rooms and `?game=` URLs use stable, case-sensitive IDs. Firestore rules require a matching atomic reservation and protect room identity fields.
- **Historical validation:** The original 2026-09-17 entry reported lint/build and an in-memory transaction harness passing, with Emulator checks still pending then. Later storage/recap work added Emulator coverage for reservations and retained results after code reuse. These historical records do not establish the currently deployed rules or fresh runtime results; no checks or deployment were performed in this review.

## Gameplay improvements

### 14. Add a ready check and a short practice question — P2 — Open

- **Now:** Players join with a nickname/avatar; the host's Start control requires at least one contestant and freezes the saved pack before category previews. There is no per-player readiness check or practice round.
- **Change:** Add Ready status, a brief explanation of buzzing and penalties, and an optional unscored practice question with an audio check. Let the host start despite missing confirmations when appropriate.
- **User benefit:** New players understand the controls before points are at stake, and technical problems surface earlier.
- **Code basis:** `src/views/JoinRoom.jsx`, `src/views/game/GameRoom.jsx` (lobby and `handleStartGame`).

### 15. Offer configurable rules and optional answer timers — P2 — Open

- **Now:** The lobby offers `trueCompetitiveMode`. Shared constants define the two-second opening/collection windows, 2.5-second early penalty, and ten-second visual answer countdown. That countdown already exists and starts at host winner finalization for policy-v1 rooms; reaching zero does not judge or deduct points.
- **Change:** Make the existing visual answer duration and selected gameplay rules configurable through room presets and a shared summary. Keep current defaults and manual judging. Any changes to rule-enforced buzzer windows require matching versioned policy/rule changes; do not add automatic timeout penalties without an explicit mode decision.
- **User benefit:** Hosts can adapt the pace to children, casual groups, or competitive players without changing familiar defaults.
- **Code basis:** `src/utils/buzzerPolicy.js`, `src/views/game/GameRoom.jsx`, `src/views/game/ActiveQuestionView.jsx`, `src/actions/buzzerActions.js`, `firestore.rules`.

### 16. Add shared pause/resume and host handover — P2 — Open

- **Now:** Remembered-room recovery and reconnecting-host buzzer finalization exist. There is no shared pause state or host-transfer workflow, and rules explicitly make `hostId` immutable.
- **Change:** Add coordinated pause/resume for buzzing, the existing visual answer countdown, and media, with a defined policy for already collecting races. Design an authorized handover that deliberately updates identity rules, private history access, recap roles, and host exclusion from standings; it cannot be only a new UI button.
- **User benefit:** Breaks or a host device problem do not require abandoning the session.
- **Code basis:** `src/App.jsx` (room return), `src/views/game/GameRoom.jsx`, `src/views/game/ActiveQuestionView.jsx`, `firestore.rules`.

### 17. Add team play with a rotating answering captain — P3 — Open

- **Now:** Scores, turns, buzz eligibility, standings, recap statistics, and profile achievements belong to individuals. There is still no separate team model.
- **Change:** Add an optional team lobby with shared points and a visible rotating/assigned answering captain. Define team eligibility, standings, and how individual recap/achievement records relate to team results before extending the scoring model.
- **User benefit:** Larger groups can cooperate, and less confident players can contribute without carrying the whole answer alone.
- **Code basis:** `src/views/JoinRoom.jsx`, `src/views/game/GameRoom.jsx`, `src/views/game/ActiveQuestionView.jsx`, `src/views/game/ResultsView.jsx`.

### 18. Add host-controlled late admission and lobby moderation — P2 — Open

- **Now:** A newcomer joining after the lobby becomes a spectator; existing participants retain their role. Lobby admission is automatic with a client-side 20-contestant limit. Recap player records are initialized when the game starts.
- **Change:** Let spectators request a seat between questions, with host approval, removal, and lobby-lock controls. Define starting scores and initialize late entrants' recap/achievement state atomically; removal must preserve already earned results and valid turn/buzzer state. Enforce capacity and admission in the data layer.
- **User benefit:** Friends who arrive late can participate without restarting, while hosts retain control over who plays.
- **Code basis:** `src/views/JoinRoom.jsx` (`handleJoin`), `src/views/game/GameRoom.jsx`, `firestore.rules` (`canJoinLobby`).

### 19. Add a guarded undo for the last host judgment — P2 — Open

- **Now:** Hosts can adjust/set scores with atomic history and recap updates, but corrections count as manual adjustments rather than reversing the original judgment, answer statistics, question state, or turn. History is append-only and finished recap/profile awards are immutable.
- **Change:** Add a compensating judgment event before the next question starts. Restore scores, eligibility, turn, buzzer lifecycle, and affected recap statistics together without rewriting history or finalized awards. A revealed answer cannot be made secret again.
- **User benefit:** An accidental Correct/Incorrect click can be repaired consistently without manual bookkeeping.
- **Code basis:** `src/views/game/GameRoom.jsx` (`ScoreEditorModal`, `HistoryModal`), `src/views/game/ActiveQuestionView.jsx` (`handleJudge`).

### 20. Support hints, answer explanations, and accepted variants — P2 — Open

- **Now:** Questions support text/media, answer text/media, points, and surprise settings. There are no dedicated hint, explanation, source, or accepted-answer fields.
- **Change:** Add optional author-written hints with a visible points cost, accepted variants for host judging, and an explanation/source revealed after the answer. Keep the host responsible for judging free-form answers.
- **User benefit:** Stuck rounds can continue, judging becomes more consistent, and players learn why an answer is correct.
- **Code basis:** `src/views/PackCreator.jsx` (question schema and editor), `src/views/game/ActiveQuestionView.jsx` (judging and reveal).

### 21. Make pack selection easier and add a short-session option — P2 — Open

- **Now:** Hosting still fetches complete owned/public pack documents and sorts them locally, displaying author and aggregate round/category/question counts. Packs support 1–3 rounds within one game. Room creation stores display metadata; Start Game freezes the latest saved full pack and initializes its board.
- **Change:** Add language, topic, difficulty, and estimated-duration metadata with search/filtering, coordinated with item 07's library pagination. Offer a balanced short-session subset and freeze that selected content atomically at start so the board, category previews, and recap agree.
- **User benefit:** Groups find suitable content faster and can fit a game into the time they have.
- **Code basis:** `src/views/HostSetup.jsx`, `src/views/PackCreator.jsx`, `src/actions/roomActions.js` (`startGame`).

### 22. Offer a knowledge-based tie-breaker — P3 — Open

- **Now:** Completed-board top-score ties use host-managed RPS and a champion override without changing quiz scores. There is no knowledge-based option; early finish can still bypass the tie-breaker.
- **Change:** Keep RPS available and add an optional reserved trivia question or closest-number challenge. Collect private simultaneous submissions, reveal together, and define how further ties are handled before the challenge begins.
- **User benefit:** Competitive groups can settle a trivia contest through knowledge while casual groups retain the existing playful ending.
- **Code basis:** `src/actions/gameActions.js` (tie-breaker actions), `src/components/RockPaperScissorsManager.jsx`, `src/views/game/ResultsView.jsx`.

### 23. Add a post-game performance recap and achievements — P2 — Implemented

- **Now:** Recap-enabled games accumulate statistics and achievements across all pack rounds without resets and show eight possible shared-winner achievements, per-player performance/category statistics, and individual/all-player score charts. Structured projections and immutable profile awards survive explicit finish and frozen-pack deletion. Buzzer-policy timing labels distinguish reported reactions from server-verified measurements.
- **Change:** None required for the implemented recap/achievement scope. Profile browsing controls remain deferred, not a missing part of this delivered scope. Revealed-question review and the Event/Change/Score table were intentionally removed and are no longer relevant to this item; do not reintroduce them as unfinished work.
- **User benefit:** Players can understand their performance and recognize contributions beyond first place, with retained results and awards.
- **Code basis:** `src/actions/gameRecap.js`, `src/utils/achievements.js`, `src/hooks/useGameRecap.js`, `src/views/game/ResultsRecap.jsx`, `src/views/game/PlayersScoreProgression.jsx`, `firestore.rules`.

- **Implemented (2026-09-18):** New v2 rooms opt into `recapVersion: 1`. Atomic gameplay projections retain statistics and score progression separately from the live room and private history. The compact final screen places the winner avatar beside the trophy, eight shared-winner achievements beneath standings, and expandable performance recap. New UI strings use English/Ukrainian i18n. Finishing atomically saves immutable profile achievements with stable game ID, invitation code, and completion date while deleting the frozen pack. Existing v2/legacy rooms have no recap or backfill; profile controls remain deferred.
- **Validation:** ESLint and production build passed (existing Vite large-chunk warning). All 22 isolated Emulator scenario groups passed, including concurrent early attempts, repeated operations, wheel scoring, rollback, concurrent finish, 20 offline award recipients, immutable records, history privacy, and retained results after pack deletion/code reuse. Browser checks covered desktop/mobile English/Ukrainian layouts, tied awards, score progression, and a host/player buzz → judgment → finish → player-refresh flow. Simulated Google identities were used; production sign-in, deployed shared URLs, and external media services were not tested. Rules and frontend require a coordinated release; nothing was deployed.
- **Scope update:** Removed the revealed-question review section and its snapshot storage, readers, media UI, translations, and access rules. Player achievements and performance recap remain implemented. Existing stored review documents are not used or migrated. The Event/Change/Score table and its dedicated translations were also removed; performance statistics and the score-progression chart remain.
- **All-player chart:** Added a shared score-progression chart below achievements, with stable player colors, a common committed-event timeline, and a legend beneath it. Clicking a line or legend entry highlights both and dims other players; selecting again clears the highlight. Keyboard selection and English/Ukrainian labels are supported. All score pages load automatically for the shared chart and are reused by the individual performance chart.

### 24. Add rematches and an optional multi-game series — P3 — Open

- **Now:** The results screen returns players to the main menu; a new game requires the host to create another room and players to join it. Pack rounds now run within one game with cumulative scores and achievements; they are not rematches or a multi-game series.
- **Change:** Offer a host-created rematch invitation with the existing roster, reset scores, and a same/new-pack choice. Create a fresh stable game ID and atomically reserved invitation through `roomActions.js`, preserving prior results and immutable awards. Optional series points must remain separate from each game's score and recap.
- **User benefit:** Groups spend less time setting up consecutive games and can run a small tournament without external scorekeeping.
- **Code basis:** `src/views/game/ResultsView.jsx`, `src/views/HostSetup.jsx`, `src/App.jsx` (room navigation).

Suggested sequence: finish the remaining permission/scoring work in 01 and 03, address answer secrecy in 02 and media safety in 09, and extend existing coverage through 05. Then address remaining recovery/authoring/usability work in 06–12 and session improvements in 14–16 and 19. Keep 04, 13, and 23 out of the new-feature queue. Private submissions in 22 depend on 02; team play, late admission, and undo (17–19) must now preserve the implemented recap/achievement model. Cross-game series in 24 should build on stable identities from 13.

For this documentation-only update, source references and relative link targets were reviewed. Lint/build are not needed for prose and were not run. The remaining user-run whitespace check is pending:

```powershell
git -c core.autocrlf=false diff --check
```

This plan was already untracked at review time. Plain `git diff --check` does not inspect untracked files; while it remains untracked, use this additional comparison without staging it:

```powershell
git -c core.autocrlf=false diff --no-index --check -- /dev/null ai-plans/app-improvement-proposals.md
```


### 25. Support up to three rounds in a question pack — Implemented

- **Now:** Packs have 1–3 ordered rounds with numbered editor tabs and per-round board previews. Every round requires a category and every category a question. Authors can add/delete rounds, but cannot move categories or questions between rounds. Existing packs remain single-round packs and convert when saved in the editor.
- **Game flow:** All rounds freeze at game start. Completing a non-final round shows cumulative contestant standings; the host starts the next category presentation. Negative scores, selection turn, streaks, score progression, and achievements carry forward. Final tie-breakers/results remain at the end of the last round; early finish remains available.
- **Persistence:** Round boundaries and advancement use atomic history/state writes, repeat-safe host controls, and rules protecting advancement/current-round selection. Snapshot cleanup and profile awards happen only on explicit finish. Worker media lookup supports both pack formats.
- **Other proposals:** This completes pack rounds, not item 24's rematches/series or item 14's practice question. Items 03 and 12 retain their broader transition-hardening scope; items 08 and 09 retain draft and external-media lifecycle work.
- **Validation:** Non-browser round checks and existing storage/recap/buzzer/wheel checks use the single isolated Emulator entry point. Browser verification is intentionally pending. See [storage validation](../docs/game-storage-validation.md) for commands and [gameplay reference](../docs/gameplay-reference.md) for the manual checklist.
- **Release:** Coordinate frontend, Firestore rules, and ImageKit Worker updates; reload older clients. No migration, version bump, commit, or deployment is part of this implementation.
