# Cortex Rush

Cortex Rush is a real-time multiplayer trivia game built with React, Tailwind CSS, lucide-react, and Firebase.

Question packs are owner-only by default. Authors can mark a pack as available to everyone so any signed-in user can host a room with it. Only the Google-authenticated author who created a pack can edit or delete it.

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create `.env.local` from `.env.example` and fill it with your Firebase web app config.
   For production builds, put production-only values in `.env.production.local` so Firebase and Analytics config stays out of the public repository.
   Keep `VITE_FIREBASE_MEASUREMENT_ID` empty in committed example files and set the real value only in ignored local env files.

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

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production-mode Vite build in `dist` for Firebase Hosting.
- `npm run preview` previews the production build.
- `npm run lint` runs ESLint.

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

New rooms use storage version 2. The live room contains pack display metadata and a
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

## Firebase Auth Troubleshooting

`auth/configuration-not-found` means the Firebase project in `.env.local` does not have Authentication configured for the requested sign-in method. Enable Google sign-in for that same project, verify the `VITE_FIREBASE_PROJECT_ID` value matches it, and restart the Vite dev server after changing `.env.local`.

`Missing or insufficient permissions` means Firestore Security Rules are still denying the write. Deploy `firestore.rules` to the same Firebase project used by `.env.local`, then retry saving the pack.
