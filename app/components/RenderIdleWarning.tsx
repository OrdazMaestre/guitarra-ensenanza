'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEPLOY_TARGET } from '../lib/deployTarget';
import IdleWarningPanel from './IdleWarningPanel';

const IDLE_THRESHOLD_MS = 10 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const;

export default function RenderIdleWarning() {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(visible);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  const scheduleWarning = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setVisible(true), IDLE_THRESHOLD_MS);
  }, []);

  useEffect(() => {
    if (DEPLOY_TARGET !== 'render') {
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
  }, [scheduleWarning]);

  if (DEPLOY_TARGET !== 'render' || !visible) {
    return null;
  }

  const handleReturnClick = () => {
    router.refresh();
    setVisible(false);
    scheduleWarning();
  };

  return <IdleWarningPanel onReturnClick={handleReturnClick} onPortadaClick={() => setVisible(false)} />;
}
