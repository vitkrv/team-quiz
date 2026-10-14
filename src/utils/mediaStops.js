export const MAX_MEDIA_STOPS = 5;

export function parseMediaTime(value) {
    const text = String(value).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text) && !/^\d+:\d{1,2}(?:\.\d{1,2})?$/.test(text)) return NaN;
    const parts = text.split(':').map(Number);
    if (parts.length === 2 && parts[1] >= 60) return NaN;
    return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}

export function formatMediaTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const hundredths = Math.round(Math.max(0, seconds) * 100);
    const minutes = Math.floor(hundredths / 6000);
    const remainder = ((hundredths % 6000) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    return `${minutes}:${Number(remainder) < 10 ? '0' : ''}${remainder}`;
}

export function validMediaStops(stops, duration) {
    return Array.isArray(stops) && stops.length <= MAX_MEDIA_STOPS
        && Number.isFinite(duration) && duration > 0
        && stops.every((time, index) => Number.isFinite(time) && time > 0 && time < duration
            && (index === 0 || time > stops[index - 1]));
}

export function getMediaStops(media) {
    return ['audio', 'video'].includes(media?.kind) && validMediaStops(media.stopPoints, media.durationSeconds)
        ? media.stopPoints : [];
}

export function pruneMediaStops(stops, duration) {
    const result = [];
    if (!Number.isFinite(duration) || duration <= 0) return result;
    for (const time of Array.isArray(stops) ? stops : []) {
        if (Number.isFinite(time) && time > 0 && time < duration && (!result.length || time > result[result.length - 1])) result.push(time);
        if (result.length === MAX_MEDIA_STOPS) break;
    }
    return result;
}

export const mediaIdentity = (media) => media?.fileId || media?.url || '';

// This probes metadata only and releases both the resource and event handlers.
export function readMediaDuration(src, kind, signal) {
    return new Promise((resolve, reject) => {
        const element = document.createElement(kind === 'video' ? 'video' : 'audio');
        let timer;
        const finish = (error, duration) => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            element.onloadedmetadata = null;
            element.onerror = null;
            element.removeAttribute('src');
            element.load();
            if (error) { error.messageKey = 'mediaDurationFailed'; reject(error); } else resolve(duration);
        };
        const abort = () => finish(new Error('mediaDurationFailed'));
        if (signal?.aborted) return abort();
        signal?.addEventListener('abort', abort, { once: true });
        element.preload = 'metadata';
        element.onloadedmetadata = () => {
            const duration = element.duration;
            finish(Number.isFinite(duration) && duration > 0 ? null : new Error('mediaDurationFailed'), duration);
        };
        element.onerror = () => finish(new Error('mediaDurationFailed'));
        timer = setTimeout(() => finish(new Error('mediaDurationFailed')), 15000);
        element.src = src;
    });
}
