# Cortex Rush: app overview and change baseline

Last checked against repository code: 2026-09-17.

## Purpose of this document

This is a reference for people and AI agents reviewing or changing Cortex Rush. It describes the current product, its responsibilities, and the behavior future changes should preserve unless a requested feature explicitly changes it. Detailed rules live in [Game modes and gameplay](gameplay-reference.md). Development commands and repository operating instructions remain in [README](../README.md) and [AGENTS.md](../AGENTS.md).

This baseline comes from source inspection, not a live multiplayer verification. It describes the supported UI workflow; it does not imply that every UI restriction is enforced by the backend.

## What the app is

Cortex Rush is a real-time, host-led multiplayer trivia game. An author prepares a question pack, a host opens a room using that pack, and players compete for points by answering questions from a category board. A human host opens questions, judges spoken or otherwise externally communicated answers, reveals solutions, and controls the pace of the game.

The app supplies the shared board, buzzer, scores, media, history, surprise-question scoring, and final standings. It does not automatically evaluate free-text answers or provide a built-in voice conversation. Players use their own devices; a shared screen or an external call can support the session.

Despite the repository name `team-quiz`, the current game stores and ranks individual player entries. It has no separate team roster or team-scoring model.

## Roles

| Role | Responsibilities and capabilities |
| --- | --- |
| Pack author | Creates and edits their packs, manages question/answer media, chooses sharing and surprise scoring settings, and optionally defines a prize presentation. |
| Host | Selects an owned or public pack, creates a lobby, starts play, opens questions, judges answers, manages scores and optional activities, and ends the game. The host is excluded from contestant standings. |
| Player | Joins the lobby, receives an animal avatar, suggests a question when it is their turn, buzzes on ordinary questions, and participates in assigned surprise questions or RPS matches. |
| Spectator | Watches an ongoing game or results without becoming a contestant or receiving player controls. |

The normal application requires Google sign-in. Public packs are available to other signed-in users for hosting; “public” does not mean anonymous editing. Only the Google-authenticated owner can edit or delete a pack. Firestore also contains administrative read exceptions; these do not constitute a separate gameplay mode.

## Main user journey

1. Sign in and choose English or Ukrainian for the interface.
2. Create a pack, manage existing packs, host a game, or join a room. A remembered active room can be reopened.
3. The host selects a pack and receives a six-digit room code and a shareable `?room=` link.
4. Players join the lobby with nicknames. The lobby supports up to 20 contestants plus the host. The host chooses whether to enable True Competitive Mode.
5. The host starts the session. Categories are introduced one at a time before the question board appears.
6. Play repeats through question selection, answering, judging, answer reveal, and return to the board. Between rounds, everyone sees cumulative standings; the host starts the next round and its category previews. Scores, selection turn, and achievement progress carry forward.
7. The host completes the game, resolving a top-score tie through RPS when following the normal completed-board flow. Everyone can view final standings.

New arrivals after the lobby view the game as spectators. Existing participants retain their role when reopening their room. A `?game=` link supports viewing a game and its defined results; see the gameplay reference for the precise result condition.

The main menu account area also opens **My Profile** for the signed-in user. A saved
username (1–18 characters after trimming surrounding whitespace, not necessarily
unique) appears on the menu and prefills the editable join-game nickname. Hosting
still defaults to the localized Host label. Saving a username leaves existing room
names and historical results unchanged. The profile shows one best saved achievement
per earned type: the highest value, or smallest positive gap for closest-late awards.
Equal values keep the most recent game, with game ID breaking date ties. Other
occurrences remain stored but hidden. Each displayed award includes its value, completion
dates, and stable game-results links. It has no performance recap or charts; older
games without saved awards are not backfilled.

## Question packs

A pack contains a title, optional emoji icon, ownership/sharing information, and one to three ordered rounds with categories and questions. Numbered tabs let authors add/delete rounds and edit or preview one round at a time. Each round needs at least one category and each category needs at least one question. Category/question reordering stays within its round; cross-round movement is unavailable. Existing category-only packs are treated as a single round and converted when saved. Round support was checked against source on 2026-09-28.

Preview, collapse-all, and round deletion controls share a panel below the round tabs. Round deletion opens an app-styled confirmation dialog identifying the selected round and warning that its categories, questions, and media will be deleted. Cancel, Escape, or clicking outside dismisses the dialog without deleting anything; confirmation retains the existing deletion and media cleanup behavior.

The editor offers **Form / Table** modes over one shared draft. Form is the initial
default; each signed-in owner's last choice is remembered locally on this device.
Unavailable local storage falls back to Form without preventing editing. Switching
modes preserves unsaved content and the active round. Both modes use the same
pack format, validation, saving, preview, media, sharing, prizes, and surprise
mechanics. Older packs remain editable in either mode.

At 1024 px and above, Table mode displays editable category headers and question
cells, with a spacious editing dialog for the selected question's full controls. Cells
show points, a question excerpt, and media/surprise/incomplete indicators. Rows
follow category question order rather than matching points; unequal lengths leave
empty space. Incomplete questions remain editable. Category ordering and deletion
controls sit in the headers; each column has Add Question. Adding a question opens
its editor and focuses its text field. The dialog places Question and Answer side
by side on desktop, stacks them on small screens, and provides Previous/Next
navigation within the category. When the selected question is last, a separate
**Add new question** button in the bottom bar appends a question to that category,
opens it in the same dialog, and focuses its text field. The question deletion
control uses a trash icon in this dialog, with the same deletion behavior.
It retains visible
close/navigation controls while its content scrolls. Escape, backdrop dismissal,
and Back to board retain draft edits and restore focus; they do not save or discard
text. Closing the dialog keeps draft changes; Save
persists text changes while media operations retain their immediate persistence.
Below 1024 px, the editor automatically switches to the existing Form layout and
disables Table selection. The desktop preference is preserved and restored when
the viewport becomes wide again. Draft content and the active round are retained.
If resizing closes a question dialog, its category expands and focus moves to that
question's Form field. Collapse/expand and collapse-all remain available in Form.
Desktop Table mode shows all columns
and confines horizontal scrolling to the board.

Selection follows stable IDs through reordering. Deletion clears a removed item's
selection and focuses a nearby control. Content validation reveals the affected
round/question and focuses its missing field. Controls that could unmount media
panels are blocked during saving, media work, and clipboard confirmation, including
dialog navigation and dismissal. Clipboard confirmation and enlarged media remain
available above the editor dialog. Crossing
the responsive breakpoint defers layout changes until the operation finishes.
Controls support English/Ukrainian and ordinary keyboard navigation. Spreadsheet
import and multi-cell paste are not included.

Deleting a saved pack from My Question Packs uses two app-styled confirmation steps. Both identify the pack; the final step warns about permanent deletion and explains that existing rooms with a copied pack remain unchanged. Cancel, Escape, or clicking outside at either step dismisses the dialog without deleting the pack or its media. Media cleanup and pack deletion start only after the final confirmation.

Each question includes a point value and question/answer content. Each side must have text or media; either can have both. Supported media kinds are image, audio, and video. In the create/edit pack editor, each media panel accepts one dropped local file or web image, including replacement of an existing attachment. Question/answer panels accept images up to 10 MB and audio/video up to 100 MB; both prize panels accept images only. Web images are downloaded without credentials in the browser with a 15-second timeout; websites that block downloading require saving the image locally first. Multiple-file drops are rejected. Pasting a clipboard media file into a focused question or answer text field opens an app-styled confirmation dialog before uploading it to that side’s media slot. The dialog highlights the Question or Answer media destination and warns when replacing an existing attachment; Cancel, Escape, or clicking the backdrop dismisses it. The same type/size validation applies; multiple-file pastes are rejected, declining keeps the attachment and text unchanged, and ordinary text pastes retain their normal behavior. Saving, round changes, and other media actions are blocked during downloading and uploading; file-picker buttons remain available for keyboard and touch use. Ordinary point values are normalized to positive multiples of 100 in the editor.

In **Question pack preview**, clicking a question value opens the same question/answer presenter used for players and spectators during gameplay, using current editor content without saving. **Reveal Answer** replaces the question with the centered answer; **Back to the table** returns to the board. Reopening a question hides its answer again. Only questions with non-whitespace text or attached media on both the question and answer sides are eligible; incomplete questions remain visible in the table as disabled, muted tiles with a lock icon and a translated explanation. They cannot open a question preview. This follows the existing editor content checks, without checking factual correctness or adding stricter media validation. Media playback and image enlargement remain available locally, alongside the modal close control. No buzzer, judging, timers, or surprise-scoring controls appear, and previewing does not change gameplay state.

The editor's Save button stays visible at the top while scrolling. Saving a new or existing pack keeps the editor open, briefly shows localized “Saved!” feedback for two seconds with an opacity transition, then restores the original label. Later saves update the same pack. Validation and save failures appear in a dismissible notification at the top, with the reason for the failure; editor input is retained.

Questions can be marked as surprise questions, with a displayed board value and a separate minimum/maximum scoring range. Both wheel and hidden-table scoring build magnitudes from the minimum in increments of 100, 200, or 400 for rounds 1, 2, or 3, stopping before exceeding the maximum. The editor explains the current increment and its round-based reason; deleting an earlier round updates the increment without changing the configured bounds. The maximum is included only when reached by the increment. The pack chooses the wheel or hidden-table scoring mechanic. An optional prize uses two images: a concealed presentation and a revealed presentation.

Packs are private by default. New rooms store only pack display metadata in the lobby. Start Game freezes the latest saved pack in an immutable, game-specific version document shared by all participants and spectators. Later source-pack edits do not change that version. Explicitly finishing the game deletes the version while retaining results in the room. Legacy rooms keep their embedded snapshots. Media assets remain external resources; copied metadata does not preserve a separate copy of the files.

### Pack editor verification

Real-browser checks for the alternative mode remain pending. Use a signed-in pack
owner and disposable packs. Repeat in English/Ukrainian at desktop (at least 1024 px)
and 390 px mobile widths:

1. Create in Form, switch before saving, edit in Table, save/reopen, then edit/save
   in Form. Repeat starting in Table. Check remembered mode and separate owner preferences.
2. Open legacy and three-round packs in both modes. Check the round cap, switching,
   deletion/cancellation, unequal category lengths, and custom points after save/reopen.
3. Add, rename, reorder, and delete categories/questions. Check minimum counts,
   category hold cancellation, stable selection, focus after adding/deleting/closing,
   and empty board space. Check Previous/Next navigation, Escape/backdrop dismissal,
   and return focus from the question dialog. Check round deletion cancellation separately.
4. Check surprise minimum/maximum/display values and round increment hints, both
   scoring mechanics, both prize images, sharing, emoji, and cross-mode save/reopen.
5. Upload, replace, remove, and preview question/answer image/audio/video. Test local
   and web-image drops, media-paste confirmation/cancellation, invalid files, failure
   recovery, progress, and retained content after errors.
6. During media work, try mode/round/selection/collapse controls and resizing across
   1024 px. The active panel must stay mounted; the automatic Form switch applies
   after completion. Confirm Table returns on desktop without losing draft edits,
   the selected round, or the remembered preference.
7. Save missing question/answer content in another round or collapsed category.
   Check visible errors and focus on the missing field; media-only content remains valid.
8. Use Tab and Enter/Space; test long text, scrolling, touch controls, and absence of
   horizontal page overflow on mobile. Preview, reveal, and return without changing the draft.

## Shared state and services

| Component | Responsibility |
| --- | --- |
| React, Vite, Tailwind, lucide-react | Screens, controls, responsive layout, and visual feedback. |
| Firebase Authentication | Google account identity. |
| Firestore | Packs, user preferences, room state, player scores, gameplay history, and live updates. |
| Firebase Hosting | Serves the built frontend. |
| ImageKit and Cloudflare auth Worker | Media storage and authorized upload/delete operations, with Firebase identity and pack ownership checks. |
| Optional Firebase Analytics | Usage events when configured. |

Data is scoped under `artifacts/{appId}/...`; environment configuration determines the namespace. New rooms keep history in a separate host-readable collection, loaded only when the host opens history. Players append authorized events without reading history. Legacy rooms still embed history. Room snapshots synchronize participants. New rooms collect in-flight buzzes for two seconds and use trusted device-reported local reaction times, with host finalization and persistent penalties. Clock synchronization helps display shared countdowns but does not rank reactions. The client also reconciles stale room state when appropriate. These mechanisms support live play but do not guarantee zero latency or identical media playback on every device.

The host remains an active part of the workflow. Category advancement, judging, returning to the board, and some timed transitions require a participating client. There is no automatic host migration workflow.

## Product behavior to preserve during updates

| ID | Baseline expectation |
| --- | --- |
| APP-01 | Preserve the distinction between pack ownership, permission to host a public pack, and participation in a room. |
| APP-02 | Keep host, contestant, and spectator controls distinct; exclude the host from contestant scoring/ranking. |
| APP-03 | Keep each game's frozen pack version independent of later source-pack edits and preserve results after snapshot deletion. |
| APP-04 | Preserve real-time updates, listener cleanup, and participant recovery when returning to an active room. |
| APP-05 | Keep user-facing copy translated through the existing English/Ukrainian translation system. |
| APP-06 | Maintain usable host, player, and spectator layouts on desktop and mobile, including text and media answers. |
| APP-07 | Preserve question/answer media and prize behavior when changing asset management; consider both the frontend and Worker. |
| APP-08 | Preserve gameplay history for existing recorded actions and the detailed scoring/turn rules in the gameplay reference. |
| APP-09 | Use app-styled custom confirmation modals instead of browser-native confirmation prompts. Keep copy translated, support keyboard access and safe cancellation, and execute destructive actions only after final confirmation. |

## How to use this baseline for future changes

Before implementation, identify the affected baseline IDs and gameplay sections. State whether the requested change preserves behavior or intentionally changes a rule. If behavior changes, update the relevant reference in the same change and explain the old and new outcome. Do not silently rewrite the reference to make an accidental regression appear intended.

Review code against the documented examples and role boundaries. Record what was checked, what requires configured services, and what remains unverified. For code changes, follow the lint/build and manual verification instructions in AGENTS.md. For documentation-only changes, check accuracy, internal links, and the diff; a production build is not evidence that gameplay documentation is correct.

If implementation and this baseline disagree, call out the discrepancy and determine whether it is an intended change, stale documentation, or a defect. These documents are review aids; they do not automatically enforce rules or authorize changes outside the user's request.

## Source map

| Area | Main source |
| --- | --- |
| Authentication, navigation, room recovery, link handling | [App.jsx](../src/App.jsx) |
| Pack creation and media editing | [PackCreator.jsx](../src/views/PackCreator.jsx), [PackManager.jsx](../src/views/PackManager.jsx) |
| Room creation and admission | [HostSetup.jsx](../src/views/HostSetup.jsx), [JoinRoom.jsx](../src/views/JoinRoom.jsx) |
| Game behavior | [Gameplay reference source map](gameplay-reference.md#source-map) |
| Language support | [i18n.jsx](../src/i18n.jsx), [LanguageProvider.jsx](../src/LanguageProvider.jsx) |
| Access rules and media services | [firestore.rules](../firestore.rules), [imageStorage.js](../src/services/imageStorage.js), [Worker guide](../imagekit-auth-worker/README.md) |
