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
    // `overflow: auto` on `el` means ITS OWN box never changes size just because its content
    // (the scrolled <svg>) grows or shrinks -- that's the whole point of a scroll container, but
    // it also means a size-only change in the content (e.g. ReducedFretboardDiagram.tsx widening
    // its <svg> when tuning pegs appear, with no change to the wrap's own width) never fires the
    // observer above and the scrollbar silently stays hidden/stale even though scrolling is now
    // needed. Observing the content element directly (always `el`'s only child in every current
    // use of this component) catches exactly that case too, without changing anything for the
    // static-width content this component already handles correctly.
    const content = el.firstElementChild;
    const contentRo = content ? new ResizeObserver(update) : null;
    if (content) contentRo?.observe(content);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      contentRo?.disconnect();
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
