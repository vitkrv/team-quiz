import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Check, Minus, Plus, X } from 'lucide-react';
import { closeTextAnswering, reorderTextAnswer, judgeTextAnswer, revealTextAnswer, submitTextAnswer } from '../actions/textAnswerActions';
import { normalizeTextAnswer, validTextPoints } from '../utils/textAnswerPolicy';
import { getRoundPointStep } from '../utils/packRounds';
import HoldToConfirmButton from './HoldToConfirmButton';
import BulkTextAnswerReview from './BulkTextAnswerReview';

export default function TextAnswerQuestion(props) {
    return props.room.textAnswerRound.assessAllAtOnce && props.room.textAnswerRound.phase !== 'answering'
        ? <BulkTextAnswerReview {...props} /> : <SequentialTextAnswerQuestion {...props} />;
}

function SequentialTextAnswerQuestion({ room, roomRef, user, question, isHost, isSpectator, t, controls = false, sharedBusy, sharedPending = false, onPendingChange }) {
    const round = room.textAnswerRound;
    const saved = round.answers[user.uid] || '';
    const [draft, setDraft] = useState(saved);
    const [points, setPoints] = useState(String(question.points));
    const [localPending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(null);
    const dirty = useRef(false);
    const busy = useRef(false);
    useEffect(() => { if (!dirty.current) setDraft(saved); setSent(null); }, [saved]);
    useEffect(() => { setPoints(String(question.points)); setError(''); }, [round.reviewIndex, question.points]);
    const pending = localPending || sharedPending;
    const actionBusy = sharedBusy || busy;
    const run = async (action) => {
        if (actionBusy.current) return;
        actionBusy.current = true; setPending(true); onPendingChange?.(true); setError('');
        try {
            const result = await action();
            if (result === 'stale') setError(isHost ? 'textAnswerOrderStale' : 'textAnswerClosed');
        } catch { setError('textAnswerFailed'); }
        finally { actionBusy.current = false; setPending(false); onPendingChange?.(false); }
    };
    const currentId = round.playerIds[round.reviewIndex];
    const playerName = room.players[currentId]?.name || t('playerFallback');
    const step = getRoundPointStep(room.currentRoundIndex || 0);
    const submittedPlayerIds = round.playerIds.filter((uid) => round.answers[uid]);
    const allPlayersAnswered = round.playerIds.length > 0 && submittedPlayerIds.length === round.playerIds.length;
    const endAnswering = () => run(() => closeTextAnswering(roomRef, round.id, user.uid));
    const judge = (decision) => run(() => judgeTextAnswer(roomRef, round.id,
        { id: user.uid, name: room.players[user.uid]?.name || t('hostLabel') }, round.reviewIndex, decision, points, t, currentId));
    const buttonClass = 'min-h-11 rounded-xl px-4 py-3 font-bold focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50';
    // Host saving feedback must not insert a row above the table or resize the controls.
    // Disabled controls provide visual feedback; the live region still announces progress.
    const feedback = <>{isHost
        ? <p role="status" className="sr-only">{pending ? t('textAnswerPending') : ''}</p>
        : pending && <p role="status">{t('textAnswerPending')}</p>}
        {error && <p role="alert" className="text-red-300">{t(error)}</p>}</>;
    if (round.phase === 'complete' && controls) return null;
    const assessedPlayerIds = round.playerIds.slice(0, round.reviewIndex);
    const pointsTags = !isHost && assessedPlayerIds.length > 0 && <section aria-label={t('textAnswerPointsDiff')} className="mt-4 w-full max-w-xl">
        <h3 className="sr-only">{t('textAnswerPointsDiff')}</h3>
        <ul className="flex flex-wrap justify-center gap-3">
            {assessedPlayerIds.map((uid) => {
                const delta = round.scoreDeltas?.[uid];
                const hasDelta = Number.isSafeInteger(delta);
                return <li key={uid} className="flex max-w-full items-center gap-2 rounded-full border border-slate-600 bg-slate-900/80 px-4 py-2 text-sm">
                    <span aria-hidden="true" className="shrink-0 text-xl">{room.players[uid]?.avatar}</span>
                    <span className="min-w-0 break-words text-left font-semibold">{room.players[uid]?.name || t('playerFallback')}</span>
                    <span className={`shrink-0 font-bold tabular-nums ${hasDelta && delta > 0 ? 'text-green-400' : hasDelta && delta < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        {hasDelta ? `${delta > 0 ? '+' : ''}${delta}` : '—'}
                    </span>
                </li>;
            })}
        </ul>
    </section>;
    if (round.phase === 'complete' && !isHost) return pointsTags;
    if (controls) return <section aria-label={t('textAnswerHostPanel')} className="flex w-full flex-col gap-3">
        {round.phase === 'answering' ? <>
            <p className="font-bold" role="status">{t('textAnswerCount', { count: submittedPlayerIds.length, total: round.playerIds.length })}</p>
            <ul className="break-words text-sm text-slate-300">{submittedPlayerIds.map((uid) => <li key={uid}>{room.players[uid]?.name}</li>)}</ul>
            {allPlayersAnswered
                ? <button type="button" disabled={pending} onClick={endAnswering}
                    className={buttonClass + ' bg-blue-600'}>{t('textAnswerEndAllAnswered')}</button>
                : <HoldToConfirmButton disabled={pending} durationMs={2000} onConfirm={endAnswering}
                    className={buttonClass + ' border border-slate-500'}>{t('textAnswerEnd')}</HoldToConfirmButton>}
        </> : <>
            <p className="font-bold">{t('textAnswerProgress', { current: round.reviewIndex + 1, total: round.playerIds.length })}</p>
            <p className="break-words">{playerName}</p>
            {!round.answerVisible ? <button type="button" disabled={pending} className={buttonClass + ' bg-blue-600'}
                onClick={() => run(() => revealTextAnswer(roomRef, round.id, user.uid, round.reviewIndex, currentId))}>{t('textAnswerShow')}</button> : <>
                <label className="text-sm font-bold" htmlFor="text-answer-points">{t('points')}</label>
                <div className="flex items-center gap-2">
                    <button type="button" disabled={pending} aria-label={t('textAnswerDecrease')} className={buttonClass + ' bg-slate-700'}
                        onClick={() => setPoints(String(Math.max(0, (validTextPoints(points) ? Number(points) : question.points) - step)))}><Minus size={18} /></button>
                    <input id="text-answer-points" type="number" min="0" step={step} value={points} disabled={pending} onChange={(e) => setPoints(e.target.value)}
                        className="min-h-11 w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900 p-2 text-center" />
                    <button type="button" disabled={pending || !Number.isSafeInteger(Number(points) + step)} aria-label={t('textAnswerIncrease')} className={buttonClass + ' bg-slate-700'}
                        onClick={() => setPoints(String((validTextPoints(points) ? Number(points) : question.points) + step))}><Plus size={18} /></button>
                </div>
                {!validTextPoints(points) && <p role="alert" className="text-red-300">{t('textAnswerInvalidPoints')}</p>}
                <button type="button" disabled={pending || !validTextPoints(points)} onClick={() => judge('accept')} className={buttonClass + ' flex items-center justify-center gap-2 bg-green-600'}><Check />{t('textAnswerAccept')}</button>
                <button type="button" disabled={pending || !validTextPoints(points)} onClick={() => judge('deny')} className={buttonClass + ' flex items-center justify-center gap-2 bg-red-600'}><X />{t('textAnswerDeny')}</button>
                {room.trueCompetitiveMode && <button type="button" disabled={pending} onClick={() => judge('skip')} className={buttonClass + ' bg-slate-700'}>{t('textAnswerSkip')}</button>}
            </>}
        </>}
        {feedback}
    </section>;
    if (round.phase === 'reviewing' || round.phase === 'complete') return <div className={`${isHost ? 'mt-8 md:mt-10' : ''} w-full max-w-xl space-y-4`}>
        {round.phase === 'reviewing' && <section aria-label={t('textAnswerReview')} className="space-y-3 rounded-xl border border-slate-600 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">{t('textAnswerProgress', { current: round.reviewIndex + 1, total: round.playerIds.length })}</p>
            <h3 className="break-words text-xl font-bold">{playerName}</h3>
            {round.answerVisible ? round.answers[currentId]
                ? <p className="break-words text-2xl font-bold">{round.answers[currentId]}</p>
                : <p className="text-2xl italic opacity-50">{t('textAnswerNothing')}</p>
                : <p className="text-slate-400" role="status">{t('textAnswerWaitingReveal')}</p>}
        </section>}
        {pointsTags}
        {isHost && <section aria-label={t('textAnswerOverview')} className="rounded-xl border border-slate-600 bg-slate-900/80 p-3 sm:p-5">
            {/* Frozen review answers are already available in the room snapshot. */}
            {round.phase === 'reviewing' && <p className="mb-3 text-sm text-slate-300">{t('textAnswerOrderHint')}</p>}
            {feedback}
            <table className="w-full table-fixed text-left text-sm">
                <caption className="mb-3 text-left text-lg font-bold">{t('textAnswerOverview')}</caption>
                <thead className="text-slate-300">
                    <tr className="border-b border-slate-600">
                        <th scope="col" className="w-14 px-1 py-2"><span className="sr-only">{t('textAnswerOrder')}</span></th>
                        <th scope="col" className="w-1/3 break-words px-2 py-2">{t('textAnswerPlayer')}</th>
                        <th scope="col" className="break-words px-2 py-2">{t('textAnswerAnswer')}</th>
                        <th scope="col" className="w-1/4 break-words px-2 py-2 text-right">{t('textAnswerPointsDiff')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                    {round.playerIds.map((uid, index) => {
                        const delta = round.scoreDeltas?.[uid];
                        const firstMovable = round.reviewIndex + (round.answerVisible ? 1 : 0);
                        const movable = round.phase === 'reviewing' && index >= firstMovable;
                        const presenting = round.phase === 'reviewing' && round.answerVisible && index === round.reviewIndex;
                        const upNext = round.phase === 'reviewing' && index === firstMovable;
                        const judged = index < round.reviewIndex && Number.isSafeInteger(delta);
                        return <tr key={uid} className={`align-middle ${presenting ? 'bg-blue-950/60' : ''}`}>
                            <td className="px-1 py-3 align-middle">
                                {movable && <div className="flex flex-col gap-1">
                                    {[-1, 1].map((direction) => <button key={direction} type="button"
                                        aria-label={t(direction === -1 ? 'textAnswerMoveUp' : 'textAnswerMoveDown', { playerName: room.players[uid]?.name || t('playerFallback') })}
                                        aria-disabled={pending || (direction === -1 ? index === firstMovable : index === round.playerIds.length - 1)}
                                        onClick={() => {
                                            if (pending || (direction === -1 ? index === firstMovable : index === round.playerIds.length - 1)) return;
                                            run(() => reorderTextAnswer(roomRef, round.id, user.uid, round.reviewIndex, uid, direction, round.playerIds));
                                        }}
                                        className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-lg bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-300 aria-disabled:opacity-40">
                                        {direction === -1 ? <ArrowUp size={13.5} /> : <ArrowDown size={13.5} />}
                                    </button>)}
                                </div>}
                            </td>
                            <th scope="row" className="px-2 py-3 align-middle font-semibold">
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-400 tabular-nums">{index + 1}.</span>
                                    <span aria-hidden="true" className="shrink-0 text-2xl">{room.players[uid]?.avatar}</span>
                                    <span className="min-w-0 break-words">{room.players[uid]?.name || t('playerFallback')}</span>
                                </div>
                                {(presenting || upNext) && <span className="block text-xs text-blue-300">{t(presenting ? 'textAnswerPresenting' : 'textAnswerUpNext')}</span>}
                            </th>
                            <td className="break-words px-2 py-3">{round.answers[uid] || <span className="italic opacity-50">{t('textAnswerNothing')}</span>}</td>
                            <td className={`break-words px-2 py-3 text-right font-bold tabular-nums ${judged && delta > 0 ? 'text-green-400' : judged && delta < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                {judged ? `${delta > 0 ? '+' : ''}${delta}` : '—'}
                            </td>
                        </tr>;
                    })}
                </tbody>
            </table>
        </section>}
    </div>;
    if (isHost) return null;
    if (isSpectator || !round.playerIds.includes(user.uid)) return <p className="mt-6 text-slate-400" role="status">{t('textAnswerWaiting')}</p>;
    const valid = normalizeTextAnswer(draft) !== null;
    return <form className="mt-6 flex w-full max-w-xl flex-col gap-3" onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const value = normalizeTextAnswer(draft);
        run(async () => {
            const result = await submitTextAnswer(roomRef, round.id, user.uid, value);
            if (result === 'saved') { dirty.current = false; setDraft(value); setSent(value); }
            return result;
        });
    }}>
        <label htmlFor="text-player-answer" className="font-bold">{t('textAnswerInput')}</label>
        <input id="text-player-answer" type="text" autoComplete="off" value={draft} disabled={pending}
            aria-describedby="text-answer-counter" onChange={(e) => { dirty.current = true; setDraft(e.target.value); }}
            className="min-h-12 rounded-xl border border-slate-600 bg-slate-900 p-3 text-white focus:ring-2 focus:ring-blue-400" />
        <span id="text-answer-counter" className={valid || !draft ? 'text-sm text-slate-400' : 'text-sm text-red-300'}>{Array.from(draft.trim()).length}/40</span>
        <button type="submit" disabled={pending || !valid} className={buttonClass + ' bg-blue-600'}>{t('textAnswerSend')}</button>
        {!pending && !error && <p role="status" className="text-sm text-slate-300">{t(draft === (sent ?? saved) && (sent ?? saved) ? 'textAnswerSaved' : 'textAnswerUnsent')}</p>}
        {feedback}
    </form>;
}
