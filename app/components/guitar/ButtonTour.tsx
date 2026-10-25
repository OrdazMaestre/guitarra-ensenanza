'use client';
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Tutorial de botones (petición del usuario): recorre, uno a uno, los botones de una barra o panel
// (barra MIDI del mástil, del teclado, panel de partida del juego). Resalta cada botón, oscurece el
// resto y explica en un globo, con frases cortas para niños, para qué sirve. Solo ENSEÑA: mientras
// está abierto, los clics fuera del globo no llegan a la página. Los pasos cuyo botón no se ve en
// este momento (p. ej. KEYBOARD en pantallas táctiles) se saltan.
//
// Va en un portal a <body>: el modo oscuro invierte `.site-shell` con un `filter`, que además
// convertiría el `position: fixed` en relativo a esa capa.

export interface TourStep {
  title: string;
  lines: string[];
  // Busca el botón dentro de la raíz del tutorial.
  find: (root: HTMLElement) => Element | null;
}

const byLabel = (label: string) => (root: HTMLElement) => root.querySelector(`[aria-label="${label}"]`);
const anyOf = (...finders: Array<(root: HTMLElement) => Element | null>) => (root: HTMLElement) => {
  for (const find of finders) {
    const el = find(root);
    if (el) return el;
  }
  return null;
};
const metronome = anyOf(byLabel('Activar metrónomo'), byLabel('Desactivar metrónomo'));
const keyboardToggle = (root: HTMLElement) => root.querySelector('.midi-kb-toggle');

export const FRETBOARD_TOUR: TourStep[] = [
  { title: 'JUGAR', lines: ['Abre el juego.', 'Las notas bajan hacia el mástil.', 'Tócalas cuando lleguen.'], find: (root) => root.querySelector('.riff-open-toggle') },
  { title: 'Diestro o zurdo', lines: ['Da la vuelta al mástil.', 'Úsalo si tocas con la otra mano.'], find: anyOf(byLabel('Cambiar a modo zurdo'), byLabel('Cambiar a modo diestro')) },
  { title: 'Afinar', lines: ['Cambia la afinación de las cuerdas.', 'Puedes elegir otras afinaciones.'], find: byLabel('Afinar el mástil') },
  { title: 'CLEAN / OVERDRIVE', lines: ['Cambia el sonido.', 'CLEAN suena limpio.', 'OVERDRIVE suena a rock.'], find: byLabel('Cambiar sonido clean u overdrive') },
  { title: 'Colores', lines: ['Pinta notas para ver dónde se repiten.'], find: anyOf(byLabel('Activar marcador de notas'), byLabel('Desactivar marcador de notas')) },
  { title: 'KEYBOARD', lines: ['Toca con el teclado del ordenador.', 'Graves y Agudas cambian la zona.'], find: keyboardToggle },
  { title: 'Metrónomo', lines: ['Marca el pulso, como un reloj.', 'Ábrelo para cambiar la velocidad.'], find: metronome },
];

export const KEYBOARD_TOUR: TourStep[] = [
  { title: 'KEYBOARD', lines: ['Toca el piano con el teclado del ordenador.', 'Hay dos filas: graves y agudos.'], find: keyboardToggle },
  { title: 'Metrónomo', lines: ['Marca el pulso, como un reloj.', 'Ábrelo para cambiar la velocidad.'], find: metronome },
];

const ddToggle = (id: string) => (root: HTMLElement) => root.querySelector(`.riff-dd-toggle[aria-controls="riff-menu-${id}"]`);

export const RIFF_PANEL_TOUR: TourStep[] = [
  { title: 'Pista', lines: ['Elige qué guitarra tocas.', 'S es la solista.', 'R es la rítmica.'], find: ddToggle('pista') },
  { title: 'Nivel', lines: ['Hay dos modos.', 'Trastes: vale cualquier cuerda.', 'Cuerdas: la cuerda también cuenta.', 'Experto es la canción de verdad.'], find: ddToggle('nivel') },
  { title: 'Acompañamiento', lines: ['Elige qué suena contigo:', 'batería, metrónomo o nada.'], find: ddToggle('modo') },
  { title: 'Velocidad', lines: ['Más lento es más fácil.', 'Empieza al 75 %.'], find: ddToggle('velocidad') },
  { title: 'Ritmo', lines: ['Con ritmo: la canción no espera.', 'Paso a paso: espera a que toques.'], find: ddToggle('ritmo') },
  { title: 'Compases y bucle', lines: ['Elige qué trozo tocar.', 'Puedes repetirlo en bucle.'], find: ddToggle('compases') },
  // Último paso: el botón principal lanza la partida tutorial de mecánicas (`finish` de TutorialButton).
  { title: 'Partida de prueba', lines: ['Aprende tres trucos jugando:', 'mantener pulsado, tapping y deslizar.'], find: (root) => root.querySelector('.tour-launch') },
];

const PAD = 6;
const BUBBLE_WIDTH = 300;

function visible(el: Element | null): el is Element {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// Acción final opcional: en el último paso, el botón principal la lanza (y cierra el recorrido).
export interface TourFinish {
  label: string;
  run: () => void;
}

interface TourProps {
  finish?: TourFinish;
  onClose: () => void;
  rootRef: RefObject<HTMLElement | null>;
  steps: TourStep[];
}

// `steps`: ya filtrados a los que se ven (ver TutorialButton).
export function ButtonTour({ finish, onClose, rootRef, steps: shown }: TourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = shown[index];

  // El botón del paso, a la vista; y su rectángulo, seguido en cada frame (scroll, cambios...).
  useLayoutEffect(() => {
    const root = rootRef.current;
    const target = root && step ? step.find(root) : null;
    if (!target) return;
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    let raf = 0;
    const follow = () => {
      const next = target.getBoundingClientRect();
      // Solo re-render si se ha movido.
      setRect((prev) => (prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next));
      raf = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(raf);
  }, [rootRef, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(shown.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, shown.length]);

  useEffect(() => {
    if (shown.length === 0) onClose();
  }, [onClose, shown.length]);

  if (!step || !rect || typeof document === 'undefined') return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(BUBBLE_WIDTH, vw - 32);
  const left = Math.min(vw - 16 - width, Math.max(16, rect.left + rect.width / 2 - width / 2));
  // Debajo del botón si cabe; si no, encima.
  const below = rect.bottom + PAD + 190 < vh;
  const last = index === shown.length - 1;

  return createPortal(
    <div className="tour-layer">
      <TourStyles />
      <div className="tour-blocker" />
      <div
        className="tour-highlight"
        style={{ height: rect.height + PAD * 2, left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2 }}
      />
      <div
        aria-label={`Tutorial: ${step.title}`}
        aria-modal="true"
        className="tour-bubble"
        role="dialog"
        style={below ? { left, top: rect.bottom + PAD + 10, width } : { bottom: vh - rect.top + PAD + 10, left, width }}
      >
        <h3 className="tour-title">{step.title}</h3>
        {step.lines.map((line) => <p className="tour-line" key={line}>{line}</p>)}
        <div className="tour-nav">
          <button className="tour-btn" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} type="button">Atrás</button>
          {last && finish && <button className="tour-btn" onClick={onClose} type="button">Ahora no</button>}
          <button
            className="tour-btn tour-btn-main"
            onClick={() => {
              if (!last) {
                setIndex((i) => i + 1);
                return;
              }
              onClose();
              finish?.run();
            }}
            type="button"
          >
            {last ? finish?.label ?? '¡Listo!' : 'Siguiente'}
          </button>
        </div>
        <button aria-label="Cerrar el tutorial" className="tour-close" onClick={onClose} type="button">✕</button>
      </div>
    </div>,
    document.body,
  );
}

interface ButtonProps {
  finish?: TourFinish;
  // Antes de abrir (p. ej. el juego vuelve a su configuración de base).
  onStart?: () => void;
  rootRef: RefObject<HTMLElement | null>;
  steps: TourStep[];
  className?: string;
}

// Botón "Tutorial" que abre el recorrido.
export function TutorialButton({ className, finish, onStart, rootRef, steps }: ButtonProps) {
  // Pasos del recorrido abierto: solo los botones que se ven al pulsar "Tutorial".
  const [shown, setShown] = useState<TourStep[] | null>(null);
  return (
    <>
      <TourStyles />
      <button
        className={`tour-launch${className ? ` ${className}` : ''}`}
        onClick={() => {
          onStart?.();
          const root = rootRef.current;
          setShown(root ? steps.filter((step) => visible(step.find(root))) : []);
        }}
        type="button"
      >
        Tutorial
      </button>
      {shown && <ButtonTour finish={finish} onClose={() => setShown(null)} rootRef={rootRef} steps={shown} />}
    </>
  );
}

// Botón "Tutorial" de un instrumento MIDI, en su propia fila arriba a la derecha (todos los
// instrumentos de la web lo llevan, petición del usuario). Va DENTRO de su `.midi-instrument-host`
// (primer hijo) y recorre los botones de ese instrumento; los pasos cuyo botón no tiene ese
// instrumento se saltan solos (ver TutorialButton).
export function InstrumentTutorial({ steps }: { steps: TourStep[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const rootRef = useMemo<RefObject<HTMLElement | null>>(() => ({
    get current() {
      return rowRef.current?.closest<HTMLElement>('.midi-instrument-host') ?? null;
    },
  }), []);
  return (
    <div className="instrument-tutorial-row" ref={rowRef}>
      <TutorialButton rootRef={rootRef} steps={steps} />
    </div>
  );
}

function TourStyles() {
  return (
    <style>{`
      .tour-launch {
        align-items: center;
        background: #ffffff;
        border: 1.5px solid #047857;
        border-radius: 999px;
        color: #047857;
        cursor: pointer;
        display: inline-flex;
        font-size: 13px;
        font-weight: 900;
        line-height: 1.3;
        padding: 4px 14px;
        position: relative;
      }

      /* Brillo que late (petición del usuario): verde; en modo oscuro, amarillo. El modo oscuro
         invierte toda la web con un filtro (invert + hue-rotate) y por ese camino ningún color sale
         amarillo intenso: rgb(144, 105, 0) es el que, ya invertido, se ve más amarillo (dorado,
         ~rgb(188, 149, 44)). Va en su propia capa (::before) para no tocar el botón. */
      .tour-launch::before {
        animation: tour-launch-glow 2s ease-in-out infinite;
        border-radius: inherit;
        content: '';
        inset: 0;
        pointer-events: none;
        position: absolute;
        --tour-glow: rgba(16, 185, 129, 0.8);
      }

      html[data-theme='dark'] .tour-launch::before {
        --tour-glow: rgb(144, 105, 0);
      }

      @keyframes tour-launch-glow {
        0%, 100% { box-shadow: 0 0 2px 0 var(--tour-glow); }
        50% { box-shadow: 0 0 14px 4px var(--tour-glow); }
      }

      @media (prefers-reduced-motion: reduce) {
        .tour-launch::before {
          animation: none;
          box-shadow: 0 0 10px 3px var(--tour-glow);
        }
      }

      .instrument-tutorial-row {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 8px;
      }

      .tour-layer {
        inset: 0;
        position: fixed;
        z-index: 1000;
      }

      .tour-blocker {
        inset: 0;
        position: fixed;
      }

      .tour-highlight {
        border: 3px solid #facc15;
        border-radius: 10px;
        box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.55), 0 0 18px rgba(250, 204, 21, 0.9);
        pointer-events: none;
        position: fixed;
      }

      .tour-bubble {
        background: #ffffff;
        border: 2px solid #047857;
        border-radius: 14px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
        box-sizing: border-box;
        color: #111827;
        padding: 14px 16px 12px;
        position: fixed;
      }

      .tour-title {
        font-size: 19px;
        font-weight: 950;
        margin: 0 0 6px;
        padding-right: 24px;
      }

      .tour-line {
        font-size: 16px;
        font-weight: 600;
        line-height: 1.4;
        margin: 0;
      }

      .tour-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 12px;
      }

      .tour-btn {
        background: #ffffff;
        border: 2px solid #047857;
        border-radius: 999px;
        color: #047857;
        cursor: pointer;
        font-size: 14px;
        font-weight: 900;
        min-height: 40px;
        padding: 6px 14px;
        white-space: nowrap;
      }

      .tour-btn:disabled {
        border-color: #d1d5db;
        color: #9ca3af;
        cursor: default;
      }

      .tour-btn-main {
        background: #047857;
        color: #ffffff;
      }

      .tour-close {
        background: transparent;
        border: 0;
        color: #6b7280;
        cursor: pointer;
        font-size: 18px;
        height: 36px;
        position: absolute;
        right: 6px;
        top: 6px;
        width: 36px;
      }
    `}</style>
  );
}
