import Link from 'next/link';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

type Marker = {
  finger: string;
  fret: number;
  string: number;
};

type Chord = {
  barre?: {
    fret: number;
    from: number;
    label: string;
    to: number;
  };
  english: string;
  markers: Marker[];
  muted?: number[];
  open?: number[];
  spanish: string;
};

type PowerChordShape = {
  name: string;
  notes: {
    fret: number;
    label: string;
    string: number;
  }[];
  rootLabel: string;
};

const majorChords: Chord[] = [
  { spanish: 'DO', english: 'C', markers: [{ string: 5, fret: 3, finger: '3' }, { string: 4, fret: 2, finger: '2' }, { string: 2, fret: 1, finger: '1' }], muted: [6], open: [3, 1] },
  { spanish: 'RE', english: 'D', markers: [{ string: 3, fret: 2, finger: '1' }, { string: 2, fret: 3, finger: '3' }, { string: 1, fret: 2, finger: '2' }], muted: [6, 5], open: [4] },
  { spanish: 'MI', english: 'E', markers: [{ string: 5, fret: 2, finger: '2' }, { string: 4, fret: 2, finger: '3' }, { string: 3, fret: 1, finger: '1' }], open: [6, 2, 1] },
  { spanish: 'FA', english: 'F', barre: { fret: 1, from: 6, to: 1, label: '1' }, markers: [{ string: 5, fret: 3, finger: '3' }, { string: 4, fret: 3, finger: '4' }, { string: 3, fret: 2, finger: '2' }] },
  { spanish: 'SOL', english: 'G', markers: [{ string: 6, fret: 3, finger: '2' }, { string: 5, fret: 2, finger: '1' }, { string: 1, fret: 3, finger: '3' }], open: [4, 3, 2] },
  { spanish: 'LA', english: 'A', markers: [{ string: 4, fret: 2, finger: '1' }, { string: 3, fret: 2, finger: '2' }, { string: 2, fret: 2, finger: '3' }], muted: [6], open: [5, 1] },
  { spanish: 'SI', english: 'B', barre: { fret: 2, from: 5, to: 1, label: '1' }, markers: [{ string: 4, fret: 4, finger: '2' }, { string: 3, fret: 4, finger: '3' }, { string: 2, fret: 4, finger: '4' }], muted: [6] },
];

const minorChords: Chord[] = [
  { spanish: 'DOm', english: 'Cm', barre: { fret: 3, from: 5, to: 1, label: '1' }, markers: [{ string: 4, fret: 5, finger: '3' }, { string: 3, fret: 5, finger: '4' }, { string: 2, fret: 4, finger: '2' }], muted: [6] },
  { spanish: 'REm', english: 'Dm', markers: [{ string: 3, fret: 2, finger: '2' }, { string: 2, fret: 3, finger: '3' }, { string: 1, fret: 1, finger: '1' }], muted: [6, 5], open: [4] },
  { spanish: 'MIm', english: 'Em', markers: [{ string: 5, fret: 2, finger: '2' }, { string: 4, fret: 2, finger: '3' }], open: [6, 3, 2, 1] },
  { spanish: 'FAm', english: 'Fm', barre: { fret: 1, from: 6, to: 1, label: '1' }, markers: [{ string: 5, fret: 3, finger: '3' }, { string: 4, fret: 3, finger: '4' }] },
  { spanish: 'SOLm', english: 'Gm', barre: { fret: 3, from: 6, to: 1, label: '1' }, markers: [{ string: 5, fret: 5, finger: '3' }, { string: 4, fret: 5, finger: '4' }] },
  { spanish: 'LAm', english: 'Am', markers: [{ string: 4, fret: 2, finger: '2' }, { string: 3, fret: 2, finger: '3' }, { string: 2, fret: 1, finger: '1' }], muted: [6], open: [5, 1] },
  { spanish: 'SIm', english: 'Bm', barre: { fret: 2, from: 5, to: 1, label: '1' }, markers: [{ string: 4, fret: 4, finger: '3' }, { string: 3, fret: 4, finger: '4' }, { string: 2, fret: 3, finger: '2' }], muted: [6] },
];

const stringX = (stringNumber: number) => 18 + (6 - stringNumber) * 20;
const fretY = (fret: number) => 22 + (fret - 0.5) * 19;
const powerFretY = (fret: number) => 24 + (fret - 0.5) * 19;

const powerChordShapes: PowerChordShape[] = [
  {
    name: 'E5',
    rootLabel: 'MI5',
    notes: [
      { label: 'T', string: 6, fret: 0 },
      { label: '5', string: 5, fret: 2 },
      { label: '8', string: 4, fret: 2 },
    ],
  },
  {
    name: 'F5',
    rootLabel: 'FA5',
    notes: [
      { label: 'T', string: 6, fret: 1 },
      { label: '5', string: 5, fret: 3 },
      { label: '8', string: 4, fret: 3 },
    ],
  },
  {
    name: 'A5',
    rootLabel: 'LA5',
    notes: [
      { label: 'T', string: 5, fret: 0 },
      { label: '5', string: 4, fret: 2 },
      { label: '8', string: 3, fret: 2 },
    ],
  },
  {
    name: 'B5',
    rootLabel: 'SI5',
    notes: [
      { label: 'T', string: 5, fret: 2 },
      { label: '5', string: 4, fret: 4 },
      { label: '8', string: 3, fret: 4 },
    ],
  },
];

function spanishChordLabel(chord: Chord) {
  const isMinor = chord.english.endsWith('m');
  const spanishRoot = isMinor ? chord.spanish.slice(0, -1) : chord.spanish;

  return `${spanishRoot} ${isMinor ? 'menor' : 'Mayor'}`;
}

function ChordDiagram({ chord }: { chord: Chord }) {
  return (
    <figure className="chord-card">
      <figcaption>
        <span className="primary-chord-name">{chord.english}</span> <span className="local-chord-name">({spanishChordLabel(chord)})</span>
      </figcaption>
      <svg className="chord-diagram" viewBox="0 0 136 124" role="img" aria-label={`Acorde ${chord.english} ${spanishChordLabel(chord)}`}>
        <line className="nut" x1="18" x2="118" y1="22" y2="22" />
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <line className="string-line" key={`string-${index}`} x1={18 + index * 20} x2={18 + index * 20} y1="22" y2="98" />
        ))}
        {[1, 2, 3, 4].map((index) => (
          <line className="fret-line" key={`fret-${index}`} x1="18" x2="118" y1={22 + index * 19} y2={22 + index * 19} />
        ))}
        {(chord.open ?? []).map((string) => (
          <circle className="open-marker" key={`open-${string}`} cx={stringX(string)} cy="14" r="4.5" />
        ))}
        {(chord.muted ?? []).map((string) => (
          <text className="muted-marker" key={`muted-${string}`} x={stringX(string)} y="15">
            x
          </text>
        ))}
        {chord.barre ? (
          <g>
            <rect
              className="barre"
              height="14"
              rx="7"
              width={Math.abs(stringX(chord.barre.to) - stringX(chord.barre.from)) + 16}
              x={Math.min(stringX(chord.barre.from), stringX(chord.barre.to)) - 8}
              y={fretY(chord.barre.fret) - 7}
            />
            <text className="finger-label" x={(stringX(chord.barre.from) + stringX(chord.barre.to)) / 2} y={fretY(chord.barre.fret) + 4}>
              {chord.barre.label}
            </text>
          </g>
        ) : null}
        {chord.markers.map((marker) => (
          <g key={`${marker.string}-${marker.fret}-${marker.finger}`}>
            <circle className="finger-dot" cx={stringX(marker.string)} cy={fretY(marker.fret)} r="8" />
            <text className="finger-label" x={stringX(marker.string)} y={fretY(marker.fret) + 4}>
              {marker.finger}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

function PowerChordDiagram({ shape }: { shape: PowerChordShape }) {
  return (
    <figure className="power-card">
      <figcaption>
        <span className="primary-chord-name">{shape.name}</span> <span className="local-chord-name">({shape.rootLabel})</span>
      </figcaption>
      <svg className="power-diagram" viewBox="0 0 136 112" role="img" aria-label={`${shape.name}: tonica, quinta y octava`}>
        <line className="nut" x1="18" x2="118" y1="24" y2="24" />
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <line className="string-line" key={`power-string-${index}`} x1={18 + index * 20} x2={18 + index * 20} y1="24" y2="100" />
        ))}
        {[1, 2, 3, 4].map((index) => (
          <line className="fret-line" key={`power-fret-${index}`} x1="18" x2="118" y1={24 + index * 19} y2={24 + index * 19} />
        ))}
        {shape.notes.map((note) => (
          <g key={`${shape.name}-${note.string}-${note.fret}`}>
            <circle className={`power-dot ${note.label === 'E' ? 'power-note-e' : note.label === 'G' ? 'power-note-g' : ''} ${note.fret === 0 ? 'open-power-dot' : ''}`} cx={stringX(note.string)} cy={note.fret === 0 ? 16 : powerFretY(note.fret)} r="9" />
            <text className="power-note-label" x={stringX(note.string)} y={note.fret === 0 ? 20 : powerFretY(note.fret) + 4}>
              {note.label}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export default function AcordesPage({ previous, next }: LessonPageProps) {
  return (
    <main className="chords-page">
      <article className="chords-content">
        <header className="chords-header">
          <h1>Acordes basicos</h1>
          <div className="short-copy">
            <p>Un acorde junta varias notas al mismo tiempo.</p>
            <p>De momento usamos mayores y menores para tocar canciones sencillas.</p>
          </div>
        </header>

        <section className="finger-guide" aria-labelledby="finger-guide-title">
          <div>
            <p className="lesson-kicker">Mano izquierda</p>
            <h2 id="finger-guide-title">Los numeros son dedos</h2>
            <p>
              En los diagramas, los circulos nos dicen qué dedo colocar en cada cuerda y traste.
            </p>
          </div>
          <div className="finger-row" aria-label="Dedos de la mano izquierda">
            {['1', '2', '3', '4'].map((finger) => (
              <span key={finger}>{finger}</span>
            ))}
          </div>
        </section>

      

        <section className="chord-library" aria-labelledby="major-title">
          <header className="chord-section-header">
            <p className="lesson-kicker">Mayores</p>
            <h2 id="major-title">Acordes mayores</h2>
          </header>
          <div className="chord-grid">
            {majorChords.map((chord) => (
              <ChordDiagram chord={chord} key={chord.english} />
            ))}
          </div>
        </section>

        <section className="chord-library minor-library" aria-labelledby="minor-title">
          <header className="chord-section-header">
            <p className="lesson-kicker">Menores</p>
            <h2 id="minor-title">Acordes menores</h2>
          </header>
          <div className="chord-grid">
            {minorChords.map((chord) => (
              <ChordDiagram chord={chord} key={chord.english} />
            ))}
          </div>
        </section>

        <section className="shape-guide" aria-labelledby="shape-guide-title">
          <p className="lesson-kicker">Figuras</p>
          <h2 id="shape-guide-title">Las formas que mas vamos a usar</h2>
          <div className="shape-copy">
            <p>Las figuras de acordes que mas usaremos son <strong>E</strong>, <strong>F</strong>, <strong>G</strong>, <strong>A</strong> y <strong>B</strong>.</p>
            
            <p><strong>E</strong>, <strong>F</strong>, <strong>A</strong> y <strong>B</strong> tienen basicamente la misma forma.</p>
            
          </div>
          <div className="power-shape-grid" aria-label="E, F, A y B como power chords">
            {powerChordShapes.map((shape) => (
              <PowerChordDiagram key={shape.name} shape={shape} />
            ))}
          </div>
          
        </section>

        <section className="practice-strip" aria-label="Forma de practicar">
          <p>
            Los acordes que teneis que ir prancticándo para clase son <strong>todos los mayores</strong>, ademas de <strong>Em</strong> y <strong>Am</strong>.
          </p>
          <p>
            Mejor forma de EMPEZAR a practicar: <strong>F</strong> - acorde cualquiera - <strong>G</strong> - acorde cualquiera - <strong>F</strong> - acorde cualquiera - <strong>G</strong>... Sé que F cuesta mucho pero es muy importante, asique mejor acostumbrarse rápido 
          </p>
        </section>

        <section className="advanced-bridges" aria-labelledby="advanced-bridges-title">
          <div className="advanced-warning">
            <p id="advanced-bridges-title">Zona mas avanzada del temario.</p>
            <p>Estos enlaces sirven como puente.</p>
            <p>Si aun cuesta cambiar acordes, puedes dejarlos para mas adelante.</p>
          </div>
          <div className="advanced-link-grid">
            <Link href="/lecciones/temario/figuras-de-acordes">
              <span>Figuras de acordes</span>
              <small>Para entender como se repiten las formas por el mastil.</small>
            </Link>
            <Link href="/lecciones/temario/acordes-escala-sol-mayor">
              <span>Acordes de la escala de Sol Mayor</span>
              <small>Para ver que acordes salen de una escala concreta.</small>
            </Link>
            <Link href="/lecciones/temario/acordes-con-septima">
              <span>Acordes con septima</span>
              <small>Para ampliar los acordes con una cuarta nota.</small>
            </Link>
          </div>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .chords-page {
          box-sizing: border-box;
          background: #ffffff;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 6vw, 96px);
          width: 100%;
        }

        .chords-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1180px;
          min-width: 0;
          width: 100%;
        }

        .chords-content {
          padding-bottom: clamp(34px, 6vw, 72px);
        }

        .lesson-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.22em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .chords-header {
          margin: 0 auto clamp(40px, 7vw, 80px);
          max-width: 900px;
          text-align: center;
        }

        .chords-header h1 {
          font-size: clamp(42px, 7vw, 92px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .chords-header .short-copy p,
        .finger-guide p,
        .shape-guide p,
        .practice-strip p {
          color: #303030;
          font-size: 18px;
          line-height: 1.62;
          margin: 0;
        }

        .chords-header .short-copy {
          display: grid;
          gap: 10px;
          margin: clamp(24px, 4vw, 36px) auto 0;
          max-width: 820px;
        }

        .chords-header .short-copy p {
          font-size: clamp(19px, 2vw, 27px);
          font-weight: 650;
          line-height: 1.42;
          overflow-wrap: anywhere;
        }

        .finger-guide {
          align-items: center;
          border: 3px solid #047857;
          box-sizing: border-box;
          display: grid;
          gap: clamp(20px, 4vw, 44px);
          grid-template-columns: minmax(0, 1fr) auto;
          margin: 0 auto clamp(44px, 7vw, 76px);
          max-width: 900px;
          min-width: 0;
          padding: clamp(20px, 4vw, 34px);
        }

        .shape-guide {
          border-block: 1px solid #d4d4d8;
          box-sizing: border-box;
          display: grid;
          gap: 12px;
          margin: 0 auto clamp(44px, 7vw, 76px);
          max-width: 900px;
          min-width: 0;
          padding: clamp(24px, 4vw, 38px) 0;
          text-align: center;
        }

        .finger-guide h2,
        .shape-guide h2,
        .chord-section-header h2 {
          font-size: clamp(30px, 4.8vw, 58px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.98;
          margin: 0 0 16px;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .shape-guide h2 {
          margin-bottom: 4px;
        }

        .shape-copy {
          display: grid;
          gap: 9px;
          margin: 0 auto;
          max-width: 760px;
          min-width: 0;
        }

        .shape-copy strong {
          color: #047857;
          font-weight: 950;
        }

        .power-shape-grid {
          display: grid;
          gap: clamp(14px, 2.4vw, 22px);
          grid-template-columns: repeat(4, minmax(0, 1fr));
          margin: clamp(18px, 3vw, 28px) auto 0;
          max-width: 900px;
          min-width: 0;
          width: 100%;
        }

        .power-card {
          border: 3px solid #d4d4d8;
          box-sizing: border-box;
          display: grid;
          gap: 6px;
          justify-items: center;
          margin: 0;
          min-width: 0;
          padding: 12px 8px 10px;
        }

        .power-card figcaption {
          color: #080808;
          font-size: clamp(14px, 1.6vw, 18px);
          font-weight: 950;
          line-height: 1.1;
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .primary-chord-name {
          color: #047857;
          font-size: 1.18em;
        }

        .local-chord-name {
          color: #080808;
          font-size: 0.92em;
        }

        .power-diagram {
          display: block;
          height: auto;
          max-width: 148px;
          overflow: visible;
          width: 100%;
        }

        .power-note-label {
          dominant-baseline: middle;
          fill: #080808;
          font-size: 10px;
          font-weight: 950;
          text-anchor: middle;
        }

        .power-dot {
          fill: #f1f5f9;
          stroke: #a1a1aa;
          stroke-width: 2.5;
        }

        .power-note-e {
          stroke: #059669;
        }

        .power-note-g {
          stroke: #2563eb;
        }

        .power-legend {
          margin-top: 4px;
        }

        .finger-row {
          display: flex;
          gap: 10px;
          min-width: 0;
        }

        .finger-row span {
          align-items: center;
          background: #047857;
          border-radius: 999px;
          color: #ffffff;
          display: inline-flex;
          font-size: clamp(20px, 3vw, 34px);
          font-weight: 950;
          height: clamp(42px, 6vw, 66px);
          justify-content: center;
          width: clamp(42px, 6vw, 66px);
        }

        .chord-library {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(24px, 4vw, 42px);
          padding-top: clamp(34px, 6vw, 58px);
          text-align: center;
        }

        .minor-library {
          margin-top: clamp(44px, 8vw, 78px);
        }

        .chord-section-header {
          margin: 0 auto;
          max-width: 760px;
        }

        .chord-grid {
          display: grid;
          gap: clamp(16px, 2.4vw, 26px);
          grid-template-columns: repeat(4, minmax(0, 1fr));
          min-width: 0;
          width: 100%;
        }

        .chord-card {
          border: 3px solid #d4d4d8;
          box-sizing: border-box;
          display: grid;
          gap: 8px;
          justify-items: center;
          margin: 0;
          min-width: 0;
          padding: 14px 8px 12px;
        }

        .chord-card figcaption {
          color: #080808;
          font-size: clamp(14px, 1.7vw, 20px);
          font-weight: 950;
          line-height: 1.1;
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .chord-diagram {
          display: block;
          height: auto;
          max-width: 148px;
          overflow: visible;
          width: 100%;
        }

        .nut,
        .fret-line,
        .string-line {
          stroke: #0f4f5f;
          stroke-linecap: square;
        }

        .nut {
          stroke-width: 4;
        }

        .fret-line,
        .string-line {
          stroke-width: 2;
        }

        .finger-dot,
        .barre {
          fill: #f1f5f9;
          stroke: #047857;
          stroke-width: 2.5;
        }

        .finger-label,
        .muted-marker {
          dominant-baseline: middle;
          fill: #080808;
          font-size: 10px;
          font-weight: 950;
          text-anchor: middle;
        }

        .open-marker {
          fill: #f1f5f9;
          stroke: #047857;
          stroke-width: 2;
        }

        .muted-marker {
          fill: #047857;
          font-size: 12px;
          text-transform: uppercase;
        }

        .practice-strip {
          border-left: 5px solid #047857;
          display: grid;
          gap: 12px;
          margin: clamp(44px, 8vw, 82px) auto 0;
          max-width: 920px;
          min-width: 0;
          padding: 4px 0 4px 20px;
        }

        .practice-strip strong {
          color: #047857;
          font-weight: 950;
        }

        .advanced-bridges {
          display: grid;
          gap: clamp(16px, 3vw, 24px);
          margin: clamp(34px, 6vw, 64px) auto 0;
          max-width: 920px;
          min-width: 0;
          width: 100%;
        }

        .advanced-warning {
          background: #fef2f2;
          border: 4px solid #dc2626;
          border-radius: 10px;
          display: grid;
          gap: 10px;
          padding: clamp(18px, 3vw, 26px);
          text-align: center;
        }

        .advanced-warning p {
          color: #080808;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 800;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .advanced-warning p:first-child {
          font-weight: 950;
          text-transform: uppercase;
        }

        .advanced-link-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          min-width: 0;
        }

        .advanced-link-grid a {
          border: 2px solid #080808;
          border-radius: 8px;
          color: #080808;
          display: grid;
          gap: 8px;
          min-width: 0;
          padding: 18px;
          text-decoration: none;
        }

        .advanced-link-grid a:hover,
        .advanced-link-grid a:focus-visible {
          border-color: #047857;
          color: #047857;
        }

        .advanced-link-grid a:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }

        .advanced-link-grid span {
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 950;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }

        .advanced-link-grid small {
          color: #303030;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        @media (max-width: 980px) {
          .chord-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .chords-header,
          .shape-guide,
          .chord-library {
            text-align: left;
          }

          .finger-guide {
            grid-template-columns: 1fr;
          }

          .finger-row {
            justify-content: flex-start;
          }

          .chord-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .power-shape-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .advanced-warning {
            text-align: left;
          }

          .advanced-link-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 520px) {
          .chords-content,
          .lesson-pager-wrap {
            max-width: 300px;
          }

          .chord-grid {
            grid-template-columns: 1fr;
          }

          .chord-card {
            padding-left: 12px;
            padding-right: 12px;
          }

          .power-shape-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
