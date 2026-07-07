import { X } from 'lucide-react';
import { useLanguage } from '../useLanguage';
import { getMediaUrl } from '../services/imageStorage';
import RetryableImage from './RetryableImage';

export default function MediaLightbox({ media, alt, onClose }) {
    const { t } = useLanguage();
    if (!media) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
            <button
                type="button"
                className="absolute inset-0 cursor-zoom-out"
                aria-label={t('closeMediaBackdrop')}
                onClick={onClose}
            />
            <div className="relative z-10 max-h-full max-w-full">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute -right-3 -top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg ring-1 ring-white/20 hover:bg-slate-800"
                    aria-label={t('closeMedia')}
                >
                    <X size={22} strokeWidth={3} />
                </button>
                <RetryableImage
                    src={getMediaUrl(media, 'full')}
                    alt={alt}
                    imageClassName="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
                    fallbackClassName="h-[60vh] max-h-[90vh] w-[92vw] max-w-5xl rounded-xl shadow-2xl"
                />
            </div>
        </div>
    );
}
