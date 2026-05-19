import { forwardRef, useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';

const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const wholeSeconds = Math.floor(seconds);
    const minutes = Math.floor(wholeSeconds / 60);
    const remainder = wholeSeconds % 60;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
};

const mergeRefs = (refs, value) => {
    refs.forEach((ref) => {
        if (!ref) return;
        if (typeof ref === 'function') {
            ref(value);
        } else {
            ref.current = value;
        }
    });
};

const AudioControls = forwardRef(function AudioControls({
    src,
    preload = 'metadata',
    disabled = false,
    compact = false,
    className = '',
    t
}, forwardedRef) {
    const audioRef = useRef(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => {
        setDuration(0);
        setCurrentTime(0);
        setIsPlaying(false);
        setIsMuted(false);
    }, [src]);

    const togglePlayback = async () => {
        const audio = audioRef.current;
        if (!audio || disabled) return;

        if (audio.paused) {
            await audio.play().catch(() => {});
        } else {
            audio.pause();
        }
    };

    const toggleMute = () => {
        const audio = audioRef.current;
        if (!audio || disabled) return;
        audio.muted = !audio.muted;
        setIsMuted(audio.muted);
    };

    const handleSeek = (event) => {
        const audio = audioRef.current;
        if (!audio || disabled) return;
        const nextTime = Number(event.target.value);
        audio.currentTime = nextTime;
        setCurrentTime(nextTime);
    };

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className={`w-full ${compact ? 'max-w-[18rem]' : 'max-w-2xl'} ${className}`}>
            <audio
                ref={(node) => mergeRefs([audioRef, forwardedRef], node)}
                src={src}
                preload={preload}
                onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
                onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
            />
            <div className={`rounded-xl border border-slate-700 bg-slate-950/80 shadow-lg shadow-black/20 ${compact ? 'p-3' : 'p-4 md:p-5'} ${disabled ? 'opacity-70' : ''}`}>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={togglePlayback}
                        disabled={disabled}
                        aria-label={isPlaying ? t('audioPause') : t('audioPlay')}
                        title={isPlaying ? t('audioPause') : t('audioPlay')}
                        className={`${compact ? 'h-10 w-10' : 'h-12 w-12'} flex shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400`}
                    >
                        {isPlaying ? <Pause size={compact ? 18 : 22} /> : <Play size={compact ? 18 : 22} className="ml-0.5" />}
                    </button>

                    <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-slate-400">
                            <span className="font-mono text-slate-200">{formatTime(currentTime)}</span>
                            <span className="font-mono">{formatTime(duration)}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max={duration || 0}
                            step="0.01"
                            value={Math.min(currentTime, duration || currentTime)}
                            onChange={handleSeek}
                            disabled={disabled || !duration}
                            aria-label={t('audioSeek')}
                            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 disabled:cursor-not-allowed"
                            style={{
                                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progressPercent}%, #1e293b ${progressPercent}%, #1e293b 100%)`
                            }}
                        />
                    </div>

                    <button
                        type="button"
                        onClick={toggleMute}
                        disabled={disabled}
                        aria-label={isMuted ? t('audioUnmute') : t('audioMute')}
                        title={isMuted ? t('audioUnmute') : t('audioMute')}
                        className={`${compact ? 'h-10 w-10' : 'h-11 w-11'} flex shrink-0 items-center justify-center rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:text-slate-500`}
                    >
                        {isMuted ? <VolumeX size={compact ? 18 : 20} /> : <Volume2 size={compact ? 18 : 20} />}
                    </button>
                </div>
            </div>
        </div>
    );
});

export default AudioControls;
