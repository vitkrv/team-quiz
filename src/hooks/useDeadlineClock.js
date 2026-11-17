import { useEffect, useState } from 'react';

// Render at state boundaries, not on every clock tick. Recheck after suspension
// and calibration; callers still read the clock at input time.
export default function useDeadlineClock(deadlines, serverNow, syncKey = 0) {
    const [, refresh] = useState(0);
    const key = JSON.stringify(deadlines.filter(Number.isFinite));
    useEffect(() => {
        let timer;
        const wake = () => {
            clearTimeout(timer);
            refresh((value) => value + 1);
            const remaining = JSON.parse(key).map((at) => at - serverNow()).filter((ms) => ms >= 0);
            if (remaining.length) timer = setTimeout(wake, Math.min(...remaining) + 1);
        };
        wake();
        for (const event of ['focus', 'pageshow', 'online']) window.addEventListener(event, wake);
        document.addEventListener('visibilitychange', wake);
        return () => {
            clearTimeout(timer);
            for (const event of ['focus', 'pageshow', 'online']) window.removeEventListener(event, wake);
            document.removeEventListener('visibilitychange', wake);
        };
    }, [key, serverNow, syncKey]);
    return serverNow();
}
