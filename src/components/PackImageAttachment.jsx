import { useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import QuestionImage from './QuestionImage';
import { validateImageFile } from '../services/imageStorage';

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

export default function PackImageAttachment({ image, label, disabled, progress, error, t, onChange, onRemove }) {
    const inputRef = useRef(null);
    const [localError, setLocalError] = useState('');

    const pickFile = () => {
        if (!disabled) inputRef.current?.click();
    };

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        const validation = validateImageFile(file);
        if (!validation.valid) {
            setLocalError(t(validation.messageKey));
            return;
        }

        setLocalError('');
        onChange(file);
    };

    const message = error || localError;

    return (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={disabled} />
            {image ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex w-fit flex-col gap-1">
                        <QuestionImage image={image} alt={label} variant="thumbnail" />
                        {formatBytes(image.size) && (
                            <div className="text-xs font-medium text-slate-500">
                                {formatBytes(image.size)}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={pickFile}
                            disabled={disabled}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                        >
                            <RefreshCw size={16} /> {t('replaceImage')}
                        </button>
                        <button
                            type="button"
                            onClick={onRemove}
                            disabled={disabled}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-600 hover:text-white disabled:opacity-50"
                        >
                            <Trash2 size={16} /> {t('removeImage')}
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
                    <ImagePlus size={16} /> {t('attachImage')}
                </button>
            )}
            {progress > 0 && progress < 100 && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
            )}
            {message && <div className="mt-2 text-xs font-medium text-red-300">{message}</div>}
            <div className="mt-2 text-xs text-slate-500">{t('imageUploadHint')}</div>
        </div>
    );
}
