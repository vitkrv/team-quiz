# Q&A Showdown

Q&A Showdown is a real-time multiplayer trivia game built with React, Tailwind CSS, lucide-react, and Firebase.

Question packs are public so any signed-in user can host a room with them. Only the Google-authenticated author who created a pack can edit or delete it.

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create `.env` from `.env.example` and fill it with your Firebase web app config.

3. In Firebase Console, open Authentication, click Get started if Auth has not been initialized yet, then enable the Google provider under Sign-in method.

4. Deploy or paste the rules in `firestore.rules` into Firestore Rules.

   ```sh
   firebase deploy --only firestore:rules
   ```

5. Start the app:

   ```sh
   npm run dev
   ```

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production build in `dist`.
- `npm run preview` previews the production build.
- `npm run lint` runs ESLint.

## Firebase Auth Troubleshooting

`auth/configuration-not-found` means the Firebase project in `.env.local` does not have Authentication configured for the requested sign-in method. Enable Google sign-in for that same project, verify the `VITE_FIREBASE_PROJECT_ID` value matches it, and restart the Vite dev server after changing `.env.local`.

`Missing or insufficient permissions` means Firestore Security Rules are still denying the write. Deploy `firestore.rules` to the same Firebase project used by `.env.local`, then retry saving the pack.
