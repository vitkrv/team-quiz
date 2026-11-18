import { MAX_HOST_HINT_LENGTH } from '../utils/packRounds';

export default function HostHintField({ value, onChange, disabled, t }) {
    const text = typeof value === 'string' ? value : '';
    return (
        <label className="block min-w-0 text-left">
            <span className="mb-1 block text-xs font-medium text-slate-400">{t('hostHintOptional')}</span>
            <textarea value={text} onChange={(event) => onChange(event.target.value)} disabled={disabled}
                maxLength={MAX_HOST_HINT_LENGTH} rows={2}
                className="min-h-11 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm font-normal text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/50 disabled:opacity-50" />
            <span className="mt-1 block text-xs font-normal text-slate-400">{t('hostHintCount', { count: text.length, max: MAX_HOST_HINT_LENGTH })}</span>
        </label>
    );
}
