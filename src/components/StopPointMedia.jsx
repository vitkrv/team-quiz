import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import MediaVolumeControl from './MediaVolumeControl';
import useLocalMediaVolume from '../hooks/useLocalMediaVolume';
import { formatMediaTime, getMediaStops, mediaIdentity } from '../utils/mediaStops';
import { getMediaUrl } from '../services/imageStorage';
import { createMediaStopPlayback } from '../utils/mediaStopPlayback';

export default function StopPointMedia({ media, t, gated = false, playback, storageScope = '', pauseSignal = 0, stopped = false, onStop, compact = false, className = '' }) {
    const elementRef = useRef(null);
    const runtimeRef = useRef(null);
    const locallyPausedRef = useRef(false);
    const latest = useRef({ playback, stopped, onStop });
    latest.current = { playback, stopped, onStop };
    const [view, setView] = useState({ time: 0, duration: media.durationSeconds, complete: !gated, playing: false, resume: false, boundary: null });
    const [volume] = useLocalMediaVolume();
    const stops = getMediaStops(media);
    const pointsKey = JSON.stringify(stops);
    const policyMedia = useMemo(() => ({ kind: media.kind, durationSeconds: media.durationSeconds, stopPoints: JSON.parse(pointsKey) }),
        [media.kind, media.durationSeconds, pointsKey]);
    const session = playback?.sessionId || '';
    const identity = mediaIdentity(media);
    const url = getMediaUrl(media);
    const isVideo = media.kind === 'video';

    useEffect(() => { if (elementRef.current) elementRef.current.volume = volume; }, [volume]);

    useEffect(() => {
        const runtime = createMediaStopPlayback({ element: elementRef.current, media: policyMedia, gated, session, storageScope, identity, latest,
            initialPause: locallyPausedRef.current, onView: (next) => { locallyPausedRef.current = next.localPause; setView(next); } });
        runtimeRef.current = runtime;
        return () => { runtime.dispose(); runtimeRef.current = null; };
    }, [gated, identity, policyMedia, session, storageScope]);

    useEffect(() => { runtimeRef.current?.sync(); }, [playback?.releasedStopCount, stopped]);
    const previousPause = useRef(pauseSignal);
    useEffect(() => {
        if (pauseSignal !== previousPause.current) runtimeRef.current?.buzzPause();
        previousPause.current = pauseSignal;
    }, [pauseSignal]);
    const duration = view.duration || media.durationSeconds;
    const progress = duration > 0 ? view.time / duration * 100 : 0;
    return <div className={`${compact ? 'w-64 max-w-full' : 'w-full max-w-4xl'} ${className}`}>
        {isVideo ? <video ref={elementRef} src={url} playsInline preload="auto" controls={view.complete && !stopped} disablePictureInPicture={!view.complete} disableRemotePlayback={!view.complete}
            className={compact ? 'h-28 w-full rounded-lg bg-black object-contain' : 'max-h-[42vh] w-full rounded-lg bg-black'} /> : <audio ref={elementRef} src={url} preload="auto" />}
        <div className="mt-2 rounded-xl border border-slate-700 bg-slate-950/80 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs font-mono text-slate-300"><span>{formatMediaTime(view.time)}</span><span>{formatMediaTime(duration)}</span></div>
            <div className="relative mb-5">
                <input type="range" min={0} max={duration || 0} step="0.01" value={Math.min(view.time, duration || 0)}
                    disabled={!view.complete || stopped} aria-label={t('mediaSeek')}
                    onChange={(event) => runtimeRef.current?.seek(Number(event.target.value))}
                    className="h-2 w-full appearance-none rounded-full disabled:cursor-not-allowed"
                    style={{ background: `linear-gradient(to right, #3b82f6 ${progress}%, #1e293b ${progress}%)` }} />
                {stops.map((time, index) => <span key={time} role="img" aria-label={t('mediaStopMarker', { number: index + 1, time: formatMediaTime(time) })}
                    className={`pointer-events-none absolute top-0 h-4 w-0.5 ${view.complete ? 'bg-slate-500' : index < (playback?.releasedStopCount || 0) ? 'bg-green-400' : 'bg-amber-400'}`}
                    style={{ left: `${time / duration * 100}%` }}><span className="absolute top-4 -translate-x-1/2 text-[10px]">{index + 1}</span></span>)}
            </div>
            {!stopped && (view.complete || (view.resume && view.boundary === null && session)) && <button type="button" onClick={() => runtimeRef.current?.toggle()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white">
                {view.playing ? <Pause size={18} /> : <Play size={18} />}{t(view.playing ? 'mediaPause' : view.complete ? 'mediaPlay' : 'mediaResume')}
            </button>}
            {!view.complete && <p role="status" className="mt-2 text-sm text-slate-400">{t(!session ? 'mediaWaitingForHostStart' : view.boundary !== null ? 'mediaWaitingForContinue' : 'mediaTimelineLocked')}</p>}
            <MediaVolumeControl t={t} />
        </div>
    </div>;
}
