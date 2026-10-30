'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import SiteSearch from '../../components/siteNav/SiteSearch';
import TreeButton from '../../components/siteNav/TreeButton';
import { ReducedFretboardDiagram, ReducedFretboardStyles } from '../../components/guitar/ReducedFretboardDiagram';
import MiniKeyboard from '../../components/guitar/MiniKeyboard';
import { TuningBoardStyles } from '../../components/tuningGame/TuningBoard';
import type { SiteSearchEntry } from '../../lib/siteSearchIndex';
import { lessonBlocks } from './temarioData';

type Instrument = 'guitarra' | 'teclado';

const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: 'guitarra', label: 'Guitarra' },
  { id: 'teclado', label: 'Teclado' },
];

// Cabecera + menús de la portada. Pantalla ancha: MÚSICA a la izquierda, botón del árbol +
// buscador en el centro (como la barra superior del resto de páginas, SiteTopBar) e INSTRUMENTOS a
// la derecha; debajo, las lecciones en UNA fila que se desplaza con flechitas. Pantalla estrecha
// (≤980px, CSS de page.tsx): buscador arriba y debajo LECCIONES · MÚSICA · INSTRUMENTOS, con las
// lecciones agrupadas en el desplegable. LECCIONES se cierra al pulsar fuera o con Escape.
// INSTRUMENTOS, en cambio, NO se cierra al pulsar fuera: mientras está abierto se ve el instrumento
// elegido en grande, y el niño tiene que poder tocarlo sin que desaparezca. Cerrarlo (su botón o
// Escape) quita también el instrumento.
export default function PortadaShell({
  children,
  className,
  entries,
}: {
  children: ReactNode;
  className: string;
  entries: SiteSearchEntry[];
}) {
  const [lessonsOpen, setLessonsOpen] = useState(false);
  const [instrumentsOpen, setInstrumentsOpen] = useState(false);
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const lessonsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lessonsOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (lessonsRef.current && !lessonsRef.current.contains(e.target as Node)) setLessonsOpen(false);
    }
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [lessonsOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (lessonsOpen) {
        setLessonsOpen(false);
      } else if (instrumentsOpen) {
        setInstrumentsOpen(false);
        setInstrument(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lessonsOpen, instrumentsOpen]);

  function toggleInstruments() {
    if (instrumentsOpen) setInstrument(null);
    setInstrumentsOpen(!instrumentsOpen);
    setLessonsOpen(false);
  }

  const lessonLinks = lessonBlocks.map((lesson) => (
    <li key={lesson.slug}>
      <Link href={`/lecciones/temario/${lesson.slug}`} className="portada2-nav-link">
        <span className="portada2-lesson-number">{lesson.number}</span>
        {lesson.title}
      </Link>
    </li>
  ));

  return (
    <div className={`portada2-page ${className}`}>
      <header className={`portada2-header${instrumentsOpen ? ' is-instruments-open' : ''}`}>
        <div className="portada2-tools">
          <TreeButton />
          <SiteSearch entries={entries} />
        </div>

        {/* En pantalla ancha este <nav> es display: contents y sus hijos se colocan en la rejilla de
            la cabecera (MÚSICA a la izquierda, INSTRUMENTOS a la derecha); en estrecha es la fila de
            debajo del buscador, en este orden del DOM: LECCIONES, MÚSICA, INSTRUMENTOS. */}
        <nav aria-label="Menú principal" className="portada2-nav">
          <div className="portada2-menu portada2-menu-lessons" ref={lessonsRef}>
            <button
              type="button"
              className="portada2-nav-button"
              aria-expanded={lessonsOpen}
              aria-controls="portada2-lessons"
              onClick={() => setLessonsOpen(!lessonsOpen)}
            >
              Lecciones
              <Chevron open={lessonsOpen} />
            </button>
            {lessonsOpen && (
              <ul id="portada2-lessons" className="portada2-dropdown">
                {lessonLinks}
              </ul>
            )}
          </div>

          <button
            type="button"
            className="portada2-nav-button portada2-music"
            onClick={() => window.dispatchEvent(new CustomEvent('mixing-console:open'))}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M9 3v12.3A3.5 3.5 0 1 0 11 18.5V8h8v5.3a3.5 3.5 0 1 0 2 3.2V3H9Z" />
            </svg>
            Música
          </button>

          <div className="portada2-menu portada2-menu-instruments">
            <button
              type="button"
              className="portada2-nav-button"
              aria-expanded={instrumentsOpen}
              aria-controls="portada2-instrumentos"
              onClick={toggleInstruments}
            >
              Instrumentos
              <Chevron open={instrumentsOpen} />
            </button>
            {instrumentsOpen && (
              <div id="portada2-instrumentos" className="portada2-instrument-options" role="group" aria-label="Elige instrumento">
                {INSTRUMENTS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="portada2-instrument-option"
                    aria-pressed={instrument === option.id}
                    onClick={() => setInstrument(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>
      </header>

      <LessonsRow>{lessonLinks}</LessonsRow>

      {instrument && (
        <section className="portada2-instrument" aria-label={instrument === 'guitarra' ? 'Guitarra' : 'Teclado'}>
          <h2>{instrument === 'guitarra' ? 'Guitarra' : 'Teclado'}</h2>
          {instrument === 'guitarra' ? (
            <ReducedFretboardDiagram
              allowLeftHanded
              allowOverdrive
              allowTuning
              ariaLabel="Mástil de guitarra interactivo del 0 al 12"
              startFret={0}
              endFret={12}
              fretLabels
              notes={[]}
            />
          ) : (
            <MiniKeyboard className="portada2-keyboard" />
          )}
        </section>
      )}

      {children}

      <ReducedFretboardStyles />
      <TuningBoardStyles />
    </div>
  );
}

// Las lecciones en UNA sola fila (solo pantalla ancha; en estrecha el CSS la oculta y quedan en el
// desplegable LECCIONES). Se desplaza con flechitas a los lados, sin barra de desplazamiento; cada
// flecha solo se ve cuando de verdad hay algo más hacia ese lado. El hueco de la flecha oculta se
// conserva (visibility) para que la fila no salte de sitio al aparecer o desaparecer.
function LessonsRow({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setCanLeft(el.scrollLeft > 1);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    el.addEventListener('scroll', update, { passive: true });
    // Las tipografías de next/font pueden llegar después del primer pintado y cambiar anchos.
    document.fonts?.ready.then(update);
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  function scrollBy(direction: 1 | -1) {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  return (
    <div className="portada2-lessons">
      <button
        type="button"
        className={`portada2-lessons-arrow${canLeft ? '' : ' is-hidden'}`}
        aria-label="Ver lecciones anteriores"
        disabled={!canLeft}
        onClick={() => scrollBy(-1)}
      >
        <ArrowIcon direction="left" />
      </button>
      <div className="portada2-lessons-scroll" ref={scrollRef}>
        <ul className="portada2-lessons-row" aria-label="Lecciones principales">
          {children}
        </ul>
      </div>
      <button
        type="button"
        className={`portada2-lessons-arrow${canRight ? '' : ' is-hidden'}`}
        aria-label="Ver más lecciones"
        disabled={!canRight}
        onClick={() => scrollBy(1)}
      >
        <ArrowIcon direction="right" />
      </button>
    </div>
  );
}

function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === 'left' ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6 4.5 9.5'} />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="portada2-chevron"
      viewBox="0 0 12 12"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : undefined }}
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" />
    </svg>
  );
}
