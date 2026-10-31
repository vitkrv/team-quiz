# Cortex Rush: game modes and gameplay reference

Last checked against repository code: 2026-09-17.

## Scope

This document captures the current gameplay baseline for manual and AI-assisted changes. Read [App overview](app-overview.md) for product context and the change-review process. Rules describe the implemented UI workflow, with implementation limitations called out separately. Verification for this document was source-based; no live multiplayer session was run.

For dark-themed selection and timing diagrams, see [How the Buzz winner is determined](buzzer-winner-selection.md), including a User A / User B example.

## 1. Modes and optional mechanics

There is one host-led category-board game, with an optional competitive setting. Surprise questions are a question type within that game. Rock-paper-scissors (RPS) is a side activity or a final tie-breaker.

| Feature | Selected where | Effect |
| --- | --- | --- |
| Standard play | Default for a new room | Correct ordinary answers earn their question value; incorrect ordinary answers cost no points. |
| True Competitive Mode | Host toggle in the lobby; default off | Incorrect ordinary answers lose their question value. Clicking the buzzer before unlock adds a personal delay. |
| Surprise question | Pack editor, per question | One selected contestant answers; a signed random/hidden value determines their score change after judging. |
| Surprise wheel or hidden table | Pack editor, per pack | Chooses how surprise points are selected. Missing or invalid settings default to wheel. |
| Host RPS | Host tool between questions | Two selected room members (including the host if selected) play an independent RPS match. It does not automatically change quiz points or the question-selection turn. |
| Final RPS tie-breaker | Completed board with tied top scores | Determines a champion among the highest-scoring contestants without changing quiz scores. |

Competitive mode does not replace surprise scoring with the ordinary right/wrong scoring rule.

## 2. Lobby and starting play

Before creating a room, the host can use **Preview themes** on any owned/public
pack tile in Create Game. This shows the pack name, author, counts, and theme names
grouped by round, without question/answer content or media. Previewing does not
create a room or select a pack for play.

1. The host creates a room from an owned or public pack. New lobbies store pack display metadata; scores begin at zero and the host has a crown avatar.
2. Contestants join using the six-digit code or join link. Names are limited to 18 characters. A saved profile username prefills the editable nickname; otherwise the Google display name or email prefix is used. The host name still defaults to the localized Host label. Profile edits do not rename existing room entries or historical records. New contestants receive an unused animal avatar; an existing participant can retain their avatar and score.
3. The lobby allows 20 contestants plus one host. A contestant can explicitly leave the lobby, removing their entry.
4. Only the host can change competitive mode, and only while the room remains in the lobby.
5. The start control requires at least one contestant. For new rooms, starting freezes the latest saved pack in a separate immutable version and initializes its questions as `available`. A missing, inaccessible or invalid pack leaves the room in the lobby. A random non-host contestant receives the first selection turn.
6. The host advances through category previews in pack order, then opens the board. New arrivals once play/preview has begun spectate instead of joining the scoring roster.

Room lifecycle:

`lobby -> category_preview -> playing -> finished`

Explicitly finishing a new-format game atomically deletes its frozen pack and retains standings/champion data for results links. Completing the board or leaving the page alone does not delete it.

The implementation can go directly from lobby to playing if there are no categories. During `playing`, the board, active question, answer reveal, and tie-breaker are substates rather than separate room statuses.

## 3. Board and selection turns

The board displays categories and question values. Used questions remain consumed and cannot be selected again through the normal UI. Surprise questions use their configured display value; that value does not determine the eventual surprise score.

The contestant identified by `currentTurn` can click an available tile to pulse it as a suggestion. This does not open the question. Only the host opens questions, and the host is not technically restricted to the suggested tile.

Selection turns follow these rules:

| Event | Next selection turn |
| --- | --- |
| Game start | Random contestant |
| Correct ordinary answer | Contestant who answered correctly |
| Incorrect ordinary answer | Unchanged |
| Skip/reveal without awarding points | Unchanged |
| Judged surprise answer, correct or incorrect | Assigned surprise answerer |
| Host RPS completion | Unchanged |

Selection priority does not restrict who may buzz on an ordinary question.

During play, contestants see their own leaderboard tile with a muted slate highlight and a subtle neutral outline around their avatar on desktop and mobile. The blue current-turn highlight takes priority over the tile background; buzz timing temporarily replaces the outlined avatar as usual. Hosts and spectators do not receive a personal tile highlight.

## 4. Ordinary question sequence

### Opening and buzzing

New rooms use buzzer policy v1. Opening an ordinary question creates a race with a server-stamped opening time and a two-second unlock delay. Eligible contestants use the button or Space; the host, spectators, and contestants already judged incorrect on this question cannot buzz.

The Buzz button accepts clicks and taps while preventing touch scrolling, swiping, and text selection that begin on its surface. Touch scrolling outside the button and keyboard buzzing remain available.

Each client measures reaction time from its own enabled-button render using a monotonic clock. The first submission committed by Firestore opens a **two-second collection window**. Eligible contestants can still press the button or Space while collection is open. A client whose button becomes active late retains a **one-second local grace period** from that enabled render, even if collection has closed locally. The grace ends immediately on winner announcement, cancellation, reveal, question change, loss of eligibility, or an accepted personal submission. Offline and pending submissions disable input. Local grace does not extend the server deadline: a submission must still commit strictly before it. Collection does not announce a provisional winner.

After the deadline, the host client transaction selects the lowest reported reaction time. Exact ties use server acceptance time, then stable player ID. For example, a reported 0.5-second reaction beats a 1-second reaction even if the faster player's request arrives later, provided both commit within the window. The winner, private history, and recap counts commit together. If the host disconnects, submissions still close at the original deadline; resolution resumes when the host reconnects. Reveal, question change, and explicit finish cancel unresolved races.

A losing accepted press never queues another answerer or affects scores. Reaction gaps of at most 3.5 seconds receive a personal notice for 3.5 seconds and the existing scoreboard indicator during the visual answer window. Exact ties receive tie-break feedback and do not qualify as a positive closest-late achievement. Every accepted submission counts once per race in the recap. Requests outside the collection deadline receive neutral too-late feedback and cannot change the result or recap; they have no accepted reaction comparison. A race that has already ended receives neutral ended feedback. Genuine save/synchronization failures remain errors, with retry guidance only while server collection is still possible.

Refresh restores the original reaction origin and remaining local grace from browser storage and promptly enables the button if collection remains open. Without stored timing on a resumed question, the shared personal unlock time is the fallback for both reaction and grace; refreshing does not grant another second. Repeated snapshots and clock synchronization do not restart the local monotonic timing. A wrong answer starts a fresh race and local reaction origin immediately, retaining any unexpired personal penalty.

Firestore enforces submission ownership, eligibility, recorded penalties, and server commit deadlines. Browser reaction measurements, reporting of early presses, and the host's ranking implementation remain trusted; this is not a tamper-resistant measurement of human reaction speed. Network delay and transaction retries can cause a press to miss the deadline. The collection window lasts two seconds; displaying the result can take longer. The status beneath Buzz distinguishes readiness, collection with input still available, submission pending, a received press awaiting resolution, a closed window, and genuine failures. Connection/clock warnings remain secondary; clock estimates guide availability and feedback but do not rank reactions or authorize expired submissions.

A failed buzzer listener retries automatically up to three times, 500 ms apart, without showing a synchronization error during recovery. Buzzing is disabled until race state is available again. A server-confirmed snapshot resets the consecutive retry count; cached or pending-write snapshots do not. If all three retries fail, the app asks the user to refresh and logs only the final listener error. Leaving the screen or changing rooms cancels pending retries.

When another contestant's commit makes a submission's attempts map stale, the client may retry confirmed contention up to three times while collection remains open, preserving the original reaction measurement and operation ID. A confirmed closed-window, ended-race, or ineligible outcome disables further presses even if the local listener still shows an older open race.

Rooms without the policy marker retain the previous first-successful-transaction winner and client-timestamp late feedback. Existing rooms are not migrated.

### Answer timer and judging

A ten-second countdown starts from the server timestamp of winner finalization in policy-v1 rooms (the winning click timestamp in older rooms). It is a visual timer: reaching zero does not automatically mark an answer wrong, deduct points, reveal the answer, or select another contestant. The host judges the answer.

| Host decision | Standard play | True Competitive Mode | Shared outcome |
| --- | --- | --- | --- |
| Correct | Add question value | Add question value | Reveal answer, mark question done, give answerer next selection turn. |
| Incorrect | No score change | Subtract question value | Clear active buzz and attempts, exclude that contestant from this question, allow other eligible contestants to buzz. |
| Skip/reveal | No new score change | No new score change | Reveal answer, mark question done, preserve selection turn. Earlier penalties remain. |

An incorrect answer does not consume the question or reveal its solution. Reopening buzzing after an incorrect answer does not start another shared two-second opening delay. If nobody can or wants to answer, the host can skip/reveal; there is no automatic all-players-failed transition.

The host can see answer content before public reveal. Players and spectators see it when revealed. The host explicitly continues back to the board after the reveal; the app does not immediately dismiss a correct answer.

### Competitive early-buzz penalty

In True Competitive Mode, clicking the buzz button before it unlocks sets that contestant's personal unlock to the shared unlock time plus 2.5 seconds. For example, if a question opens at time 0, normal unlock is time 2.0 seconds and the penalized contestant unlocks at time 4.5 seconds. The penalty is not measured from the premature click and does not deduct points.

In policy-v1 rooms, both button and Space follow this rule. The first early report persists one penalty in shared race state, surviving refresh and device changes. Repeated presses during the penalty do not extend it or add recap counts. During collection, contestants who have reached their personal unlock may submit; those still locked cannot press or receive another early penalty. Presses during answering or reveal are ignored. Auto-repeat and Space inside editable controls are ignored.

A penalized contestant's reaction is measured from their personal unlock without adding 2.5 seconds to their ranking duration. The early report is client-trusted because the server cannot observe when a button appeared enabled locally; once stored, rules enforce the penalty before accepting a submission. Older rooms retain browser-local penalties and ignore premature Space presses.

Example: on a 300-point ordinary question, Alice answers incorrectly and Bob answers correctly. Standard play gives Alice 0 and Bob +300. Competitive play gives Alice -300 and Bob +300. Bob receives the next selection turn in either case.

## 5. Surprise questions

### Assignment and answering

When the host selects a surprise question, they choose a specific non-host contestant or a random contestant. The shared avatar reel runs for four seconds with player names hidden, then holds the chosen avatar and player name for another two seconds; the host client then opens the question.

Only the assigned contestant answers. There is no ordinary buzzer contest or buzz-triggered ten-second countdown for this question. The host marks their answer correct or incorrect, revealing the solution, marking the question done, and assigning them the next selection turn. This prepares the scoring activity; judging alone does not add/subtract the printed board value.

### Building the possible score changes

The question defines minimum and maximum magnitudes, normalized to positive multiples of 100 with maximum at least minimum. Editor defaults are 100 through 500. For older question data without an explicit maximum, runtime normalization can use the stored question value.

1. Starting at the minimum, build magnitudes in steps of 100 for round 1, 200 for round 2, or 400 for round 3, with both signs, stopping before exceeding the maximum. The maximum appears only when reached by that increment. For 100–500, the magnitudes are `100, 200, 300, 400, 500` in round 1, `100, 300, 500` in round 2, and `100, 500` in round 3. Legacy single-round packs use steps of 100.
2. If the answer is correct, prune negative values. If incorrect, prune positive values.
3. From that sign, remove the largest magnitudes first. For `N` magnitudes, remove `min(N - 1, floor(0.8 * N))` entries, never eliminating that sign entirely.
4. Shuffle the remaining values for the selected scoring mechanic.

With the default range in round 1:

| Judgment | Remaining values |
| --- | --- |
| Correct | +100, +200, +300, +400, +500, -100 |
| Incorrect | -100, -200, -300, -400, -500, +100 |

A correct answer can still lose points; an incorrect answer can still gain points. If minimum equals maximum, both signs remain regardless of judgment. There is no zero-point entry in this generated pool.

### Wheel

The assigned contestant or host starts the wheel after judging. In current-format rooms (`dataVersion: 2`, `recapVersion: 1`, `buzzerPolicyVersion: 1`), the app persists one selected entry and a server-stamped spin identity/start time without changing scores. Everyone uses the same six-second animation timeline. Refreshing or receiving a late snapshot resumes at the elapsed position; after the deadline the wheel is shown settled. The result label stays hidden until the animation ends, and a committed award settles the wheel before its score is displayed.

After the deadline, either the host or selected contestant can complete the award. The score, application marker, history, and recap commit together exactly once; Firestore rejects early completion even if a client clock runs ahead. Mounted authorized clients retry after refresh/reconnect and show pending/retry feedback. If both are disconnected, the pending award waits for either to return. Continue and explicit Finish cannot discard an unresolved judged surprise award. These guarantees require current-format rooms and updated clients and rules; older rooms retain their existing version markers.

Older rooms retain numeric client timestamps and their existing history/recap format.
The assigned contestant or host can still start the wheel and apply its award after
the six-second animation, including after refresh. This compatibility path does not
add the current room's server-enforced deadline or migrate its version markers.

### Hidden table

The remaining values are shuffled into hidden cells with animal icons. The assigned contestant or host chooses one cell. The selection and signed score change are committed together in a transaction, which rejects a repeated selection. The displayed grid uses approximately square dimensions and contains one selectable cell per remaining value, with blank padding slots if needed. Continuing is enabled once the choice and score application are complete.

### Skipping and score examples

The host can skip an unjudged surprise question to reveal it without running its scoring activity. This gives no new points and does not transfer the selection turn. Once a surprise answer is judged, its scoring activity must complete before the normal Continue control becomes available.

If a contestant has 200 points, answers correctly, and receives -100, their total becomes 100. If they answer incorrectly and receive +100, their total becomes 300. Both outcomes follow the same rules in standard and competitive rooms.

## 6. Media, prizes, and host controls

Question and answer content can contain text, images, audio, or video. Question audio/video uses a host start action with a shared scheduled start timestamp, currently 600 ms ahead of the host's local time. Browser playback restrictions and connection delays can affect actual playback. Buzzer unlock is based on question opening, not on pressing media Play.

Question audio/video may contain up to five owner-defined stop points. The host's
initial Play authorizes playback from zero to the first unreleased stop. Each
client pauses and clamps its player at that boundary. When the host's player reaches
it, **Continue after stop** becomes available in the host panel. A successful host
action releases exactly one stop. Waiting clients resume automatically unless
locally paused or blocked by browser autoplay; slower clients pass stops already
released without pausing or jumping forward. The final release permits the last
segment through the end. There is no wait for every contestant or spectator.

For stop-point media, before a client's own playback reaches the end, its timeline and playback speed
are locked, with numbered markers for pending/released stops. Volume remains local
and available. Ordinary pause/play controls are hidden; a limited Resume appears
after a buzz pause, browser interruption, or autoplay rejection. A host release
does not cancel a local buzz pause. Seeking, replay, and normal controls unlock only
after that client finishes the last authorized segment; markers then become
inactive when the creator permits participant replay. This first-playback restriction
also applies to question media without stops. When participant replay is disabled,
independent controls remain locked even after completion.
Answer media retains its existing unrestricted controls.

In both Form and Table pack editors, the question audio/video panel offers **Allow
participants to freely control media after playback ends**, checked by default.
It is stored as `questionMedia.allowParticipantMediaReplay` alongside the asset and
saved with the pack. Older media with no field defaults to enabled. Replacing
audio/video preserves the preference; removing the attachment and adding a new one
starts with the default. Answer-media and image panels do not show this option.
The saved value is frozen with the pack at game start; later source edits do not
change an active game. Any old game-wide preference is ignored.

Checked: ordinary question audio/video unlocks independent participant controls
after each viewer completes their own first playback. Unchecked: participants and
spectators cannot use ordinary play/pause, seeking, or replay before or after
completion. This applies to audio/video with or without stop points and survives
refresh. Only a fresh host-authorized playback session can replay the media.
Limited recovery Resume can still finish an interrupted authorized segment without
seeking; local volume remains available.

The host sees no checkbox or help control during play. When the mode is unchecked,
a notice says the replay-after-completion mode is disabled for this question and
the host fully controls media for everyone. Host panel Start/Continue/Replay actions affect all
viewers. With stops, only Start/Continue appears during initial playback; Continue
is visibly disabled until the host reaches the pending boundary. Shared Replay
becomes available when the host finishes and resets the playback session and stops
only when the creator disabled the replay-after-completion mode. Without stops,
shared Replay remains available after start only in that disabled mode. When the
mode is enabled, shared Replay is hidden and regular local Play/Pause, seeking,
and native video controls appear beneath the host's media after the host completes
the first full playback. Before completion, or when the mode is disabled, those
local host controls remain hidden/disabled; volume remains local.
Recovery Resume still allows an interrupted host playback to
finish its authorized segment. Participant controls remain beneath their media.

The question-mark beside the editor checkbox opens the same keyboard-accessible
help dialog, including when editing in the Table question dialog. The introduction
comes first, then a 30-second example comparing both settings with and without
stops, followed by detailed cases. The title and close icon remain visible while
scrolling; there is no footer Close button. Escape closes only the help dialog and
restores focus to its trigger. Answer media and pack previews are unaffected.

For the locked-first-playback mode and stop-point media, refresh in the same tab restores saved local progress and pause/completion state,
keyed to that user, room, question, media, and playback session. Restored progress
is clamped to host permission. New clients start at zero and can cross already
released stops; host completion does not unlock another client's controls. Storage
unavailability falls back to in-memory progress. Reveal stops gated question media
and disables continuation; board/question changes and game finish clear the shared
session. Stale or repeated Continue requests cannot release additional stops.

The player checks boundaries on playback events, timers, and foreground recovery.
Browser scheduling can cause brief overshoot before clamping; stopping is not
sample-exact. These controls enforce the app's UI flow, not confidentiality of the
underlying external media URL or restrictions on modified clients. Firestore rules
restrict shared media permission writes to the host. Stop-point games require the
updated frontend and rules together, with clients reloaded; no migration is needed.

An accepted buzz attempt signals a pause to media on that contestant's client. Do not assume this pauses every participant's player. Volume controls are local. Answer media is presented with the revealed answer; the host has advance access to answer content.

During an active question, the host's media start, judging, skip/reveal, wheel start, and continue controls share one panel with the current answerer and ordinary-answer timer. When the question area has at least 56rem of available width, this panel sits on the right; narrower layouts place it below the content with full-width touch controls. The wheel/table remains in the question content, and contestant/spectator controls keep their existing layout. Skip/reveal still requires a two-second hold, and continue remains unavailable while a surprise award is unresolved.

Hold-to-confirm controls show a translated, four-second guidance toast when a mouse/touch press is released inside the button, or Enter/Space is released, before confirmation. The toast states the required duration: two seconds for skip/reveal and three seconds for category removal or early finish (on the board or between rounds). Repeated incomplete presses refresh a single toast; starting another hold clears it. Moving outside the button, pointer cancellation, lost capture, and focus loss cancel silently. A completed hold confirms only once, including when a keyboard key continues repeating. The toast does not intercept input or move focus.

The controls panel keeps a 17rem width throughout question phases, capped by the available space on narrow screens. The shared question-media launch action is available only before answer reveal; it does not control answer media.

The host can adjust contestant scores by +100/-100 and use the score editor to set totals. Negative scores are allowed. These changes are recorded in history and can affect final ranking. They do not automatically transfer the question-selection turn.

A pack with both prize images allows the host to open the prize presentation, reveal it, and close it. It is a visual activity and does not automatically award points or deliver a real-world prize.

The history records the implemented events, including question picks, accepted/late buzzes, judgments, surprise results, skips, board resumes, score changes, and game completion. For new rooms, events are separate append-only documents readable exclusively by the game host. The history dialog loads the latest 50 while open and offers older pages; players and spectators never receive these history documents. Player buzz and surprise-scoring actions append their events atomically without history read permission. Legacy rooms retain the embedded history array. This remains a session activity record, not a trusted audit or automatic undo system.

## 7. RPS and final results

### Shared RPS rules

Rock beats scissors, scissors beats paper, and paper beats rock. Matching choices are a draw and award no win. A mode of `one` means first to one winning throw; `three` means first to three winning throws, not best-of-three. Choices are submitted by the two participants, throws are resolved, and wins accumulate until the target is reached.

### Host side match

Between questions, the host can select two room members for RPS, including themselves. On completion, the result is shown and recorded in history; the host closes the activity. It does not itself alter trivia scores, establish the final tie-breaker champion, or transfer the selection turn.

### Completed-board tie-breaker

When all questions across all pack rounds are done and the host has returned to the board:

- With a single highest scorer, the host can show final results.
- With multiple contestants tied for highest score, the normal completion control opens the tie-breaker setup.

Only top-score-tied contestants enter this bracket. The host selects pairs and can advance a contestant with a bye. Match winners advance, losers are eliminated, and the last unpaired contestant in a round can advance automatically. Rounds continue until one champion remains. The host then finishes the game.

Quiz scores remain unchanged. Final standings place the tie-breaker champion first and sort other contestants by score descending. Lower-place ties are not separately resolved; the results UI displays sequential rank numbers.

### Early finish and shared result links

The host can end the game early from a board that still has questions, using hold-to-confirm. This goes directly to finished results without requiring a tie-breaker. Without a recorded champion, the first entry in the score-sorted list is highlighted as winner; an early finish with tied top scores therefore does not guarantee a uniquely resolved winner.

The host is excluded from final standings. A finished game counts as having defined results. Results can also be defined before `finished` when the room is `playing`, all questions are done, no question/reveal is active, and there is either no top-score tie or a recorded champion. A non-participant opening a `?game=` link can see those defined results.

## 8. Review checks for future changes

### Pack rounds and intermediate standings

The pack editor's Form and Table modes share the same draft, saved pack format,
round limits, ordering rules, point normalization, media, and surprise settings.
Switching editor modes does not change gameplay. Existing packs can be edited in
either mode; older single-round packs retain the same conversion on save.

A pack has 1–3 numbered rounds. Every round has at least one category, and every
category has at least one question. Authors manage rounds through tabs; reordering
categories/questions never moves them between rounds. The selected round has its
own board preview. Prize and surprise-scoring settings remain pack-wide.

New categories start at 100 points in round 1, 200 in round 2, and 400 in round 3.
Adding a question increments the previous question's value by that round's starting
value: `100, 200, 300, ...`, `200, 400, 600, ...`, or `400, 800, 1200, ...`.
Authors can still edit values in multiples of 100; existing values are preserved,
including when deleting a round changes the remaining round numbers. Surprise
scoring ranges retain their existing defaults and owner-configured bounds, but their
score-pool increment follows the current round position: 100, 200, or 400. The editor
shows this increment and its round-based reason below the range inputs. Deleting
an earlier round immediately updates this hint and the increment used in future games;
it does not change the range bounds or board display values. Frozen packs keep their
bounds, and already prepared wheel/table pools remain unchanged.

Start Game freezes all rounds together. The host presents only the current round's
categories, then players select from that round's board. After the final question is
resolved and the host presses Continue, a non-final round enters the shared
intermediate screen. Pending surprise awards must finish first. Standings exclude
the host and show cumulative scores, including negative scores, without final awards
or a tie-breaker. Only the host starts the next round, beginning its category previews.

Scores and the current selection turn carry forward unchanged. Recap statistics,
correct-answer streaks, achievement counters, and score progression cover the entire
game; round boundaries do not reset or finalize them. Final tie-breakers/results use
the existing flow only after the last round. Explicit early finish remains available
from the intermediate screen and saves results and achievements normally.

Refreshes and spectator joins during an intermediate screen restore that screen.
A shared results link cannot treat a round break as a final result. The frozen pack
survives every round boundary and is deleted only on explicit finish. Existing packs,
embedded legacy rooms, and older frozen snapshots remain single-round experiences.

Browser verification on 2026-09-28 used the real editor/game components against a
dedicated Firestore Emulator with simulated identities. English desktop checks
covered legacy-pack conversion, adding three rounds, the round cap, preview and
save/reload; host/contestant/spectator checks covered category presentations,
cumulative negative standings, a round break and refresh, host advancement, turn
carryover, final-only results, and achievement/streak totals across two rounds.
Ukrainian editor tabs and question controls were checked at a 390 px viewport.

Pending manual checks: English/Ukrainian editor tabs on both desktop and mobile,
round deletion, switching tabs during media uploads/replacements/removals, and
responsive host/contestant/spectator round transitions on physical devices.
Also check final-round top-score ties, surprise scoring at a boundary, early
finish during a break, and production Google sign-in and external ImageKit media.

### Active room connection recovery

The active room subscription checks for current server state when the page returns to the foreground, gains focus, comes online, or is restored through browser navigation. A foreground fallback checks every ten seconds when the last server confirmation is at least five seconds old. An unchanged room is not itself a connection failure.

Cached room data may remain visible while reconnecting, but only server-confirmed data can close a room, remove a participant from the view, or clear the remembered room. A translated connection banner appears after prolonged syncing or immediately on a failed request, and includes a Reconnect action. It clears when the live room listener confirms server data again.

Recoverable listener failures retry with bounded delays; exhausted retries can be restarted manually or when returning to the foreground/coming online. Access and authentication errors require attention instead of indefinite retries. Safari can suspend background pages, so recovery cannot guarantee updates while the page is suspended. This recovery applies only to the active room subscription. The buzzer listener has its own three short retries described above; history and recap subscriptions keep their existing behavior.

After changes to room recovery or the Firebase SDK, manually compare Safari with a second participant through screen lock, app/tab switching, back/forward navigation, offline/online transitions, and room switching. Confirm questions and scores recover and remain live, idle rooms do not show false warnings, and access-denied/missing-room outcomes remain distinct. Also verify sign-in/out, pack operations, normal play, results, and existing buzzer behavior; run the isolated storage validation harness as an SDK regression check.

These are manual acceptance scenarios, not claims of automated coverage. Use a host and at least two contestant sessions where applicable.

| ID | Scenario and expected result |
| --- | --- |
| GAME-01 | Create a room: competitive mode starts off, questions are available, and at least one contestant is required to start through the UI. |
| GAME-02 | Start: a non-host gets the first turn; host advances previews; only host opens a question, while the current contestant can pulse a suggestion. |
| GAME-03 | Ordinary question: shared two-second lock; one winning answerer; ten-second countdown never judges automatically. |
| GAME-04 | Wrong then correct: apply the mode-specific penalty, lock out the wrong contestant for this question, award the correct contestant, and transfer selection turn. |
| GAME-05 | Competitive early button click: personal unlock becomes shared unlock +2.5 seconds; repeated clicks do not extend it. |
| GAME-06 | Near-simultaneous buzzes: preserve one winner; accepted late attempts within 3.5 seconds produce feedback/history without points or a queued turn. |
| GAME-07 | Skip/reveal then continue: question stays consumed, no new award, selection turn retained, and next question starts with clean buzz state. |
| GAME-08 | Surprise assignment: explicit/random selection excludes host; ordinary buzzing is unavailable; both judgments produce the documented signed pool. |
| GAME-09 | Surprise scoring: exercise wheel and table, both positive and negative outcomes; apply the selected delta and gate Continue until complete. |
| GAME-10 | RPS: draws do not count; three means three wins; side matches do not change quiz state; final bracket champion ranks first without score mutation. |
| GAME-11 | Finish normally, finish early, and open result links: preserve their different tie/result conditions and exclude host from standings. |
| GAME-12 | Spectator/rejoining participant: preserve role, current state, and lack of spectator gameplay controls. |
| GAME-13 | Media/prize/score tools: verify host controls, answer reveal, local volume, recorded score changes, and desktop/mobile layouts. |

## 9. Implementation boundaries

Do not present the following as stronger guarantees than the code provides:

- Much of the host/player workflow is enforced in client controls and handlers. Current room-update security rules broadly allow participant/host updates, with a dedicated competitive-setting restriction; they do not enforce every scoring or turn rule independently.
- Answers and hidden surprise values are included in shared room data. Hiding them in the UI is not confidentiality from a technically inspecting participant.
- Buzz ordering depends on transaction success and estimated client timing, not a dedicated authoritative game server that sorts all clicks.
- Current wheel scoring separates the persisted selection from the atomic award, which is permitted only after the shared animation deadline. Recovery still requires the host or selected contestant online; it is not a scheduled backend job. Result concealment is interface-only, and clock synchronization does not guarantee identical display timing across devices. Table selection and scoring still commit together.
- Host presence is needed for normal progression. Automatic timer adjudication, automatic host replacement, and comprehensive interruption recovery are not established gameplay features.

These are current limitations, not requirements to preserve bugs. Addressing them should be an explicit change with suitable validation and corresponding documentation updates.

## Source map

| Rules | Source |
| --- | --- |
| Room defaults, frozen pack creation and start | [HostSetup.jsx](../src/views/HostSetup.jsx), [roomActions.js](../src/actions/roomActions.js) |
| Admission, capacity, names, avatars | [JoinRoom.jsx](../src/views/JoinRoom.jsx) |
| Lobby, previews, mode toggle, score tools, prize, history | [GameRoom.jsx](../src/views/game/GameRoom.jsx) |
| Board selection, surprise draw, completion controls | [BoardView.jsx](../src/views/game/BoardView.jsx) |
| Buzzing, timers, judging, surprise scoring, media start | [ActiveQuestionView.jsx](../src/views/game/ActiveQuestionView.jsx) |
| Question transactions, RPS state and advancement | [gameActions.js](../src/actions/gameActions.js) |
| RPS presentation and participant controls | [RockPaperScissorsManager.jsx](../src/components/RockPaperScissorsManager.jsx), [HostRpsModal.jsx](../src/components/HostRpsModal.jsx) |
| Ranking and defined-result conditions | [ResultsView.jsx](../src/views/game/ResultsView.jsx), [gameResults.js](../src/utils/gameResults.js) |
| Pack values and mechanic defaults | [PackCreator.jsx](../src/views/PackCreator.jsx), [constants.js](../src/constants.js) |
| Links, roles on reconnect, clock and media behavior | [App.jsx](../src/App.jsx), [useServerClock.js](../src/hooks/useServerClock.js), [QuestionMedia.jsx](../src/components/QuestionMedia.jsx) |
| Backend authorization boundaries | [firestore.rules](../firestore.rules) |

## Predefined pack themes

Pack authors choose Default, Halloween, or Music (Музикальна) after Prize in the editor. Board and question previews use the draft theme; the editor and pack listings retain their normal appearance. Halloween customizes room colors, decorative text, question backgrounds, and contestant avatars. It does not change gameplay rules.

Room creation snapshots the saved pack theme in an immutable room themeId. Starting still freezes the latest question content, but source theme edits never change an existing room. Shared results retain the room theme after snapshot deletion. Existing packs and rooms default to the original appearance without migration. The Halloween pool uses all 15 avatars and Music all 13 before balanced reuse; rejoining players retain their avatars and rooms still support 20 contestants plus the crowned host.

Validate with npm run lint, npm run build, and the single scripts/verify-game-storage.mjs entry point against a dedicated local Firestore Emulator. Publish the updated Firestore rules and frontend together only when deployment is explicitly authorized. No Worker release, indexes, or migration is needed.

Pending browser checklist: English/Ukrainian; desktop/mobile; host, contestant, spectator; Default/Halloween/Music previews, lobby, category introductions, board, ordinary/surprise questions, answer reveal, wheel/table, prize, dialogs, RPS, round breaks, and shared results. Check reduced motion, keyboard focus, long headings, and returning to unthemed screens.

Music uses dark green surfaces, soft rose accents, matcha highlights, musical-note ordinary backgrounds, musical surprise emoji, and a cycling pool of 13 creatures on the hidden table. Its Ukrainian Buzz label is “Тиць” and table title is “Приховані створіння”. This is presentation-only; scoring, turn behavior, timers, and room theme locking are unchanged. See the [completed Music theme brief](pack-theme-music.md).
