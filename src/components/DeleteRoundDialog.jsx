import { useEffect, useRef } from 'react';
import { Trash2, X } from 'lucide-react';

export default function DeleteRoundDialog({ roundNumber, disabled, onCancel, onConfirm, t }) {
    const dialogRef = useRef(null);
    const cancelRef = useRef(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        dialog.showModal();
        document.body.style.overflow = 'hidden';
        cancelRef.current?.focus();
        return () => {
            dialog.close();
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby="delete-round-title"
            aria-describedby="delete-round-description"
            onCancel={(event) => { event.preventDefault(); onCancel(); }}
            onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-0 text-slate-300 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
        >
            <div className="p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                    <h2 id="delete-round-title" className="flex items-center gap-2 text-xl font-bold text-white">
                        <Trash2 size={22} className="shrink-0 text-red-400" /> {t('removeRound')}
                    </h2>
                    <button type="button" onClick={onCancel} aria-label={t('cancel')}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
                        <X size={20} />
                    </button>
                </div>
                <div id="delete-round-description" className="mt-4 space-y-3 text-sm">
                    <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-bold text-red-300">
                        {t('packRound', { round: roundNumber })}
                    </p>
                    <p>{t('removeRoundConfirm')}</p>
                </div>
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                    <button ref={cancelRef} type="button" onClick={onCancel}
                        className="rounded-lg border border-slate-700 px-4 py-2 font-bold text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
                        {t('cancel')}
                    </button>
                    <button type="button" onClick={onConfirm} disabled={disabled}
                        className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 disabled:opacity-50">
                        {t('removeRound')}
                    </button>
                </div>
            </div>
        </dialog>
    );
}
