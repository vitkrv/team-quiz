import { useEffect, useId, useRef } from 'react';
import { HelpCircle, X } from 'lucide-react';

export default function SurpriseQuestionHelpDialog({ t, onClose }) {
    const titleId = useId();
    const dialogRef = useRef(null);
    const closeRef = useRef(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        dialog.showModal();
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => {
            dialog.close();
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);

    return (
        <dialog ref={dialogRef} aria-labelledby={titleId}
            onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-0 text-slate-300 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 p-5 sm:p-6">
                <h2 id={titleId} className="flex items-center gap-2 text-xl font-bold text-white">
                    <HelpCircle size={22} className="shrink-0 text-blue-400" />{t('surpriseHelpTitle')}
                </h2>
                <button ref={closeRef} type="button" onClick={onClose} aria-label={t('surpriseHelpClose')}
                    className="shrink-0 rounded-lg p-2 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"><X size={20} /></button>
            </div>
            <div className="space-y-4 p-5 text-sm leading-relaxed sm:p-6">
                <p>{t('surpriseHelpFirst')}</p>
                <p className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-blue-100">{t('surpriseHelpExample')}</p>
                <ul className="list-disc space-y-3 pl-5">
                    {['surpriseHelpAssignment', 'surpriseHelpSettings', 'surpriseHelpRounds', 'surpriseHelpJudging', 'surpriseHelpPool', 'surpriseHelpMechanics', 'surpriseHelpContinue', 'surpriseHelpSkip'].map((key) => <li key={key}>{t(key)}</li>)}
                </ul>
            </div>
        </dialog>
    );
}
