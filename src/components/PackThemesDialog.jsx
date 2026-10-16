import { useEffect, useRef } from 'react';
import { Eye, X } from 'lucide-react';
import PackTitle from './PackTitle';

export default function PackThemesDialog({ preview, onClose, t }) {
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
        <dialog
            ref={dialogRef}
            aria-labelledby="pack-themes-title"
            onCancel={(event) => { event.preventDefault(); onClose(); }}
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-2 text-slate-300 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
        >
            <div className="flex max-h-[calc(100dvh-3.125rem)] flex-col">
                <div className="flex shrink-0 items-center justify-between gap-3 p-3 sm:p-4">
                    <h2 id="pack-themes-title" className="flex items-center gap-2 text-xl font-bold text-white">
                        <Eye size={22} className="shrink-0 text-purple-400" /> {t('previewPackThemes')}
                    </h2>
                    <button ref={closeRef} type="button" onClick={onClose} aria-label={t('closeQuestionPackPreview')}
                        className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-400">
                        <X size={20} />
                    </button>
                </div>
                <div className="pack-themes-scroll min-h-0 overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4">
                    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                        <h3 className="text-lg font-bold text-white">
                            <PackTitle pack={preview} className="[&>span:last-child]:whitespace-normal [&>span:last-child]:break-words" />
                        </h3>
                        <p className="mt-1 break-words text-sm text-slate-400">{t('byAuthor', { author: preview.ownerEmail || t('unknownAuthor') })}</p>
                        <p className="mt-2 text-sm text-slate-300">
                            {t('packStats', { rounds: preview.rounds.length, categories: preview.categoryCount, questions: preview.questionCount })}
                        </p>
                    </div>
                    <div className="mt-5 space-y-4">
                        {preview.rounds.map((round, roundIndex) => (
                            <section key={roundIndex} aria-labelledby={`pack-themes-round-${roundIndex}`} className="rounded-xl border border-slate-700 p-4">
                                <h3 id={`pack-themes-round-${roundIndex}`} className="font-bold text-purple-300">{t('packRound', { round: roundIndex + 1 })}</h3>
                                {round.themes.length > 0 ? (
                                    <ul className="mt-3 list-disc space-y-2 pl-5">
                                        {round.themes.map((theme, themeIndex) => (
                                            <li key={themeIndex} className="break-words pl-1">{theme || t('unnamedPackTheme')}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-3 text-sm text-slate-400">{t('noPackThemes')}</p>
                                )}
                            </section>
                        ))}
                    </div>
                </div>
            </div>
        </dialog>
    );
}
