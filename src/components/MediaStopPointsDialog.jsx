import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { formatMediaTime, MAX_MEDIA_STOPS, parseMediaTime, readMediaDuration, validMediaStops } from '../utils/mediaStops';
import { getMediaUrl } from '../services/imageStorage';

export default function MediaStopPointsDialog({ media, onCancel, onApply, t }) {
    const id = useId();
    const dialogRef = useRef(null);
    const cancelRef = useRef(null);
    const [values, setValues] = useState(() => (media.stopPoints || []).map(formatMediaTime));
    const [duration, setDuration] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(false);
        readMediaDuration(getMediaUrl(media), media.kind, controller.signal).then((value) => {
            if (!controller.signal.aborted) setDuration(value);
        }).catch(() => { if (!controller.signal.aborted) setError(true); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [media, retry]);
    useEffect(() => {
        const previousFocus = document.activeElement;
        const overflow = document.body.style.overflow;
        const background = Array.from(document.body.children).filter((element) => !element.contains(dialogRef.current))
            .map((element) => ({ element, inert: element.inert }));
        background.forEach(({ element }) => { element.inert = true; });
        document.body.style.overflow = 'hidden';
        cancelRef.current?.focus();
        return () => {
            document.body.style.overflow = overflow;
            background.forEach(({ element, inert }) => { element.inert = inert; });
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);
    const times = values.map(parseMediaTime);
    const valid = !loading && !error && validMediaStops(times, duration);
    const keyDown = (event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
        if (event.key !== 'Tab') return;
        const elements = Array.from(dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled)'));
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onKeyDown={keyDown}>
            <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={id} aria-describedby={`${id}-help`}
                className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-200 shadow-2xl">
                <h2 id={id} className="text-xl font-bold">{t('mediaStopPoints')}</h2>
                <p id={`${id}-help`} className="my-3 text-sm text-slate-400">{t('mediaStopHelp')}</p>
                <p className="mb-3 font-mono">{loading ? t('mediaDurationLoading') : t('mediaDuration', { time: formatMediaTime(duration) })}</p>
                {error && <div role="alert" className="mb-3 text-red-300">{t('mediaDurationFailed')} <button type="button" onClick={() => setRetry(retry + 1)} className="underline">{t('mediaRetry')}</button></div>}
                <div className="space-y-2">
                    {values.map((value, index) => <div key={index} className="flex items-center gap-2">
                        <label className="flex flex-1 items-center gap-2">{index + 1}.
                            <input aria-label={t('mediaStopNumber', { number: index + 1 })} value={value} disabled={loading || error}
                                placeholder={t('mediaStopPlaceholder')}
                                onChange={(event) => setValues(values.map((item, i) => i === index ? event.target.value : item))}
                                className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 font-mono" />
                        </label>
                        <button type="button" aria-label={t('mediaRemoveStop', { number: index + 1 })} onClick={() => setValues(values.filter((_, i) => i !== index))}
                            className="min-h-11 rounded-lg p-3 text-red-300"><Trash2 size={18} /></button>
                    </div>)}
                </div>
                <button type="button" disabled={loading || error || values.length >= MAX_MEDIA_STOPS} onClick={() => setValues([...values, ''])}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-3 disabled:opacity-50"><Plus size={18} />{t('mediaAddStop')}</button>
                {!loading && !error && !valid && <p role="alert" className="mt-3 text-sm text-red-300">{t('mediaStopsInvalid')}</p>}
                <div className="mt-5 flex justify-end gap-3">
                    <button ref={cancelRef} type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-slate-700 px-4">{t('cancel')}</button>
                    <button type="button" disabled={!valid} onClick={() => onApply({ ...media, durationSeconds: duration, stopPoints: times })}
                        className="min-h-11 rounded-lg bg-blue-600 px-4 font-bold disabled:opacity-50">{t('mediaApplyStops')}</button>
                </div>
            </section>
        </div>, document.body);
}
