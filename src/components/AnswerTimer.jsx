import { memo, useEffect, useState } from 'react';
import { ANSWER_WINDOW_MS } from '../utils/buzzerPolicy';

function AnswerTimer({ startedAt, revealed, isHost, serverNow, clockSyncKey }) {
    const [remaining, setRemaining] = useState(ANSWER_WINDOW_MS);
    useEffect(() => {
        let timer;
        const tick = () => {
            clearTimeout(timer);
            const left = startedAt ? Math.max(0, ANSWER_WINDOW_MS - (serverNow() - startedAt)) : ANSWER_WINDOW_MS;
            setRemaining(left);
            if (startedAt && !revealed && left > 0 && !document.hidden) timer = setTimeout(tick, 100);
        };
        tick();
        document.addEventListener('visibilitychange', tick);
        return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', tick); };
    }, [startedAt, revealed, serverNow, clockSyncKey]);
    return <div className={`relative h-24 w-24 shrink-0 ${isHost ? 'mt-2' : 'mb-6 md:mb-8 md:h-32 md:w-32'}`}>
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90 transform">
            <circle cx="64" cy="64" r="60" className="stroke-slate-700 fill-none" strokeWidth="8" />
            <circle cx="64" cy="64" r="60" className={`fill-none stroke-blue-500 transition-all duration-100 ${remaining < 3000 ? 'stroke-red-500' : ''}`}
                strokeWidth="8" strokeDasharray="377" strokeDashoffset={377 - 377 * remaining / ANSWER_WINDOW_MS} />
        </svg>
        <div className={`absolute inset-0 flex items-center justify-center font-mono text-3xl font-black md:text-4xl ${remaining < 3000 ? 'text-red-400' : 'text-blue-400'}`}>
            {Math.ceil(remaining / 1000)}
        </div>
    </div>;
}

export default memo(AnswerTimer);
