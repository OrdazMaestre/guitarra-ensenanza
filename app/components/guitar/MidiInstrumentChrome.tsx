'use client';
import type { ReactNode } from 'react';

// Floating warning (above) + control bar (below) shared by every MIDI
// instrument. Must be rendered inside a `.midi-instrument-host` element
// (wrapping the <svg>) so its position:absolute children anchor correctly.
// `children` renders as one row, in DOM order (KB button, volume slider,
// metronome), wrapping onto extra lines at narrow widths.
export default function MidiInstrumentChrome({ warning, children }: {
  warning?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {warning && <div className="midi-float-warning">{warning}</div>}
      <div className="midi-float-controls">
        <div className="midi-float-pill">{children}</div>
      </div>
    </>
  );
}
