import { initializeApp } from 'firebase/app';
import { initializeAnalytics, isSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const canvasFirebaseConfig = globalThis.__firebase_config
    ? JSON.parse(globalThis.__firebase_config)
    : null;

const envMeasurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;

const envFirebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: envMeasurementId
};

const firebaseConfig = canvasFirebaseConfig
    ? { ...canvasFirebaseConfig, measurementId: canvasFirebaseConfig.measurementId ?? envMeasurementId }
    : envFirebaseConfig;
export const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const hasFirebaseAnalyticsConfig = Boolean(app && firebaseConfig.measurementId);
export const analyticsPromise = hasFirebaseAnalyticsConfig
    ? isSupported()
        .then((supported) => (supported
            ? initializeAnalytics(app, { config: { send_page_view: false } })
            : null))
        .catch((err) => {
            console.error("Analytics initialization error:", err);
            return null;
        })
    : Promise.resolve(null);

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const appId = globalThis.__app_id ?? import.meta.env.VITE_FIREBASE_APP_NAMESPACE ?? 'cortex-rush';
