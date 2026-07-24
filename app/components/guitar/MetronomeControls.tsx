'use client';
import type { MetronomeAPI, MetronomeSubdivision } from '@/app/lib/useMetronome';

const NOTE_CHARS: Record<MetronomeSubdivision, string> = {
  quarter: '♩',
  eighth: '♪',
  sixteenth: '♬',
};
const NOTE_LABELS: Record<MetronomeSubdivision, string> = {
  quarter: 'Negra',
  eighth: 'Corchea',
  sixteenth: 'Semicorchea',
};
const SUBDIVISIONS: MetronomeSubdivision[] = ['quarter', 'eighth', 'sixteenth'];

function MetronomeIcon() {
  return (
    <svg width="16" height="17" viewBox="0 0 20 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="16" y2="21" />
      <polyline points="7,21 5.5,4 14.5,4 13,21" />
      <line x1="10" y1="4" x2="14" y2="13" />
      <circle cx="14" cy="13" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function MetronomeControls({ bpm, setBpm, on, subdivision, turnOn, turnOff, selectSubdivision }: MetronomeAPI) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      {/* Toggle button */}
      <button
        onClick={on ? turnOff : () => turnOn()}
        aria-label={on ? 'Desactivar metrónomo' : 'Activar metrónomo'}
        style={{
          background: on ? '#047857' : 'transparent',
          border: `1.5px solid ${on ? '#047857' : '#9ca3af'}`,
          borderRadius: '5px',
          color: on ? '#fff' : '#6b7280',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding: '3px 7px',
          lineHeight: 1,
        }}
      >
        <MetronomeIcon />
      </button>

      {/* Subdivision buttons — visible only while metronome is on */}
      {on && SUBDIVISIONS.map(sub => (
        <button
          key={sub}
          onClick={() => selectSubdivision(sub)}
          title={NOTE_LABELS[sub]}
          aria-label={NOTE_LABELS[sub]}
          aria-pressed={subdivision === sub}
          style={{
            background: subdivision === sub ? '#047857' : 'transparent',
            border: `1.5px solid ${subdivision === sub ? '#047857' : '#9ca3af'}`,
            borderRadius: '5px',
            color: subdivision === sub ? '#fff' : '#6b7280',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            padding: '2px 6px',
          }}
        >
          {NOTE_CHARS[sub]}
        </button>
      ))}

      {/* BPM slider — only visible while metronome is on */}
      {on && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#080808', minWidth: '52px', textAlign: 'right' }}>
            {bpm} bpm
          </span>
          <input
            aria-label="Tempo del metrónomo"
            type="range" min="30" max="100" step="1" value={bpm}
            onChange={e => setBpm(Number(e.target.value))}
            style={{ accentColor: '#047857', cursor: 'pointer', width: '112px' }}
          />
        </label>
      )}
    </div>
  );
}
