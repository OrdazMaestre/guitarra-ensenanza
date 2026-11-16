'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  DRUM_KEY_ROWS,
  DRUM_PAD_NAMES,
  codesFor,
  comboLabel,
  isDrumTestKey,
  keyLabel,
  rolloverAlternatives,
  rolloverCombos,
  rolloverReport,
  type RolloverResult,
} from '@/app/lib/keyRollover';

// Probador de teclas de la batería (Sala de pruebas, usuario 2026-11-16): recorre las combinaciones de
// Z X C V B N y anota cuáles recibe el navegador a la vez en ESTE teclado; si una falla, prueba las mismas
// columnas en otras filas (la batería del juego acepta cualquier fila). Solo escucha con su bloque abierto.
// El fallo se marca con el RATÓN a propósito: pulsar otra tecla podría fallar también.

const COMBOS = rolloverCombos();
const ZERO_ROWS = (n: number) => Array.from({ length: n }, () => 0);

// Lo que hay que mantener en cada paso: la combinación en la fila Z, o su alternativa número `alt`.
function targetOf(main: number, alt: number): string[] {
  if (main >= COMBOS.length) return [];
  return alt < 0 ? codesFor(COMBOS[main], ZERO_ROWS(COMBOS[main].length)) : rolloverAlternatives(COMBOS[main])[alt];
}

interface Run {
  main: number;
  alt: number; // -1 = la combinación en la fila Z
  results: RolloverResult[];
  armed: boolean; // hay que soltarlo todo antes de cada paso
  flash: boolean;
}

const START: Run = { main: 0, alt: -1, results: [], armed: true, flash: false };

export default function KeyRolloverTester() {
  const rootRef = useRef<HTMLDivElement>(null);
  const heldRef = useRef(new Set<string>());
  const bestRef = useRef<string[]>([]);
  const [held, setHeld] = useState<string[]>([]);
  const [run, setRun] = useState<Run>(START);
  const runRef = useRef(run);
  useLayoutEffect(() => { runRef.current = run; }, [run]);
  const [copied, setCopied] = useState(false);

  const done = run.main >= COMBOS.length;
  const alternatives = done ? [] : rolloverAlternatives(COMBOS[run.main]);
  const target = targetOf(run.main, run.alt);

  // Avanza: `ok` = la combinación llegó entera; si no, se apunta lo máximo que llegó.
  // Lo que llegó se copia FUERA del actualizador: React puede ejecutarlo dos veces (modo estricto).
  const advance = useCallback((ok: boolean) => {
    const arrived = bestRef.current;
    const armed = heldRef.current.size === 0;
    bestRef.current = [];
    setRun((prev) => {
      if (prev.main >= COMBOS.length) return prev;
      const codes = targetOf(prev.main, prev.alt);
      const alts = rolloverAlternatives(COMBOS[prev.main]);
      const results = [...prev.results];
      const next = { ...prev, results, armed, flash: false };
      if (prev.alt < 0) {
        results.push({ codes, ok, arrived: ok ? codes : arrived, alternatives: [] });
        if (!ok && alts.length > 0) next.alt = 0;
        else { next.main = prev.main + 1; next.alt = -1; }
      } else {
        const last = results[results.length - 1];
        results[results.length - 1] = { ...last, alternatives: [...last.alternatives, { codes, ok }] };
        if (!ok && prev.alt + 1 < alts.length) next.alt = prev.alt + 1;
        else { next.main = prev.main + 1; next.alt = -1; }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const details = rootRef.current?.closest('details');
    const sync = () => setHeld([...heldRef.current]);
    const down = (e: KeyboardEvent) => {
      if (!isDrumTestKey(e.code)) return;
      e.preventDefault();
      if (e.repeat || heldRef.current.has(e.code)) return;
      heldRef.current.add(e.code);
      sync();
      const r = runRef.current;
      if (!r.armed || r.flash || r.main >= COMBOS.length) return;
      const goal = targetOf(r.main, r.alt);
      const now = goal.filter((code) => heldRef.current.has(code));
      if (now.length > bestRef.current.length) bestRef.current = now;
      if (now.length === goal.length) {
        runRef.current = { ...r, flash: true };
        setRun((prev) => ({ ...prev, flash: true }));
        window.setTimeout(() => advance(true), 350);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (!isDrumTestKey(e.code)) return;
      e.preventDefault();
      heldRef.current.delete(e.code);
      sync();
      if (heldRef.current.size === 0 && !runRef.current.armed) setRun((prev) => ({ ...prev, armed: true }));
    };
    const clear = () => {
      heldRef.current.clear();
      sync();
      setRun((prev) => ({ ...prev, armed: true }));
    };
    const listen = (on: boolean) => {
      if (on) {
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', clear);
      } else {
        window.removeEventListener('keydown', down);
        window.removeEventListener('keyup', up);
        window.removeEventListener('blur', clear);
        clear();
      }
    };
    let listening = false;
    const toggle = () => {
      const open = !details || details.open;
      if (open !== listening) { listening = open; listen(open); }
      if (rootRef.current) rootRef.current.dataset.listening = String(open);
    };
    toggle();
    details?.addEventListener('toggle', toggle);
    return () => {
      details?.removeEventListener('toggle', toggle);
      if (listening) listen(false);
    };
  }, [advance]);

  const report = rolloverReport(run.results, typeof navigator === 'undefined' ? '' : navigator.userAgent);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rollover-tester" data-testid="rollover-tester" ref={rootRef}>
      <div className="rollover-grid" aria-label="Teclas que llegan ahora">
        {DRUM_PAD_NAMES.map((pad, column) => (
          <div className="rollover-col" key={pad}>
            <span className="rollover-pad">{pad}</span>
            {DRUM_KEY_ROWS.map((row) => (
              <span className="rollover-key" data-held={held.includes(row[column])} data-target={target.includes(row[column])} key={row[column]}>
                {keyLabel(row[column])}
              </span>
            ))}
          </div>
        ))}
      </div>

      {done ? (
        <p className="rollover-status" data-state="done">¡Terminado!</p>
      ) : (
        <div className="rollover-step" data-testid="rollover-step" data-target={target.join(',')}>
          <p className="rollover-progress">
            Prueba {run.main + 1} de {COMBOS.length}
            {run.alt >= 0 ? ` · otra fila ${run.alt + 1} de ${alternatives.length}` : ''}
          </p>
          <p className="rollover-status" data-state={run.flash ? 'ok' : run.armed ? 'wait' : 'release'}>
            {run.flash ? '✔ ¡Llegan todas!' : run.armed ? `Mantén ${comboLabel(target)}` : 'Suelta todas las teclas'}
          </p>
          <button type="button" className="rollover-fail" onClick={() => advance(false)} disabled={run.flash}>
            No llegan todas
          </button>
        </div>
      )}

      {run.results.length > 0 && (
        <>
          <pre className="rollover-report" data-testid="rollover-report">{report}</pre>
          <div className="rollover-actions">
            <button type="button" onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button>
            <button type="button" onClick={() => { bestRef.current = []; setCopied(false); setRun({ ...START, armed: heldRef.current.size === 0 }); }}>
              Repetir desde el principio
            </button>
          </div>
        </>
      )}

      <style>{`
        .rollover-tester {
          display: grid;
          font-size: 14px;
          gap: 10px;
          min-width: 0;
        }
        .rollover-tester p {
          margin: 0;
        }
        .rollover-grid {
          display: grid;
          gap: 4px;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          max-width: 100%;
        }
        .rollover-col {
          display: grid;
          gap: 4px;
          min-width: 0;
          text-align: center;
        }
        .rollover-pad {
          font-size: 11px;
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .rollover-key {
          border: 1px solid #3f3f46;
          border-radius: 8px;
          font-weight: 900;
          padding: 4px 0;
        }
        .rollover-key[data-target='true'] {
          border-color: #047857;
          border-width: 2px;
        }
        .rollover-key[data-held='true'] {
          background: #047857;
          color: #fff;
        }
        .rollover-step {
          display: grid;
          gap: 6px;
          justify-items: start;
        }
        .rollover-status {
          font-size: 18px;
          font-weight: 900;
        }
        .rollover-status[data-state='ok'] {
          color: #047857;
        }
        .rollover-report {
          font-size: 12px;
          margin: 0;
          max-width: 100%;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }
        .rollover-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .rollover-tester button {
          border: 1px solid #047857;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 800;
          padding: 6px 14px;
        }
      `}</style>
    </div>
  );
}
