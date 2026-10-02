import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { HoldGuidanceContext } from '../holdGuidanceContext';

export default function HoldGuidanceProvider({ children }) {
    const [guidance, setGuidance] = useState(null);
    const timeoutRef = useRef(null);
    const announcementIdRef = useRef(0);

    const clearHoldGuidance = useCallback(() => {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        setGuidance(null);
    }, []);

    const showHoldGuidance = useCallback((message) => {
        window.clearTimeout(timeoutRef.current);
        setGuidance({ message, id: ++announcementIdRef.current });
        timeoutRef.current = window.setTimeout(clearHoldGuidance, 4000);
    }, [clearHoldGuidance]);

    useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

    const value = useMemo(() => ({ showHoldGuidance, clearHoldGuidance }), [showHoldGuidance, clearHoldGuidance]);

    return (
        <HoldGuidanceContext.Provider value={value}>
            {children}
            {createPortal(
                <div
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="pointer-events-none fixed inset-x-0 z-[100] flex justify-center px-4"
                    style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
                >
                    {guidance && (
                        <div key={guidance.id} className="flex max-w-md items-center gap-3 rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
                            <Info size={20} className="shrink-0 text-sky-400" aria-hidden="true" />
                            <span>{guidance.message}</span>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </HoldGuidanceContext.Provider>
    );
}
