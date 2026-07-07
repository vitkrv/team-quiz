import { useEffect, useState } from 'react';
import { getMediaKind, getMediaUrl, MEDIA_KINDS } from '../services/imageStorage';

const DEFAULT_RETRY_COUNT = 2;
const imageLoadCache = new Map();

const canCacheBust = (url) => (
    typeof url === 'string'
    && !url.startsWith('blob:')
    && !url.startsWith('data:')
);

const getAttemptUrl = (url, attempt) => {
    if (attempt === 0 || !canCacheBust(url)) return url;

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}cr_image_retry=${Date.now()}_${attempt}`;
};

const loadImageOnce = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(url);
    image.onerror = () => reject(new Error(`Image failed to load: ${url}`));
    image.src = url;
});

export const preloadImage = (url, { retries = DEFAULT_RETRY_COUNT } = {}) => {
    if (!url) return Promise.resolve({ status: 'idle', url: '' });

    const cached = imageLoadCache.get(url);
    if (cached?.status === 'loaded') return Promise.resolve(cached);
    if (cached?.status === 'failed') return Promise.reject(cached.error);
    if (cached?.promise) return cached.promise;

    const promise = (async () => {
        let lastError = null;

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            const attemptUrl = getAttemptUrl(url, attempt);

            try {
                await loadImageOnce(attemptUrl);
                const result = { status: 'loaded', url: attemptUrl, baseUrl: url };
                imageLoadCache.set(url, result);
                return result;
            } catch (err) {
                lastError = err;
            }
        }

        const error = lastError || new Error(`Image failed to load: ${url}`);
        imageLoadCache.set(url, { status: 'failed', url: '', baseUrl: url, error });
        throw error;
    })();

    imageLoadCache.set(url, { status: 'loading', promise });
    return promise;
};

export const preloadMediaImage = (media, variant = 'game', options) => {
    if (getMediaKind(media) !== MEDIA_KINDS.IMAGE) {
        return Promise.resolve({ status: 'idle', url: '' });
    }

    return preloadImage(getMediaUrl(media, variant), options);
};

export const useRetryableImage = (url, { retries = DEFAULT_RETRY_COUNT } = {}) => {
    const [state, setState] = useState(() => ({
        status: url ? 'loading' : 'idle',
        url: ''
    }));

    useEffect(() => {
        let isCancelled = false;

        if (!url) {
            setState({ status: 'idle', url: '' });
            return undefined;
        }

        setState({ status: 'loading', url: '' });

        preloadImage(url, { retries })
            .then((result) => {
                if (!isCancelled) {
                    setState({ status: 'loaded', url: result.url });
                }
            })
            .catch(() => {
                if (!isCancelled) {
                    setState({ status: 'failed', url: '' });
                }
            });

        return () => {
            isCancelled = true;
        };
    }, [retries, url]);

    return state;
};
