import { useEffect, useState } from 'react';
import { getMediaKind, getMediaUrl, MEDIA_KINDS } from '../services/imageStorage';
import { createPreloadQueue } from '../utils/preloadQueue';

const queue = createPreloadQueue({ concurrency: globalThis.navigator?.connection?.saveData ? 1 : 3 });
const RETRIES = 2;
const TIMEOUT_MS = 8000;
export const cancelBackgroundPreloads = () => queue.cancelBackground();

const loadImageOnce = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (error) => {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        if (error) { image.src = ''; reject(error); } else resolve(url);
    };
    const timer = setTimeout(() => finish(new Error('Image timed out')), TIMEOUT_MS);
    image.onload = () => finish();
    image.onerror = () => finish(new Error('Image failed to load'));
    image.src = url;
});

export const preloadImage = (url, { retries = RETRIES, priority = 1, retry = false, preserveUrl = false } = {}) => {
    if (!url) return Promise.resolve({ status: 'idle', url: '' });
    return queue.load(preserveUrl ? `external-image:${url}` : url, async () => {
        for (let attempt = 0; ; attempt++) {
            const attemptUrl = attempt && !preserveUrl && !/^(blob:|data:)/.test(url)
                ? `${url}${url.includes('?') ? '&' : '?'}cr_image_retry=${Date.now()}_${attempt}` : url;
            try { await loadImageOnce(attemptUrl); return { status: 'loaded', url: attemptUrl, baseUrl: url }; }
            catch (error) { if (attempt >= retries) throw error; }
        }
    }, { priority, retry });
};

export const preloadMediaImage = (media, variant = 'game', options) => getMediaKind(media) === MEDIA_KINDS.IMAGE
    ? preloadImage(getMediaUrl(media, variant), { ...options, preserveUrl: media.provider === 'external' }) : Promise.resolve({ status: 'idle', url: '' });

export const preloadMedia = (media, variant = 'game', options = {}) => {
    const kind = getMediaKind(media);
    if (kind === MEDIA_KINDS.IMAGE) return preloadMediaImage(media, variant, options);
    const url = getMediaUrl(media, variant);
    if (!url || ![MEDIA_KINDS.AUDIO, MEDIA_KINDS.VIDEO].includes(kind)) return Promise.resolve({ status: 'idle', url: '' });
    return queue.load(url, () => new Promise((resolve, reject) => {
        const element = document.createElement(kind === MEDIA_KINDS.VIDEO ? 'video' : 'audio');
        const dispose = () => { element.pause(); element.removeAttribute('src'); element.load(); };
        const finish = (error) => {
            clearTimeout(timer);
            element.removeEventListener('loadeddata', ready);
            element.removeEventListener('canplay', ready);
            element.removeEventListener('error', failed);
            if (error) { dispose(); reject(error); }
            else resolve({ status: 'loaded', url, element, dispose });
        };
        const ready = () => finish();
        const failed = () => finish(new Error('Media preload failed'));
        const timer = setTimeout(() => finish(new Error('Media preload timed out')), options.timeoutMs ?? TIMEOUT_MS);
        element.preload = 'auto';
        element.playsInline = true;
        element.addEventListener('loadeddata', ready);
        element.addEventListener('canplay', ready);
        element.addEventListener('error', failed);
        element.src = url;
        element.load();
    }), options);
};

export const useRetryableImage = (url, { retries = RETRIES, preserveUrl = false } = {}) => {
    const [state, setState] = useState({ status: 'idle', url: '' });
    useEffect(() => {
        let active = true;
        let failed = false;
        let loading = false;
        const load = (retry = false) => {
            if (loading) return;
            if (!url) { setState({ status: 'idle', url: '' }); return; }
            loading = true;
            setState({ status: 'loading', url: '' });
            preloadImage(url, { retries, retry, preserveUrl }).then((result) => {
                failed = false;
                if (active) setState({ status: 'loaded', url: result.url });
            }, () => {
                failed = true;
                if (active) setState({ status: 'failed', url: '' });
            }).finally(() => { loading = false; });
        };
        const recover = () => { if (failed && navigator.onLine !== false && !document.hidden) load(true); };
        load();
        window.addEventListener('online', recover);
        window.addEventListener('focus', recover);
        document.addEventListener('visibilitychange', recover);
        return () => {
            active = false;
            window.removeEventListener('online', recover);
            window.removeEventListener('focus', recover);
            document.removeEventListener('visibilitychange', recover);
        };
    }, [retries, url, preserveUrl]);
    return state;
};
