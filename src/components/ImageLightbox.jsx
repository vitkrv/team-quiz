import { X } from 'lucide-react';
import { getImageUrl } from '../services/imageStorage';
import { useLanguage } from '../useLanguage';

export default function ImageLightbox({ image, alt, onClose }) {
    const { t } = useLanguage();
    if (!image) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
            <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full bg-slate-900/90 p-3 text-white shadow-lg hover:bg-slate-800"
                aria-label={t('closeImage')}
            >
                <X size={24} />
            </button>
            <button
                type="button"
                className="absolute inset-0 -z-10 cursor-default"
                aria-label={t('closeImageBackdrop')}
                onClick={onClose}
            />
            <img
                src={getImageUrl(image, 'full')}
                alt={alt}
                className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
            />
        </div>
    );
}
