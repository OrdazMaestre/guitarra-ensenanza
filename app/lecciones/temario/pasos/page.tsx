import Link from 'next/link';
import TemarioPager from '../TemarioPager';
import TestRoomButton from './TestRoomButton';
import { lessonBlocks } from '../temarioData';
import {
  branchMap,
  lessonToneClasses,
  SECONDARY_MAIN_TARGET_SLUG,
  SECONDARY_SOURCE_SLUG,
} from '../temarioTree';
import ConceptLinks from './ConceptLinks';

// Árbol del temario (datos en temarioTree.ts): tarjetas redondeadas, tronco con
// puntos, ramas con codos curvos y flechas de esquinas suaves (ConceptLinks.tsx).
//
// Geometría compartida entre CSS y ConceptLinks: el "gancho" de cada tarjeta
// (--cn-hook, 43px desde arriba) es la altura del centro del número; ahí se
// alinean el punto del tronco, el conector y la primera rama.
export default function PasosPage() {
  return (
    <main className="cn-page">
      <header className="cn-hero">
        <p className="cn-eyebrow">Mapa de contenidos</p>
        <h1 className="cn-title">Temario</h1>
        <p className="cn-note">(Esta web está pendiente de ser ampliada)</p>

        <div className="cn-guide">
          <section className="cn-guide-card">
            <h2>Método Ordaz</h2>
            <p className="cn-guide-sub">Temas principales + apartados.</p>
            <ul>
              <li><strong>Soy nuevo:</strong> Céntrate en los temas principales (1, 2, 3... 10), y entra en los apartados de los temas 2 y 3.</li>
              <li><strong>Llegué al final:</strong> tras llegar al tema 10, vuelve al inicio y entra en los apartados pendientes. Si uno se te atasca, pasa a otro.</li>
              <li>Aprender cosas nuevas es necesario para avanzar y también facilita entender lo anterior.</li>
            </ul>
          </section>

          <section className="cn-guide-card">
            <h2>Niveles</h2>
            <p className="cn-guide-sub">A nuestro ritmo.</p>
            <ul className="cn-levels">
              <li><span>1</span>Al superar el tema 5</li>
              <li><span>2</span>Al entender todos los temas principales</li>
              <li><span>3</span>Al completar todos los apartados (listo para clases avanzadas)</li>
            </ul>
          </section>
        </div>

        <ul className="cn-legend" aria-label="Leyenda del mapa">
          <li><i className="cn-legend-main" aria-hidden="true" />Tema principal</li>
          <li><i className="cn-legend-branch" aria-hidden="true" />Apartado</li>
          <li><i className="cn-legend-link" aria-hidden="true" />Relacionado</li>
        </ul>
      </header>

      <section className="cn-map" aria-label="Orden real de las lecciones" data-pasos-map>
        <ConceptLinks />

        <ol className="cn-trunk">
          {lessonBlocks.map((lesson, index) => {
            const branches = branchMap[lesson.slug];

            return (
              <li key={lesson.slug} className={`cn-node ${lessonToneClasses[index]}`}>
                <span className="cn-dot" aria-hidden="true" />
                <div
                  className="cn-card"
                  data-pasos-source={lesson.slug === SECONDARY_SOURCE_SLUG ? '' : undefined}
                  data-pasos-target={lesson.slug === SECONDARY_MAIN_TARGET_SLUG ? 'figuras' : undefined}
                >
                  <span className="cn-badge">{lesson.number}</span>
                  <Link href={`/lecciones/temario/${lesson.slug}`} className="cn-card-title">
                    {lesson.title}
                  </Link>
                </div>

                {branches ? (
                  <div className="cn-side">
                    <ul className="cn-branches" aria-label={`Apartados de ${lesson.title}`}>
                      {branches.map((branch) => (
                        <li key={branch.href} className="cn-branch">
                          <div className="cn-branch-card" data-pasos-target={branch.secondaryTarget}>
                            <Link href={branch.href}>{branch.title}</Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <TemarioPager
        previous={{ href: '/lecciones/temario', label: 'Portada' }}
        next={{ href: '/lecciones/temario/conceptos-basicos', label: 'Conceptos básicos' }}
      />

      <TestRoomButton />

      <style>{`
        .cn-page {
          --cn-ink: #27272a;
          --cn-line: 3px;
          --cn-hook: 43px;
          --cn-branch-hook: 27px;
          --cn-trunk-x: 52px;
          --cn-card-left: 112px;
          --cn-gap: 44px;
          --cn-lane-space: 56px;
          --cn-node-width: 760px;
          --cn-card-width: 600px;
          --cn-branch-width: 400px;
          background: #ffffff;
          color: #080808;
          margin: 0;
          max-width: 100%;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(76px, 9vw, 116px) clamp(16px, 6vw, 88px) clamp(48px, 7vw, 84px);
          position: relative;
          width: 100%;
        }

        /* ---------- Cabecera ---------- */

        .cn-hero {
          margin: 0 auto clamp(40px, 6vw, 64px);
          max-width: 1180px;
          min-width: 0;
          width: 100%;
        }

        .cn-eyebrow {
          color: #047857;
          font-size: clamp(13px, 1.1vw, 16px);
          font-weight: 800;
          letter-spacing: 0.32em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .cn-title {
          font-size: clamp(46px, 8vw, 104px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.92;
          margin: 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .cn-note {
          color: #71717a;
          font-size: clamp(15px, 1.4vw, 18px);
          font-weight: 650;
          margin: 14px 0 0;
        }

        .cn-guide {
          display: grid;
          gap: clamp(14px, 2vw, 22px);
          grid-template-columns: repeat(2, minmax(0, 1fr));
          margin-top: clamp(24px, 4vw, 36px);
        }

        .cn-guide-card {
          background: #fafafa;
          border: 1.5px solid #e4e4e7;
          border-radius: 20px;
          min-width: 0;
          padding: clamp(18px, 2.6vw, 26px);
        }

        .cn-guide-card h2 {
          color: #047857;
          font-size: clamp(20px, 2vw, 26px);
          font-weight: 950;
          line-height: 1.1;
          margin: 0;
        }

        .cn-guide-sub {
          color: #18181b;
          font-size: clamp(16px, 1.5vw, 19px);
          font-weight: 800;
          margin: 6px 0 14px;
        }

        .cn-guide-card ul {
          display: grid;
          gap: 10px;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        /* Tamaño fijo (el mínimo de pantalla pequeña): si creciera con el ancho,
           en pantallas grandes cada punto ocuparía una línea más. */
        .cn-guide-card li {
          color: #303030;
          font-size: 15px;
          font-weight: 600;
          line-height: 1.45;
          min-width: 0;
          padding-left: 18px;
          position: relative;
        }

        .cn-guide-card li::before {
          background: #34d399;
          border-radius: 999px;
          content: "";
          height: 8px;
          left: 0;
          position: absolute;
          top: 0.6em;
          width: 8px;
        }

        .cn-guide-card strong {
          color: #080808;
        }

        .cn-levels li {
          align-items: center;
          display: flex;
          gap: 12px;
          padding-left: 0;
        }

        .cn-levels li::before {
          display: none;
        }

        .cn-levels span {
          align-items: center;
          background: #047857;
          border-radius: 999px;
          color: #ffffff;
          display: inline-flex;
          flex: 0 0 auto;
          font-size: 14px;
          font-weight: 950;
          height: 30px;
          justify-content: center;
          width: 30px;
        }

        .cn-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 22px;
          list-style: none;
          margin: clamp(20px, 3vw, 28px) 0 0;
          padding: 0;
        }

        .cn-legend li {
          align-items: center;
          color: #52525b;
          display: flex;
          font-size: 14px;
          font-weight: 800;
          gap: 8px;
        }

        .cn-legend i {
          display: inline-block;
          flex: 0 0 auto;
        }

        .cn-legend-main {
          background: #10b981;
          border-radius: 999px;
          box-shadow: 0 0 0 3px #ffffff, 0 0 0 5px var(--cn-ink);
          height: 14px;
          margin: 0 4px;
          width: 14px;
        }

        .cn-legend-branch {
          border-radius: 999px;
          border-top: 3px solid #10b981;
          height: 0;
          width: 28px;
        }

        .cn-legend-link {
          border-top: 3px solid #f59e0b;
          border-radius: 999px;
          height: 0;
          position: relative;
          width: 28px;
        }

        .cn-legend-link::after {
          border-right: 3px solid #f59e0b;
          border-top: 3px solid #f59e0b;
          content: "";
          height: 8px;
          position: absolute;
          right: 0;
          top: -5.5px;
          transform: rotate(45deg);
          width: 8px;
        }

        /* ---------- Mapa ---------- */

        .cn-map {
          margin: 0 auto;
          max-width: 1180px;
          min-width: 0;
          position: relative;
          width: 100%;
        }

        .cn-links {
          height: 100%;
          inset: 0;
          overflow: visible;
          pointer-events: none;
          position: absolute;
          width: 100%;
          z-index: 1;
        }

        .cn-link path {
          fill: none;
          stroke: #f59e0b;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 3;
        }

        .cn-link circle {
          fill: #f59e0b;
        }

        .cn-links marker path {
          fill: none;
          stroke: #f59e0b;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 3;
        }

        .cn-trunk {
          display: grid;
          list-style: none;
          margin: 0;
          padding: 0 var(--cn-lane-space) 0 0;
          position: relative;
          z-index: 2;
        }

        /* Siempre una sola columna: el tema arriba (pegado a la izquierda) y
           sus apartados debajo (pegados a la derecha). */
        .cn-node {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          max-width: calc(var(--cn-card-left) + var(--cn-node-width));
          min-width: 0;
          padding: 0 0 clamp(30px, 4.5vw, 46px) var(--cn-card-left);
          position: relative;
          row-gap: 14px;
        }

        /* Tramo de tronco desde este punto hasta el del siguiente tema. */
        .cn-node::before {
          background: var(--cn-ink);
          border-radius: 999px;
          bottom: calc(-1 * var(--cn-hook));
          content: "";
          left: calc(var(--cn-trunk-x) - 2px);
          position: absolute;
          top: var(--cn-hook);
          width: 4px;
        }

        .cn-node:last-child::before {
          display: none;
        }

        /* Conector corto del punto a la tarjeta. */
        .cn-node::after {
          background: var(--cn-ink);
          border-radius: 999px;
          content: "";
          height: var(--cn-line);
          left: var(--cn-trunk-x);
          position: absolute;
          top: calc(var(--cn-hook) - var(--cn-line) / 2);
          width: calc(var(--cn-card-left) - var(--cn-trunk-x));
        }

        .cn-dot {
          background: var(--node-color);
          border-radius: 999px;
          box-shadow: 0 0 0 4px #ffffff, 0 0 0 7px var(--cn-ink);
          height: 18px;
          left: calc(var(--cn-trunk-x) - 9px);
          position: absolute;
          top: calc(var(--cn-hook) - 9px);
          width: 18px;
          z-index: 3;
        }

        .cn-card {
          align-items: start;
          align-self: start;
          background: #ffffff;
          border: 2px solid var(--cn-ink);
          border-radius: 20px;
          box-shadow: 0 6px 0 var(--node-color);
          display: grid;
          gap: 16px;
          grid-template-columns: auto minmax(0, 1fr);
          max-width: var(--cn-card-width);
          min-width: 0;
          padding: 17px 20px 20px 17px;
          position: relative;
          z-index: 2;
        }

        .cn-badge {
          align-items: center;
          background: color-mix(in srgb, var(--node-color) 18%, #ffffff);
          border: 2px solid var(--node-color);
          border-radius: 14px;
          color: #080808;
          display: inline-flex;
          font-size: 20px;
          font-weight: 950;
          height: 48px;
          justify-content: center;
          width: 48px;
        }

        .cn-card-title {
          font-size: clamp(22px, 2.8vw, 32px);
          font-weight: 950;
          line-height: 1.08;
          margin-top: 8px;
          overflow-wrap: anywhere;
        }

        /* ---------- Apartados (ramas) ---------- */

        .cn-side {
          min-width: 0;
          padding-left: var(--cn-gap);
          position: relative;
          z-index: 2;
        }

        .cn-branches {
          display: grid;
          gap: 14px;
          list-style: none;
          margin: 0;
          min-width: 0;
          padding: 14px 0 0;
          position: relative;
        }

        /* La vía baja recta desde el borde inferior de la tarjeta del tema. */
        .cn-branches::before {
          border-left: var(--cn-line) solid var(--node-color);
          content: "";
          height: 28px;
          left: calc(-1 * var(--cn-gap) / 2 - var(--cn-line) / 2);
          position: absolute;
          top: -14px;
        }

        .cn-branch {
          display: flex;
          justify-content: flex-end;
          min-width: 0;
          position: relative;
        }

        /* Codo curvo de la vía hacia cada apartado. Llega hasta el borde derecho
           de la fila: la caja (opaca) tapa el tramo que queda debajo de ella, así
           el trazo siempre muere justo en su borde izquierdo, esté donde esté. */
        .cn-branch::before {
          border-bottom: var(--cn-line) solid var(--node-color);
          border-bottom-left-radius: 14px;
          border-left: var(--cn-line) solid var(--node-color);
          content: "";
          height: calc(var(--cn-branch-hook) + var(--cn-line) / 2);
          left: calc(-1 * var(--cn-gap) / 2 - var(--cn-line) / 2);
          position: absolute;
          right: 8px;
          top: 0;
        }

        /* La vía sigue recta hacia el siguiente apartado. */
        .cn-branch:not(:last-child)::after {
          border-left: var(--cn-line) solid var(--node-color);
          bottom: -14px;
          content: "";
          left: calc(-1 * var(--cn-gap) / 2 - var(--cn-line) / 2);
          position: absolute;
          top: 0;
        }

        .cn-branch-card {
          background: color-mix(in srgb, var(--node-color) 9%, #ffffff);
          border: 1.5px solid color-mix(in srgb, var(--node-color) 45%, #ffffff);
          border-radius: 16px;
          flex: 0 1 var(--cn-branch-width);
          max-width: 100%;
          min-width: 0;
          padding: 14px 18px 15px;
          position: relative;
          z-index: 1;
        }

        .cn-branch-card a {
          font-size: clamp(17px, 1.8vw, 21px);
          font-weight: 900;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .tone-emerald {
          --node-color: #10b981;
        }

        .tone-red {
          --node-color: #ef4444;
        }

        .tone-zinc {
          --node-color: #a1a1aa;
        }

        .tone-amber {
          --node-color: #f59e0b;
        }

        /* ---------- Responsive ---------- */

        @media (max-width: 900px) {
          .cn-guide {
            grid-template-columns: minmax(0, 1fr);
          }
        }

        @media (max-width: 820px) {
          .cn-page {
            --cn-gap: 34px;
            --cn-lane-space: 40px;
          }
        }

        @media (max-width: 560px) {
          .cn-page {
            --cn-trunk-x: 22px;
            --cn-card-left: 50px;
          }

          .cn-dot {
            box-shadow: 0 0 0 3px #ffffff, 0 0 0 6px var(--cn-ink);
          }

          .cn-card {
            gap: 12px;
            padding: 17px 16px 18px 17px;
          }

          .cn-card-title {
            font-size: clamp(20px, 6vw, 24px);
            margin-top: 10px;
          }
        }
      `}</style>
    </main>
  );
}
