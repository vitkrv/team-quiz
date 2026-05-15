import { DEFAULT_LANGUAGE, translate } from '../i18n';

export const getAuthErrorMessage = (err, language = DEFAULT_LANGUAGE) => {
    if (err?.code === 'auth/configuration-not-found') {
        return translate(language, 'authConfigMissing');
    }

    if (err?.code === 'auth/invalid-api-key' || err?.code === 'auth/api-key-not-valid') {
        return translate(language, 'authInvalidApiKey');
    }

    if (err?.code === 'auth/popup-closed-by-user') {
        return translate(language, 'authPopupClosed');
    }

    return err?.message
        ? translate(language, 'authFailedWithMessage', { message: err.message })
        : translate(language, 'authFailed');
};
export const getFirestoreErrorMessage = (err, action, language = DEFAULT_LANGUAGE) => {
    if (err?.code === 'permission-denied') {
        return translate(language, 'firestorePermissionDenied', { action });
    }

    return err?.message
        ? translate(language, 'actionFailedWithMessage', { action, message: err.message })
        : translate(language, 'actionFailed', { action });
};
