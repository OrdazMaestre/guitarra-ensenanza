'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

type Metrics = {
  leftPct: number;
  thumbPct: number;
};

export default function HorizontalScrollbar({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    function update() {
      if (!el) return;
      const { scrollWidth, clientWidth, scrollLeft } = el;
      if (scrollWidth <= clientWidth + 1) {
        setMetrics(null);
        return;
      }
      const thumbPct = Math.max((clientWidth / scrollWidth) * 100, 10);
      const maxScroll = scrollWidth - clientWidth;
      const leftPct = maxScroll > 0 ? (scrollLeft / maxScroll) * (100 - thumbPct) : 0;
      setMetrics({ leftPct, thumbPct });
    }

    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [targetRef]);

  function scrollToClientX(clientX: number) {
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    el.scrollLeft = ratio * (el.scrollWidth - el.clientWidth);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragPointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrollToClientX(e.clientX);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragPointerIdRef.current !== e.pointerId) return;
    scrollToClientX(e.clientX);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (dragPointerIdRef.current !== e.pointerId) return;
    dragPointerIdRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer capture may already be released by the browser; safe to ignore
    }
  }

  if (!metrics) return null;

  return (
    <div
      ref={trackRef}
      className="hscrollbar-track"
      role="scrollbar"
      aria-orientation="horizontal"
      aria-label="Desplazamiento horizontal del mástil"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="hscrollbar-thumb" style={{ left: `${metrics.leftPct}%`, width: `${metrics.thumbPct}%` }} />
    </div>
  );
}
