'use client';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// Floating warning (above) + control bar (below) shared by every MIDI
// instrument. Must be rendered inside a `.midi-instrument-host` element
// (wrapping the <svg>) so its position:absolute children anchor correctly.
// `children` renders as one row, in DOM order (KB button, volume slider,
// metronome), wrapping onto extra lines at narrow widths.
// `belowNote` is a SEPARATE slot from `warning` -- a petición explícita del usuario (ver
// KeyboardLeftyNote en HandednessToggleButton.tsx), se apila DENTRO del mismo contenedor flotante
// de abajo, justo encima de la fila de botones (el hueco entre el final del mástil y los botones),
// en vez de reutilizar `warning` (que sigue flotando por encima del instrumento, para el aviso de
// ghosting). `.midi-float-controls` pasó a `flex-direction: column` en globals.css precisamente
// para poder apilar este aviso sobre la píldora de botones sin afectar a los mástiles que no lo usan
// (con un único hijo, una columna centrada se ve igual que una fila centrada).
//
// Flotante vs. "en su hueco" (automático, sin breakpoint fijo): en pantalla grande la barra es una
// fila pequeña que cabe en el hueco de debajo del instrumento, así que flota y NO empuja el
// contenido siguiente (decisión del usuario: los bloques relacionados deben seguir a la vista
// juntos). Pero cuando la píldora se parte en varias líneas (móvil) o pisaría el siguiente
// contenido (anchos intermedios), pasa a `.is-in-flow` (position: static): reserva su altura y
// empuja lo de abajo, porque tapar algo importante nunca es aceptable. Ver `measure()` abajo.
export default function MidiInstrumentChrome({ belowNote, warning, children }: {
  belowNote?: ReactNode;
  warning?: ReactNode;
  children: ReactNode;
}) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const [inFlow, setInFlow] = useState(false);
  const inFlowRef = useRef(false);

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const pill = pillRef.current;
    const host = controls?.parentElement;
    if (!controls || !pill || !host) return;

    function measure() {
      if (!controls || !pill || !host) return;
      const pillRect = pill.getBoundingClientRect();
      // 0 de alto = no se está mostrando (display:none de algún ancestro) -- no decidir nada.
      if (pillRect.height === 0) return;
      const controlsHeight = controls.getBoundingClientRect().height;

      // 1) ¿Se ha partido en varias líneas? Una sola fila mide lo que su hijo más alto + relleno.
      const style = getComputedStyle(pill);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      let tallestChild = 0;
      for (const child of Array.from(pill.children)) {
        tallestChild = Math.max(tallestChild, child.getBoundingClientRect().height);
      }
      const wrapped = pillRect.height > tallestChild + padding + 4;

      // 2) ¿Pisaría el siguiente contenido? Siguiente elemento visible subiendo desde el host.
      let overlaps = false;
      const hostBottom = host.getBoundingClientRect().bottom;
      let node: Element | null = host;
      let next: Element | null = null;
      while (node && node.tagName !== 'MAIN' && node.tagName !== 'BODY') {
        let sibling = node.nextElementSibling;
        while (sibling && sibling.getBoundingClientRect().height === 0) sibling = sibling.nextElementSibling;
        if (sibling) { next = sibling; break; }
        node = node.parentElement;
      }
      if (next) {
        // `next.top - host.bottom` es el hueco libre real en AMBOS modos: flotando, host.bottom es
        // el final del instrumento; "en su hueco", la barra está dentro del host, así que host y
        // siguiente crecen/bajan lo mismo y la resta no cambia. Por eso no oscila entre modos.
        const freeSpace = next.getBoundingClientRect().top - hostBottom;
        overlaps = 8 + controlsHeight > freeSpace;
      }

      const shouldBeInFlow = wrapped || overlaps;
      if (shouldBeInFlow !== inFlowRef.current) {
        inFlowRef.current = shouldBeInFlow;
        setInFlow(shouldBeInFlow);
      }
    }

    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(pill);
    observer.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <>
      {warning && <div className="midi-float-warning">{warning}</div>}
      <div ref={controlsRef} className={`midi-float-controls${inFlow ? ' is-in-flow' : ''}`}>
        {belowNote}
        <div ref={pillRef} className="midi-float-pill">{children}</div>
      </div>
    </>
  );
}
