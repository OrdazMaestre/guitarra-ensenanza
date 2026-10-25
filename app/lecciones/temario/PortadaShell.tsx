'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ReducedFretboardDiagram, ReducedFretboardStyles } from '../../../components/guitar/ReducedFretboardDiagram';
import MiniKeyboard from '../../../components/guitar/MiniKeyboard';
import { TuningBoardStyles } from '../../../components/tuningGame/TuningBoard';
import { lessonBlocks } from '../temarioData';

type Instrument = 'guitarra' | 'teclado';

const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: 'guitarra', label: 'Guitarra' },
  { id: 'teclado', label: 'Teclado' },
];

// Cabecera + menús de la portada nueva. LECCIONES es un desplegable normal (se cierra al pulsar
// fuera o con Escape). MIDIS, en cambio, NO se cierra al pulsar fuera: mientras está abierto se
// ve el instrumento elegido en grande debajo de la cabecera, y el niño tiene que poder tocarlo sin
// que desaparezca. Cerrar MIDIS (su botón o Escape) quita también el instrumento.
export default function PortadaShell({ children, className }: { children: ReactNode; className: string }) {
  const [lessonsOpen, setLessonsOpen] = useState(false);
  const [midisOpen, setMidisOpen] = useState(false);
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
      } else if (midisOpen) {
        setMidisOpen(false);
        setInstrument(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lessonsOpen, midisOpen]);

  function toggleMidis() {
    if (midisOpen) setInstrument(null);
    setMidisOpen(!midisOpen);
    setLessonsOpen(false);
  }

  return (
    <div className={`portada2-page ${className}`}>
      <header className={`portada2-header${midisOpen ? ' is-midis-open' : ''}`}>
        <span className="portada2-brand">
          {/* Logo oficial: el mismo icono de la web (favicon / android-chrome / apple-icon). */}
          <Image
            src="/android-chrome-192x192.png"
            alt=""
            width={192}
            height={192}
            className="portada2-logo"
          />
          <span className="portada2-brand-name">Guitarra desde cero</span>
        </span>

        <nav aria-label="Menú principal" className="portada2-nav">
          <div className="portada2-menu" ref={lessonsRef}>
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
                {lessonBlocks.map((lesson) => (
                  <li key={lesson.slug}>
                    <Link href={`/lecciones/temario/${lesson.slug}`} className="portada2-nav-link">
                      <span className="portada2-lesson-number">{lesson.number}</span>
                      {lesson.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            className="portada2-nav-button"
            aria-expanded={midisOpen}
            aria-controls="portada2-midis"
            onClick={toggleMidis}
          >
            Midis
            <Chevron open={midisOpen} />
          </button>
          {midisOpen && (
            <div id="portada2-midis" className="portada2-midi-options" role="group" aria-label="Instrumentos MIDI">
              {INSTRUMENTS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="portada2-midi-option"
                  aria-pressed={instrument === option.id}
                  onClick={() => setInstrument(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="portada2-nav-button"
            onClick={() => window.dispatchEvent(new CustomEvent('mixing-console:open'))}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M9 3v12.3A3.5 3.5 0 1 0 11 18.5V8h8v5.3a3.5 3.5 0 1 0 2 3.2V3H9Z" />
            </svg>
            Música
          </button>
        </nav>
      </header>

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
