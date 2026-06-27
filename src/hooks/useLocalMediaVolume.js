import { useCallback, useEffect, useState } from 'react';

export const DEFAULT_MEDIA_VOLUME = 0.75;
export const MEDIA_VOLUME_STORAGE_KEY = 'cortexRush.mediaVolume';
export const MEDIA_VOLUME_CHANGE_EVENT = 'cortexRush:mediaVolumeChanged';

export const clampMediaVolume = (value) => {
    const volume = Number(value);
    if (!Number.isFinite(volume)) return DEFAULT_MEDIA_VOLUME;
    return Math.min(1, Math.max(0, volume));
};

const getLocalStorage = () => {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

export const getStoredMediaVolume = () => {
    if (typeof window === 'undefined') return DEFAULT_MEDIA_VOLUME;

    const storage = getLocalStorage();
    if (!storage) return DEFAULT_MEDIA_VOLUME;

    const storedValue = storage.getItem(MEDIA_VOLUME_STORAGE_KEY);
    if (storedValue === null) return DEFAULT_MEDIA_VOLUME;

    return clampMediaVolume(storedValue);
};

export const saveMediaVolume = (nextVolume) => {
    const volume = clampMediaVolume(nextVolume);

    if (typeof window === 'undefined') return volume;

    const storage = getLocalStorage();
    if (storage) {
        try {
            storage.setItem(MEDIA_VOLUME_STORAGE_KEY, String(volume));
        } catch {
            // Local storage can be unavailable in private modes; keep the in-memory value.
        }
    }

    window.dispatchEvent(new CustomEvent(MEDIA_VOLUME_CHANGE_EVENT, { detail: { volume } }));
    return volume;
};

export default function useLocalMediaVolume() {
    const [volume, setVolumeState] = useState(getStoredMediaVolume);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const syncVolume = (event) => {
            if (event?.type === MEDIA_VOLUME_CHANGE_EVENT && typeof event.detail?.volume === 'number') {
                setVolumeState(clampMediaVolume(event.detail.volume));
                return;
            }

            setVolumeState(getStoredMediaVolume());
        };

        window.addEventListener(MEDIA_VOLUME_CHANGE_EVENT, syncVolume);
        window.addEventListener('storage', syncVolume);

        return () => {
            window.removeEventListener(MEDIA_VOLUME_CHANGE_EVENT, syncVolume);
            window.removeEventListener('storage', syncVolume);
        };
    }, []);

    const setVolume = useCallback((nextVolume) => {
        const savedVolume = saveMediaVolume(nextVolume);
        setVolumeState(savedVolume);
    }, []);

    return [volume, setVolume];
}
