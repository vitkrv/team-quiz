import { useEffect, useRef, useState } from 'react';
import { Image, Lock, Music, Play, Video } from 'lucide-react';
import AudioControls from './AudioControls';
import MediaVolumeControl from './MediaVolumeControl';
import MediaLightbox from './MediaLightbox';
import useLocalMediaVolume from '../hooks/useLocalMediaVolume';
import { getMediaKind, getMediaUrl, MEDIA_KINDS } from '../services/imageStorage';

const variantClasses = {
    thumbnail: 'h-28 w-44',
    host: 'max-h-48 w-full max-w-sm',
    player: 'max-h-[42vh] w-full max-w-4xl'
};

const frameClasses = {
    thumbnail: 'overflow-hidden rounded-lg border border-slate-700 bg-slate-950/70',
    host: 'overflow-hidden rounded-lg border border-slate-700 bg-slate-950/70',
    player: 'overflow-visible rounded-none border-0 bg-transparent'
};

const iconByKind = {
    [MEDIA_KINDS.IMAGE]: Image,
    [MEDIA_KINDS.AUDIO]: Music,
    [MEDIA_KINDS.VIDEO]: Video
};

export default function QuestionMedia({
    media,
    alt,
    variant = 'player',
    className = '',
    t,
    locked = false,
    unlocked = true,
    shouldStart = false,
    startAt = 0,
    pauseSignal = 0,
    onBlocked
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const mediaRef = useRef(null);
    const startedKeyRef = useRef('');
    const [volume] = useLocalMediaVolume();

    const kind = getMediaKind(media);
    const url = getMediaUrl(media, variant === 'thumbnail' ? 'thumbnail' : variant === 'host' ? 'host' : 'game');
    const Icon = iconByKind[kind] || Image;

    useEffect(() => {
        const element = mediaRef.current;
        if (!element || !shouldStart || !unlocked || kind === MEDIA_KINDS.IMAGE) return;

        const startedKey = `${media?.fileId || media?.url}:${startAt}`;
        if (startedKeyRef.current === startedKey) return;
        startedKeyRef.current = startedKey;

        const delay = Math.max(0, Number(startAt || Date.now()) - Date.now());
        const timeoutId = window.setTimeout(() => {
            setIsBlocked(false);
            element.play().catch(() => {
                startedKeyRef.current = '';
                setIsBlocked(true);
                onBlocked?.();
            });
        }, delay);

        return () => window.clearTimeout(timeoutId);
    }, [kind, media?.fileId, media?.url, onBlocked, shouldStart, startAt, unlocked]);

    useEffect(() => {
        const element = mediaRef.current;
        if (!element || !pauseSignal || kind === MEDIA_KINDS.IMAGE) return;

        element.pause();
    }, [kind, pauseSignal]);

    useEffect(() => {
        const element = mediaRef.current;
        if (!element || kind !== MEDIA_KINDS.VIDEO) return;

        element.volume = volume;
    }, [kind, volume]);

    if (!media) return null;

    if (kind === MEDIA_KINDS.IMAGE) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className={`${frameClasses[variant]} ${variantClasses[variant]} ${className}`}
                >
                    <img
                        src={url}
                        alt={alt}
                        className="h-full w-full object-contain"
                    />
                </button>
                {isOpen && <MediaLightbox media={media} alt={alt} onClose={() => setIsOpen(false)} />}
            </>
        );
    }

    if (variant === 'thumbnail') {
        if (kind === MEDIA_KINDS.AUDIO) {
            return (
                <div className={`${frameClasses.thumbnail} h-auto min-h-28 w-64 max-w-full flex items-center justify-center p-3`}>
                    <AudioControls src={url} preload="none" compact showVolume={false} t={t} />
                </div>
            );
        }

        if (kind === MEDIA_KINDS.VIDEO) {
            return (
                <div className={`${frameClasses.thumbnail} ${variantClasses.thumbnail}`}>
                    <video src={url} controls preload="none" playsInline className="h-full w-full object-contain" />
                </div>
            );
        }

        return (
            <div className={`${frameClasses.thumbnail} ${variantClasses.thumbnail} flex flex-col items-center justify-center gap-2 text-slate-300`}>
                <Icon size={28} />
                <span className="px-2 text-center text-xs font-bold uppercase tracking-wide">
                    {kind === MEDIA_KINDS.AUDIO ? t('audioMedia') : t('videoMedia')}
                </span>
            </div>
        );
    }

    const controls = !locked && unlocked;
    const videoProps = {
        ref: mediaRef,
        src: url,
        controls,
        preload: 'auto',
        autoPlay: false,
        className: `max-h-[42vh] w-full max-w-4xl rounded-lg bg-black ${className}`
    };

    return (
        <div className="flex w-full flex-col items-center gap-3">
            {kind === MEDIA_KINDS.AUDIO ? (
                <AudioControls
                    ref={mediaRef}
                    src={url}
                    preload="auto"
                    disabled={!controls}
                    className={className}
                    t={t}
                />
            ) : (
                <div className="w-full max-w-4xl">
                    <video {...videoProps} playsInline />
                    <MediaVolumeControl t={t} />
                </div>
            )}
            {locked && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm font-bold text-slate-300">
                    <Lock size={16} /> {t('mediaLockedUntilHost')}
                </div>
            )}
            {!locked && !controls && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-950/60 px-3 py-2 text-sm font-bold text-blue-100">
                    <Play size={16} /> {t('mediaWaitingForHostStart')}
                </div>
            )}
            {isBlocked && controls && (
                <button
                    type="button"
                    onClick={() => mediaRef.current?.play().then(() => setIsBlocked(false)).catch(() => {})}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
                >
                    <Play size={16} /> {t('tapToPlayMedia')}
                </button>
            )}
        </div>
    );
}
