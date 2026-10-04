'use client';

// Extraido de SpotlightFlank.tsx para poder reutilizar el mismo foco+luz (imagen, animaciones de
// balanceo/parpadeo) en un contexto NUEVO: las 4 esquinas de sala-de-pruebas (SpotlightCorners.tsx),
// no solo flanqueando un botón. SpotlightFlank sigue siendo dueño de CÓMO se coloca el par
// izquierda/derecha alrededor de un botón (`.quiz-spotlight`/`.quiz-spotlight-left/right`,
// `.quiz-button-wrap`) -- eso no cambia aquí. Este fichero es solo la lámpara en sí (rig > head >
// foco+luz) y sus animaciones, para que cualquier ajuste futuro del foco/luz (ángulo, fundidos,
// timing) se siga haciendo una única vez y se aplique a los TRES sitios que lo usan.
//
// Ver SpotlightFlank.tsx para el porqué de cada valor (recorte de foco.png/luz.png, el truco de
// "falsa transparencia" reconstruida por flood-fill, los % de posición/tamaño calculados a partir
// de la imagen de referencia, el ángulo de -31.7deg medido por ajuste de elipse, etc.) -- esos
// comentarios no se duplican aquí para no desincronizarse; este fichero solo mueve el CSS/JSX.
export default function SpotlightLamp({ animationDelay }: { animationDelay?: string }) {
  return (
    <div className="quiz-spotlight-rig">
      <div className="quiz-spotlight-head" style={animationDelay ? { animationDelay } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- decorativo, imagen estatica de un solo componente cliente, no contenido */}
        <img className="quiz-spotlight-foco" src="/images/quiz/spotlight/foco.png" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="quiz-spotlight-luz" src="/images/quiz/spotlight/luz.png" alt="" />
      </div>
    </div>
  );
}

export function SpotlightLampStyles() {
  return (
    <style>{`
      /* Lienzo de referencia 1097x513 "unidades de diseno" (solo foco+luz, sin pie) -- aspect-ratio
         lo mantiene proporcional a cualquier ancho real sin recalcular nada. */
      .quiz-spotlight-rig {
        aspect-ratio: 1097 / 513;
        position: relative;
        width: 100%;
      }

      /* Pivote de balanceo: aprox. donde iria el tornillo/junta de montaje en la parte trasera
         del foco (visible en foco.png). */
      .quiz-spotlight-head {
        animation: quiz-spotlight-sway 6s ease-in-out infinite;
        height: 58.48%;
        left: 0%;
        position: absolute;
        top: 23.59%;
        transform-origin: 22% 56%;
        width: 29.63%;
      }

      .quiz-spotlight-foco {
        height: 100%;
        left: 0;
        position: absolute;
        top: 0;
        width: 100%;
      }

      /* Posicion/tamano de luz.png en % del propio foco.png (su padre inmediato) -- por eso pasa
         del 100%, la luz es mas ancha que el foco del que sale. Ver SpotlightFlank.tsx para el
         detalle completo del anclaje a la punta del cristal y el ángulo de -31.7deg. */
      .quiz-spotlight-luz {
        animation: quiz-spotlight-flicker 4.2s ease-in-out infinite;
        height: 153.9%;
        left: 81.51%;
        max-width: none;
        position: absolute;
        top: -48.23%;
        transform: rotate(-31.7deg);
        transform-origin: 0% 52%;
        width: 744.16%;
      }

      /* Balanceo tipo "barrido de escenario": se queda quieto en su postura natural (0deg, la
       * misma que en la imagen de referencia) la mayor parte del ciclo, y solo de vez en cuando
       * barre a un lado y vuelve -- un foco de concierto de verdad no oscila sin parar como un
       * péndulo, se mueve a ráfagas. Gira sobre su propio pivote, nunca se traslada. */
      @keyframes quiz-spotlight-sway {
        0%, 22% { transform: rotate(0deg); }
        32%, 42% { transform: rotate(-16deg); }
        52%, 72% { transform: rotate(0deg); }
        82%, 92% { transform: rotate(10deg); }
        100% { transform: rotate(0deg); }
      }

      /* Encendido/apagado tipo concierto: se queda encendida un buen rato, se apaga de golpe dos
         veces seguidas y vuelve. */
      @keyframes quiz-spotlight-flicker {
        0%, 58% { opacity: 1; }
        64% { opacity: 0.15; }
        70% { opacity: 1; }
        74% { opacity: 0.15; }
        80%, 100% { opacity: 1; }
      }

      @media (prefers-reduced-motion: reduce) {
        .quiz-spotlight-head,
        .quiz-spotlight-luz {
          animation: none;
        }
      }
    `}</style>
  );
}
