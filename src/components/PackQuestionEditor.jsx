import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, PartyPopper, Trash2, X } from 'lucide-react';
import PackMediaAttachment from './PackMediaAttachment';
import { MEDIA_SLOTS } from '../services/imageStorage';

const inputClass = 'min-h-11 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/50 disabled:opacity-50';

export default function PackQuestionEditor({
    category, question, questionIndex, t, disabled, compact = false, formLayout = false, dialogLayout = false,
    roundNumber, pointIncrement, surpriseMin, surpriseMax, surpriseDisplay,
    onUpdate, onValidatePoints, onMove, onRemove, onPaste,
    onMediaChange, onMediaResolve, onMediaRemove, mediaProgress, mediaErrors
}) {
    const id = useId();
    const [expanded, setExpanded] = useState(false);
    const q = question;
    const showDetails = !compact || expanded;
    const pointsField = q.isSurpriseQuestion ? 'surpriseDisplayPoints' : 'points';
    const paste = (event, field) => {
        if (compact && (event.clipboardData?.files?.length || Array.from(event.clipboardData?.items || []).some((item) => item.kind === 'file'))) setExpanded(true);
        onPaste(event, field);
    };
    const numberField = (field, label, value, min = 100) => (
        <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
            <input type="number" min={min} step={100} value={value} disabled={disabled}
                data-question-id={q.id} data-question-field={field}
                onChange={(event) => onUpdate(field, event.target.value)}
                onBlur={() => onValidatePoints(field)} className={inputClass + ' font-mono text-yellow-300'} />
        </label>
    );
    const mediaPanel = (field, label) => (
        <PackMediaAttachment media={q[field]} label={label} disabled={disabled} stacked={!formLayout}
            progress={mediaProgress[`${q.id}:${field}`] || 0} error={mediaErrors[`${q.id}:${field}`]} t={t}
            onChange={(file) => onMediaChange(field, file)}
            onResolveFile={(resolveFile) => onMediaResolve(field, resolveFile)}
            onRemove={() => onMediaRemove(field)} />
    );
    return (
        <div className={`min-w-0 rounded-xl border p-4 ${formLayout ? 'grid grid-cols-1 gap-4 sm:grid-cols-[140px,minmax(0,1fr)]' : 'space-y-4'} ${q.isSurpriseQuestion ? 'border-yellow-400/60 bg-yellow-950/20' : 'border-slate-700 bg-slate-900'}`}>
            <div className={`flex flex-wrap items-center gap-2 ${formLayout ? 'col-span-full' : ''}`}>
                <span className="flex-1 text-sm font-bold text-slate-300">{t('editorQuestionNumber', { number: questionIndex + 1 })}</span>
                <button type="button" disabled={disabled || questionIndex === 0} onClick={() => onMove(-1)} aria-label={t('moveQuestionUp')}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-30"><ArrowUp size={18} /></button>
                <button type="button" disabled={disabled || questionIndex === category.questions.length - 1} onClick={() => onMove(1)} aria-label={t('moveQuestionDown')}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-30"><ArrowDown size={18} /></button>
                <button type="button" disabled={disabled || category.questions.length <= 1} onClick={onRemove} aria-label={t('removeQuestion')}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-red-300 hover:bg-red-900/30 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-30">{dialogLayout ? <Trash2 size={20} /> : <X size={20} />}</button>
            </div>
            <div className={formLayout ? 'sm:col-start-1 sm:row-start-2' : dialogLayout ? 'max-w-xs' : ''}>
                {numberField(pointsField, t(q.isSurpriseQuestion ? 'shownAs' : 'points'), q.isSurpriseQuestion ? (q.surpriseDisplayPoints ?? surpriseDisplay) : q.points)}
            </div>
            <div className={`min-w-0 ${dialogLayout ? 'grid items-start gap-5 md:grid-cols-2' : 'space-y-4'} ${formLayout ? 'sm:col-start-2 sm:row-start-2 sm:row-span-2' : ''}`}>
            <div className="min-w-0 space-y-4">
            <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-400">{t('question')}</span>
                <textarea value={q.text} rows={3} disabled={disabled} data-question-id={q.id} data-question-field="text"
                    onChange={(event) => onUpdate('text', event.target.value)} onPaste={(event) => paste(event, MEDIA_SLOTS.QUESTION)}
                    placeholder={t('questionPlaceholder')} className={inputClass + ' resize-y'} />
            </label>
            {!compact && mediaPanel(MEDIA_SLOTS.QUESTION, t('questionMediaAlt'))}
            </div>
            <div className="min-w-0 space-y-4">
            <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-400">{t('answer')}</span>
                <textarea value={q.answer} rows={2} disabled={disabled} data-question-id={q.id} data-question-field="answer"
                    onChange={(event) => onUpdate('answer', event.target.value)} onPaste={(event) => paste(event, MEDIA_SLOTS.ANSWER)}
                    placeholder={t('answerPlaceholder')} className={inputClass + ' resize-y text-green-300'} />
            </label>
            {!compact && mediaPanel(MEDIA_SLOTS.ANSWER, t('answerMediaAlt'))}
            </div>
            </div>
            {compact && <button type="button" disabled={disabled} aria-expanded={expanded} aria-controls={id + '-details'}
                onClick={() => setExpanded(!expanded)} className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm font-bold text-blue-200 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50">
                {t(expanded ? 'editorHideDetails' : 'editorShowDetails')}
            </button>}
            <div id={id + '-details'} hidden={!showDetails} className={`space-y-4 ${formLayout ? 'sm:col-start-1 sm:row-start-3' : ''}`}>
                <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-yellow-300">
                    <input type="checkbox" checked={Boolean(q.isSurpriseQuestion)} disabled={disabled}
                        onChange={(event) => onUpdate('isSurpriseQuestion', event.target.checked)} className="h-5 w-5 accent-yellow-400" />
                    <PartyPopper size={16} /> {t('surpriseQuestion')}
                </label>
                {q.isSurpriseQuestion && <div className={`grid gap-3 ${formLayout ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {numberField('surpriseMinPoints', t('pointsFrom'), q.surpriseMinPoints ?? surpriseMin)}
                    {numberField('surpriseMaxPoints', t('pointsTo'), q.surpriseMaxPoints ?? surpriseMax, surpriseMin)}
                    <p className="col-span-full text-xs text-slate-400">{t('surprisePointIncrementHint', { increment: pointIncrement, round: roundNumber })}</p>
                </div>}
                {compact && <>
                    <div><span className="text-sm font-bold">{t('questionMediaAlt')}</span>{mediaPanel(MEDIA_SLOTS.QUESTION, t('questionMediaAlt'))}</div>
                    <div><span className="text-sm font-bold">{t('answerMediaAlt')}</span>{mediaPanel(MEDIA_SLOTS.ANSWER, t('answerMediaAlt'))}</div>
                </>}
            </div>
        </div>
    );
}
