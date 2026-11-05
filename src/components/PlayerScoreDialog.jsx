import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import usePlayerScoreHistory from '../hooks/usePlayerScoreHistory';
import { savePlayerScore } from '../actions/scoreActions';
import { scoreHistoryChange, validScore } from '../utils/scoreHistory';
import { HistoryMessage } from './historyMessage';

export default function PlayerScoreDialog({ room, roomRef, playerId, host, onClose, t }) {
    const dialogRef = useRef(null);
    const cancelRef = useRef(null);
    const pendingSave = useRef(null);
    const savingRef = useRef(false);
    const [manualDelta, setManualDelta] = useState(0);
    const [invalidInput, setInvalidInput] = useState(null);
    const [selected, setSelected] = useState({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const history = usePlayerScoreHistory(roomRef, room, playerId);
    const player = room.players[playerId];
    const baseline = Number(player?.score) || 0;
    const revertDelta = Object.values(selected).reduce((sum, delta) => sum + delta, 0);
    const draft = baseline + manualDelta + revertDelta;
    const valid = invalidInput === null && Number.isSafeInteger(draft) && Number.isSafeInteger(manualDelta);
    const conflict = Object.keys(selected).some((id) => history.reversed(id) === true);
    const busy = saving;

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

    const dismiss = () => { if (!savingRef.current) onClose(); };
    const edit = (value) => {
        pendingSave.current = null;
        setError('');
        if (!validScore(value)) { setInvalidInput(value); return; }
        setInvalidInput(null);
        setManualDelta(Number(value) - baseline - revertDelta);
    };
    const toggle = (item) => {
        pendingSave.current = null;
        setError('');
        setSelected((previous) => {
            const next = { ...previous };
            if (Object.hasOwn(next, item.id)) delete next[item.id];
            else next[item.id] = -scoreHistoryChange(item).delta;
            return next;
        });
    };
    const save = async () => {
        if (savingRef.current || !valid || conflict || !player) return;
        if (!manualDelta && !Object.keys(selected).length) { onClose(); return; }
        if (!pendingSave.current) pendingSave.current = { operationId: crypto.randomUUID(), manualDelta,
            sourceEventIds: Object.keys(selected), playerId, actor: host };
        savingRef.current = true;
        setSaving(true);
        setError('');
        try {
            await savePlayerScore(roomRef, pendingSave.current);
            onClose();
        } catch (cause) {
            setError(cause.code === 'score-edit-conflict' ? 'scoreEditConflict' : 'scoreEditFailed');
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    return (
        <dialog ref={dialogRef} aria-labelledby="player-score-title"
            onCancel={(event) => { event.preventDefault(); dismiss(); }}
            onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-700 theme-border bg-slate-900 theme-room-background p-5 text-slate-200 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
                <h2 id="player-score-title" className="text-xl font-bold theme-text">{t('editPlayerScore', { playerName: player?.name || t('playerFallback') })}</h2>
                <button type="button" disabled={busy} onClick={dismiss} aria-label={t('cancel')} className="rounded-lg p-2 hover:bg-slate-800 disabled:opacity-50"><X size={20} /></button>
            </div>
            <div className="mt-5 flex items-center gap-3"><span className="text-3xl">{player?.avatar}</span><span className="font-bold">{player?.name}</span></div>
            <label htmlFor="player-score-input" className="mt-4 block text-sm text-slate-400 theme-muted">{t('scoreEditTotal')}</label>
            <div className="mt-2 flex items-center overflow-hidden rounded-xl border border-slate-700 theme-border bg-slate-950 theme-surface focus-within:border-blue-500">
                <button type="button" onClick={() => edit(String(draft - 100))} disabled={busy || !valid} aria-label={t('scoreSubtract100')} className="flex shrink-0 items-center justify-center self-stretch p-4 hover:bg-slate-800 disabled:opacity-50"><Minus size={20} /></button>
                <input id="player-score-input" type="text" inputMode="text" value={invalidInput ?? String(draft)} onChange={(event) => edit(event.target.value)} disabled={busy}
                    aria-invalid={!valid} aria-describedby="player-score-validation" className="min-w-0 w-full bg-transparent py-3 text-center font-mono text-2xl font-bold text-yellow-400 theme-accent outline-none" />
                <button type="button" onClick={() => edit(String(draft + 100))} disabled={busy || !valid} aria-label={t('scoreAdd100')} className="flex shrink-0 items-center justify-center self-stretch p-4 hover:bg-slate-800 disabled:opacity-50"><Plus size={20} /></button>
            </div>
            <p className="mt-2 text-sm text-slate-400 theme-muted" aria-live="polite">{t('scoreEditCurrent', { score: baseline })}</p>
            <p id="player-score-validation" className="mt-1 text-sm text-red-300">{!valid ? t('scoreEditInvalid') : ''}</p>
            <h3 className="mt-5 font-bold">{t('scoreEditRecent')}</h3>
            {history.loading && <p className="mt-2 text-sm text-slate-400">{t('gameDataLoading')}</p>}
            {history.error && <button type="button" disabled={busy} onClick={history.retry} className="mt-2 text-sm text-red-300">{t('historyLoadFailed')} {t('gameDataRetry')}</button>}
            {!history.loading && !history.error && !history.items.length && <p className="mt-2 text-sm text-slate-400">{t('scoreEditEmpty')}</p>}
            <div className="mt-3 space-y-2">
                {history.items.map((item) => {
                    const pending = Object.hasOwn(selected, item.id);
                    const reversed = history.reversed(item.id);
                    return <div key={item.id} className="rounded-xl border border-slate-700 theme-border bg-slate-950 theme-surface p-3">
                        <div className="text-sm"><HistoryMessage item={item} t={t} /></div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                            <time>{new Date(item.timestamp || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</time>
                            <button type="button" onClick={() => toggle(item)} disabled={busy || !valid || (!pending && (reversed !== false || Object.keys(selected).length >= 3))} aria-pressed={pending}
                                className="flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                                <RotateCcw size={14} />{t(pending ? 'scoreEditUndoPending' : reversed ? 'scoreEditReverted' : 'scoreEditRevert')}
                            </button>
                        </div>
                    </div>;
                })}
            </div>
            {Object.keys(selected).filter((id) => !history.items.some((item) => item.id === id)).map((id) => (
                <button key={id} type="button" disabled={busy} onClick={() => {
                    pendingSave.current = null;
                    setError('');
                    setSelected((previous) => { const next = { ...previous }; delete next[id]; return next; });
                }} className="mt-2 block rounded-lg border border-slate-600 px-3 py-2 text-sm">
                    {t('scoreEditUndoPending')} ({selected[id] > 0 ? '+' : ''}{selected[id]})
                </button>
            ))}
            <p className="mt-3 text-sm text-slate-400 theme-muted">{t('scoreEditSaveNotice')}</p>
            {(error || conflict) && <p role="alert" className="mt-3 text-sm text-red-300">{t(conflict ? 'scoreEditConflict' : error)}</p>}
            <div className="mt-5 flex justify-end gap-3">
                <button ref={cancelRef} type="button" disabled={busy} onClick={dismiss} className="rounded-lg border border-slate-700 px-4 py-2 font-bold hover:bg-slate-800 disabled:opacity-50">{t('cancel')}</button>
                <button type="button" onClick={save} disabled={busy || !valid || conflict || !player} className="rounded-lg bg-blue-600 theme-primary px-5 py-2 font-bold text-white hover:bg-blue-500 disabled:opacity-50">{t(saving ? 'saving' : 'saveScores')}</button>
            </div>
        </dialog>
    );
}
