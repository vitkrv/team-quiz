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
    const pointerIdRef = useRef(null);

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

    const releasePointerCapture = (button, pointerId) => {
        if (button.hasPointerCapture(pointerId)) {
            button.releasePointerCapture(pointerId);
        }

        if (pointerIdRef.current === pointerId) {
            pointerIdRef.current = null;
        }
    };

    const handlePointerDown = (event) => {
        if (!event.isPrimary || event.button !== 0 || pointerIdRef.current !== null) return;

        if (event.pointerType !== 'mouse') {
            event.preventDefault();
        }

        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        startHold();
    };

    const handlePointerMove = (event) => {
        if (pointerIdRef.current !== event.pointerId) return;

        const rect = event.currentTarget.getBoundingClientRect();
        const isInside = event.clientX >= rect.left
            && event.clientX <= rect.right
            && event.clientY >= rect.top
            && event.clientY <= rect.bottom;

        if (!isInside) {
            cancelHold();
            releasePointerCapture(event.currentTarget, event.pointerId);
        }
    };

    const handlePointerEnd = (event) => {
        if (pointerIdRef.current !== event.pointerId) return;

        cancelHold();
        releasePointerCapture(event.currentTarget, event.pointerId);
    };

    return (
        <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onLostPointerCapture={(event) => {
                if (pointerIdRef.current === event.pointerId) {
                    pointerIdRef.current = null;
                    cancelHold();
                }
            }}
            onContextMenu={(event) => event.preventDefault()}
            onDragStart={(event) => event.preventDefault()}
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
            onBlur={cancelHold}
            className={`relative select-none overflow-hidden ${className}`}
            style={{
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                boxShadow: `inset 0 0 0 ${progress}px currentColor`,
                touchAction: 'none',
                userSelect: 'none'
            }}
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
