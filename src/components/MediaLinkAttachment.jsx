import { useEffect, useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { parseMediaLink } from '../utils/externalMedia';

const buttonClass = 'inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50';

export default function MediaLinkAttachment({ disabled, replacing, onAttach, label, t }) {
    const trigger = useRef(null);
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
    const [kind, setKind] = useState('');
    const [preview, setPreview] = useState(null);
    const [status, setStatus] = useState('');
    const duration = useRef(null);
    const link = parseMediaLink(url, kind);
    const detected = parseMediaLink(url)?.kind;

    useEffect(() => {
        if (status !== 'loading') return;
        const timer = setTimeout(() => setStatus('failed'), 15000);
        return () => clearTimeout(timer);
    }, [preview, status]);

    const resetPreview = () => {
        setPreview(null);
        setStatus('');
        duration.current = null;
    };
    const close = () => {
        resetPreview();
        setOpen(false);
        setUrl('');
        setKind('');
        trigger.current?.focus();
    };
    const ready = (event) => {
        duration.current = event.currentTarget.duration;
        setStatus('ready');
    };
    const MediaElement = preview?.kind === 'image' ? 'img' : preview?.kind;

    return <div className="mt-2">
        <button ref={trigger} type="button" disabled={disabled} aria-expanded={open}
            onClick={() => open ? close() : setOpen(true)} className={buttonClass}>
            <Link2 size={16} />{t('attachFromLink')}
        </button>
        {open && <fieldset disabled={disabled} className="mt-2 space-y-2 rounded-lg border border-slate-700 p-3">
            <legend className="px-1 text-sm">{label}</legend>
            <label className="block text-sm">{t('mediaLinkUrl')}
                <input type="url" autoFocus value={url} placeholder="https://…" className="mt-1 block w-full rounded bg-slate-800 p-2"
                    onChange={(event) => { resetPreview(); setKind(''); setUrl(event.target.value); }} />
            </label>
            {link && !detected && <label className="block text-sm">{t('mediaLinkType')}
                <select value={kind} className="ml-2 rounded bg-slate-800 p-2"
                    onChange={(event) => { resetPreview(); setKind(event.target.value); }}>
                    <option value="">—</option>
                    {['image', 'audio', 'video'].map((value) => <option key={value} value={value}>{t(value + 'Media')}</option>)}
                </select>
            </label>}
            {url.trim() && !link && <p role="alert" className="text-sm text-red-300">{t('mediaLinkInvalid')}</p>}
            {preview && status !== 'failed' && <MediaElement src={preview.url}
                {...(preview.kind === 'image' ? { alt: label, onLoad: ready } : { controls: true, playsInline: true, preload: 'metadata', onLoadedMetadata: ready })}
                onError={() => setStatus('failed')} className="max-h-48 max-w-full" />}
            {status === 'failed' && <p role="alert" className="text-sm text-red-300">{t('mediaLinkFailed')}</p>}
            <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass} onClick={close}>{t('cancel')}</button>
                <button type="button" className={buttonClass} disabled={!link?.kind || status === 'loading' || status === 'ready'}
                    onClick={() => { setPreview(link); setStatus('loading'); }}>{t('mediaLinkPreview')}</button>
                <button type="button" className={buttonClass} disabled={status !== 'ready'}
                    onClick={() => { onAttach(preview, duration.current); close(); }}>{t(replacing ? 'replaceMedia' : 'attachMedia')}</button>
            </div>
        </fieldset>}
    </div>;
}
