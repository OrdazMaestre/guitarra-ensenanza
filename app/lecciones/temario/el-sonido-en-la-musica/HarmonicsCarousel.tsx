'use client';
import { useState } from 'react';
import StringHarmonics from './StringHarmonics';

// ── Posiciones de armónicos naturales en el mástil ─────────────────────────
const HARM_FRETS = [
  { fret: 2,  roman: 'II',   desc: 'muy agudo',   color: '#D85A30', fraction: '≈⅑' },
  { fret: 5,  roman: 'V',    desc: '2 octavas',   color: '#7F77DD', fraction: '¼' },
  { fret: 7,  roman: 'VII',  desc: 'oct. + 5ª',   color: '#1D9E75', fraction: '⅓' },
  { fret: 12, roman: 'XII',  desc: '1 octava',    color: '#D4537E', fraction: '½' },
];

// ── Constantes SVG del mástil ───────────────────────────────────────────────
const NUT_X = 55;
const END_X = 650;
const BW = END_X - NUT_X;           // ancho del mástil
const FRETS = 13;                   // 13 líneas → el XII queda dentro del tablero
const FS = BW / FRETS;              // espacio por traste ≈ 45.8 px
const SY = [28, 50, 72, 94, 116, 138]; // y de cada cuerda (E2 → E4)
const BTOP = SY[0] - 10;
const BBOT = SY[SY.length - 1] + 10;
const LBL_Y = BBOT + 24;
const NOTE_Y = BBOT + 42;
const SVG_H = NOTE_Y + 16;
const STRING_W = [2.2, 1.9, 1.6, 1.3, 1.0, 0.7];

// Centro del hueco antes de un traste (para los inlays estándar)
function slotCx(fret: number) { return NUT_X + (fret - 0.5) * FS; }
// Línea del traste (posición real del armónico)
function fretX(fret: number)  { return NUT_X + fret * FS; }

function GuitarHarmonicsMap() {
  const midY = (BTOP + BBOT) / 2;

  return (
    <svg
      viewBox={`0 0 700 ${SVG_H}`}
      role="img"
      aria-label="Mástil de guitarra con los trastes II, V, VII y XII marcados como posiciones de armónicos naturales"
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {/* Madera del mástil */}
      <rect x={NUT_X} y={BTOP} width={BW} height={BBOT - BTOP} fill="#c8a45a" rx={3} />

      {/* Líneas de traste */}
      {Array.from({ length: FRETS + 1 }, (_, i) => i).map(f => (
        <line
          key={f}
          x1={NUT_X + f * FS} y1={BTOP}
          x2={NUT_X + f * FS} y2={BBOT}
          stroke="#9a7035" strokeWidth={1.5}
        />
      ))}

      {/* Puntos de posición estándar (inlays) */}
      {[3, 5, 7, 9, 12].map(f => {
        const x = slotCx(f);
        return f === 12 ? (
          <g key={f}>
            <circle cx={x} cy={midY - 12} r={5} fill="rgba(255,255,255,0.25)" />
            <circle cx={x} cy={midY + 12} r={5} fill="rgba(255,255,255,0.25)" />
          </g>
        ) : (
          <circle key={f} cx={x} cy={midY} r={5} fill="rgba(255,255,255,0.25)" />
        );
      })}

      {/* Cuerdas */}
      {SY.map((y, i) => (
        <line key={i} x1={NUT_X} y1={y} x2={END_X} y2={y}
          stroke="#aaa" strokeWidth={STRING_W[i]} />
      ))}

      {/* Cejilla */}
      <rect x={NUT_X - 2} y={BTOP} width={6} height={BBOT - BTOP} fill="#2a2a2a" />

      {/* Columna resaltada centrada en la línea del traste */}
      {HARM_FRETS.map(({ fret, color }) => (
        <rect key={fret}
          x={fretX(fret) - 14} y={BTOP}
          width={28} height={BBOT - BTOP}
          fill={color} opacity={0.18} rx={3}
        />
      ))}

      {/* Círculos de armónico sobre la línea del traste */}
      {HARM_FRETS.map(({ fret, color }) =>
        SY.map((y, si) => (
          <circle key={`${fret}-${si}`}
            cx={fretX(fret)} cy={y}
            r={8}
            fill={color} stroke="white" strokeWidth={1.5}
          />
        ))
      )}

      {/* Etiquetas romanas debajo del mástil */}
      {HARM_FRETS.map(({ fret, roman, color }) => (
        <text key={fret} x={fretX(fret)} y={LBL_Y}
          textAnchor="middle" fontSize={12} fontWeight="800" fill={color}
        >
          {roman}
        </text>
      ))}

      {/* Descripción del armónico */}
      {HARM_FRETS.map(({ fret, desc, color }) => (
        <text key={fret} x={fretX(fret)} y={NOTE_Y}
          textAnchor="middle" fontSize={10} fontWeight="700" fill={color}
        >
          {desc}
        </text>
      ))}
    </svg>
  );
}

// ── Carrusel ────────────────────────────────────────────────────────────────
export default function HarmonicsCarousel() {
  const [slide, setSlide] = useState(0);

  return (
    <div className="hmc">
      {/* Barra de navegación */}
      <div className="hmc-bar">
        <button
          onClick={() => setSlide(s => (s - 1 + 2) % 2)}
          className="hmc-nav"
          aria-label="Sección anterior"
        >←</button>
        <div className="hmc-info">
          <span className="hmc-title">
            {slide === 0 ? 'Serie armónica' : 'En la guitarra'}
          </span>
          <span className="hmc-pager">{slide + 1} / 2</span>
        </div>
        <button
          onClick={() => setSlide(s => (s + 1) % 2)}
          className="hmc-nav"
          aria-label="Sección siguiente"
        >→</button>
      </div>

      {/* Cuerpo de dos columnas */}
      <div className="hmc-body">
        {/* Columna de figura (izquierda, más ancha) */}
        <figure className="hmc-figure">
          {slide === 0 ? (
            <>
              <figcaption>Serie armónica de una cuerda vibrante</figcaption>
              <StringHarmonics />
            </>
          ) : (
            <>
              <figcaption>Dónde rozar para sacar armónicos</figcaption>
              <GuitarHarmonicsMap />
              <div className="hmc-legend">
                {HARM_FRETS.map(({ roman, desc, color, fraction }) => (
                  <div key={roman} className="hmc-leg-row">
                    <span className="hmc-leg-dot" style={{ background: color }} />
                    <strong style={{ color }}>Traste {roman}</strong>
                    <span className="hmc-leg-desc">{desc} ({fraction} de cuerda)</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </figure>

        {/* Columna de texto (derecha, más estrecha) */}
        <div className="hmc-copy">
          <p className="hmc-kicker">Idea 2</p>
          {slide === 0 ? (
            <>
              <h2>Serie armónica</h2>
              <p>
                Si una nota tiene una frecuencia fundamental, también aparecen vibraciones relacionadas: el doble, el triple, el cuádruple...
              </p>
              <p>
                No todas suenan igual de fuertes y eso hace que cada instrumento suene como suene, porque combinan sus armónicos de formas distintas.
              </p>
            </>
          ) : (
            <>
              <h2>En la guitarra</h2>
              <p>
                En una guitarra, los armónicos de la serie se pueden sacar de verdad.
              </p>
              <p>
                Solo hay que rozar la cuerda suavemente justo encima del sitio y pulsarla. </p>
              <p>Aquí sí ponemos el dedo sobre el traste y no sobre la celda.
              </p>
              <p>
                Hay muchos más armónicos para sacar en la guitarra pero los del dibujo tienen la posicion más fácil de sacar.
              </p>
            </>
          )}
        </div>
      </div>

      <style>{`
        .hmc {
          display: grid;
          gap: 16px;
          margin-top: clamp(44px, 8vw, 92px);
        }

        /* ── Barra de navegación ── */
        .hmc-bar {
          align-items: center;
          background: #ffffff;
          border: 1px solid #d4d4d8;
          border-radius: 8px;
          box-shadow: 0 1px 6px rgba(0,0,0,0.07);
          display: flex;
          gap: 6px;
          padding: 8px 10px;
        }
        .hmc-info {
          align-items: center;
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          overflow: hidden;
        }
        .hmc-title {
          color: #222222;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          overflow: hidden;
          text-align: center;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
          width: 100%;
        }
        .hmc-pager {
          color: #666666;
          font-size: 11px;
          font-weight: 600;
        }
        .hmc-nav {
          background: #f0f0f0;
          border: 1px solid #cccccc;
          border-radius: 6px;
          color: #222222;
          cursor: pointer;
          flex-shrink: 0;
          font-size: 16px;
          line-height: 1;
          padding: 6px 10px;
          transition: background 0.12s;
        }
        .hmc-nav:hover { background: #e0e0e0; }

        /* ── Cuerpo de dos columnas ── */
        .hmc-body {
          align-items: center;
          display: grid;
          gap: clamp(28px, 5vw, 64px);
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.74fr);
        }

        /* ── Figura ── */
        .hmc-figure {
          border: 1px solid #d4d4d8;
          display: grid;
          gap: 14px;
          margin: 0;
          min-width: 0;
          padding: clamp(16px, 3vw, 28px);
        }
        .hmc-figure figcaption {
          color: #18181b;
          font-size: 14px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-align: center;
          text-transform: uppercase;
        }

        /* ── Leyenda del mástil ── */
        .hmc-legend {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .hmc-leg-row {
          align-items: center;
          display: flex;
          font-size: 13px;
          gap: 8px;
        }
        .hmc-leg-dot {
          border-radius: 50%;
          flex-shrink: 0;
          height: 10px;
          width: 10px;
        }
        .hmc-leg-row strong { font-weight: 800; min-width: 76px; }
        .hmc-leg-desc { color: #71717a; font-size: 12px; }

        /* ── Texto ── */
        .hmc-copy {
          display: grid;
          gap: 16px;
          min-width: 0;
        }
        .hmc-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.2em;
          margin: 0;
          text-transform: uppercase;
        }
        .hmc-copy h2 {
          font-size: clamp(32px, 4vw, 58px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0 0 4px;
        }
        .hmc-copy p {
          color: #303030;
          font-size: 18px;
          line-height: 1.62;
          margin: 0;
        }

        /* ── Mobile ── */
        @media (max-width: 820px) {
          .hmc-body {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
