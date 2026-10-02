import { IMAGE_SIZE_LIMIT_BYTES } from '../services/imageStorage';

export const getDroppedImageUrl = (dataTransfer) => {
    const html = dataTransfer.getData('text/html');
    const images = html ? new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img[src]') : [];
    if (images.length > 1) throw new Error('mediaDropOneFile');
    const urls = dataTransfer.getData('text/uri-list').split(/\r?\n/)
        .map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
    if (!images.length && urls.length > 1) throw new Error('mediaDropOneFile');
    const url = new URL(images[0]?.getAttribute('src') || urls[0] || '');
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('mediaDropRemoteFailed');
    return url.href;
};

export const downloadDroppedImage = async (url, signal) => {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal });
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!response.ok || !type.startsWith('image/')) throw new Error('mediaDropRemoteFailed');
    if (Number(response.headers.get('content-length')) > IMAGE_SIZE_LIMIT_BYTES) throw new Error('mediaDropRemoteFailed');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > IMAGE_SIZE_LIMIT_BYTES) throw new Error('mediaDropRemoteFailed');
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }
    if (!size) throw new Error('mediaDropRemoteFailed');
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' };
    return new File(chunks, `dropped-image.${extensions[type] || 'img'}`, { type });
};
