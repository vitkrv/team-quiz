import { useEffect, useRef, useState } from 'react';

const cornerClasses = [
    'left-1 top-1 border-l border-t',
    'right-1 top-1 border-r border-t',
    'bottom-1 left-1 border-b border-l',
    'bottom-1 right-1 border-b border-r'
];

export default function HoldToConfirmButton({
    children,
    className,
    fillClassName = 'bg-red-600',
    durationMs = 3000,
    onConfirm
}) {
    const [progress, setProgress] = useState(0);
    const [isHolding, setIsHolding] = useState(false);
    const startedAtRef = useRef(null);
    const confirmedRef = useRef(false);

    useEffect(() => {
        if (!isHolding) return undefined;

        const intervalId = window.setInterval(() => {
            const elapsed = Date.now() - startedAtRef.current;
            const nextProgress = Math.min(1, elapsed / durationMs);
            setProgress(nextProgress);

            if (nextProgress >= 1 && !confirmedRef.current) {
                confirmedRef.current = true;
                setIsHolding(false);
                onConfirm();
            }
        }, 30);

        return () => window.clearInterval(intervalId);
    }, [durationMs, isHolding, onConfirm]);

    const startHold = () => {
        startedAtRef.current = Date.now();
        confirmedRef.current = false;
        setProgress(0);
        setIsHolding(true);
    };

    const cancelHold = () => {
        if (confirmedRef.current) return;
        setIsHolding(false);
        setProgress(0);
    };

    return (
        <button
            type="button"
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && !isHolding) {
                    event.preventDefault();
                    startHold();
                }
            }}
            onKeyUp={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    cancelHold();
                }
            }}
            className={`relative overflow-hidden ${className}`}
            style={{ boxShadow: `inset 0 0 0 ${progress}px currentColor` }}
        >
            <span
                className={`absolute inset-y-0 left-0 transition-[width] duration-75 ${fillClassName}`}
                style={{ width: `${Math.min(1, progress / 0.9) * 100}%` }}
                aria-hidden="true"
            />
            <span className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
                {cornerClasses.map((cornerClass) => (
                    <span
                        key={cornerClass}
                        className={`absolute h-2 w-2 border-current opacity-70 ${cornerClass}`}
                    />
                ))}
            </span>
            <span className="relative z-10">{children}</span>
        </button>
    );
}
