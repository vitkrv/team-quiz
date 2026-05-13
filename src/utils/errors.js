export const getAuthErrorMessage = (err) => {
    if (err?.code === 'auth/configuration-not-found') {
        return 'Firebase Auth is not configured for this project. Enable Google sign-in in Firebase Console, then restart the dev server.';
    }

    if (err?.code === 'auth/invalid-api-key' || err?.code === 'auth/api-key-not-valid') {
        return 'Firebase API key is invalid. Check the VITE_FIREBASE_* values in .env.local, then restart the dev server.';
    }

    if (err?.code === 'auth/popup-closed-by-user') {
        return 'Google sign-in was closed before it finished.';
    }

    return err?.message ? `Failed to authenticate: ${err.message}` : 'Failed to authenticate.';
};
export const getFirestoreErrorMessage = (err, action) => {
    if (err?.code === 'permission-denied') {
        return `${action} failed: Firestore denied the write. Deploy the rules from firestore.rules to the Firebase project in .env.local.`;
    }

    return err?.message ? `${action} failed: ${err.message}` : `${action} failed.`;
};
