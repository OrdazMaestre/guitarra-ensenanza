export interface Point {
  x: number;
  y: number;
}

/** Todas las piezas comparten este lienzo (README de maikael-review/updated-assets). */
export const PIECE_CANVAS = 256;

/**
 * Coordenadas de las bolas de articulación dentro del lienzo 256×256 de cada
 * pieza. Medidas a mano contra una rejilla ampliada 4x de cada PNG (algunas
 * confirmadas por las coordenadas del propio script de composición en
 * maikael-review/build-updated-assets.mjs: cuerpo.neck y las dos cuerpo.hip*).
 */
export const JOINTS = {
  cuerpo: {
    neck: { x: 128, y: 39 },
    hipL: { x: 105, y: 219 },
    hipR: { x: 151, y: 219 },
    shL: { x: 52, y: 95 },
    shR: { x: 204, y: 95 },
  },
  cabeza: { neckBottom: { x: 127, y: 198 } },
  biceps: { top: { x: 124, y: 66 }, bottom: { x: 134, y: 187 } },
  antebrazo: { top: { x: 126, y: 92 }, bottom: { x: 128, y: 190 } },
  mano: { top: { x: 130, y: 77 } },
  muslo: { top: { x: 128, y: 64 }, bottom: { x: 128, y: 190 } },
  cana: { top: { x: 127, y: 69 }, bottom: { x: 128, y: 190 } },
  pie: { top: { x: 121, y: 84 } },
} as const;

export function mirrorX(x: number): number {
  return PIECE_CANVAS - x;
}

/** Rota `point` alrededor de `origin` por `angleDeg` (sentido horario en
 * pantalla, igual que `transform: rotate()` de CSS). */
export function rotatePoint(point: Point, origin: Point, angleDeg: number): Point {
  const th = (angleDeg * Math.PI) / 180;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * Math.cos(th) - dy * Math.sin(th),
    y: origin.y + dx * Math.sin(th) + dy * Math.cos(th),
  };
}

export interface PlacedPiece {
  key: string;
  src: string;
  x: number;
  y: number;
  flip?: boolean;
  /** Origen de rotación en coordenadas de MUNDO, para animar esta pieza. */
  pivot?: Point;
}

const ASSET = (name: string) => `/images/maikael/${name}`;

/**
 * Calcula la posición (esquina superior izquierda, en coordenadas de mundo)
 * de cada pieza del cuerpo desplegado, encadenando articulación a
 * articulación desde el torso. `originX/originY` es dónde cae el propio
 * `02_cuerpo.png` (su esquina superior izquierda) dentro del mundo.
 */
export function computeMaikaelPose(originX: number, originY: number): PlacedPiece[] {
  const pieces: PlacedPiece[] = [];
  const world = (local: Point) => ({ x: originX + local.x, y: originY + local.y });

  pieces.push({ key: 'cuerpo', src: ASSET('02_cuerpo.png'), x: originX, y: originY });

  const neck = world(JOINTS.cuerpo.neck);
  const cabezaX = neck.x - JOINTS.cabeza.neckBottom.x;
  const cabezaY = neck.y - JOINTS.cabeza.neckBottom.y;
  pieces.push({ key: 'cabeza', src: ASSET('01_cabeza.png'), x: cabezaX, y: cabezaY });

  function leg(side: 'L' | 'R') {
    const flip = side === 'R';
    const hip = world(side === 'L' ? JOINTS.cuerpo.hipL : JOINTS.cuerpo.hipR);
    const musloTopX = flip ? mirrorX(JOINTS.muslo.top.x) : JOINTS.muslo.top.x;
    const musloX = hip.x - musloTopX;
    const musloY = hip.y - JOINTS.muslo.top.y;
    pieces.push({ key: `muslo-${side}`, src: ASSET('08_muslo.png'), x: musloX, y: musloY, flip, pivot: hip });

    const musloBottomX = musloX + (flip ? mirrorX(JOINTS.muslo.bottom.x) : JOINTS.muslo.bottom.x);
    const musloBottomY = musloY + JOINTS.muslo.bottom.y;
    const canaTopX = flip ? mirrorX(JOINTS.cana.top.x) : JOINTS.cana.top.x;
    const canaX = musloBottomX - canaTopX;
    const canaY = musloBottomY - JOINTS.cana.top.y;
    pieces.push({
      key: `cana-${side}`,
      src: ASSET('07_cana.png'),
      x: canaX,
      y: canaY,
      flip,
      pivot: { x: musloBottomX, y: musloBottomY },
    });

    const canaBottomX = canaX + (flip ? mirrorX(JOINTS.cana.bottom.x) : JOINTS.cana.bottom.x);
    const canaBottomY = canaY + JOINTS.cana.bottom.y;
    const pieTopX = flip ? mirrorX(JOINTS.pie.top.x) : JOINTS.pie.top.x;
    const pieX = canaBottomX - pieTopX;
    const pieY = canaBottomY - JOINTS.pie.top.y;
    pieces.push({
      key: `pie-${side}`,
      src: ASSET('06_pie.png'),
      x: pieX,
      y: pieY,
      flip,
      pivot: { x: canaBottomX, y: canaBottomY },
    });
  }

  function arm(side: 'L' | 'R') {
    const flip = side === 'R';
    const shoulder = world(side === 'L' ? JOINTS.cuerpo.shL : JOINTS.cuerpo.shR);
    const bicepsTopX = flip ? mirrorX(JOINTS.biceps.top.x) : JOINTS.biceps.top.x;
    const bicepsX = shoulder.x - bicepsTopX;
    const bicepsY = shoulder.y - JOINTS.biceps.top.y;
    pieces.push({ key: `biceps-${side}`, src: ASSET('05_biceps.png'), x: bicepsX, y: bicepsY, flip, pivot: shoulder });

    const bicepsBottomX = bicepsX + (flip ? mirrorX(JOINTS.biceps.bottom.x) : JOINTS.biceps.bottom.x);
    const bicepsBottomY = bicepsY + JOINTS.biceps.bottom.y;
    const antebrazoTopX = flip ? mirrorX(JOINTS.antebrazo.top.x) : JOINTS.antebrazo.top.x;
    const antebrazoX = bicepsBottomX - antebrazoTopX;
    const antebrazoY = bicepsBottomY - JOINTS.antebrazo.top.y;
    pieces.push({
      key: `antebrazo-${side}`,
      src: ASSET('04_antebrazo.png'),
      x: antebrazoX,
      y: antebrazoY,
      flip,
      pivot: { x: bicepsBottomX, y: bicepsBottomY },
    });

    const antebrazoBottomX = antebrazoX + (flip ? mirrorX(JOINTS.antebrazo.bottom.x) : JOINTS.antebrazo.bottom.x);
    const antebrazoBottomY = antebrazoY + JOINTS.antebrazo.bottom.y;
    const manoTopX = flip ? mirrorX(JOINTS.mano.top.x) : JOINTS.mano.top.x;
    const manoX = antebrazoBottomX - manoTopX;
    const manoY = antebrazoBottomY - JOINTS.mano.top.y;
    pieces.push({
      key: `mano-${side}`,
      src: ASSET('03_mano.png'),
      x: manoX,
      y: manoY,
      flip,
      pivot: { x: antebrazoBottomX, y: antebrazoBottomY },
    });
  }

  leg('L');
  leg('R');
  arm('L');
  arm('R');

  return pieces;
}
