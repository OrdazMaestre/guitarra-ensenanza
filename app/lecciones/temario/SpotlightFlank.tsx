// Extraido de QuizButton.tsx para poder flanquear tambien el boton MULTIJUGADOR
// (QuizRunner.tsx) con los mismos dos focos, sin duplicar todo este CSS/JSX cuidadosamente
// afinado en dos sitios -- cualquier ajuste futuro (angulo del haz, tamaño, fundidos...) se hace
// una sola vez aqui y se aplica a los dos botones. `children` es el elemento clicable que queda
// en medio (un <Link> en QuizButton, un <button> en QuizRunner) -- este componente no sabe ni le
// importa cual es, solo le exige que se posicione a si mismo (`position: relative`) y lleve
// `z-index: 1` para que el solape de 10px con los focos (ver `.quiz-spotlight` mas abajo) quede
// por debajo de ellos, igual que `.quiz-button-link` y `.quiz-multijugador-button`.
//
// foco/luz vienen de un unico PNG de referencia con "transparencia falsa" (checkerboard dibujado
// a mano en los pixeles, sin canal alpha real -- confirmado con sharp().metadata(): hasAlpha=
// false). Se recortaron en piezas independientes y se les reconstruyo la transparencia real por
// flood-fill desde los bordes (para no perder detalles claros ENCERRADOS, como el reflejo del
// cristal del foco, que un simple "quita los pixeles claros" habria borrado). La pieza "pie"
// (soporte/tripode) se descarto a peticion del usuario -- solo quedan foco+luz.
//
// El lienzo entero (.quiz-spotlight-rig) usa aspect-ratio + posiciones en % en vez de tamaños fijos
// en px, para que foco y luz escalen juntos y de forma fluida con el ancho real disponible sin
// tener que recalcular nada por breakpoint. Los % de left/top/width/height salen de la posicion
// real de foco/luz en la imagen original ANTES de recortarla (luz desplazada (364,-121) respecto
// a foco, en las unidades del lienzo -- ver el comentario del script de recorte).
//
// luz.png lleva DOS fundidos de opacidad combinados (multiplicados pixel a pixel, no dos mascaras
// de SVG apiladas): uno A LO LARGO del haz (transparente en la punta que toca el foco Y en el
// extremo lejano, opaco en medio -- el fundido "de siempre") y otro TRANSVERSAL (opaco en la
// linea central del haz, a la misma altura que la punta, y que se apaga hacia los bordes
// superior/inferior del triangulo -- mas pronunciado que su primera version: la franja de
// transicion se comprimio a la mitad de ancho a cada lado del pico, doblando lo rapido que cae).
interface SpotlightFlankProps {
  children: React.ReactNode;
  className?: string;
}

export default function SpotlightFlank({ children, className }: SpotlightFlankProps) {
  return (
    <>
      <div className={className ? `quiz-button-wrap ${className}` : 'quiz-button-wrap'}>
        <div className="quiz-spotlight quiz-spotlight-left" aria-hidden="true">
          <div className="quiz-spotlight-rig">
            <div className="quiz-spotlight-head">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorativo, imagen estatica de un solo componente cliente, no contenido */}
              <img className="quiz-spotlight-foco" src="/images/quiz/spotlight/foco.png" alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="quiz-spotlight-luz" src="/images/quiz/spotlight/luz.png" alt="" />
            </div>
          </div>
        </div>

        {children}

        <div className="quiz-spotlight quiz-spotlight-right" aria-hidden="true">
          <div className="quiz-spotlight-rig">
            <div className="quiz-spotlight-head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="quiz-spotlight-foco" src="/images/quiz/spotlight/foco.png" alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="quiz-spotlight-luz" src="/images/quiz/spotlight/luz.png" alt="" />
            </div>
          </div>
        </div>
      </div>
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

        /* Lienzo de referencia 1097x513 "unidades de diseno" (solo foco+luz, sin pie -- ver
           comentario de arriba) -- aspect-ratio lo mantiene proporcional a cualquier ancho real
           sin recalcular nada. */
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

        /* Posicion/tamano de luz.png en % del propio foco.png (su padre inmediato) -- por eso
           pasa del 100%, la luz es mas ancha que el foco del que sale. El punto de la punta de
           luz.png (su propio borde izquierdo, al 52% de su alto) se ancla al centro real del
           cristal del foco -- NO al centro geometrico de la caja de foco.png, que no coincide:
           el cristal esta desplazado hacia arriba/derecha dentro de esa caja. Centro del cristal
           localizado por analisis de color (deteccion del blob mas brillante/verdoso en
           foco.png, sin las marcas pequeñas del lateral): x=81.51% (264.9/325px), y=31.8%
           (95.4/300px) del propio foco.png. left/top despejados para que
           left + 0%*width = 81.51% (tip.x) y top + 52%*height = 31.8% (tip.y) -- top se recalcula
           cada vez que cambia el alto, para que la punta se quede siempre anclada al cristal.
           Alto +50% dos veces seguidas (68.4%->102.6%->153.9%, grosor del haz). Ancho duplicado
           sobre una version anterior (372.08% -> 744.16%, "el limite exterior") -- solo crece
           hacia el extremo ancho/lejano, la punta se queda anclada porque esta al 0% del propio
           ancho de la imagen.
           max-width: none es imprescindible: la regla global img { max-width: 100% } de
           globals.css (pensada para que fotos normales no desborden su contenedor) estaba
           recortando esta imagen a como maximo el 100% del ancho de .quiz-spotlight-head SIN
           avisar -- por eso ningun aumento de width anterior (225%, 248%, 372%...) se notaba:
           siempre quedaba invisiblemente limitado al 100%. */
        /* luz.png en si misma esta dibujada perfectamente horizontal (la punta y el eje del
           triangulo van rectos), pero foco.png NO esta dibujado recto -- el cilindro/cristal del
           foco esta inclinado dentro de su propio lienzo. Angulo medido tratando el cristal como
           un circulo visto en perspectiva (una elipse): el eje MENOR de esa elipse (la direccion
           en la que el circulo se ve "aplastado") es la direccion real hacia la que apunta el
           cristal -- confirmado con tres metodos independientes: PCA de los pixeles del cristal
           (~-28deg), vector centroide-del-foco -> centro-del-cristal (~-27deg), y un ajuste de
           elipse (minimos cuadrados, conica general) al borde interior del aro del cristal
           trazado por barrido radial desde su centro (~-31.7deg, el mas preciso de los tres al
           usar 180 puntos del borde real en vez de una nube de pixeles). Las dos primeras
           estimaciones (-17deg a partir de la silueta del cuerpo del cilindro, luego -28deg) se
           quedaban cortas -- se fueron corrigiendo comparando capturas hasta que el haz siguiera
           visualmente la misma linea que el cristal. Sin esta rotacion la luz sale
           horizontal mientras el foco apunta hacia arriba, y se ve torcida respecto a el.
           transform-origin al 0%/52% fija el pivote justo en la punta (el mismo punto anclado por
           left/top arriba), para que rotar no mueva el punto de anclaje al cristal. */
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

        .quiz-spotlight-right .quiz-spotlight-head,
        .quiz-spotlight-right .quiz-spotlight-luz {
          animation-delay: 1.6s;
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
           veces seguidas y vuelve -- con animation-delay distinto en cada lado (arriba) para que
           las dos luces nunca se enciendan/apaguen exactamente a la vez. */
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
    </>
  );
}
