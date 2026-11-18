import { useEffect, useId, useRef } from 'react';
import { HelpCircle, X } from 'lucide-react';

export default function TextAnswerHelpDialog({ t, onClose }) {
    const titleId = useId();
    const dialogRef = useRef(null);
    const closeRef = useRef(null);
    useEffect(() => {
        const dialog = dialogRef.current;
        const focus = document.activeElement;
        const overflow = document.body.style.overflow;
        dialog.showModal(); document.body.style.overflow = 'hidden'; closeRef.current.focus();
        return () => { dialog.close(); document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus(); };
    }, []);
    return <dialog ref={dialogRef} aria-labelledby={titleId}
        onCancel={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-0 text-slate-300 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm">
        <header className="flex items-center justify-between gap-3 border-b border-slate-700 p-5">
            <h2 id={titleId} className="flex items-center gap-2 text-xl font-bold text-white"><HelpCircle size={22} />{t('textAnswerHelpTitle')}</h2>
            <button ref={closeRef} type="button" onClick={onClose} aria-label={t('surpriseHelpClose')} className="rounded-lg p-2 focus-visible:ring-2 focus-visible:ring-blue-400"><X size={20} /></button>
        </header>
        <div className="space-y-4 p-5 text-sm leading-relaxed">
            {['textAnswerHelpInput', 'textAnswerHelpClose', 'textAnswerHelpReview', 'textAnswerHelpScoring', 'textAnswerHelpSurprise'].map((key) => <p key={key}>{t(key)}</p>)}
        </div>
    </dialog>;
}
