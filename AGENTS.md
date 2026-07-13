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

Fill `.env.local` with Firebase web app values and the deployed ImageKit auth Worker endpoint. Local env files are ignored by git and must not be committed.

Required app env keys:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_APP_NAMESPACE`
- `VITE_IMAGEKIT_AUTH_ENDPOINT`

Optional env keys:

- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_APP_PUBLIC_URL`

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

There is currently no automated test script in `package.json`.

Use these checks for normal code changes:

```sh
npm run lint
npm run build
```

Manual verification should match the changed surface area. Common flows:

- Authentication: sign in with Google and sign out.
- Pack management: create, edit, delete, and mark packs public/private.
- Media: attach, save, replace, remove, and view image/audio/video question media.
- Game host flow: create a room, start a game, advance questions, finish the game.
- Player flow: join by room code or shared `?room=` link, answer questions, view results.
- Spectator/final-results link flow: open a shared `?game=` URL after a game has results.
- Responsive UI: check desktop and mobile widths for changed screens.

For Firestore security rule changes, deploy or test the target project's rules before relying on app behavior:

```sh
firebase deploy --only firestore:rules
```

For Worker changes, verify from `imagekit-auth-worker/`:

```sh
wrangler deploy
wrangler tail
```

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

## Repository Map

- `src/App.jsx`: top-level auth, routing-like view state, room URL handling, and Firebase listeners.
- `src/views/`: main screens.
- `src/views/game/`: game room, board, active question, and results screens.
- `src/components/`: reusable UI and media components.
- `src/actions/gameActions.js`: Firestore writes and game state transitions.
- `src/services/`: analytics and ImageKit/media storage integration.
- `src/hooks/`: reusable React hooks.
- `src/utils/`: pure helpers.
- `src/i18n.jsx`: translation data and helpers.
- `firestore.rules`: Firestore authorization model.
- `imagekit-auth-worker/worker.js`: Cloudflare Worker that authorizes ImageKit operations through Firebase ID tokens and Firestore REST.

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

## Dependency Guidance

- Prefer existing dependencies before adding new ones.
- If a new package is necessary, explain why, update `package-lock.json`, and run lint/build checks.
- Avoid adding test or build tooling unless the task requires it or the user asks.

## Known Gaps

- No automated unit/integration/e2e test suite is configured yet.
- Firebase, ImageKit, and Google sign-in flows require configured external services for full manual verification.
