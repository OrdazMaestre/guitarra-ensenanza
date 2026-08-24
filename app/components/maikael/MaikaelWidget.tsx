'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { computeMaikaelPose, PIECE_CANVAS, rotatePoint, type PlacedPiece, type Point } from '@/app/lib/maikaelRig';
import { resolveFace, type MaikaelFace } from '@/app/lib/maikaelExpression';
import {
  useMaikaelGuitarLoop,
  useMaikaelLeftHandFret,
  LEFT_HAND_FRET_COUNT,
} from '@/app/lib/maikaelBodyAnimation';

type OpenStep = 'closed' | 'screen-on' | 'torso-out' | 'full';

const STEPS: OpenStep[] = ['closed', 'screen-on', 'torso-out', 'full'];
const STEP_DELAY_MS = 220;
const GUITAR_SCALE = 1.9; // "casi el doble" que el resto de piezas

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
const RIGHT_FOREARM_ROTATE_NEAR_DEG = 106.2; // traste cerca del cuerpo (unión mástil-caja)
const RIGHT_FOREARM_ROTATE_FAR_DEG = 201.8; // traste cerca de la ceja/nut (sin salto al interpolar)
const RIGHT_FOREARM_SCALE_NEAR = 0.72;
const RIGHT_FOREARM_SCALE_FAR = 0.87;
// Muñeca: dedos casi perpendiculares al mástil, "hacia arriba" — varía para
// mantener ese ángulo absoluto constante en cualquier punto del mástil.
const RIGHT_WRIST_NEAR_DEG = 42.6;
const RIGHT_WRIST_FAR_DEG = -53;

// Brazo izquierdo = rasgueo (mano siempre cerca de la caja), lado contrario.
const LEFT_SHOULDER_DEG = 15.1;
const LEFT_ELBOW_DEG = -86.2; // fijo — en la técnica real el codo apenas se mueve al rasguear
// La amplitud del rasgueo (muñeca) vive en la clase .maikael-strum de globals.css.

// Ancla del propio 09_guitarra.png: el agujero de la caja (soundhole), que
// ahora es el punto que se centra en la cadera del personaje.
const GUITAR_ANCHOR = { xPct: 128 / 256, yPct: 152 / 256 };
// 60° de giro desde la vertical nativa del dibujo = mástil a 30° sobre la
// horizontal, mirando a la derecha (90°-30°=60°).
const GUITAR_ROTATE_DEG = 60;

const FACE_ASSET: Record<MaikaelFace, string> = {
  normal: '/images/maikael/10_neutra.png',
  tocando: '/images/maikael/11_tocando.png',
  analizando: '/images/maikael/12_analizando.png',
  dibujando: '/images/maikael/13_dibujando.png',
  'fuera-tema': '/images/maikael/14_fuera_de_tema.png',
  sensible: '/images/maikael/15_tema_sensible.png',
};

const HEAD_OFF_ASSET = '/images/maikael/01_cabeza.png';

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
  const bodyState = useMaikaelGuitarLoop(step === 'full');
  const isPlayingGuitar = bodyState === 'guitar';
  const leftHandFret = useMaikaelLeftHandFret(isPlayingGuitar);
  const resolvedFace = face ?? resolveFace(false, null, bodyState);

  const pose = useMemo(() => computeMaikaelPose(32, 160), []);
  const worldWidth = 320;
  const worldHeight = 620;
  const displayHeight = 144; // el doble del tamaño inicial (72px), a petición de Ordaz tras ver el primer pase
  const scale = displayHeight / worldHeight;

  const showBody = step === 'torso-out' || step === 'full';
  const showLimbs = step === 'full';
  const headAsset =
    step === 'full' || step === 'torso-out' ? FACE_ASSET[resolvedFace] : step === 'screen-on' ? FACE_ASSET.normal : HEAD_OFF_ASSET;

  const cuerpo = pose[0];
  const cabeza = pose[1];
  const byKey = (key: string) => pose.find((p) => p.key === key)!;
  const legLPieces = [byKey('muslo-L'), byKey('cana-L'), byKey('pie-L')];
  const musloR = byKey('muslo-R');
  const canaR = byKey('cana-R');
  const pieR = byKey('pie-R');
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
  const rightForearmRotate = isPlayingGuitar
    ? RIGHT_FOREARM_ROTATE_NEAR_DEG + fretT * (RIGHT_FOREARM_ROTATE_FAR_DEG - RIGHT_FOREARM_ROTATE_NEAR_DEG)
    : 0;
  const rightForearmScale = isPlayingGuitar
    ? RIGHT_FOREARM_SCALE_NEAR + fretT * (RIGHT_FOREARM_SCALE_FAR - RIGHT_FOREARM_SCALE_NEAR)
    : 1;
  const rightWristAngle = isPlayingGuitar
    ? RIGHT_WRIST_NEAR_DEG + fretT * (RIGHT_WRIST_FAR_DEG - RIGHT_WRIST_NEAR_DEG)
    : 0;
  const leftShoulderAngle = isPlayingGuitar ? LEFT_SHOULDER_DEG : 0;
  const leftElbowAngle = isPlayingGuitar ? LEFT_ELBOW_DEG : 0;

  // El codo derecho es un punto FIJO (no sigue al traste) — el antebrazo+mano
  // se recolocan enteros para que su propio pivote de codo caiga justo ahí,
  // y luego el antebrazo rota+estira desde ese punto fijo hasta la mano.
  const elbowRFixed = isPlayingGuitar ? rotatePoint(elbowR, shoulderR, RIGHT_SHOULDER_DEG) : elbowR;
  const elbowShiftDx = elbowRFixed.x - elbowR.x;
  const elbowShiftDy = elbowRFixed.y - elbowR.y;
  const antebrazoRShifted = shiftPiece(antebrazoR, elbowShiftDx, elbowShiftDy);
  const manoRShifted = shiftPiece(manoR, elbowShiftDx, elbowShiftDy);
  const wristRShifted = shiftPoint(wristR, elbowShiftDx, elbowShiftDy);

  const guitarSize = PIECE_CANVAS * GUITAR_SCALE;
  // El agujero de la caja (GUITAR_ANCHOR) se centra en la cadera del personaje.
  const guitarTarget = { x: (shoulderL.x + shoulderR.x) / 2, y: cuerpo.y + 219 };
  const guitarLeft = guitarTarget.x - GUITAR_ANCHOR.xPct * guitarSize;
  const guitarTop = guitarTarget.y - GUITAR_ANCHOR.yPct * guitarSize;

  const widgetWidth = (worldWidth / worldHeight) * displayHeight;
  const isOn = step !== 'closed';

  return (
    <>
      {isOn && (
        <div
          role="status"
          style={{
            position: 'fixed',
            right: 16 + widgetWidth + 12,
            bottom: 16 + displayHeight - 40,
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
        aria-label={step === 'closed' ? 'Abrir a MAIkael' : 'Cerrar a MAIkael'}
        onClick={toggle}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          width: widgetWidth,
          height: displayHeight,
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          zIndex: 40,
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
        {showLimbs && legLPieces.map((piece) => pieceImg(piece))}
        {showLimbs && pieceImg(musloR)}
        {showLimbs && pieceImg(canaR)}
        {showLimbs && pieceImg(pieR, undefined, isPlayingGuitar ? 'maikael-foot-tap' : undefined)}
        {/* Bíceps derecho SIEMPRE se pinta antes que la guitarra: queda por
            detrás del mástil, como pidió Ordaz. Solo la rotación de hombro —
            el codo es un punto fijo, no sigue al traste. */}
        {showLimbs && (
          <RotatingGroup pivot={shoulderR} angleDeg={isPlayingGuitar ? RIGHT_SHOULDER_DEG : 0}>
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
        {/* Antebrazo+mano derechos: pintados DESPUÉS de la guitarra, para que
            la mano quede agarrando el mástil por encima. El codo queda fijo
            (elbowRFixed); el antebrazo rota+estira desde ahí hasta la mano,
            que siempre cae sobre el mástil. */}
        {showLimbs && (
          <RotatingGroup
            pivot={elbowRFixed}
            angleDeg={isPlayingGuitar ? rightForearmRotate : 0}
            scaleY={isPlayingGuitar ? rightForearmScale : 1}
          >
            {pieceImg(antebrazoRShifted)}
            <RotatingGroup pivot={wristRShifted} angleDeg={rightWristAngle}>
              {pieceImg(manoRShifted)}
            </RotatingGroup>
          </RotatingGroup>
        )}
      </div>
      </button>
    </>
  );
}
