'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { computeMaikaelPose, PIECE_CANVAS, JOINTS, mirrorX, rotatePoint, type PlacedPiece, type Point } from '@/app/lib/maikaelRig';
import {
  resolveFace,
  detectFaceFromReply,
  containsResetKeyword,
  type MaikaelFace,
  type MaikaelTransientFace,
} from '@/app/lib/maikaelExpression';
import MaikaelChat from './MaikaelChat';
import {
  useMaikaelGuitarLoop,
  useMaikaelLeftHandFret,
  LEFT_HAND_FRET_COUNT,
} from '@/app/lib/maikaelBodyAnimation';

type OpenStep = 'closed' | 'screen-on' | 'torso-out' | 'full';

const STEPS: OpenStep[] = ['closed', 'screen-on', 'torso-out', 'full'];
const STEP_DELAY_MS = 220;
const GUITAR_SCALE = 1.9; // "casi el doble" que el resto de piezas

// Ancla del propio 09_guitarra.png: el agujero de la caja (soundhole), que
// se centra en la cadera del personaje.
const GUITAR_ANCHOR = { xPct: 128 / 256, yPct: 152 / 256 };
// 60° de giro desde la vertical nativa del dibujo = mástil a 30° sobre la
// horizontal, mirando a la derecha (90°-30°=60°).
const GUITAR_ROTATE_DEG = 60;

// Ángulos de brazo mientras bodyState === 'guitar'. Segundo ajuste a petición
// de Ordaz: la guitarra se centra (agujero de la caja) en la cadera del
// personaje, mirando a la derecha ~30° sobre la horizontal. Como es un robot
// (articulaciones libres a 360°, sin límites anatómicos humanos), ambos
// brazos "se articulan al lado contrario" — se eligió a propósito la otra
// solución de codo de la IK en vez de la más "humana".
//
// Brazo derecho = traste. Prioridad (según Ordaz): 1) la mano SIEMPRE sobre
// el mástil, deslizándose a lo largo de él; 2) el bíceps por detrás del
// mástil; 3) el codo siempre por debajo. Como el codo queda en un punto FIJO
// (no sigue al traste) y la mano sí, el antebrazo casi nunca mide lo mismo
// que la distancia codo→mano — así que el antebrazo "estira" su longitud
// (scaleY sobre su propio pivote del codo) además de rotar. El bíceps se
// pinta ANTES que la guitarra (queda detrás) y el antebrazo+mano DESPUÉS
// (queda encima, agarrando el mástil de verdad).
const RIGHT_SHOULDER_DEG = -30; // fijo — dónde cae el codo, "cerrado" cerca del cuerpo
// Muñeca mientras toca (SIN antebrazo, mano colocada directamente sobre el
// mástil): ángulo ABSOLUTO. Ordaz lo planteó como ejes locales del mástil —
// el mástil ES el eje X (dirección GUITAR_ROTATE_DEG-90 desde la horizontal
// nativa) y la mano gira para que sus dedos apunten a lo largo del eje Y
// perpendicular. En reposo la mano cuelga con los dedos hacia abajo (~90° en
// convención de pantalla); se rota hasta el eje Y "hacia afuera" del mástil
// (GUITAR_ROTATE_DEG-180) restando esos 90° de reposo.
const RIGHT_WRIST_PLAY_DEG = GUITAR_ROTATE_DEG - 180 - 90;

// Brazo izquierdo = rasgueo (mano siempre cerca de la caja), lado contrario.
// +20° más "afuera" a petición de Ordaz sobre el valor resuelto por la IK (15.1°).
const LEFT_SHOULDER_DEG = 15.1 + 20;
const LEFT_ELBOW_DEG = -86.2 - 30; // -30° más "adentro" a petición de Ordaz (a verificar el sentido)
// La amplitud del rasgueo (muñeca) vive en la clase .maikael-strum de globals.css.

// REGLA (pedida por Ordaz): cualquier cambio de posición de una extremidad
// se hace ROTANDO su articulación, nunca desplazando la pieza suelta — así
// cada pieza sigue unida a la anterior en la cadena. (El desplazamiento de
// antebrazos en reposo y el giro de tobillo para los pies no convencieron y
// se revirtieron; los brazos en reposo vuelven a su pose original.)
//
// Piernas en reposo: sí se mantiene la apertura de cadera — a Ordaz le gustó
// ese resultado. Cadera rota un ángulo pequeño y la rodilla contra-rota la
// misma cantidad, así la caña+pie sigue colgando vertical (el pie no se abre
// más que la rodilla). sin(θ) = 2 / (126 * escala) ≈ 3.27° (126 = longitud
// cadera→rodilla).
const LEG_HIP_OPEN_DEG = 3.27;

// Brazos en reposo (sin guitarra): antes colgaban pegados al cuerpo, se ven
// más naturales con el hombro abriendo un poco hacia afuera y el codo
// contra-rotando la misma cantidad — mismo truco que la cadera/rodilla de
// las piernas, así el antebrazo+mano sigue colgando vertical.
const REST_SHOULDER_OPEN_DEG = 10;
// +10° extra hacia afuera en el codo derecho de reposo, a petición de Ordaz
// (negativo = "afuera" del lado derecho, misma convención que el hombro).
const REST_RIGHT_ELBOW_EXTRA_OPEN_DEG = -10;

const FACE_ASSET: Record<MaikaelFace, string> = {
  normal: '/images/maikael/10_neutra.png',
  tocando: '/images/maikael/11_tocando.png',
  analizando: '/images/maikael/12_analizando.png',
  dibujando: '/images/maikael/13_dibujando.png',
  'fuera-tema': '/images/maikael/14_fuera_de_tema.png',
  sensible: '/images/maikael/15_tema_sensible.png',
};

const HEAD_OFF_ASSET = '/images/maikael/01_cabeza.png';
// Cabeza apagada + "zzZ" — copia de 01_cabeza.png con el texto compuesto
// encima de la pantalla negra, en el mismo cian de los iconos de expresión.
const DORMIDO_ASSET = '/images/maikael/16_dormido.png';

const FINE_POINTER_QUERY = '(pointer: fine)';

function subscribeFinePointer(callback: () => void) {
  const mq = window.matchMedia(FINE_POINTER_QUERY);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}
function getFinePointerSnapshot() {
  return window.matchMedia(FINE_POINTER_QUERY).matches;
}
function getFinePointerServerSnapshot() {
  return false; // por defecto, tamaño de móvil/táctil hasta que el cliente confirme puntero fino
}

/**
 * true en ratón/trackpad (PC), false en pantallas táctiles — el 20% extra de
 * tamaño de MAIkael (para leer "MAIkael" en el pecho) solo aplica en PC, a
 * petición de Ordaz. `useSyncExternalStore` evita el salto de hidratación:
 * SSR y el primer render de cliente usan el mismo valor (false/móvil), y
 * React actualiza al valor real justo después de montar.
 */
function useIsFinePointer() {
  return useSyncExternalStore(subscribeFinePointer, getFinePointerSnapshot, getFinePointerServerSnapshot);
}

/**
 * Sustituye al pósit original para el límite diario (1.500 mensajes): en vez
 * de tapar el chat con una nota, MAIkael simplemente no "despliega el
 * cuerpo" al intentar abrirlo — se queda dormido (cabeza apagada + "zzZ").
 * El límite de sesión (50 mensajes) NO usa esto — se avisa desde el propio
 * chat en su último mensaje permitido (Fase 5), no desde el widget.
 *
 * `reached` empieza en `null` (aún no lo sabemos) y se rellena al montar —
 * así la cabeza ya puede aparecer dormida desde el primer render si el cupo
 * ya estaba agotado por otros alumnos. `checkNow` vuelve a consultar el
 * estado real justo en el momento del clic (más fiable que el valor cacheado
 * del montaje, por si el cupo se agotó mientras la pestaña estaba abierta).
 */
function useMaikaelDailyLimit() {
  const [reached, setReached] = useState<boolean | null>(null);

  // Chequeo del montaje: independiente de checkNow (más abajo) para que el
  // efecto solo dispare el setState desde el .then() de una promesa, nunca
  // de forma síncrona en su propio cuerpo.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/maikael/status')
      .then((res) => res.json())
      .then((data: { dailyRemaining: number }) => {
        if (!cancelled) setReached(data.dailyRemaining <= 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Chequeo bajo demanda, llamado desde el manejador de clic — vuelve a
  // consultar el estado real justo en ese instante (más fiable que el valor
  // cacheado del montaje, por si el cupo se agotó mientras la pestaña
  // estaba abierta) y devuelve el resultado para decidir al momento.
  const checkNow = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/maikael/status');
      const data = (await res.json()) as { dailyRemaining: number };
      const isReached = data.dailyRemaining <= 0;
      setReached(isReached);
      return isReached;
    } catch {
      // Si falla la consulta, no bloqueamos a MAIkael por un problema de red.
      return false;
    }
  };

  return { reached, checkNow };
}

/** Un paso cada vez hacia `target`, en cualquier dirección — abrir y cerrar
 * recorren la misma secuencia de 4 pasos, solo cambia el sentido. */
function useOpenStep() {
  const [step, setStep] = useState<OpenStep>('closed');
  const [target, setTarget] = useState<'closed' | 'full'>('closed');

  useEffect(() => {
    const currentIndex = STEPS.indexOf(step);
    const targetIndex = STEPS.indexOf(target);
    if (currentIndex === targetIndex) return;
    const direction = targetIndex > currentIndex ? 1 : -1;
    const timer = setTimeout(() => setStep(STEPS[currentIndex + direction]), STEP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [step, target]);

  const toggle = () => setTarget((current) => (current === 'closed' ? 'full' : 'closed'));
  return { step, toggle };
}

export interface MaikaelWidgetProps {
  /**
   * Cara a mostrar cuando el widget está abierto. Si no se pasa, se resuelve
   * sola a partir de si está tocando la guitarra en su ciclo idle o no — las
   * caras que dependen del chat (analizando/dibujando/fuera-tema/sensible)
   * las decide quien conecte esto al chat real (Fase 5).
   */
  face?: MaikaelFace;
}

function pieceImg(piece: PlacedPiece, extraStyle?: CSSProperties, className?: string) {
  return (
    <img
      key={piece.key}
      src={piece.src}
      alt=""
      className={className}
      style={{
        position: 'absolute',
        left: piece.x,
        top: piece.y,
        width: PIECE_CANVAS,
        height: PIECE_CANVAS,
        transform: piece.flip ? 'scaleX(-1)' : undefined,
        ...extraStyle,
      }}
    />
  );
}

/** Envuelve un grupo de piezas para rotarlas (y opcionalmente estirarlas)
 * juntas alrededor de un pivote en coordenadas de mundo (hombro/codo/muñeca).
 * `scaleY` estira a lo largo del eje local de la pieza sin mover el pivote —
 * lo usa el antebrazo derecho para "alcanzar" la mano hasta el mástil. */
function RotatingGroup({
  pivot,
  angleDeg,
  scaleY = 1,
  children,
}: {
  pivot: { x: number; y: number };
  angleDeg: number;
  scaleY?: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transformOrigin: `${pivot.x}px ${pivot.y}px`,
        transform: `rotate(${angleDeg}deg) scaleY(${scaleY})`,
        transition: 'transform 300ms ease',
      }}
    >
      {children}
    </div>
  );
}

/** Traslada una pieza (y su pivote, si tiene) por (dx, dy) en coordenadas de
 * mundo, sin tocar su tamaño ni su flip. */
function shiftPiece(piece: PlacedPiece, dx: number, dy: number): PlacedPiece {
  return {
    ...piece,
    x: piece.x + dx,
    y: piece.y + dy,
    pivot: piece.pivot ? { x: piece.pivot.x + dx, y: piece.pivot.y + dy } : undefined,
  };
}

function shiftPoint(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}

export default function MaikaelWidget({ face }: MaikaelWidgetProps) {
  const { step, toggle } = useOpenStep();
  const { reached: dailyLimitReached, checkNow: checkDailyLimit } = useMaikaelDailyLimit();
  const bodyState = useMaikaelGuitarLoop(step === 'full');
  const isPlayingGuitar = bodyState === 'guitar';
  const leftHandFret = useMaikaelLeftHandFret(isPlayingGuitar);

  // Estado de expresión que depende del chat real (Fase 3: sensitiveSticky
  // manda sobre todo, transientFace refleja el último turno) — lo alimentan
  // los callbacks que le pasamos a MaikaelChat más abajo.
  const [sensitiveSticky, setSensitiveSticky] = useState(false);
  const [transientFace, setTransientFace] = useState<MaikaelTransientFace>(null);
  const resolvedFace = face ?? resolveFace(sensitiveSticky, transientFace, bodyState);

  function handleUserMessage(text: string) {
    if (sensitiveSticky && containsResetKeyword(text)) {
      setSensitiveSticky(false);
    }
    setTransientFace('analizando');
  }

  function handleReply(text: string) {
    const detected = detectFaceFromReply(text);
    if (detected.triggersSensitive) {
      setSensitiveSticky(true);
      setTransientFace(null);
    } else {
      setTransientFace(detected.transientFace);
    }
  }

  const pose = useMemo(() => computeMaikaelPose(32, 160), []);
  const worldWidth = 320;
  const worldHeight = 620;
  const isFinePointer = useIsFinePointer();
  const displayHeight = isFinePointer ? 144 * 1.2 : 144; // 20% más grande solo en PC (ratón/trackpad)
  const scale = displayHeight / worldHeight;

  // Pies (forma activa) y cabeza (forma guardada) a 3px del borde inferior de
  // la pantalla. El lienzo de mundo (worldHeight) no coincide con dónde
  // terminan de verdad esas piezas — se midió el píxel no transparente más
  // bajo de cada PNG (01_cabeza.png y 06_pie.png) para calcular el `bottom`
  // exacto en cada caso; por eso el botón cambia de `bottom` según el paso.
  const CABEZA_ART_BOTTOM_LOCAL = 211; // dentro de su lienzo 256×256
  const PIE_ART_BOTTOM_LOCAL = 184;
  const cabezaWorldBottomClosed = (worldHeight - PIECE_CANVAS) / 2 + CABEZA_ART_BOTTOM_LOCAL;
  const piesWorldBottom = pose.find((p) => p.key === 'pie-L')!.y + PIE_ART_BOTTOM_LOCAL;
  const bottomClosed = 3 - (worldHeight - cabezaWorldBottomClosed) * scale;
  const bottomOpen = 3 - (worldHeight - piesWorldBottom) * scale;
  const widgetBottom = step === 'closed' ? bottomClosed : bottomOpen;

  const showBody = step === 'torso-out' || step === 'full';
  const showLimbs = step === 'full';
  const headAsset =
    step === 'full' || step === 'torso-out'
      ? FACE_ASSET[resolvedFace]
      : step === 'screen-on'
        ? FACE_ASSET.normal
        : dailyLimitReached
          ? DORMIDO_ASSET
          : HEAD_OFF_ASSET;

  // Al hacer clic para abrir, se confirma el cupo diario justo en ese
  // instante (más fiable que el valor cacheado del montaje). Si está
  // agotado, MAIkael se queda dormido: no se llama a toggle(), así que
  // nunca avanza de 'closed' — solo cambia qué cabeza se muestra.
  async function handleClick() {
    if (step === 'closed') {
      const isReached = await checkDailyLimit();
      if (isReached) return;
    }
    toggle();
  }

  const cuerpo = pose[0];
  const cabeza = pose[1];
  const byKey = (key: string) => pose.find((p) => p.key === key)!;
  const musloL = byKey('muslo-L');
  const canaL = byKey('cana-L');
  const pieL = byKey('pie-L');
  const musloR = byKey('muslo-R');
  const canaR = byKey('cana-R');
  const pieR = byKey('pie-R');
  const hipL = musloL.pivot!;
  const kneeL = canaL.pivot!;
  const hipR = musloR.pivot!;
  const kneeR = canaR.pivot!;
  // Los pies simplemente invierten su imagen en el eje X respecto a como los
  // calcula el rig general (que los pensó para brazos/piernas simétricos,
  // no para la forma concreta del dibujo del pie) — a petición de Ordaz. Pero
  // invertir la imagen (scaleX(-1) alrededor del CENTRO del lienzo) desplaza
  // visualmente el "tobillo" del pie, que no está exactamente centrado en su
  // propio lienzo (JOINTS.pie.top.x=121, no 128) — separamos cada pie esa
  // misma distancia para que su tobillo vuelva a coincidir con el de la
  // caña a la que se une, en vez de dejar un hueco/solape.
  const PIE_ANKLE_MIRROR_SHIFT = mirrorX(JOINTS.pie.top.x) - JOINTS.pie.top.x; // = 14
  const pieLFlipped: PlacedPiece = shiftPiece({ ...pieL, flip: !pieL.flip }, -PIE_ANKLE_MIRROR_SHIFT, 0);
  const pieRFlipped: PlacedPiece = shiftPiece({ ...pieR, flip: !pieR.flip }, PIE_ANKLE_MIRROR_SHIFT, 0);
  const bicepsL = byKey('biceps-L');
  const antebrazoL = byKey('antebrazo-L');
  const manoL = byKey('mano-L');
  const bicepsR = byKey('biceps-R');
  const antebrazoR = byKey('antebrazo-R');
  const manoR = byKey('mano-R');
  const shoulderL = bicepsL.pivot!;
  const elbowL = antebrazoL.pivot!;
  const wristL = manoL.pivot!;
  const shoulderR = bicepsR.pivot!;
  const elbowR = antebrazoR.pivot!;
  const wristR = manoR.pivot!;

  const fretT = leftHandFret / (LEFT_HAND_FRET_COUNT - 1);
  // Solo se usa en la cadena de reposo (con antebrazo) — en reposo vale 0.
  const rightWristAngle = 0;
  // Izquierdo: positivo abre el hombro hacia afuera (lado izquierdo de la
  // pantalla); el codo contra-rota para que el antebrazo siga vertical.
  const leftShoulderAngle = isPlayingGuitar ? LEFT_SHOULDER_DEG : REST_SHOULDER_OPEN_DEG;
  const leftElbowAngle = isPlayingGuitar ? LEFT_ELBOW_DEG : -REST_SHOULDER_OPEN_DEG;
  // Derecho: negativo abre el hombro hacia afuera (lado derecho), espejo del
  // izquierdo — se usa también para reposicionar el codo fijo más abajo.
  const restShoulderAngleR = -REST_SHOULDER_OPEN_DEG;

  // Cadera abre hacia afuera, rodilla contra-rota la misma cantidad (positivo
  // mueve el extremo de un segmento colgante hacia la izquierda; negativo,
  // hacia la derecha).
  const hipAngleL = LEG_HIP_OPEN_DEG;
  const kneeAngleL = -LEG_HIP_OPEN_DEG;
  const hipAngleR = -LEG_HIP_OPEN_DEG;
  const kneeAngleR = LEG_HIP_OPEN_DEG;

  // Solo se usa de verdad para la cadena de REPOSO (antebrazo+mano normales).
  // Mientras toca, el bíceps ya no usa RIGHT_SHOULDER_DEG (ver
  // rightShoulderPlayAngle más abajo, que apunta hacia la mano de verdad),
  // así que este valor con RIGHT_SHOULDER_DEG no se consume en ese caso.
  const elbowRFixed = rotatePoint(elbowR, shoulderR, isPlayingGuitar ? RIGHT_SHOULDER_DEG : restShoulderAngleR);
  const elbowShiftDx = elbowRFixed.x - elbowR.x;
  const elbowShiftDy = elbowRFixed.y - elbowR.y;
  const antebrazoRShifted = shiftPiece(antebrazoR, elbowShiftDx, elbowShiftDy);
  const manoRShifted = shiftPiece(manoR, elbowShiftDx, elbowShiftDy);
  const wristRShifted = shiftPoint(wristR, elbowShiftDx, elbowShiftDy);

  const guitarSize = PIECE_CANVAS * GUITAR_SCALE;
  // El agujero de la caja (GUITAR_ANCHOR) se centra en la cadera del personaje.
  // +10px, +20px y +5px de pantalla (derecha, derecha, arriba) a petición de
  // Ordaz — convertido a unidades de mundo dividiendo por la escala, ya que
  // este punto vive en el sistema de coordenadas de mundo.
  const guitarTarget = { x: (shoulderL.x + shoulderR.x) / 2 + 30 / scale, y: cuerpo.y + 219 - 5 / scale };
  const guitarLeft = guitarTarget.x - GUITAR_ANCHOR.xPct * guitarSize;
  const guitarTop = guitarTarget.y - GUITAR_ANCHOR.yPct * guitarSize;

  // Convierte un punto LOCAL del lienzo 256×256 de 09_guitarra.png a
  // coordenadas de mundo, usando la posición/rotación actuales de la
  // guitarra — así la mano siempre se encuentra sobre el mástil de verdad,
  // aunque la guitarra se mueva más adelante (antes se usaban constantes
  // fijas calculadas para una posición vieja de la guitarra, y se
  // desincronizaron en cuanto la guitarra se desplazó por otra petición).
  function guitarLocalToWorld(local: Point): Point {
    const scaled = { x: local.x * GUITAR_SCALE, y: local.y * GUITAR_SCALE };
    const anchorScaled = { x: GUITAR_ANCHOR.xPct * guitarSize, y: GUITAR_ANCHOR.yPct * guitarSize };
    const unrotated = { x: guitarTarget.x + (scaled.x - anchorScaled.x), y: guitarTarget.y + (scaled.y - anchorScaled.y) };
    return rotatePoint(unrotated, guitarTarget, GUITAR_ROTATE_DEG);
  }

  // El "eje X" del mástil (pedido por Ordaz): un punto cerca del cuerpo de la
  // guitarra (unión mástil-caja) y otro cerca de la ceja/nut, medidos a mano
  // sobre el PNG nativo. La mano se mueve a lo largo de esa línea según el
  // traste aleatorio (fretT), nunca fuera de ella.
  // Ordaz midió el recorrido real en pantalla como "0 a 2" cuando debía ser
  // "-1 a 1": mismo ancho, recentrado medio recorrido hacia el cuerpo (nunca
  // llegaba a los trastes agudos, y a veces se pasaba del clavijero) — se
  // corrige desplazando los dos puntos esa misma mitad hacia el cuerpo.
  const NECK_BODY_LOCAL: Point = { x: 128, y: 145.5 };
  const NECK_NUT_LOCAL: Point = { x: 128, y: 84.5 };
  const neckBodyWorld = guitarLocalToWorld(NECK_BODY_LOCAL);
  const neckNutWorld = guitarLocalToWorld(NECK_NUT_LOCAL);
  // "Eje Y" del mástil (perpendicular): la mano baja 10px de pantalla hacia
  // el lado del cuerpo (opuesto al que apuntan los dedos), a petición de Ordaz.
  const NECK_Y_AXIS_DOWN_DEG = GUITAR_ROTATE_DEG; // opuesto a RIGHT_WRIST_PLAY_DEG's eje "hacia afuera"
  const manoRPlayYOffsetPx = 20 / scale; // 10 + 10px más, a petición de Ordaz
  const manoRPlayTarget: Point = {
    x:
      neckBodyWorld.x +
      fretT * (neckNutWorld.x - neckBodyWorld.x) +
      manoRPlayYOffsetPx * Math.cos((NECK_Y_AXIS_DOWN_DEG * Math.PI) / 180),
    y:
      neckBodyWorld.y +
      fretT * (neckNutWorld.y - neckBodyWorld.y) +
      manoRPlayYOffsetPx * Math.sin((NECK_Y_AXIS_DOWN_DEG * Math.PI) / 180),
  };
  const manoRPlayShifted = shiftPiece(manoR, manoRPlayTarget.x - wristR.x, manoRPlayTarget.y - wristR.y);

  // Coherencia del brazo derecho mientras toca (pedido por Ordaz): sin
  // antebrazo dibujado, el bíceps debe APUNTAR hacia la mano (que se mueve
  // sola a lo largo del mástil) para que su bola del codo quede tocando o
  // muy cerca de la bola de la muñeca — no falta que coincidan siempre, solo
  // que lo intenten, para que no se sienta "mano flotante". El bíceps mide lo
  // que mide (no se estira), así que apunta en la MISMA dirección que la
  // mano aunque no siempre llegue exactamente a tocarla.
  const rightShoulderPlayAngle = (() => {
    const targetAngleDeg = (Math.atan2(manoRPlayTarget.y - shoulderR.y, manoRPlayTarget.x - shoulderR.x) * 180) / Math.PI;
    const restUpperAngleDeg = (Math.atan2(elbowR.y - shoulderR.y, elbowR.x - shoulderR.x) * 180) / Math.PI;
    return targetAngleDeg - restUpperAngleDeg;
  })();

  const widgetWidth = (worldWidth / worldHeight) * displayHeight;
  const isOn = step !== 'closed';
  const WIDGET_RIGHT = 31; // 16 original, -5px y ahora -10px más a la izquierda, a petición de Ordaz

  return (
    <>
      {step === 'full' && (
        <div
          style={{
            position: 'fixed',
            right: WIDGET_RIGHT + widgetWidth + 12,
            bottom: 3, // el recuadro de texto queda a 3px del borde inferior, a petición de Ordaz
            zIndex: 39,
          }}
        >
          <MaikaelChat onUserMessage={handleUserMessage} onReply={handleReply} />
        </div>
      )}
      {isOn && step !== 'full' && (
        <div
          role="status"
          style={{
            position: 'fixed',
            right: WIDGET_RIGHT + widgetWidth + 12,
            bottom: widgetBottom + displayHeight - 48,
            maxWidth: 190,
            background: '#fffdf7',
            border: '2px solid #ee9721',
            borderRadius: 14,
            padding: '8px 12px',
            fontSize: 13,
            lineHeight: 1.35,
            color: '#3a2a12',
            fontFamily: 'inherit',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            zIndex: 39,
            pointerEvents: 'none',
          }}
        >
          Saludos, soy MAIkael, aún me están construyendo
          <span
            aria-hidden
            style={{
              position: 'absolute',
              right: -8,
              bottom: 14,
              width: 0,
              height: 0,
              borderTop: '7px solid transparent',
              borderBottom: '7px solid transparent',
              borderLeft: '9px solid #ee9721',
            }}
          />
          <span
            aria-hidden
            style={{
              position: 'absolute',
              right: -5.5,
              bottom: 15,
              width: 0,
              height: 0,
              borderTop: '5.5px solid transparent',
              borderBottom: '5.5px solid transparent',
              borderLeft: '7px solid #fffdf7',
            }}
          />
        </div>
      )}
      <button
        type="button"
        aria-label={
          step !== 'closed' ? 'Cerrar a MAIkael' : dailyLimitReached ? 'MAIkael está dormido por hoy' : 'Abrir a MAIkael'
        }
        onClick={handleClick}
        style={{
          position: 'fixed',
          right: WIDGET_RIGHT,
          bottom: widgetBottom,
          width: widgetWidth,
          height: displayHeight,
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          zIndex: 40,
          transition: 'bottom 220ms ease',
        }}
      >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: worldWidth,
          height: worldHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {showBody && (
          <img
            src={cuerpo.src}
            alt=""
            style={{ position: 'absolute', left: cuerpo.x, top: cuerpo.y, width: PIECE_CANVAS, height: PIECE_CANVAS }}
          />
        )}
        <img
          src={headAsset}
          alt="MAIkael"
          className={isPlayingGuitar ? 'maikael-head-bob' : undefined}
          style={{
            position: 'absolute',
            left: showBody ? cabeza.x : (worldWidth - PIECE_CANVAS) / 2,
            top: showBody ? cabeza.y : (worldHeight - PIECE_CANVAS) / 2,
            width: PIECE_CANVAS,
            height: PIECE_CANVAS,
            transition: 'left 200ms ease, top 200ms ease',
          }}
        />
        {/* Pierna izquierda: cadera → rodilla (contra-rotada), pie con la
            imagen invertida en X respecto al cálculo general del rig. */}
        {showLimbs && (
          <RotatingGroup pivot={hipL} angleDeg={hipAngleL}>
            {pieceImg(musloL)}
            <RotatingGroup pivot={kneeL} angleDeg={kneeAngleL}>
              {pieceImg(canaL)}
              {pieceImg(pieLFlipped)}
            </RotatingGroup>
          </RotatingGroup>
        )}
        {/* Pierna derecha: misma cadena, ángulos en espejo. */}
        {showLimbs && (
          <RotatingGroup pivot={hipR} angleDeg={hipAngleR}>
            {pieceImg(musloR)}
            <RotatingGroup pivot={kneeR} angleDeg={kneeAngleR}>
              {pieceImg(canaR)}
              {pieceImg(pieRFlipped, undefined, isPlayingGuitar ? 'maikael-foot-tap' : undefined)}
            </RotatingGroup>
          </RotatingGroup>
        )}
        {/* Bíceps derecho SIEMPRE se pinta antes que la guitarra: queda por
            detrás del mástil, como pidió Ordaz. Solo la rotación de hombro —
            el codo es un punto fijo, no sigue al traste. */}
        {showLimbs && (
          <RotatingGroup pivot={shoulderR} angleDeg={isPlayingGuitar ? rightShoulderPlayAngle : restShoulderAngleR}>
            {pieceImg(bicepsR)}
          </RotatingGroup>
        )}
        {showLimbs && isPlayingGuitar && (
          <img
            src="/images/maikael/09_guitarra.png"
            alt=""
            style={{
              position: 'absolute',
              left: guitarLeft,
              top: guitarTop,
              width: guitarSize,
              height: guitarSize,
              transform: `rotate(${GUITAR_ROTATE_DEG}deg)`,
              transformOrigin: `${GUITAR_ANCHOR.xPct * 100}% ${GUITAR_ANCHOR.yPct * 100}%`,
              opacity: 0.95,
            }}
          />
        )}
        {/* Brazo izquierdo: rasgueo (mano en la caja, muñeca oscilando). Va
            encima de la guitarra para que la mano se vea rasgueando de verdad. */}
        {showLimbs && (
          <RotatingGroup pivot={shoulderL} angleDeg={leftShoulderAngle}>
            {pieceImg(bicepsL)}
            <RotatingGroup pivot={elbowL} angleDeg={leftElbowAngle}>
              {pieceImg(antebrazoL)}
              {isPlayingGuitar ? (
                <div
                  className="maikael-strum"
                  style={{ position: 'absolute', inset: 0, transformOrigin: `${wristL.x}px ${wristL.y}px` }}
                >
                  {pieceImg(manoL)}
                </div>
              ) : (
                pieceImg(manoL)
              )}
            </RotatingGroup>
          </RotatingGroup>
        )}
        {/* Antebrazo+mano derechos, pintados DESPUÉS de la guitarra para que
            la mano quede agarrando el mástil por encima. En reposo: cadena
            normal codo fijo→antebrazo→mano. Tocando: prueba de Ordaz — sin
            antebrazo, la mano va directa al mismo punto del mástil que antes
            calculaba el antebrazo, sin la restricción de su longitud. */}
        {showLimbs && !isPlayingGuitar && (
          <RotatingGroup pivot={elbowRFixed} angleDeg={-restShoulderAngleR + REST_RIGHT_ELBOW_EXTRA_OPEN_DEG}>
            {pieceImg(antebrazoRShifted)}
            <RotatingGroup pivot={wristRShifted} angleDeg={rightWristAngle}>
              {pieceImg(manoRShifted)}
            </RotatingGroup>
          </RotatingGroup>
        )}
        {showLimbs && isPlayingGuitar && (
          <RotatingGroup pivot={manoRPlayTarget} angleDeg={RIGHT_WRIST_PLAY_DEG}>
            {pieceImg(manoRPlayShifted)}
          </RotatingGroup>
        )}
      </div>
      </button>
    </>
  );
}
