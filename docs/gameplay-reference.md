# Cortex Rush: game modes and gameplay reference

Last checked against repository code: 2026-09-17.

## Scope

This document captures the current gameplay baseline for manual and AI-assisted changes. Read [App overview](app-overview.md) for product context and the change-review process. Rules describe the implemented UI workflow, with implementation limitations called out separately. Verification for this document was source-based; no live multiplayer session was run.

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

1. The host creates a room from an owned or public pack. New lobbies store pack display metadata; scores begin at zero and the host has a crown avatar.
2. Contestants join using the six-digit code or join link. Names are limited to 18 characters. New contestants receive an unused animal avatar; an existing participant can retain their avatar and score.
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

## 4. Ordinary question sequence

### Opening and buzzing

Opening a question clears the previous buzz, attempts, wrong-answer exclusions, reveal state, and question media state. The shared buzzer unlock is set to two seconds after the opening action's synchronized time.

Eligible contestants can buzz using the button or Space after unlock. The host and spectators cannot buzz. A contestant who has already answered this question incorrectly cannot buzz again on it.

The first successful Firestore transaction to claim the empty buzzer becomes the active answerer. The implementation does not collect every click and then elect the earliest timestamp across devices. Once a winner is visible in local state, the ordinary buzz control is disabled.

Near-simultaneous attempts that reach the transaction after another contestant won can still be recorded as late attempts if their click timestamp is more than zero and at most 3.5 seconds after the winning timestamp. Such an attempt:

- Does not replace the active answerer, award points, or queue an automatic next answerer.
- Records a history event and the attempt timing.
- Shows the losing contestant a personal notice naming the winner and their delay.
- Supports a temporary delay indicator beside the contestant in the scoreboard.

The acceptance window and scoreboard timing window are both 3.5 seconds. The personal notice also lasts 3.5 seconds from being shown. This is a race-feedback mechanism, not a continuously available secondary buzzer after the winner is known.

### Answer timer and judging

A ten-second countdown starts from the winning buzz timestamp. It is a visual timer: reaching zero does not automatically mark an answer wrong, deduct points, reveal the answer, or select another contestant. The host judges the answer.

| Host decision | Standard play | True Competitive Mode | Shared outcome |
| --- | --- | --- | --- |
| Correct | Add question value | Add question value | Reveal answer, mark question done, give answerer next selection turn. |
| Incorrect | No score change | Subtract question value | Clear active buzz and attempts, exclude that contestant from this question, allow other eligible contestants to buzz. |
| Skip/reveal | No new score change | No new score change | Reveal answer, mark question done, preserve selection turn. Earlier penalties remain. |

An incorrect answer does not consume the question or reveal its solution. Reopening buzzing after an incorrect answer does not start another shared two-second opening delay. If nobody can or wants to answer, the host can skip/reveal; there is no automatic all-players-failed transition.

The host can see answer content before public reveal. Players and spectators see it when revealed. The host explicitly continues back to the board after the reveal; the app does not immediately dismiss a correct answer.

### Competitive early-buzz penalty

In True Competitive Mode, clicking the buzz button before it unlocks sets that contestant's personal unlock to the shared unlock time plus 2.5 seconds. For example, if a question opens at time 0, normal unlock is time 2.0 seconds and the penalized contestant unlocks at time 4.5 seconds. The penalty is not measured from the premature click and does not deduct points.

Repeated early clicks do not keep extending the delay. The delay is stored locally by room, question, and user so a refresh in the same browser can retain it. Space is enabled only when buzzing is allowed, so a premature Space press does not follow the button's penalty path. This is client behavior, not a server-enforced anti-cheat guarantee.

Example: on a 300-point ordinary question, Alice answers incorrectly and Bob answers correctly. Standard play gives Alice 0 and Bob +300. Competitive play gives Alice -300 and Bob +300. Bob receives the next selection turn in either case.

## 5. Surprise questions

### Assignment and answering

When the host selects a surprise question, they choose a specific non-host contestant or a random contestant. The shared avatar reel runs for four seconds with player names hidden, then holds the chosen avatar and player name for another two seconds; the host client then opens the question.

Only the assigned contestant answers. There is no ordinary buzzer contest or buzz-triggered ten-second countdown for this question. The host marks their answer correct or incorrect, revealing the solution, marking the question done, and assigning them the next selection turn. This prepares the scoring activity; judging alone does not add/subtract the printed board value.

### Building the possible score changes

The question defines minimum and maximum magnitudes, normalized to positive multiples of 100 with maximum at least minimum. Editor defaults are 100 through 500. For older question data without an explicit maximum, runtime normalization can use the stored question value.

1. Build every magnitude in the inclusive range in steps of 100, with both signs. For 100–500: `+100, -100, +200, -200, ... +500, -500`.
2. If the answer is correct, prune negative values. If incorrect, prune positive values.
3. From that sign, remove the largest magnitudes first. For `N` magnitudes, remove `min(N - 1, floor(0.8 * N))` entries, never eliminating that sign entirely.
4. Shuffle the remaining values for the selected scoring mechanic.

With the default range:

| Judgment | Remaining values |
| --- | --- |
| Correct | +100, +200, +300, +400, +500, -100 |
| Incorrect | -100, -200, -300, -400, -500, +100 |

A correct answer can still lose points; an incorrect answer can still gain points. If minimum equals maximum, both signs remain regardless of judgment. There is no zero-point entry in this generated pool.

### Wheel

The assigned contestant or host starts the wheel after judging. The app randomly selects one remaining entry, persists the result, and animates for six seconds. The initiating client then applies the signed score change. Continuing to the board is gated on the animation/result and score application being complete.

### Hidden table

The remaining values are shuffled into hidden cells with animal icons. The assigned contestant or host chooses one cell. The selection and signed score change are committed together in a transaction, which rejects a repeated selection. The displayed grid uses approximately square dimensions and contains one selectable cell per remaining value, with blank padding slots if needed. Continuing is enabled once the choice and score application are complete.

### Skipping and score examples

The host can skip an unjudged surprise question to reveal it without running its scoring activity. This gives no new points and does not transfer the selection turn. Once a surprise answer is judged, its scoring activity must complete before the normal Continue control becomes available.

If a contestant has 200 points, answers correctly, and receives -100, their total becomes 100. If they answer incorrectly and receive +100, their total becomes 300. Both outcomes follow the same rules in standard and competitive rooms.

## 6. Media, prizes, and host controls

Question and answer content can contain text, images, audio, or video. Question audio/video uses a host start action with a shared scheduled start timestamp, currently 600 ms ahead of the host's local time. Browser playback restrictions and connection delays can affect actual playback. Buzzer unlock is based on question opening, not on pressing media Play.

An accepted buzz attempt signals a pause to media on that contestant's client. Do not assume this pauses every participant's player. Volume controls are local. Answer media is presented with the revealed answer; the host has advance access to answer content.

The host can adjust contestant scores by +100/-100 and use the score editor to set totals. Negative scores are allowed. These changes are recorded in history and can affect final ranking. They do not automatically transfer the question-selection turn.

A pack with both prize images allows the host to open the prize presentation, reveal it, and close it. It is a visual activity and does not automatically award points or deliver a real-world prize.

The history records the implemented events, including question picks, accepted/late buzzes, judgments, surprise results, skips, board resumes, score changes, and game completion. For new rooms, events are separate append-only documents readable exclusively by the game host. The history dialog loads the latest 50 while open and offers older pages; players and spectators never receive these history documents. Player buzz and surprise-scoring actions append their events atomically without history read permission. Legacy rooms retain the embedded history array. This remains a session activity record, not a trusted audit or automatic undo system.

## 7. RPS and final results

### Shared RPS rules

Rock beats scissors, scissors beats paper, and paper beats rock. Matching choices are a draw and award no win. A mode of `one` means first to one winning throw; `three` means first to three winning throws, not best-of-three. Choices are submitted by the two participants, throws are resolved, and wins accumulate until the target is reached.

### Host side match

Between questions, the host can select two room members for RPS, including themselves. On completion, the result is shown and recorded in history; the host closes the activity. It does not itself alter trivia scores, establish the final tie-breaker champion, or transfer the selection turn.

### Completed-board tie-breaker

When all questions are done and the host has returned to the board:

- With a single highest scorer, the host can show final results.
- With multiple contestants tied for highest score, the normal completion control opens the tie-breaker setup.

Only top-score-tied contestants enter this bracket. The host selects pairs and can advance a contestant with a bye. Match winners advance, losers are eliminated, and the last unpaired contestant in a round can advance automatically. Rounds continue until one champion remains. The host then finishes the game.

Quiz scores remain unchanged. Final standings place the tie-breaker champion first and sort other contestants by score descending. Lower-place ties are not separately resolved; the results UI displays sequential rank numbers.

### Early finish and shared result links

The host can end the game early from a board that still has questions, using hold-to-confirm. This goes directly to finished results without requiring a tie-breaker. Without a recorded champion, the first entry in the score-sorted list is highlighted as winner; an early finish with tied top scores therefore does not guarantee a uniquely resolved winner.

The host is excluded from final standings. A finished game counts as having defined results. Results can also be defined before `finished` when the room is `playing`, all questions are done, no question/reveal is active, and there is either no top-score tie or a recorded champion. A non-participant opening a `?game=` link can see those defined results.

## 8. Review checks for future changes

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
- Wheel scoring uses a delayed write from the initiating browser. Interruption before that write can leave score application incomplete. The table path commits selection and score together; do not assume the wheel has the same transactional guarantees.
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
