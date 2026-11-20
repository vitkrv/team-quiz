import { Check, Minus, Plus, X } from 'lucide-react';
import { textAssessmentShortcut, validSignedTextPoints } from '../utils/textAnswerPolicy';
import { getRoundPointStep } from '../utils/packRounds';

const color = (value) => Number(value) > 0 ? 'text-green-400' : Number(value) < 0 ? 'text-red-400' : 'text-gray-400';
const button = 'flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-40';

export default function BulkTextAnswerReview({ room, question, isHost, controls, t, assessment }) {
    const round = room.textAnswerRound;
    const complete = round.phase === 'complete';
    const showAnswers = isHost || round.showAnswers !== false;
    if (controls && complete) return null;
    if (!isHost && !complete) return <p className="mt-6 text-center text-slate-300" role="status">{t('textAnswerBulkWaiting')}</p>;
    const feedback = isHost && <>
        <p role="status" className="sr-only">{assessment.pending ? t('textAnswerPending') : ''}</p>
        {assessment.error && <p role="alert" className="text-red-300">{t(assessment.error)}</p>}
        {assessment.invalid && <p role="alert" className="text-red-300">{t('textAnswerSignedInvalid')}</p>}
    </>;
    if (controls) return <section aria-label={t('textAnswerHostPanel')} className="flex w-full flex-col gap-3">
        <button type="button" disabled={assessment.pending || assessment.invalid} onPointerDown={(e) => e.preventDefault()} onClick={() => assessment.persist(true)}
            className="min-h-11 rounded-xl bg-blue-600 px-4 py-3 font-bold focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50">{t('textAnswerRevealResults')}</button>
        {feedback}
    </section>;
    const step = getRoundPointStep(room.currentRoundIndex || 0);
    const shortcut = (uid, amount) => { assessment.edit(uid, amount); assessment.persist(); };
    return <section aria-label={t('textAnswerOverview')} className={`mt-6 rounded-xl border border-slate-600 bg-slate-900/80 ${complete ? 'w-fit max-w-full p-3' : 'w-full max-w-4xl p-3 sm:p-5'}`}>
        <table className={`w-full text-left ${complete ? 'table-auto text-base' : 'table-fixed text-sm'}`}>
            <caption className={`${complete ? 'mb-2' : 'mb-3'} text-left text-lg font-bold`}>{t('textAnswerOverview')}</caption>
            <thead className="text-slate-300"><tr className="border-b border-slate-600">
                <th scope="col" className={`${complete ? '' : 'w-1/4'} break-words p-2`}>{t('textAnswerPlayer')}</th>
                {showAnswers && <th scope="col" className="break-words p-2">{t('textAnswerAnswer')}</th>}
                <th scope="col" className={`${complete ? '' : 'w-1/2'} break-words p-2 text-right`}>{t('textAnswerPointsDiff')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700">{round.playerIds.map((uid) => {
                const name = room.players[uid]?.name || t('playerFallback');
                const amount = complete ? round.scoreDeltas[uid] : assessment.value(uid);
                const valid = validSignedTextPoints(amount);
                return <tr key={uid}>
                    <th scope="row" className={`${complete ? 'max-w-48 [overflow-wrap:anywhere] px-2 py-1.5' : 'break-words p-2'} font-semibold`}><span aria-hidden="true">{room.players[uid]?.avatar} </span>{name}</th>
                    {showAnswers && <td className={complete ? 'max-w-xs [overflow-wrap:anywhere] px-2 py-1.5' : 'break-words p-2'}>{round.answers[uid] || <span className="italic opacity-50">{t('textAnswerNothing')}</span>}</td>}
                    <td className={`${complete ? 'whitespace-nowrap px-2 py-1.5' : 'p-2'} text-right`}>{complete
                        ? <span className={`font-bold tabular-nums ${color(amount)}`}>{amount > 0 ? '+' : ''}{amount}</span>
                        : <div className="flex flex-wrap justify-end gap-1" onPointerDown={(e) => { if (e.target.closest('button')) e.preventDefault(); }}>
                            <div className="flex w-full min-w-0 items-center gap-1 xl:w-auto">
                                <button type="button" className={button} disabled={assessment.pending || !valid || !Number.isSafeInteger(Number(amount) - step)}
                                    aria-label={`${t('textAnswerDecrease')}: ${name}`} onClick={() => shortcut(uid, Number(amount) - step)}><Minus size={18} /></button>
                                <input type="number" step={step} value={amount} disabled={assessment.pending} aria-invalid={!valid}
                                    aria-label={`${t('textAnswerPointsDiff')}: ${name}`} onChange={(e) => assessment.edit(uid, e.target.value)} onBlur={() => assessment.persist()}
                                    className={`min-h-11 w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900 p-1 text-center font-bold xl:w-24 ${color(amount)}`} />
                                <button type="button" className={button} disabled={assessment.pending || !valid || !Number.isSafeInteger(Number(amount) + step)}
                                    aria-label={`${t('textAnswerIncrease')}: ${name}`} onClick={() => shortcut(uid, Number(amount) + step)}><Plus size={18} /></button>
                            </div>
                            <button type="button" className={button + ' text-green-400'} disabled={assessment.pending} aria-label={`${t('textAnswerAccept')}: ${name}`}
                                onClick={() => shortcut(uid, textAssessmentShortcut(true, question.points, room.trueCompetitiveMode))}><Check size={20} /></button>
                            <button type="button" className={button + ' text-red-400'} disabled={assessment.pending} aria-label={`${t('textAnswerDeny')}: ${name}`}
                                onClick={() => shortcut(uid, textAssessmentShortcut(false, question.points, room.trueCompetitiveMode))}><X size={20} /></button>
                        </div>}</td>
                </tr>;
            })}</tbody>
        </table>
        {isHost && !complete && <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-200"
            onPointerDown={(e) => e.preventDefault()}>
            <input type="checkbox" checked={assessment.showAnswers} disabled={assessment.pending || assessment.invalid}
                onChange={(e) => assessment.setShowAnswers(e.target.checked)} className="h-5 w-5 shrink-0 accent-blue-400" />
            {t('textAnswerShowAllAnswers')}
        </label>}
        {!complete && feedback}
    </section>;
}
