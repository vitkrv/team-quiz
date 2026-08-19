# Cortex Rush Admin App

Standalone read-only Firebase admin UI for Cortex Rush.

## Install And Run

Run commands from `admin-app/`:

```sh
npm install
npm run admin-dev
```

The local dev server runs on `http://localhost:5175/`.

Build:

```sh
npm run admin-build
```

Preview a production build:

```sh
npm run admin-preview
```

## Environment

Create `.env.local` from `.env.example` and fill in the Firebase web app values:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_APP_NAMESPACE=team-quiz
VITE_FIREBASE_MEASUREMENT_ID=
```

## Admin Setup

The app signs in with Google and checks this document:

```txt
artifacts/{VITE_FIREBASE_APP_NAMESPACE}/users/{Firebase Auth UID}
```

Create or update that document with:

```json
{
  "admin": true
}
```

Authenticated users without `admin: true` see a blocked-access screen.

Column visibility and order are saved on the same admin user document:

```txt
adminTableColumns.{games|questionPacks|users}
```

## Collections

The admin app reads these Firestore collections once per refresh, using `VITE_FIREBASE_APP_NAMESPACE` as the `{appId}` segment:

- Games: `artifacts/{appId}/public/data/rooms`
- Question Packs: `artifacts/{appId}/public/data/packs`
- Users: `artifacts/{appId}/users`

It does not create, delete, export, paginate, or attach realtime listeners. It only updates the signed-in admin user's `adminTableColumns` view preferences.

## Security Rules

This app uses client-side gating for UX only. Firestore Security Rules must enforce admin access.

Suggested read-only shape:

```js
function isAdmin(appId) {
  return request.auth != null
    && get(/databases/$(database)/documents/artifacts/$(appId)/users/$(request.auth.uid)).data.admin == true;
}

match /artifacts/{appId}/public/data/packs/{packId} {
  allow read: if isAdmin(appId);
  allow write: if false;
}

match /artifacts/{appId}/public/data/rooms/{roomCode} {
  allow read: if isAdmin(appId);
  allow write: if false;
}

match /artifacts/{appId}/users/{userId} {
  allow read: if isAdmin(appId);
  allow update: if request.auth.uid == userId
    && isAdmin(appId)
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['adminTableColumns', 'updatedAt']);
}
```
