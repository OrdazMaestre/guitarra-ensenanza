'use client';
import { useState } from 'react';
import { BassIcon, GuitarIcon } from './riff/RiffIcons';

// Selector de instrumento del mástil (usuario, 2026-11-17, Sala de pruebas): guitarra o bajo de 4 cuerdas.
// Como los desplegables de la barra MIDI: el botón (`.midi-anchor`) enseña el icono del instrumento y sus
// opciones salen debajo (`.midi-dropdown`), cada una con icono + nombre.
const OPTIONS = [
  { kind: 'guitar' as const, label: 'Guitarra', icon: <GuitarIcon /> },
  { kind: 'bass' as const, label: 'Bajo', icon: <BassIcon /> },
];

export default function NeckInstrumentPicker({ kind, onPick }: { kind: 'guitar' | 'bass'; onPick: (kind: 'guitar' | 'bass') => void }) {
  const [open, setOpen] = useState(false);
  const current = OPTIONS.find((option) => option.kind === kind) ?? OPTIONS[0];
  const style = (active: boolean) => ({
    alignItems: 'center',
    background: active ? '#047857' : 'transparent',
    border: `1.5px solid ${active ? '#047857' : '#9ca3af'}`,
    borderRadius: '5px',
    color: active ? '#fff' : '#6b7280',
    cursor: 'pointer',
    display: 'inline-flex',
    fontSize: '11px',
    fontWeight: 700,
    gap: '4px',
    lineHeight: 1.4,
    padding: '2px 7px',
    whiteSpace: 'nowrap' as const,
  });
  return (
    <div className="midi-anchor neck-instrument-picker">
      <button aria-expanded={open} aria-haspopup="menu" aria-label={`Instrumento: ${current.label}`} className="neck-instrument-toggle" onClick={() => setOpen((value) => !value)} style={style(open)} title={`Instrumento: ${current.label}`} type="button">
        {current.icon}
      </button>
      {open && (
        <div className="midi-dropdown" role="menu">
          {OPTIONS.map((option) => (
            <button
              aria-pressed={option.kind === kind}
              key={option.kind}
              onClick={() => { onPick(option.kind); setOpen(false); }}
              role="menuitemradio"
              aria-checked={option.kind === kind}
              style={style(option.kind === kind)}
              type="button"
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
