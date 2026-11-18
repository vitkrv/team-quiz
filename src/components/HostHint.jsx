export default function HostHint({ value, t, variant = 'question' }) {
    if (typeof value !== 'string' || !value.trim()) return null;
    if (variant === 'category') {
        return (
            <aside className="mx-auto mt-6 w-full max-w-2xl text-center font-normal italic text-inherit [text-shadow:none]">
                <p className="mb-2 text-sm leading-relaxed md:text-base">{t('hostHint')}</p>
                <p className="whitespace-pre-wrap break-words text-lg leading-relaxed md:text-2xl">{value}</p>
            </aside>
        );
    }
    return (
        <aside className="mx-auto mt-4 w-full max-w-2xl rounded-xl border border-slate-700 theme-border bg-slate-800 theme-surface p-4 text-left [text-shadow:none] md:p-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400 theme-muted">{t('hostHint')}</p>
            <p className="whitespace-pre-wrap break-words text-base font-normal text-slate-200 theme-text">{value}</p>
        </aside>
    );
}
