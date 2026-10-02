import { useEffect, useRef, useState } from 'react';
import { FileAudio, FileVideo, ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import QuestionMedia from './QuestionMedia';
import { getMediaKind, MEDIA_KINDS, validateMediaFile } from '../services/imageStorage';
import { downloadDroppedImage, getDroppedImageUrl } from '../utils/mediaDrop';

const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
};

const getKindLabel = (kind, t) => {
    if (kind === MEDIA_KINDS.AUDIO) return t('audioMedia');
    if (kind === MEDIA_KINDS.VIDEO) return t('videoMedia');
    return t('imageMedia');
};

export default function PackMediaAttachment({
    media,
    label,
    disabled,
    progress,
    error,
    t,
    onChange,
    onResolveFile,
    onRemove,
    accept = 'image/*,audio/*,video/*',
    allowedKinds = [MEDIA_KINDS.IMAGE, MEDIA_KINDS.AUDIO, MEDIA_KINDS.VIDEO],
    hint
}) {
    const inputRef = useRef(null);
    const [localError, setLocalError] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [fetching, setFetching] = useState(false);
    const dragDepth = useRef(0);
    const downloadRef = useRef(null);
    const mountedRef = useRef(true);
    const fetchingRef = useRef(false);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            downloadRef.current?.abort();
        };
    }, []);
    useEffect(() => {
        if (disabled) {
            dragDepth.current = 0;
            setDragActive(false);
        }
    }, [disabled]);
    const kind = getMediaKind(media);
    const EmptyIcon = kind === MEDIA_KINDS.AUDIO ? FileAudio : kind === MEDIA_KINDS.VIDEO ? FileVideo : ImagePlus;

    const pickFile = () => {
        if (!disabled) inputRef.current?.click();
    };

    const validateFile = (file) => {
        const validation = validateMediaFile(file);
        if (!validation.valid || !allowedKinds.includes(validation.kind)) {
            setLocalError(t(validation.valid ? 'mediaInvalidType' : validation.messageKey));
            return false;
        }

        setLocalError('');
        return true;
    };

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!disabled && !fetchingRef.current && file && validateFile(file)) onChange(file);
    };

    const handleDrop = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current = 0;
        setDragActive(false);
        if (disabled || fetchingRef.current) return;
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 1) return setLocalError(t('mediaDropOneFile'));
        if (files.length === 1) {
            if (validateFile(files[0])) onChange(files[0]);
            return;
        }
        let timer;
        try {
            const url = getDroppedImageUrl(event.dataTransfer);
            if (!onResolveFile) throw new Error('mediaDropRemoteFailed');
            const controller = new AbortController();
            downloadRef.current = controller;
            fetchingRef.current = true;
            setFetching(true);
            setLocalError('');
            await onResolveFile(async () => {
                timer = setTimeout(() => controller.abort(), 15000);
                const file = await downloadDroppedImage(url, controller.signal);
                clearTimeout(timer);
                if (!mountedRef.current || controller.signal.aborted) throw new Error('mediaDropRemoteFailed');
                if (!validateFile(file)) throw new Error('mediaDropRemoteFailed');
                return file;
            });
        } catch (err) {
            if (mountedRef.current) setLocalError(t(err.message === 'mediaDropOneFile' ? 'mediaDropOneFile' : 'mediaDropRemoteFailed'));
        } finally {
            clearTimeout(timer);
            downloadRef.current = null;
            fetchingRef.current = false;
            if (mountedRef.current) setFetching(false);
        }
    };

    const message = localError || error;

    return (
        <div
            className={`mt-2 rounded-lg border p-3 transition-colors ${dragActive && !disabled ? 'border-blue-400 bg-blue-500/10' : 'border-slate-800 bg-slate-950/40'}`}
            onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (disabled || fetchingRef.current) return;
                dragDepth.current += 1;
                setDragActive(true);
            }}
            onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = disabled || fetchingRef.current ? 'none' : 'copy';
            }}
            onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (!dragDepth.current) setDragActive(false);
            }}
            onDrop={handleDrop}
        >
            <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} disabled={disabled} />
            {media ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex w-fit flex-col gap-1">
                        <QuestionMedia media={media} alt={label} variant="thumbnail" t={t} />
                        <div className="text-xs font-medium text-slate-500">
                            {[getKindLabel(kind, t), formatBytes(media.size)].filter(Boolean).join(' · ')}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={pickFile}
                            disabled={disabled}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                        >
                            <RefreshCw size={16} /> {t('replaceMedia')}
                        </button>
                        <button
                            type="button"
                            onClick={onRemove}
                            disabled={disabled}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-600 hover:text-white disabled:opacity-50"
                        >
                            <Trash2 size={16} /> {t('removeMedia')}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={pickFile}
                    disabled={disabled}
                    className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-700 px-3 py-2 text-sm font-bold text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50"
                >
                    <EmptyIcon size={16} /> {t('attachMedia')}
                </button>
            )}
            {progress > 0 && progress < 100 && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
            )}
            {message && <div className="mt-2 text-xs font-medium text-red-300">{message}</div>}
            <div className="mt-2 text-xs text-slate-400" role="status">
                {fetching ? t('mediaDropDownloading') : t(media ? 'mediaDropReplace' : 'mediaDropAttach')}
            </div>
            <div className="mt-2 text-xs text-slate-500">{hint || t('mediaUploadHint')}</div>
        </div>
    );
}
