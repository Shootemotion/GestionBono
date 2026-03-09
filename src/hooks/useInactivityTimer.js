// src/hooks/useInactivityTimer.js
import { useEffect, useCallback, useRef } from 'react';

/**
 * Calls `onTimeout` after `timeoutMs` ms of inactivity.
 * Activity is reset by: mousemove, mousedown, keydown, touchstart, scroll, click, wheel.
 *
 * @param {Function} onTimeout - Callback fired when user has been inactive for too long.
 * @param {number}   timeoutMs - Milliseconds of inactivity before triggering. Default: 25000 (25s).
 * @param {boolean}  enabled   - Whether the timer is active (e.g. only when user is logged in).
 */
export function useInactivityTimer(onTimeout, timeoutMs = 25_000, enabled = true) {
    const timerRef = useRef(null);
    const onTimeoutRef = useRef(onTimeout);

    // Keep ref up to date so the handler closure is always fresh
    useEffect(() => {
        onTimeoutRef.current = onTimeout;
    }, [onTimeout]);

    const reset = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            onTimeoutRef.current?.();
        }, timeoutMs);
    }, [timeoutMs]);

    useEffect(() => {
        if (!enabled) {
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];
        events.forEach(e => window.addEventListener(e, reset, { passive: true }));
        reset(); // start timer immediately

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(e => window.removeEventListener(e, reset));
        };
    }, [enabled, reset]);
}
