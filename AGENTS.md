# AI Repository Guide

This guide is for AI coding agents and maintainers working in this repository. Keep it current when commands, project structure, or deployment steps change.

## Project Snapshot

- App: Cortex Rush, a real-time multiplayer trivia game.
- Frontend: React 18, Vite, Tailwind CSS, lucide-react.
- Backend/services: Firebase Auth, Firestore, Firebase Hosting, optional Analytics, and a Cloudflare Worker for ImageKit upload/delete authorization.
- Main app code lives in `src/`.
- Cloudflare Worker code lives in `imagekit-auth-worker/`.
- Firebase Hosting serves the production build from `dist/`.

## First Checks

Before editing:

1. Run `git status --short` and treat existing changes as user work unless the task says otherwise.
2. Read `package.json`, `README.md`, and any files directly related to the requested change.
3. Prefer small, scoped edits that match the current React component and utility patterns.
4. Do not commit, stage, deploy, or change versions unless the user explicitly asks.

For product or gameplay changes, read [the app baseline](docs/app-overview.md) and the affected sections of [the gameplay reference](docs/gameplay-reference.md). Preserve the documented role, scoring, and turn behavior unless the request changes it; update the reference alongside intentional behavior changes. Treat code as the evidence when checking whether a reference is stale.

## Current Product Surface

- Google-authenticated host, contestant, and spectator roles; English/Ukrainian UI.
- Owned/public packs with previews, ordered categories/questions, question/answer media, and optional prize images.
- Up to 20 contestants plus the host; category previews, question suggestions, host judging, and standard/True Competitive scoring.
- Late-buzz feedback, animated surprise contestant selection, wheel/table surprise scoring, score editing, and host history.
- Host RPS side matches, final top-score tie-breakers, remembered rooms, and shared results. The host is excluded from contestant standings.

## Setup

Install dependencies:

```sh
npm install
```

Create local environment configuration:

```sh
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill `.env.local` with Firebase web app values and the deployed ImageKit auth Worker endpoint when using media uploads/deletions. Use `.env.production.local` for production-only overrides; `npm run build` explicitly uses production mode. Local env files are ignored by git and must not be committed. Restart Vite after changing them.

Firebase web app env keys:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

`src/firebase.js` checks API key, project ID, and app ID to decide whether to initialize Firebase; Google sign-in also needs the appropriate Auth configuration.

Additional configuration:

- `VITE_FIREBASE_APP_NAMESPACE`: Firestore namespace; `.env.example` uses `qa-showdown`, while the code fallback is `cortex-rush`. Keep it consistent with the intended dataset.
- `VITE_IMAGEKIT_AUTH_ENDPOINT`: required for media upload/delete operations, not text-only packs.
- `VITE_FIREBASE_MEASUREMENT_ID`: optional Analytics; keep real values in ignored local env files.
- `VITE_APP_PUBLIC_URL`: optional production hostname reference for Analytics environment labels; invitation links use the current page URL.

## Run

Start the Vite dev server:

```sh
npm run dev
```

Preview a production build locally:

```sh
npm run build
npm run preview
```

The app needs valid Firebase config for authenticated/game flows. Without Firebase config, the app shows the setup-missing state.

## Build, Lint, And Verify

There is currently no automated test script in `package.json`. For changes to game storage/actions/rules, run the isolated Emulator checks in `scripts/verify-game-storage.mjs`; setup and commands are in `docs/game-storage-validation.md`.

The harness requires Java, the Firebase CLI, and a dedicated local Firestore Emulator. It targets `demo-game-storage`, requires a loopback `FIRESTORE_EMULATOR_HOST`, and loads this checkout's rules into the emulator project. Do not share that emulator with other active tests. It covers room reservations, concurrent starts/finishes, history permissions/pagination, frozen packs, player events, and legacy compatibility; it does not deploy rules or Hosting.

Use these checks for normal code changes:

```sh
npm run lint
npm run build
```

For documentation-only changes, check source accuracy, relative links, and `git diff --check`; lint/build are not needed to validate prose.

Manual verification should match the changed surface area. Common flows:

- Authentication: sign in with Google and sign out.
- Pack management: create, edit, delete, and mark packs public/private.
- Media: attach, save, replace, remove, and view image/audio/video question media.
- Game host flow: create a room, start a game, advance questions, finish the game.
- Player flow: join by room code or shared `?room=` link, answer questions, view results.
- Spectator/final-results link flow: open a shared `?game=` URL after a game has results.
- Responsive UI: check desktop and mobile widths for changed screens.
- Game mechanics: standard/competitive wrong answers, late-buzz feedback, surprise draw and wheel/table scoring, side-match/final RPS, and host exclusion from standings.
- Storage lifecycle: concurrent start, frozen content after source edits, host history loading/older pages, participant/spectator refresh, and retained results after explicit finish deletes the snapshot. Check legacy rooms separately.

For Firestore security rule changes, validate the checked-in rules with the Emulator before relying on app behavior. For Worker changes, check both frontend media calls and ownership authorization against the [Worker guide](imagekit-auth-worker/README.md). Deploy only when explicitly requested, using the commands below; `wrangler tail` can inspect deployed Worker logs.

## Deployment

Build the app before Firebase Hosting deploys:

```sh
npm run build
firebase deploy --only hosting
```

Deploy Firestore rules separately when `firestore.rules` changes:

```sh
firebase deploy --only firestore:rules
```

Deploy the ImageKit auth Worker from `imagekit-auth-worker/` after Worker code or secret changes:

```sh
wrangler deploy
```

Do not deploy unless the user explicitly asks.

Coordinate storage-related rule and frontend releases. Older clients must reload before creating new-format rooms. No migration, new indexes, or TTL configuration is required for the current storage model.

## Repository Map

- `src/App.jsx`: top-level auth, routing-like view state, room URL handling, and Firebase listeners.
- `src/views/`: main screens.
- `src/views/game/`: game room, board, active question, and results screens.
- `src/components/`: reusable UI and media components.
- `src/actions/gameActions.js`: Firestore writes and game state transitions.
- `src/actions/gameStorage.js`: Atomic history writes, legacy compatibility and frozen-pack references.
- `src/actions/roomActions.js`: Room-code reservation, room creation and atomic game start.
- `src/services/`: analytics and ImageKit/media storage integration.
- `src/hooks/`: reusable React hooks.
- `src/hooks/useGamePack.js`: one-time frozen-pack loading per version/load, retries, and legacy/finished-room fallbacks.
- `src/hooks/useGameHistory.js`: host dialog history subscription and cursor pagination in pages of 50.
- `src/utils/`: pure helpers.
- `src/utils/gameResults.js`: contestant filtering, top-score ties, and final-result availability.
- `src/i18n.jsx`: translation data and helpers.
- `firestore.rules`: Firestore authorization model.
- `imagekit-auth-worker/worker.js`: Cloudflare Worker that authorizes ImageKit operations through Firebase ID tokens and Firestore REST.
- `scripts/verify-game-storage.mjs` and `docs/game-storage-validation.md`: isolated storage/rules integration checks and release verification guidance.

## Coding Conventions

- Use functional React components and hooks.
- Keep Firebase reads/writes centralized in existing action/service patterns when practical.
- Keep translation-facing strings in `src/i18n.jsx` instead of hardcoding new user-visible copy.
- Use lucide-react icons when adding icon buttons or UI controls.
- Follow existing Tailwind utility style and avoid broad visual rewrites for narrow tasks.
- Preserve existing real-time listener cleanup patterns.
- Validate external inputs and URL/query values before using them in Firestore paths or UI state.
- Do not place secrets in frontend code, docs examples with real values, or committed env files.

## Data And Security Notes

- Question packs are owner-only by default unless marked public.
- Only the Google-authenticated pack owner should be able to edit/delete their packs and manage associated media.
- The Worker receives Firebase ID tokens from the app and checks ownership through Firestore REST before signing uploads or deleting media.
- Media delete/replace behavior depends on both app code and Worker authorization. Verify both sides when changing media flows.
- Firestore paths use `artifacts/{appId}/...`; keep `appId` and `VITE_FIREBASE_APP_NAMESPACE` behavior in mind when debugging data visibility.
- Stable room document IDs are distinct from reusable six-digit invitation codes. Keep code reservation and join resolution transactional through `roomActions.js`; legacy numeric room IDs stay reserved so old links remain valid.
- New rooms use `dataVersion: 2`, `packSummary`, and `packVersionId`; do not reintroduce embedded `pack` or `history`. Start freezes the latest accessible saved source pack in `gamePackVersions`; explicit finish atomically deletes it and retains results. Leaving or exhausting the board does not delete it.
- Use `gameStorage.js` helpers for atomic action/history writes and transaction pack reads. Complete transaction reads before writes. Preserve legacy embedded pack/history behavior without migrating existing rooms.
- New-format history is append-only under `rooms/{gameId}/history`, readable only by the host (not unrelated admins). Player buzz/surprise events must accompany their validated action. Enable history subscriptions only while the host dialog is open.
- Frozen packs still expose full answers to authorized readers; hiding answers in the UI is not confidentiality. Room-update rules do not independently enforce every gameplay/scoring rule.

## Dependency Guidance

- Prefer existing dependencies before adding new ones.
- If a new package is necessary, explain why, update `package-lock.json`, and run lint/build checks.
- Avoid adding test or build tooling unless the task requires it or the user asks.

## Known Gaps

- No general unit/e2e test suite is configured. A focused Firestore Emulator integration harness covers game history and frozen-pack storage.
- Firebase, ImageKit, and Google sign-in flows require configured external services for full manual verification.
- Abandoned-game snapshot cleanup, external media retention, and automatic host migration are not implemented.
