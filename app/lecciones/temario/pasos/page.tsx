import Link from 'next/link';
import TemarioPager from '../TemarioPager';
import { lessonBlocks } from '../temarioData';
import SecondaryPaths from './SecondaryPaths';

type BranchItem = {
  title: string;
  href: string;
  secondaryTarget?: 'harmony' | 'sevenths';
};

// Keep this map in sync whenever a temario route branches from a lesson.
const branchMap: Record<string, BranchItem[]> = {
  'conceptos-basicos': [
    {
      title: 'El sonido en la música',
      href: '/lecciones/temario/el-sonido-en-la-musica',
    },
  ],
  'notacion-musical': [
    {
      title: 'Afinación',
      href: '/lecciones/temario/afinacion',
    },
  ],
  tablaturas: [
    {
      title: 'Tablaturas con dos cuerdas',
      href: '/lecciones/temario/tablaturas-dos-cuerdas',
    },
    {
      title: 'Más punteos cortos',
      href: '/lecciones/temario/mas-punteos-cortos',
    },
  ],
  arpegios: [
    {
      title: 'Ampliacion de arpegios',
      href: '/lecciones/temario/ampliacion-arpegios',
    },
  ],
  pentatonica: [
    {
      title: 'Ejercicios de pentatónica',
      href: '/lecciones/temario/ejercicios-pentatonica',
    },
    {
      title: 'Ejercicios avanzados de pentatónica',
      href: '/lecciones/temario/ejercicios-pentatonica-avanzados',
    },
    {
      title: 'Pentatónica de blues',
      href: '/lecciones/temario/pentatonica-blues',
    },
    {
      title: 'Ejercicios de pentatónica de blues',
      href: '/lecciones/temario/ejercicios-pentatonica-blues',
    },
  ],
  escalas: [
    {
      title: 'Escala completa de Sol Mayor',
      href: '/lecciones/temario/escala-completa-sol-mayor',
    },
    {
      title: 'Ejercicios de escalas',
      href: '/lecciones/temario/ejercicios-escalas',
    },
    {
      title: 'Ejercicios avanzados de escalas',
      href: '/lecciones/temario/ejercicios-escalas-avanzados',
    },
    {
      title: 'Acordes de la escala de Sol Mayor',
      href: '/lecciones/temario/acordes-escala-sol-mayor',
      secondaryTarget: 'harmony',
    },
    {
      title: 'Acordes con séptima',
      href: '/lecciones/temario/acordes-con-septima',
      secondaryTarget: 'sevenths',
    },
    {
      title: 'Modos',
      href: '/lecciones/temario/modos-griegos',
    },
  ],
};

const lessonToneClasses = [
  'tone-emerald',
  'tone-red',
  'tone-zinc',
  'tone-amber',
  'tone-emerald',
  'tone-red',
  'tone-zinc',
  'tone-amber',
  'tone-emerald',
  'tone-red',
];

export default function PasosPage() {
  return (
    <main className="steps-page">
      <section className="steps-hero">
        <div className="steps-hero-copy">
          <p className="steps-kicker">Árbol de contenidos</p>
          <h1>EL MÉTODO</h1>
          <p>
            Aquí vemos las cosas desde el principio, pero luego podemos profundizar más en cada cosa al ritmo que queramos. 
            </p>
          <p>MÉTODO ORDAZ: Camino principal (temas) + ramas secundarias (apartados). La primera vez tienes que pasar solo por las páginas con número (el camino principal: 1, 2, 3...). Cada vez que llegues a la página 10, vuelve al principio y entra en las demás ramas secundarias / apartados sin número. Si alguno se te atasca demasiado, ve a otro. A medida que aprendemos y practicamos cosas nuevas es más fácil entender los conceptos anteriores también.</p>
          <p>Los APARTADOS que debemos visitar en el PRIMER RECORRIDO son los de los temas 2 y 3</p>
        </div>

      </section>

      <section className="learning-map" aria-label="Orden real de las lecciones" data-learning-map>
        <SecondaryPaths />
        

        <ol className="map-trunk">
          {lessonBlocks.map((lesson, index) => (
            <li key={lesson.slug} className={`map-node ${lessonToneClasses[index]}`}>
              <div className="main-lesson" data-secondary-source={lesson.slug === 'acordes' ? 'acordes' : undefined} data-secondary-target={lesson.slug === 'figuras-de-acordes' ? 'figuras' : undefined}>
                <span className="lesson-number">{lesson.number}</span>
                <Link href={`/lecciones/temario/${lesson.slug}`} className="lesson-title">
                  {lesson.title}
                </Link>
              </div>

              <div className="node-side">
                {branchMap[lesson.slug] ? (
                  <ul className="branch-list" aria-label={`Ramas de ${lesson.title}`}>
                    {branchMap[lesson.slug].map((branch) => (
                      <li key={branch.href} className="branch-node" data-secondary-target={branch.secondaryTarget}>
                        <Link href={branch.href}>{branch.title}</Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <TemarioPager
        previous={{ href: '/lecciones/temario', label: 'Portada' }}
        next={{ href: '/lecciones/temario/conceptos-basicos', label: 'Conceptos básicos' }}
      />

      <style>{`
        .steps-page {
          background:
            linear-gradient(90deg, rgba(4, 120, 87, 0.08) 1px, transparent 1px),
            linear-gradient(180deg, rgba(4, 120, 87, 0.08) 1px, transparent 1px),
            #ffffff;
          background-size: 38px 38px;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(76px, 9vw, 116px) clamp(16px, 6vw, 88px) clamp(48px, 7vw, 84px);
          position: relative;
          width: 100%;
        }

        .steps-hero {
          align-items: end;
          display: grid;
          gap: 28px;
          grid-template-columns: minmax(0, 1fr) auto;
          margin: 0 auto clamp(38px, 7vw, 72px);
          max-width: 1180px;
          min-width: 0;
          width: 100%;
        }

        .steps-hero-copy {
          min-width: 0;
        }

        .steps-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .steps-kicker {
          margin: 0 0 16px;
        }

        .steps-hero h1 {
          font-size: clamp(46px, 8vw, 112px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.92;
          margin: 0;
          max-width: 780px;
          overflow-wrap: break-word;
        }

        .steps-hero p:not(.steps-kicker) {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.45;
          margin: 18px 0 0;
          max-width: 720px;
        }

        .steps-legend {
          align-content: start;
          border: 1px solid #111111;
          display: grid;
          gap: 12px;
          justify-self: end;
          min-width: min(100%, 240px);
          padding: 18px;
        }

        .steps-legend span {
          align-items: center;
          color: #18181b;
          display: flex;
          font-size: 14px;
          font-weight: 900;
          gap: 10px;
          line-height: 1.2;
        }

        .steps-legend i {
          display: inline-block;
          flex: 0 0 auto;
          height: 12px;
          width: 34px;
        }

        .legend-main {
          background: #080808;
        }

        .legend-branch {
          background: #047857;
        }

        .learning-map {
          margin: 0 auto;
          max-width: 1180px;
          min-width: 0;
          position: relative;
          width: 100%;
        }

        .secondary-path-overlay {
          height: 100%;
          inset: 0;
          overflow: visible;
          pointer-events: none;
          position: absolute;
          width: 100%;
          z-index: 1;
        }

        .secondary-path {
          fill: none;
          marker-end: url("#secondary-path-arrow");
          stroke: #f59e0b;
          stroke-linecap: square;
          stroke-linejoin: round;
          stroke-width: 4;
        }

        .secondary-path-overlay marker path {
          fill: #f59e0b;
        }

        .map-root {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin: 0 0 24px;
          padding-left: clamp(0px, 6vw, 92px);
        }

        .map-root-link {
          background: #080808;
          border: 2px solid #080808;
          border-radius: 6px;
          color: #ffffff !important;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.12em;
          padding: 12px 14px;
          text-decoration: none !important;
          text-transform: uppercase;
        }

        .map-root-link-active {
          background: #ffffff;
          color: #080808 !important;
        }

        .map-trunk {
          counter-reset: lessons;
          display: grid;
          gap: 0;
          list-style: none;
          margin: 0;
          padding: 0;
          position: relative;
          z-index: 2;
        }

        .map-trunk::before {
          background: #080808;
          bottom: 36px;
          content: "";
          left: clamp(24px, 6vw, 74px);
          position: absolute;
          top: 16px;
          width: 6px;
        }

        .map-node {
          box-sizing: border-box;
          display: grid;
          gap: clamp(14px, 3vw, 34px);
          grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
          min-width: 0;
          padding: 0 0 clamp(28px, 5vw, 52px) clamp(58px, 10vw, 124px);
          position: relative;
        }

        .map-node::before {
          background: var(--node-color);
          border: 5px solid #080808;
          border-radius: 999px;
          content: "";
          height: 28px;
          left: calc(clamp(24px, 6vw, 74px) - 11px);
          position: absolute;
          top: 20px;
          width: 28px;
          z-index: 3;
        }

        .main-lesson {
          align-items: center;
          background: #ffffff;
          border: 2px solid #080808;
          box-shadow: 8px 8px 0 var(--node-color);
          display: grid;
          gap: 16px;
          grid-template-columns: auto minmax(0, 1fr);
          min-width: 0;
          padding: clamp(14px, 3vw, 20px);
          position: relative;
          z-index: 2;
        }

        .lesson-number {
          align-items: center;
          background: #080808;
          color: #ffffff;
          display: inline-flex;
          font-size: 18px;
          font-weight: 950;
          height: 46px;
          justify-content: center;
          width: 46px;
          position: relative;
          z-index: 2;
        }

        .lesson-title {
          color: #080808 !important;
          font-size: clamp(22px, 3vw, 34px);
          font-weight: 950;
          line-height: 1.04;
          max-width: 100%;
          overflow-wrap: anywhere;
          text-decoration-color: var(--node-color) !important;
          text-decoration-thickness: 0.12em !important;
          text-underline-offset: 0.16em !important;
          position: relative;
          z-index: 2;
        }

        .node-side {
          align-content: start;
          display: grid;
          gap: 12px;
          min-width: 0;
          position: relative;
          z-index: 2;
        }

        .branch-list {
          align-content: start;
          display: grid;
          gap: 12px;
          list-style: none;
          margin: 12px 0 0;
          min-width: 0;
          padding: 0;
          position: relative;
        }

        .branch-list::before {
          background: var(--node-color);
          content: "";
          height: 4px;
          left: calc(clamp(-34px, -3vw, -14px));
          position: absolute;
          top: 34px;
          width: clamp(16px, 3vw, 34px);
        }

        .branch-node {
          background: #f4f4f5;
          border-left: 5px solid var(--node-color);
          min-width: 0;
          padding: 18px 16px;
          position: relative;
        }

        .branch-node a {
          color: #080808 !important;
          display: inline-block;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 900;
          line-height: 1.12;
          max-width: 100%;
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

        @media (max-width: 820px) {
          .steps-hero {
            align-items: start;
            grid-template-columns: 1fr;
          }

          .steps-legend {
            justify-self: stretch;
          }

          .map-node {
            grid-template-columns: 1fr;
            padding-left: clamp(48px, 11vw, 72px);
          }

          .branch-list {
            margin-top: 0;
          }

          .branch-list::before {
            display: none;
          }
        }

        @media (max-width: 560px) {
          .steps-hero h1 {
            font-size: clamp(38px, 10vw, 44px);
            line-height: 1;
          }

          .map-trunk::before {
            left: 14px;
          }

          .map-node {
            padding-left: 38px;
          }

          .map-node::before {
            left: 2px;
          }

          .main-lesson {
            box-shadow: 5px 5px 0 var(--node-color);
            grid-template-columns: 1fr;
          }

          .lesson-number {
            height: 40px;
            width: 40px;
          }
        }
      `}</style>
    </main>
  );
}
