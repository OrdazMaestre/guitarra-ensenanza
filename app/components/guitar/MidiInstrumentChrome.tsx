'use client';
import type { ReactNode } from 'react';

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
export default function MidiInstrumentChrome({ belowNote, warning, children }: {
  belowNote?: ReactNode;
  warning?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {warning && <div className="midi-float-warning">{warning}</div>}
      <div className="midi-float-controls">
        {belowNote}
        <div className="midi-float-pill">{children}</div>
      </div>
    </>
  );
}
