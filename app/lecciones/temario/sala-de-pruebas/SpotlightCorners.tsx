import SpotlightLamp, { SpotlightLampStyles } from '../SpotlightLamp';

// 4 focos decorativos enmarcando LAS ESQUINAS DE LA PÁGINA de sala-de-pruebas -- a petición
// explícita del usuario, a diferencia de SpotlightFlank (que flanquea un botón concreto con dos
// focos apuntando hacia afuera desde el centro). `position: absolute` respecto al contenedor de
// la página (`.test-room-page`, que necesita `position: relative` -- ver su propio <style>) para
// que las esquinas de ABAJO queden junto al final real del contenido, no ancladas al viewport
// (`position: fixed` las pegaría a las esquinas de la PANTALLA seguiendo el scroll, que no es lo
// que se pidió: "las 4 esquinas de la propia página"). `pointer-events: none` porque son
// decorativas y no deben robar clics a nada que quede debajo en las esquinas.
//
// Reutiliza la MISMA convención de espejado horizontal que SpotlightFlank ya estableció para
// "apuntar hacia afuera": el lado izquierdo usa `scaleX(-1)`. El eje VERTICAL es al revés de lo
// que parecería intuitivo -- comprobado visualmente (capturas con Playwright): la dirección
// NATURAL del haz (sin ningún scaleY) apunta HACIA ARRIBA (así se ve en los dos focos de
// SpotlightFlank, que sin tocar el eje Y ya salen disparados hacia arriba). Para una esquina de
// ARRIBA de la página eso dispara el haz fuera de la pantalla (no hay nada por encima del borde
// superior que iluminar) y el foco apenas se ve -- así que son las esquinas de ARRIBA las que
// necesitan `scaleY(-1)` (invertir a "hacia abajo", hacia el contenido de la página) y las de
// ABAJO las que se quedan con la dirección natural (hacia arriba, hacia el contenido que tienen
// encima). Cada una con un `animation-delay` distinto (mismo incremento de 1.6s que ya separaba
// el par izquierda/derecha de SpotlightFlank) para que no parpadeen/balanceen las 4 a la vez.
export default function SpotlightCorners() {
  return (
    <>
      <div className="spotlight-corner spotlight-corner-top-left" aria-hidden="true">
        <SpotlightLamp animationDelay="0s" />
      </div>
      <div className="spotlight-corner spotlight-corner-top-right" aria-hidden="true">
        <SpotlightLamp animationDelay="1.6s" />
      </div>
      <div className="spotlight-corner spotlight-corner-bottom-left" aria-hidden="true">
        <SpotlightLamp animationDelay="3.2s" />
      </div>
      <div className="spotlight-corner spotlight-corner-bottom-right" aria-hidden="true">
        <SpotlightLamp animationDelay="4.8s" />
      </div>
      <SpotlightLampStyles />
      <style>{`
        .spotlight-corner {
          /* z-index: -1 se probó primero (razonamiento: debería pintar por detrás del contenido
             normal pero por delante del propio fondo blanco de .test-room-page) pero lo dejaba
             INVISIBLE del todo -- comprobado con capturas de Playwright, algún ancestro de
             .test-room-page (p.ej. .site-shell) forma su propio contexto de apilamiento con fondo
             opaco por encima de cualquier z-index negativo de aquí dentro. z-index positivo bajo
             (como ya usan .quiz-button-link/.test-room-button-link) sí es visible. */
          pointer-events: none;
          position: absolute;
          width: clamp(100px, 14vw, 200px);
          z-index: 1;
        }

        /* Invertidos en el eje X a petición explícita del usuario, CONSERVANDO la posición de
           cada uno (mismos top/left/right/bottom de siempre) -- solo cambia hacia qué lado
           apunta el haz dentro de su propia esquina, el eje Y (arriba/abajo, ya resuelto en el
           comentario de más arriba) no se toca. */
        .spotlight-corner-top-left {
          left: 0;
          top: 0;
          transform: scaleY(-1);
        }

        .spotlight-corner-top-right {
          right: 0;
          top: 0;
          transform: scale(-1, -1);
        }

        .spotlight-corner-bottom-left {
          bottom: 0;
          left: 0;
        }

        .spotlight-corner-bottom-right {
          bottom: 0;
          right: 0;
          transform: scaleX(-1);
        }
      `}</style>
    </>
  );
}
