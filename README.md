# Cortex Rush

Cortex Rush is a real-time multiplayer trivia game built with React, Tailwind CSS, lucide-react, and Firebase.

Question packs are owner-only by default. Authors can mark a pack as available to everyone so any signed-in user can host a room with it. Only the Google-authenticated author who created a pack can edit or delete it.

## Features and game flow

- Google sign-in and English/Ukrainian interfaces.
- Pack editing with category/question reordering, board previews, image/audio/video questions and answers, and optional concealed/revealed prize images.
- Host-led rooms for up to 20 contestants plus the host, with six-digit invitations, remembered rooms, and spectator support after play starts.
- Category previews, a shared question board, contestant question suggestions, and host judging/reveal controls. Answers are given outside the app; the app does not evaluate free-text answers or provide voice chat.
- Standard scoring or optional True Competitive Mode with wrong-answer deductions and early-buzz delays. New rooms collect in-flight buzzes for two seconds and rank device-reported local reaction times; accepted losing presses retain personal reaction-gap feedback.
- Surprise questions with animated contestant selection and wheel or hidden-table scoring; host score adjustments and paginated game history.
- Rock-paper-scissors side matches and final top-score tie-breakers, plus shareable results that exclude the host from contestant standings.

To play, sign in, create or choose an owned/public pack, host a room, and share its invitation. Start with at least one contestant, advance the category previews, then open and judge questions. Explicitly finish the game to retain results and release its frozen pack snapshot. Detailed rules and role boundaries are in the [gameplay reference](docs/gameplay-reference.md).

## Setup

Use Node.js 20 or newer (required by Firebase 12). The frontend uses the modular Firebase SDK and Vite's existing production build targets.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create `.env.local` from `.env.example` and fill it with your Firebase web app config.
   For production builds, put production-only values in `.env.production.local` so Firebase and Analytics config stays out of the public repository.
   Keep `VITE_FIREBASE_MEASUREMENT_ID` empty in committed example files and set the real value only in ignored local env files.

   Use a consistent `VITE_FIREBASE_APP_NAMESPACE` for the intended dataset. The supplied example uses `qa-showdown`; when unset, the code defaults to `cortex-rush`. Changing it changes the Firestore data paths. Optional `VITE_APP_PUBLIC_URL` identifies the production hostname for Analytics environment labels.

3. In Firebase Console, open Authentication, click Get started if Auth has not been initialized yet, then enable the Google provider under Sign-in method.

4. Deploy or paste the rules in `firestore.rules` into Firestore Rules.

   ```sh
   firebase deploy --only firestore:rules
   ```

5. Deploy an ImageKit auth endpoint.

   Firebase Functions are not required. The app calls the URL from `VITE_IMAGEKIT_AUTH_ENDPOINT` to get ImageKit upload signatures and to delete replaced/removed files. Follow the Cloudflare Worker guide in `imagekit-auth-worker/README.md`.
   After changing Worker code or secrets, run `wrangler deploy` again.

6. Add the deployed endpoint URL to `.env.local`:

   ```env
   VITE_IMAGEKIT_AUTH_ENDPOINT=https://your-worker.your-subdomain.workers.dev
   ```

7. Start the app:

   ```sh
   npm run dev
   ```

   The ImageKit endpoint is needed for media upload/delete operations; text-only packs do not require it. Restart Vite after changing environment values.

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production-mode Vite build in `dist` for Firebase Hosting.
- `npm run preview` previews the production build.
- `npm run lint` runs ESLint.

## Verification and deployment

For code changes, run `npm run lint` and `npm run build`, then manually check the affected host, player, and spectator flows. There is no general unit/e2e test script. Storage, game-action, and Firestore-rule changes also have a focused [Firestore Emulator validation harness](docs/game-storage-validation.md), using a dedicated local emulator and the `demo-game-storage` project.

For documentation-only edits, verify source accuracy, relative links, and `git diff --check`.

To publish the frontend, build first, then deploy Hosting:

```sh
npm run build
firebase deploy --only hosting
```

Rules deploy separately with `firebase deploy --only firestore:rules`; coordinate rules and frontend changes for storage releases. Deploy Worker changes from `imagekit-auth-worker/` using the [Worker guide](imagekit-auth-worker/README.md). These deployment commands require the corresponding CLI, account access, and intended target project; lint/build and emulator validation do not deploy anything.

## AI / Agent Guide

Repository operating guidance for AI tools lives in `AGENTS.md`. Update it when build, test, run, verification, or deployment workflows change.

Product and gameplay references for reviewing manual or AI-generated changes:

- [App overview and change baseline](docs/app-overview.md)
- [Game modes and gameplay reference](docs/gameplay-reference.md)

## Room identity and invitation codes

New games use stable Firestore document IDs. Six-digit invitation codes resolve through
`artifacts/{appId}/public/data/roomCodes/{code}` and are reserved atomically with the game.
Creation tries at most 10 code candidates; codes belonging to finished games may be reused.
Results links (`?game=<gameId>`) and remembered rooms retain the stable ID, so reuse does
not redirect an old results link. Legacy six-digit room documents and their links remain
supported, and their codes are never reused.

Validate and deploy the updated `firestore.rules` together with this frontend release.
Older clients must reload to create rooms after the new rules are deployed.

## Game history and frozen packs

New rooms use `dataVersion: 2`. The live room contains pack display metadata and a
`packVersionId`, without embedded history or question-pack content. When the host
clicks **Start Game**, a transaction freezes the latest saved source pack in
`artifacts/{appId}/public/data/gamePackVersions/{versionId}` and initializes the board.
The snapshot cannot change during play. Participants and spectators fetch that same
version once per load; ordinary room updates do not resend it.

History events live in `rooms/{gameId}/history/{eventId}` under the same data root.
Only the game host can read them, including when an unrelated user is an admin.
The host dialog subscribes to the newest 50 events while open and loads older pages
on demand. Players can append their own validated buzz and surprise-scoring events
atomically with the action, but cannot read any history. Event documents cannot be
edited or deleted by clients.

Finishing a new-format game atomically deletes its pack snapshot and records the
final event. The room retains scores, champion information and display metadata, so
results links work without the pack. Leaving a game or finishing all questions does
not delete the snapshot: the host must explicitly finish the game. Abandoned-game
cleanup is deferred.

Existing rooms retain embedded packs/history and their previous behavior, including
history visibility in shared payloads. No migration is performed. Full frozen packs
still include answers for every participant; answer secrecy and retaining external
media files are separate work.

Validate and deploy `firestore.rules` with the frontend release. Older clients must
reload before creating new rooms; neither rules nor hosting are deployed by the
validation commands. See [storage validation](docs/game-storage-validation.md).

## Post-game recap and achievements

New games also use `recapVersion: 1`. Gameplay atomically maintains separate recap
statistics and score entries. Results show eight possible achievements (shared on
ties), performance by player/category, and score-progression charts. The all-player chart
below achievements shares one event timeline, with player colors and an interactive legend;
selecting a line or legend entry highlights that player. English and Ukrainian
are supported.

Finishing saves each awarded player's achievement details, game ID, invitation code,
and completion date under their profile's `gameAchievements` subcollection. It freezes
the recap and deletes the frozen pack in the same transaction, so achievements and
performance statistics survive pack deletion. Question/answer content and media are
not retained in the recap.
Profile controls are deferred. Existing games without the recap marker show only
their original results, with the compact layout; no historical awards are inferred.

Deploy the updated rules and frontend together when authorized. Run the existing
storage validation command to include the recap/achievement scenarios.

## Firebase Auth Troubleshooting

`auth/configuration-not-found` means the Firebase project in `.env.local` does not have Authentication configured for the requested sign-in method. Enable Google sign-in for that same project, verify the `VITE_FIREBASE_PROJECT_ID` value matches it, and restart the Vite dev server after changing `.env.local`.

`Missing or insufficient permissions` means Firestore Security Rules are still denying the write. Deploy `firestore.rules` to the same Firebase project used by `.env.local`, then retry saving the pack.

## Buzzer policy v1

New rooms use `buzzerPolicyVersion: 1` and a bounded `rooms/{gameId}/buzzer/current` document. The first server-committed submission starts a two-second collection window. The host resolves accepted submissions by reported local reaction duration, then server acceptance timestamp and player ID. Device measurements and host ranking are trusted; there is no new backend service or latency estimate. Shared penalties apply to button and Space, and the answer countdown begins only when the winner is finalized. Existing rooms keep their previous policy.

Rules and frontend require a coordinated release; older clients must reload before creating new rooms. No migration or new indexes are required. The existing storage verification command also runs `scripts/verify-buzzer.mjs`. See the [gameplay reference](docs/gameplay-reference.md#4-ordinary-question-sequence) for refresh, penalties, deadlines, and host recovery.
