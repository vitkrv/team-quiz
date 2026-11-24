const kindsByExtension = {
    image: ['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'],
    audio: ['aac', 'flac', 'm4a', 'mp3', 'oga', 'opus', 'wav', 'weba'],
    video: ['m4v', 'mov', 'mp4', 'ogv', 'webm']
};

export function parseMediaLink(input, selectedKind = '') {
    if (typeof input !== 'string') return null;
    const url = input.trim();
    if (!/^https:\/\/[^/\\\s]/i.test(url) || /[\\\s]/.test(url)) return null;
    try {
        const parsed = new URL(url);
        if (parsed.username || parsed.password) return null;
        const extension = parsed.pathname.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
        const detected = Object.keys(kindsByExtension).find((kind) => kindsByExtension[kind].includes(extension));
        const kind = detected || (Object.hasOwn(kindsByExtension, selectedKind) ? selectedKind : '');
        return { provider: 'external', kind, url };
    } catch {
        return null;
    }
}

export const isManagedMedia = (media) => Boolean(media?.fileId && media.provider !== 'external');
