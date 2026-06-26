import { appId, auth } from '../firebase';

export const IMAGE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;
export const MEDIA_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;
const IMAGE_COMPRESSION_SKIP_BYTES = 200 * 1024;
const IMAGE_COMPRESSION_MIN_SAVINGS_RATIO = 0.9;
export const MEDIA_SLOTS = {
    QUESTION: 'questionMedia',
    ANSWER: 'answerMedia',
    PRIZE_HIDDEN: 'prizeHiddenMedia',
    PRIZE_REVEALED: 'prizeRevealedMedia'
};

export const PACK_PRIZE_MEDIA_ID = 'packPrize';
export const MEDIA_KINDS = {
    IMAGE: 'image',
    AUDIO: 'audio',
    VIDEO: 'video'
};

const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const IMAGEKIT_AUTH_CACHE_PREFIX = 'team-quiz:imagekit-auth:';
const AUTH_EXPIRY_SAFETY_SECONDS = 15;
const normalizeEndpoint = (endpoint) => {
    const value = endpoint?.trim();
    if (!value) return '';
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};
const imageKitAuthEndpoint = normalizeEndpoint(import.meta.env.VITE_IMAGEKIT_AUTH_ENDPOINT);

const appendTransformation = (url, transformation) => {
    if (!url || !transformation) return url || '';
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}tr=${encodeURIComponent(transformation)}`;
};

const cleanFileName = (name) => (
    (name || 'media')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 90)
);

const getFileExtension = (name) => {
    const match = cleanFileName(name).match(/\.([a-zA-Z0-9]+)$/);
    return match ? `.${match[1]}` : '';
};

const createUploadFileName = (file, packId, timestamp) => (
    cleanFileName(`${packId}-${timestamp}${getFileExtension(file.name)}`)
);

const createStorageError = (messageKey, fallbackMessage) => {
    const error = new Error(fallbackMessage || messageKey);
    error.messageKey = messageKey;
    return error;
};

export const getMediaKind = (fileOrMedia) => {
    const mimeType = fileOrMedia?.type || fileOrMedia?.mimeType || '';
    if (mimeType.startsWith('image/')) return MEDIA_KINDS.IMAGE;
    if (mimeType.startsWith('audio/')) return MEDIA_KINDS.AUDIO;
    if (mimeType.startsWith('video/')) return MEDIA_KINDS.VIDEO;
    return fileOrMedia?.kind || '';
};

const shouldCompressImage = (file) => (
    file.size > IMAGE_COMPRESSION_SKIP_BYTES
    && file.type !== 'image/svg+xml'
    && file.type !== 'image/gif'
);

const compressImage = async (file) => {
    if (!shouldCompressImage(file)) return file;

    try {
        const { default: imageCompression } = await import('browser-image-compression');
        const compressedFile = await imageCompression(file, {
            maxSizeMB: 4,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            fileType: 'image/webp',
            initialQuality: 0.86,
            alwaysKeepResolution: false
        });

        if (compressedFile.size >= file.size * IMAGE_COMPRESSION_MIN_SAVINGS_RATIO) {
            return file;
        }

        const compressedName = `${cleanFileName(file.name).replace(/\.[^.]+$/, '') || 'image'}.webp`;
        return new File([compressedFile], compressedName, {
            type: compressedFile.type || 'image/webp',
            lastModified: file.lastModified
        });
    } catch (err) {
        console.error("Image compression error:", err);
        return file;
    }
};

const getAuthCacheKey = ({ uid, packId, questionId, slot }) => (
    `${IMAGEKIT_AUTH_CACHE_PREFIX}${uid}:${packId}:${questionId}:${slot}`
);

const isUploadAuthUsable = (data) => (
    data?.token
    && data?.signature
    && data?.publicKey
    && data?.folder
    && Number(data.expire) > Math.floor(Date.now() / 1000) + AUTH_EXPIRY_SAFETY_SECONDS
);

const readUploadAuthFromSession = (key) => {
    try {
        const data = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (isUploadAuthUsable(data)) return data;
        sessionStorage.removeItem(key);
    } catch (err) {
        console.error("ImageKit auth cache read error:", err);
        sessionStorage.removeItem(key);
    }

    return null;
};

const writeUploadAuthToSession = (key, data) => {
    if (!isUploadAuthUsable(data)) return;
    sessionStorage.setItem(key, JSON.stringify(data));
};

const consumeUploadAuthFromSession = (key) => {
    const data = readUploadAuthFromSession(key);
    if (data) sessionStorage.removeItem(key);
    return data;
};

export const clearImageKitAuthSession = () => {
    Object.keys(sessionStorage)
        .filter((key) => key.startsWith(IMAGEKIT_AUTH_CACHE_PREFIX))
        .forEach((key) => sessionStorage.removeItem(key));
};

const getUploadAuth = async ({ packId, questionId, slot }) => {
    const uid = auth.currentUser.uid;
    const cacheKey = getAuthCacheKey({ uid, packId, questionId, slot });
    const cachedAuth = consumeUploadAuthFromSession(cacheKey);
    if (cachedAuth) return cachedAuth;

    const idToken = await auth.currentUser.getIdToken();
    const authResponse = await fetch(imageKitAuthEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
            action: 'uploadAuth',
            appId,
            packId,
            questionId,
            slot
        })
    });

    const data = await authResponse.json();
    if (!authResponse.ok) {
        throw createStorageError('mediaKitUploadAuthFailed', data.message || 'ImageKit upload authorization failed.');
    }

    writeUploadAuthToSession(cacheKey, data);
    return consumeUploadAuthFromSession(cacheKey);
};

export const validateMediaFile = (file) => {
    if (!file) {
        return { valid: false, messageKey: 'mediaRequired' };
    }

    const kind = getMediaKind(file);
    if (![MEDIA_KINDS.IMAGE, MEDIA_KINDS.AUDIO, MEDIA_KINDS.VIDEO].includes(kind)) {
        return { valid: false, messageKey: 'mediaInvalidType' };
    }

    if (kind === MEDIA_KINDS.IMAGE && file.size > IMAGE_SIZE_LIMIT_BYTES) {
        return { valid: false, messageKey: 'imageTooLarge' };
    }

    if ((kind === MEDIA_KINDS.AUDIO || kind === MEDIA_KINDS.VIDEO) && file.size > MEDIA_SIZE_LIMIT_BYTES) {
        return { valid: false, messageKey: 'mediaTooLarge' };
    }

    return { valid: true, kind };
};

export const getMediaUrl = (media, variant = 'full') => {
    if (!media) return '';
    if (media.previewUrl) return media.previewUrl;

    const url = media.url || media.thumbnailUrl;
    if (!url) return '';

    if (media.kind && media.kind !== MEDIA_KINDS.IMAGE) return url;

    switch (variant) {
        case 'thumbnail':
            return appendTransformation(url, 'w-220,h-140,c-at_max,q-80');
        case 'host':
            return appendTransformation(url, 'w-360,h-240,c-at_max,q-85');
        case 'game':
            return appendTransformation(url, 'w-1200,h-720,c-at_max,q-90');
        default:
            return url;
    }
};

export const uploadMedia = async (file, { packId, questionId, slot, onProgress }) => {
    const validation = validateMediaFile(file);
    if (!validation.valid) {
        const error = new Error(validation.messageKey);
        error.messageKey = validation.messageKey;
        throw error;
    }

    if (!imageKitAuthEndpoint) throw createStorageError('imageKitAuthEndpointMissing', 'ImageKit auth endpoint is not configured.');
    if (!auth?.currentUser) throw createStorageError('imageKitSignInRequired', 'Sign in is required.');

    const kind = validation.kind;
    const uploadFile = kind === MEDIA_KINDS.IMAGE ? await compressImage(file) : file;
    const uploadTimestamp = Date.now();
    const data = await getUploadAuth({ packId, questionId, slot });

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('fileName', createUploadFileName(uploadFile, packId, uploadTimestamp));
    formData.append('publicKey', data.publicKey);
    formData.append('signature', data.signature);
    formData.append('expire', String(data.expire));
    formData.append('token', data.token);
    formData.append('folder', data.folder);
    formData.append('useUniqueFileName', 'false');
    formData.append('tags', ['team-quiz', appId, packId, questionId, slot, kind].join(','));

    const response = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', IMAGEKIT_UPLOAD_URL);
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
                onProgress(Math.round((event.loaded / event.total) * 100));
            }
        };
        xhr.onload = () => {
            const body = xhr.responseText ? JSON.parse(xhr.responseText) : {};
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(body);
            } else {
                reject(createStorageError('mediaUploadFailed', body.message || 'Media upload failed.'));
            }
        };
        xhr.onerror = () => reject(createStorageError('mediaUploadFailed', 'Media upload failed.'));
        xhr.send(formData);
    });

    return {
        provider: 'imagekit',
        kind,
        packId,
        questionId,
        slot,
        fileId: response.fileId,
        name: response.name,
        filePath: response.filePath,
        url: response.url,
        thumbnailUrl: response.thumbnailUrl || null,
        size: response.size || uploadFile.size,
        width: response.width || null,
        height: response.height || null,
        mimeType: uploadFile.type || file.type || null,
        originalName: file.name,
        originalSize: file.size,
        compressed: kind === MEDIA_KINDS.IMAGE && uploadFile !== file,
        uploadedAt: uploadTimestamp
    };
};

export const deleteMedia = async (media) => {
    if (!media?.fileId || !imageKitAuthEndpoint || !auth?.currentUser) return;
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch(imageKitAuthEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
            action: 'delete',
            appId,
            media
        })
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw createStorageError('mediaKitDeleteFailed', data.message || 'ImageKit delete failed.');
    }
};
