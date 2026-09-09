import { useEffect, useRef, useCallback } from "react";

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

/**
 * Logs the user out after 1 hour of no mouse, keyboard, touch, or scroll
 * activity. The timer resets on any of those events.
 */
export function useInactivityLogout(onLogout: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLogoutRef = useRef(onLogout);

  // Keep ref current without needing onLogout in dep arrays
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onLogoutRef.current(), INACTIVITY_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer(); // start timer immediately on mount
    return () => {
      events.forEach(evt => window.removeEventListener(evt, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);
}
