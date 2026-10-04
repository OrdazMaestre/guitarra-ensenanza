import SpotlightLamp, { SpotlightLampStyles } from './SpotlightLamp';

// Extraido de QuizButton.tsx para poder flanquear tambien el boton MULTIJUGADOR
// (QuizRunner.tsx) con los mismos dos focos, sin duplicar todo este CSS/JSX cuidadosamente
// afinado en dos sitios -- cualquier ajuste futuro (angulo del haz, tamaño, fundidos...) se hace
// una sola vez aqui y se aplica a los dos botones. `children` es el elemento clicable que queda
// en medio (un <Link> en QuizButton, un <button> en QuizRunner) -- este componente no sabe ni le
// importa cual es, solo le exige que se posicione a si mismo (`position: relative`) y lleve
// `z-index: 1` para que el solape de 10px con los focos (ver `.quiz-spotlight` mas abajo) quede
// por debajo de ellos, igual que `.quiz-button-link` y `.quiz-multijugador-button`.
//
// La lámpara en sí (rig > head > foco+luz, con sus animaciones de balanceo/parpadeo) vive en
// SpotlightLamp.tsx -- compartida también con SpotlightCorners.tsx (las 4 esquinas de
// sala-de-pruebas). Este fichero solo decide CÓMO colocar el par izquierda/derecha alrededor de
// `children` (`.quiz-spotlight`/`.quiz-spotlight-left/right`, `.quiz-button-wrap`, el solape de
// 10px, el `scaleX(-1)` del lado izquierdo). Ver SpotlightLamp.tsx para el porqué del recorte de
// foco.png/luz.png, la reconstrucción de transparencia, los % de posición/ángulo, etc.
interface SpotlightFlankProps {
  children: React.ReactNode;
  className?: string;
}

export default function SpotlightFlank({ children, className }: SpotlightFlankProps) {
  return (
    <>
      <div className={className ? `quiz-button-wrap ${className}` : 'quiz-button-wrap'}>
        <div className="quiz-spotlight quiz-spotlight-left" aria-hidden="true">
          <SpotlightLamp />
        </div>

        {children}

        <div className="quiz-spotlight quiz-spotlight-right" aria-hidden="true">
          <SpotlightLamp />
        </div>
      </div>
      <SpotlightLampStyles />
      <style>{`
        .quiz-button-wrap {
          align-items: center;
          display: flex;
          justify-content: center;
          width: 100%;
        }

        /* Decorativos: se mantienen SIEMPRE visibles, incluso en pantallas estrechas -- el ancho
           minimo del clamp() ya evita que se encojan hasta ilegibles, y el haz de luz puede
           salirse de la pantalla a los lados sin generar scroll horizontal (el overflow-x: clip
           global del sitio en html/body/.site-shell lo garantiza; comprobado con Playwright:
           document.documentElement.scrollWidth === clientWidth incluso con la luz pintando fuera
           del viewport). z-index por encima del boton + margen negativo: se acercan al boton
           hasta QUEDAR DELANTE de él (superpuestos, no solo al lado), dejando unos 10px de solape
           visible. */
        .quiz-spotlight {
          display: block;
          flex: 0 0 auto;
          overflow: visible;
          position: relative;
          width: clamp(210px, 27vw, 390px);
          z-index: 2;
        }

        .quiz-spotlight-left {
          margin-right: -10px;
        }

        .quiz-spotlight-right {
          margin-left: -10px;
        }

        /* luz.png sale apuntando hacia la derecha en el recorte original (ver comentario de
         * arriba) -- el lado IZQUIERDO es el que hay que espejar para que las dos apunten hacia
         * AFUERA del botón (una hacia cada borde de la pantalla), no una hacia la otra. */
        .quiz-spotlight-left {
          transform: scaleX(-1);
        }

        .quiz-spotlight-right .quiz-spotlight-head,
        .quiz-spotlight-right .quiz-spotlight-luz {
          animation-delay: 1.6s;
        }
      `}</style>
    </>
  );
}
