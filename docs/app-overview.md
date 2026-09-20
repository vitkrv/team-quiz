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
6. Play repeats through question selection, answering, judging, answer reveal, and return to the board.
7. The host completes the game, resolving a top-score tie through RPS when following the normal completed-board flow. Everyone can view final standings.

New arrivals after the lobby view the game as spectators. Existing participants retain their role when reopening their room. A `?game=` link supports viewing a game and its defined results; see the gameplay reference for the precise result condition.

## Question packs

A pack contains a title, optional emoji icon, ownership/sharing information, ordered categories, and ordered questions. Authors can add, remove, reorder, and preview categories and questions.

Each question includes a point value and question/answer content. Each side must have text or media; either can have both. Supported media kinds are image, audio, and video. Ordinary point values are normalized to positive multiples of 100 in the editor.

Questions can be marked as surprise questions, with a displayed board value and a separate minimum/maximum scoring range. The pack chooses the wheel or hidden-table scoring mechanic. An optional prize uses two images: a concealed presentation and a revealed presentation.

Packs are private by default. New rooms store only pack display metadata in the lobby. Start Game freezes the latest saved pack in an immutable, game-specific version document shared by all participants and spectators. Later source-pack edits do not change that version. Explicitly finishing the game deletes the version while retaining results in the room. Legacy rooms keep their embedded snapshots. Media assets remain external resources; copied metadata does not preserve a separate copy of the files.

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
