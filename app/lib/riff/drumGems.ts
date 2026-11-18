// NOTAS DE LA BATERÍA con la forma de su pieza (usuario, 2026-11-18; puro, sin React): las que caen por el
// carril en modo batería se dibujan como el instrumento al que pertenecen, pero TODAS centradas en la misma
// `y` de siempre (la del carril): solo cambia el dibujo, nunca la altura a la que caen.
//   bombo (0): círculo de frente, algo más pequeño que el círculo de antes
//   platos (1 y 5, sin pie): elipse ancha y fina; el plato fuerte, algo más ancho
//   caja y toms (2, 3, 4): cilindro (parche arriba, casco y borde de abajo); el tom grave, el más ancho
import { CRASH, HIGH_TOM, HIHAT, KICK, LOW_TOM, SNARE } from './drums';

// Lo que necesita del contexto 2D (así un test puede apuntar las llamadas).
export interface GemPathTarget {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, anticlockwise?: boolean): void;
  closePath(): void;
}

export type DrumGemKind = 'kick' | 'cymbal' | 'drum';

export function drumGemKind(pad: number): DrumGemKind {
  if (pad === KICK) return 'kick';
  if (pad === HIHAT || pad === CRASH) return 'cymbal';
  return 'drum';
}

// Traza (sin rellenar) la forma de la nota del pad `pad`, centrada en (x, y). `w` y `h` son el ancho y el alto
// de la gema normal; `radius`, el del círculo de antes. Devuelve la forma, y en los platos su campana (para
// dibujarla encima).
export function drumGemPath(
  ctx: GemPathTarget,
  pad: number,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): { kind: DrumGemKind; bell?: { x: number; y: number; rx: number; ry: number } } {
  const kind = drumGemKind(pad);
  ctx.beginPath();
  if (kind === 'kick') {
    const r = radius * 0.8;
    ctx.moveTo(x + r, y);
    ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
    return { kind };
  }
  if (kind === 'cymbal') {
    const rx = w * (pad === CRASH ? 0.58 : 0.5);
    const ry = Math.max(3, h * 0.3);
    ctx.moveTo(x + rx, y);
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    return { kind, bell: { x, y: y - ry * 0.25, rx: rx * 0.16, ry: ry * 0.45 } };
  }
  // Cilindro de alto 1,1 h centrado en y: parche (elipse de arriba) + casco + borde de abajo.
  const rx = w * (pad === LOW_TOM ? 0.46 : pad === HIGH_TOM ? 0.44 : pad === SNARE ? 0.42 : 0.44);
  const ry = Math.max(2, h * 0.22);
  const top = y - h * 0.55 + ry;
  const bottom = y + h * 0.55 - ry;
  ctx.moveTo(x - rx, top);
  ctx.lineTo(x - rx, bottom);
  ctx.ellipse(x, bottom, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + rx, top);
  ctx.ellipse(x, top, rx, ry, 0, 0, Math.PI, true);
  ctx.closePath();
  // El parche entero (se ve como la tapa del tambor).
  ctx.moveTo(x + rx, top);
  ctx.ellipse(x, top, rx, ry, 0, 0, Math.PI * 2);
  return { kind };
}
