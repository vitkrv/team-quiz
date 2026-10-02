import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Plus, X } from 'lucide-react';

const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-bold focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40';

export default function QuestionEditDialog({ title, validationMessage, disabled, hasPrevious, hasNext, onPrevious, onNext, onAddQuestion, onClose, children, t }) {
    const dialogRef = useRef(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        const background = Array.from(document.body.children)
            .filter((element) => !element.contains(dialog))
            .map((element) => ({ element, inert: element.inert }));
        background.forEach(({ element }) => { element.inert = true; });
        document.body.style.overflow = 'hidden';
        dialog.querySelector('[data-question-field="text"]')?.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            background.forEach(({ element, inert }) => { element.inert = inert; });
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);

    const handleKeyDown = (event) => {
        // Media previews and clipboard confirmations use their own portals.
        if (!dialogRef.current.contains(event.target)) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (!disabled) onClose();
        }
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialogRef.current.querySelectorAll('button, input, textarea, select, a[href], [tabindex]'))
            .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
            event.preventDefault();
            dialogRef.current.focus();
            return;
        }
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4"
            onClick={(event) => { if (!disabled && event.target === event.currentTarget) onClose(); }}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="question-edit-title" aria-describedby="question-edit-description"
                data-question-editor-dialog tabIndex={-1} onKeyDown={handleKeyDown}
                className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden border border-slate-700 bg-slate-900 text-slate-200 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-5xl sm:rounded-2xl">
                <div className="flex shrink-0 items-start gap-3 border-b border-slate-700 p-4 sm:px-6">
                    <div className="min-w-0 flex-1">
                        <h2 id="question-edit-title" className="break-words text-xl font-bold">{title}</h2>
                        <p id="question-edit-description" className="mt-2 text-sm text-slate-400">{t('editorDraftHelp')}</p>
                        {validationMessage && <p role="status" className="mt-2 text-sm text-orange-200">{validationMessage}</p>}
                    </div>
                    <button type="button" disabled={disabled} onClick={onClose} aria-label={t('editorCloseQuestion')}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40"><X size={22} /></button>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-700 p-4 sm:px-6">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={disabled || !hasPrevious} onClick={onPrevious} className={buttonClass}><ArrowLeft size={18} />{t('editorPreviousQuestion')}</button>
                        <button type="button" disabled={disabled || !hasNext} onClick={onNext} className={buttonClass}>{t('editorNextQuestion')}<ArrowRight size={18} /></button>
                    </div>
                    {!hasNext && <button type="button" disabled={disabled} onClick={onAddQuestion} className={buttonClass + ' text-blue-200'}><Plus size={18} />{t('editorAddNewQuestion')}</button>}
                    <button type="button" disabled={disabled} onClick={onClose} className={buttonClass + ' border-blue-500 bg-blue-600 text-white hover:bg-blue-500'}>{t('editorBackToBoard')}</button>
                </div>
            </div>
        </div>, document.body
    );
}
