import { logEvent, setDefaultEventParameters, setUserProperties } from 'firebase/analytics';
import { analyticsPromise, appId } from '../firebase';

const APP_NAME = 'team-quiz';
const PUBLIC_URL = import.meta.env.VITE_APP_PUBLIC_URL || '';

const getHostname = () => (typeof window === 'undefined' ? '' : window.location.hostname);

const getPublicHostname = () => {
    if (!PUBLIC_URL) return '';

    try {
        return new URL(PUBLIC_URL).hostname;
    } catch {
        return '';
    }
};

const isLocalhost = () => {
    const hostname = getHostname();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost');
};

const getAppEnvironment = () => {
    const hostname = getHostname();
    const publicHostname = getPublicHostname();

    if (isLocalhost()) return 'localhost';
    if (publicHostname && hostname === publicHostname) return 'production';
    if (import.meta.env.PROD) return 'preview';
    return 'development';
};

const getDefaultEventParameters = () => ({
    app_name: APP_NAME,
    app_namespace: appId,
    app_environment: getAppEnvironment(),
    is_localhost: isLocalhost(),
    host_name: getHostname()
});

const cleanAnalyticsParams = (params = {}) => Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
);

let analyticsReadyPromise = null;

const getAnalyticsInstance = () => {
    if (!analyticsReadyPromise) {
        analyticsReadyPromise = analyticsPromise.then((analytics) => {
            if (analytics) {
                setDefaultEventParameters(getDefaultEventParameters());
            }

            return analytics;
        });
    }

    return analyticsReadyPromise;
};

export const trackEvent = (eventName, params = {}) => {
    getAnalyticsInstance()
        .then((analytics) => {
            if (!analytics) return;
            logEvent(analytics, eventName, cleanAnalyticsParams(params));
        })
        .catch((err) => {
            console.error("Analytics event error:", err);
        });
};

export const trackPageView = (screenName) => {
    if (typeof window === 'undefined') return;

    const pagePath = window.location.pathname || '/';
    trackEvent('page_view', {
        page_title: `${APP_NAME}: ${screenName}`,
        page_location: `${window.location.origin}${pagePath}`,
        page_path: pagePath,
        screen_name: screenName
    });
};

export const setAnalyticsUserContext = ({ signedIn }) => {
    getAnalyticsInstance()
        .then((analytics) => {
            if (!analytics) return;

            setUserProperties(analytics, {
                auth_state: signedIn ? 'signed_in' : 'signed_out'
            });
        })
        .catch((err) => {
            console.error("Analytics user context error:", err);
        });
};

export const getPackAnalyticsSummary = (pack = {}) => {
    const categories = pack.categories || [];
    const questions = categories.flatMap((category) => category.questions || []);
    const questionMediaCount = questions.reduce((count, question) => (
        count + (question.questionMedia ? 1 : 0) + (question.answerMedia ? 1 : 0)
    ), 0);
    const prize = pack.prize || {};
    const prizeMediaCount = (prize.hiddenMedia ? 1 : 0) + (prize.revealedMedia ? 1 : 0);

    return {
        category_count: categories.length,
        question_count: questions.length,
        surprise_question_count: questions.filter((question) => question.isSurpriseQuestion).length,
        media_count: questionMediaCount + prizeMediaCount,
        is_public: pack.isPublic ? 'yes' : 'no'
    };
};

export const getRoomAnalyticsSummary = (room = {}) => ({
    ...getPackAnalyticsSummary(room.pack || {}),
    player_count: Object.values(room.players || {}).filter((player) => !player.isHost).length
});
