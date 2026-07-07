import { AlertTriangle, Loader2 } from 'lucide-react';
import { useRetryableImage } from '../hooks/useRetryableImage';
import { useLanguage } from '../useLanguage';

export default function RetryableImage({
    src,
    alt,
    imageClassName = '',
    fallbackClassName = '',
    retries = 2
}) {
    const { t } = useLanguage();
    const { status, url } = useRetryableImage(src, { retries });

    if (status === 'loaded') {
        return <img src={url} alt={alt} className={imageClassName} />;
    }

    if (status === 'failed') {
        return (
            <div className={`${fallbackClassName} flex flex-col items-center justify-center gap-2 border border-red-500/50 bg-red-950/40 p-4 text-center text-red-100`}>
                <AlertTriangle size={28} className="text-red-300" />
                <span className="text-sm font-black uppercase tracking-wide">{t('imageLoadFailed')}</span>
            </div>
        );
    }

    return (
        <div className={`${fallbackClassName} flex flex-col items-center justify-center gap-2 bg-slate-950/70 p-4 text-center text-slate-400`}>
            <Loader2 size={28} className="animate-spin" />
            <span className="sr-only">{t('imageLoading')}</span>
        </div>
    );
}
