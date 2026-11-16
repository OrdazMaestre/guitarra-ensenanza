'use client';
import { useState, useSyncExternalStore } from 'react';
import { perfEnabled, perfSummary } from '@/app/lib/riff/perfMeter';

// Resumen del medidor de fluidez (solo con `?medir=1`, perfMeter.ts): sale en PAUSA y al terminar, con
// un botón para copiarlo y pasárnoslo. Sin `?medir=1` no pinta nada.
const neverChanges = () => () => {};

export function RiffPerfBox({ status }: { status: string }) {
  const on = useSyncExternalStore(neverChanges, perfEnabled, () => false);
  const [copied, setCopied] = useState(false);
  if (!on || (status !== 'paused' && status !== 'finished')) return null;
  const text = perfSummary().text;
  return (
    <div className="riff-perf-box" data-testid="riff-perf-box" style={{ background: 'rgba(0,0,0,0.85)', border: '1px solid #34d399', borderRadius: 8, color: '#d1fae5', font: '11px/1.35 ui-monospace, monospace', left: 4, maxWidth: 'calc(100% - 8px)', padding: '6px 8px', position: 'absolute', top: 4, whiteSpace: 'pre-wrap', zIndex: 40 }}>
      {text}
      <div>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false));
          }}
          style={{ background: '#047857', border: 0, borderRadius: 6, color: '#fff', cursor: 'pointer', font: 'inherit', fontWeight: 800, marginTop: 4, padding: '3px 10px' }}
          type="button"
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
