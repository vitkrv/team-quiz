import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, X } from 'lucide-react';

export default function MediaPasteDialog({ file, targetLabel, replacing, disabled, onCancel, onConfirm, t }) {
    const dialogRef = useRef(null);
    const cancelRef = useRef(null);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        const backgroundElements = Array.from(document.body.children)
            .filter((element) => !element.contains(dialogRef.current))
            .map((element) => ({ element, inert: element.inert }));
        backgroundElements.forEach(({ element }) => { element.inert = true; });
        document.body.style.overflow = 'hidden';
        cancelRef.current?.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            backgroundElements.forEach(({ element, inert }) => { element.inert = inert; });
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);

    const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
        }
        if (event.key !== 'Tab') return;
        const buttons = Array.from(dialogRef.current.querySelectorAll('button:not(:disabled)'));
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}
            onKeyDown={handleKeyDown}>
            <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="media-paste-title"
                aria-describedby="media-paste-description" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6">
                <div className="flex items-center justify-between gap-3">
                    <h2 id="media-paste-title" className="flex items-center gap-2 text-xl font-bold text-white">
                        <Paperclip size={22} className="shrink-0 text-blue-400" /> {t('mediaPasteTitle')}
                    </h2>
                    <button type="button" onClick={onCancel} aria-label={t('cancel')}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"><X size={20} /></button>
                </div>
                <div id="media-paste-description" className="mt-4 space-y-3 text-sm text-slate-300">
                    <p>{t('mediaPasteDescription')}</p>
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
                        <span className="block text-xs text-slate-400">{t('mediaPasteDestination')}</span>
                        <strong className="mt-1 block text-base text-blue-300">{targetLabel}</strong>
                    </div>
                    <p className="break-all text-xs text-slate-400">{file.name}</p>
                    {replacing && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">{t('mediaPasteReplaceWarning')}</p>}
                </div>
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                    <button ref={cancelRef} type="button" onClick={onCancel}
                        className="rounded-lg border border-slate-700 px-4 py-2 font-bold text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">{t('cancel')}</button>
                    <button type="button" onClick={onConfirm} disabled={disabled}
                        className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50">{t('attachMedia')}</button>
                </div>
            </section>
        </div>, document.body
    );
}
