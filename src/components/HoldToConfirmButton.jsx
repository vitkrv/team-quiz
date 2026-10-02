import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../useLanguage';
import { useHoldGuidance } from '../holdGuidanceContext';

const cornerClasses = [
    'left-1 top-1 border-l border-t',
    'right-1 top-1 border-r border-t',
    'bottom-1 left-1 border-b border-l',
    'bottom-1 right-1 border-b border-r'
];

export default function HoldToConfirmButton({
    children,
    ariaLabel,
    className,
    fillClassName = 'bg-red-600',
    durationMs = 3000,
    onConfirm,
    title
}) {
    const { t } = useLanguage();
    const { showHoldGuidance, clearHoldGuidance } = useHoldGuidance();
    const [progress, setProgress] = useState(0);
    const [isHolding, setIsHolding] = useState(false);
    const startedAtRef = useRef(null);
    const confirmedRef = useRef(false);
    const pointerIdRef = useRef(null);
    const heldKeyRef = useRef(null);

    useEffect(() => {
        if (!isHolding) return undefined;

        const intervalId = window.setInterval(() => {
            if (startedAtRef.current === null) return;
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
        clearHoldGuidance();
        startedAtRef.current = Date.now();
        confirmedRef.current = false;
        setProgress(0);
        setIsHolding(true);
    };

    const cancelHold = () => {
        startedAtRef.current = null;
        setIsHolding(false);
        if (!confirmedRef.current) setProgress(0);
    };

    const finishHold = () => {
        if (startedAtRef.current !== null && !confirmedRef.current) {
            showHoldGuidance(t('holdToConfirmGuidance', { seconds: durationMs / 1000 }));
        }
        cancelHold();
    };

    const isPointerInside = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right
            && event.clientY >= rect.top && event.clientY <= rect.bottom;
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
        if (!event.isPrimary || event.button !== 0 || pointerIdRef.current !== null || heldKeyRef.current !== null) return;

        if (event.pointerType !== 'mouse') {
            event.preventDefault();
        }

        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        startHold();
    };

    const handlePointerMove = (event) => {
        if (pointerIdRef.current !== event.pointerId) return;

        if (!isPointerInside(event)) {
            cancelHold();
            releasePointerCapture(event.currentTarget, event.pointerId);
        }
    };

    const handlePointerEnd = (event) => {
        if (pointerIdRef.current !== event.pointerId) return;

        if (event.type === 'pointerup' && isPointerInside(event)) finishHold();
        else cancelHold();
        releasePointerCapture(event.currentTarget, event.pointerId);
    };

    return (
        <button
            type="button"
            aria-label={ariaLabel}
            title={title}
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
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (!event.repeat && heldKeyRef.current === null && pointerIdRef.current === null) {
                        heldKeyRef.current = event.key;
                        startHold();
                    }
                }
            }}
            onKeyUp={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (heldKeyRef.current === event.key) {
                        heldKeyRef.current = null;
                        finishHold();
                    }
                }
            }}
            onBlur={(event) => {
                heldKeyRef.current = null;
                cancelHold();
                if (pointerIdRef.current !== null) {
                    releasePointerCapture(event.currentTarget, pointerIdRef.current);
                }
            }}
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
