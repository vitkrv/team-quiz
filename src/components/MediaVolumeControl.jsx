import { Volume1 } from 'lucide-react';
import { useId } from 'react';
import useLocalMediaVolume from '../hooks/useLocalMediaVolume';

export default function MediaVolumeControl({ disabled = false, compact = false, t }) {
    const volumeInputId = useId();
    const [volume, setVolume] = useLocalMediaVolume();
    const volumePercent = Math.round(volume * 100);

    const handleVolumeChange = (event) => {
        setVolume(Number(event.target.value) / 100);
    };

    return (
        <div className={`flex items-center gap-3 ${compact ? 'pt-2' : 'pt-3'}`}>
            <Volume1 size={compact ? 16 : 18} className="shrink-0 text-slate-300" />
            <label className="sr-only" htmlFor={volumeInputId}>
                {t('mediaVolume')}
            </label>
            <input
                id={volumeInputId}
                type="range"
                min="0"
                max="100"
                step="1"
                value={volumePercent}
                onChange={handleVolumeChange}
                disabled={disabled}
                aria-label={t('mediaVolume')}
                className="h-3 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-slate-800 disabled:cursor-not-allowed"
                style={{
                    background: `linear-gradient(to right, #22c55e 0%, #22c55e ${volumePercent}%, #1e293b ${volumePercent}%, #1e293b 100%)`
                }}
            />
            <span className="w-10 shrink-0 text-right font-mono text-xs font-bold text-slate-300">
                {t('mediaVolumePercent', { percent: volumePercent })}
            </span>
        </div>
    );
}
