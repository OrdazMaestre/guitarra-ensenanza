'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const;

export function useIdleWarning(active: boolean, thresholdMs: number) {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(visible);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  const scheduleWarning = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setVisible(true), thresholdMs);
  }, [thresholdMs]);

  useEffect(() => {
    if (!active) {
      return;
    }

    scheduleWarning();

    const handleActivity = () => {
      if (visibleRef.current) {
        return;
      }
      scheduleWarning();
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [active, scheduleWarning]);

  const dismiss = useCallback(() => {
    setVisible(false);
    scheduleWarning();
  }, [scheduleWarning]);

  const dismissPermanently = useCallback(() => {
    setVisible(false);
  }, []);

  return { visible, dismiss, dismissPermanently };
}
