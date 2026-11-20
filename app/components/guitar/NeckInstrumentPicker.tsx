'use client';
import { useState } from 'react';
import { BassIcon, DrumIcon, GuitarIcon, KeysIcon } from './riff/RiffIcons';
import type { DifficultyKind } from '@/app/lib/riff/difficulty';

// Selector de instrumento del mástil (usuario, 2026-11-17, Sala de pruebas; ampliado a 4 el 2026-11-20):
// guitarra, bajo de 4 cuerdas, batería o teclado, orden cíclico fijo. Como los desplegables de la barra
// MIDI: el botón central (`.midi-anchor`) enseña icono + NOMBRE COMPLETO del instrumento (petición del
// usuario: más vistoso, se ve qué instrumento es sin adivinar por el icono) y sus opciones salen debajo
// (`.midi-dropdown`); a los lados, dos flechas que cambian directamente al contiguo sin abrir el menú
// (petición del usuario: que se note que se puede cambiar, sin tener que desplegar nada para ello).
const OPTIONS: { kind: DifficultyKind; label: string; icon: React.ReactNode }[] = [
  { kind: 'guitar', label: 'Guitarra', icon: <GuitarIcon /> },
  { kind: 'bass', label: 'Bajo', icon: <BassIcon /> },
  { kind: 'drums', label: 'Batería', icon: <DrumIcon /> },
  { kind: 'keys', label: 'Teclado', icon: <KeysIcon /> },
];

export default function NeckInstrumentPicker({ kind, onPick }: { kind: DifficultyKind; onPick: (kind: DifficultyKind) => void }) {
  const [open, setOpen] = useState(false);
  const index = OPTIONS.findIndex((option) => option.kind === kind);
  const current = OPTIONS[index] ?? OPTIONS[0];
  const step = (direction: 1 | -1) => {
    const next = OPTIONS[(index + direction + OPTIONS.length) % OPTIONS.length];
    onPick(next.kind);
  };
  const itemStyle = (active: boolean) => ({
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
  const arrowStyle = {
    alignItems: 'center',
    background: 'transparent',
    border: '1.5px solid #9ca3af',
    borderRadius: '5px',
    color: '#6b7280',
    cursor: 'pointer',
    display: 'inline-flex',
    fontSize: '13px',
    fontWeight: 900,
    justifyContent: 'center',
    lineHeight: 1,
    padding: '4px 6px',
  };
  return (
    <div className="midi-anchor neck-instrument-picker" style={{ alignItems: 'center', display: 'inline-flex', gap: '4px' }}>
      <button aria-label="Instrumento anterior" className="neck-instrument-prev" onClick={() => step(-1)} style={arrowStyle} title="Instrumento anterior" type="button">
        ‹
      </button>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Instrumento: ${current.label}`}
        className="neck-instrument-toggle"
        onClick={() => setOpen((value) => !value)}
        style={{ alignItems: 'center', background: open ? '#047857' : '#ecfdf5', border: `2px solid ${open ? '#047857' : '#047857'}`, borderRadius: '6px', color: open ? '#fff' : '#047857', cursor: 'pointer', display: 'inline-flex', fontSize: '13px', fontWeight: 800, gap: '6px', justifyContent: 'center', lineHeight: 1.4, minWidth: '128px', padding: '4px 16px' }}
        title={`Instrumento: ${current.label}`}
        type="button"
      >
        {current.icon}
        <span>{current.label}</span>
      </button>
      <button aria-label="Instrumento siguiente" className="neck-instrument-next" onClick={() => step(1)} style={arrowStyle} title="Instrumento siguiente" type="button">
        ›
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
              style={itemStyle(option.kind === kind)}
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
