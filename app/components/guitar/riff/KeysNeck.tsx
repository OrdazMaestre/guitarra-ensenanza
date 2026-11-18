// MÁSTIL EN MODO TECLADO (usuario, 2026-11-18): con una pista de piano, órgano o sinte en Riff-Hero el mástil
// se dibuja como un TECLADO, una columna por semitono (traste = semitonos desde la tecla más grave del
// nivel, ver app/lib/riff/keys.ts). Las negras ocupan su columna arriba (carril de la cuerda 5, VERDE) y las
// blancas llegan abajo hasta la mitad de cada negra vecina (carril de la cuerda 6, ROJO), con el degradado
// de cada carril del modo dos cuerdas (`stringFretColor`). Coherente con la batería (DrumKitNeck): dibujo fijo
// dentro del `<svg>` del mástil y los brillos al tocar aparte (`KeysHits`, solo cambia `data-on`, el CSS
// funde la opacidad), sin re-render del mástil.
import { stringFretColor } from '../../../lib/riff/colors';
import { BLACK_STRING, isBlackKey, WHITE_STRING } from '../../../lib/riff/keys';

export interface KeysNeckGeometry {
  // Borde izquierdo de la columna de una tecla y su ancho (ya con el modo zurdo: `x(fret)` es el borde
  // lógico izquierdo, que `drawX` refleja).
  colLeft: (fret: number) => number;
  colWidth: number;
  drawX: (x: number) => number;
  top: number;
  height: number;
  // MIDI de la columna 0 y número de columnas.
  low: number;
  count: number;
}

// Las negras ocupan la parte de arriba de la tabla.
export const BLACK_KEY_DEPTH = 0.56;

const pale = (hex: string, k: number) => {
  const c = [1, 3, 5].map((j) => parseInt(hex.slice(j, j + 2), 16));
  return `#${c.map((v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')).join('')}`;
};
const dark = (hex: string, k: number) => {
  const c = [1, 3, 5].map((j) => parseInt(hex.slice(j, j + 2), 16));
  const base = [0x11, 0x18, 0x27];
  return `#${c.map((v, i) => Math.round(base[i] + (v - base[i]) * k).toString(16).padStart(2, '0')).join('')}`;
};

// Color de una tecla (el de su gema): blancas en rojo, negras en verde, con su degradado.
export function keyColor(fret: number, g: KeysNeckGeometry): string {
  return stringFretColor(isBlackKey(g.low + fret) ? BLACK_STRING : WHITE_STRING, fret, g.count - 1);
}

// Rectángulo de una tecla en coordenadas del viewBox (ya reflejado en zurdo).
export function keyRect(fret: number, g: KeysNeckGeometry): { x: number; y: number; w: number; h: number } {
  const midi = g.low + fret;
  let from = fret;
  let to = fret + 1;
  if (!isBlackKey(midi)) {
    if (fret > 0 && isBlackKey(midi - 1)) from -= 0.5;
    if (fret < g.count - 1 && isBlackKey(midi + 1)) to += 0.5;
  }
  const a = g.drawX(g.colLeft(0) + from * g.colWidth);
  const b = g.drawX(g.colLeft(0) + to * g.colWidth);
  const h = isBlackKey(midi) ? g.height * BLACK_KEY_DEPTH : g.height;
  return { x: Math.min(a, b), y: g.top, w: Math.abs(b - a), h };
}

// Qué tecla hay en un punto (x lógica, sin reflejar; y del viewBox): arriba, la negra si la columna es
// negra; si no (o abajo), la blanca de ese trozo. null = fuera.
export function keyAt(x: number, y: number, g: KeysNeckGeometry): number | null {
  const col = (x - g.colLeft(0)) / g.colWidth;
  if (col < 0 || col >= g.count || y < g.top - 20 || y > g.top + g.height + 20) return null;
  const fret = Math.floor(col);
  const midi = g.low + fret;
  if (!isBlackKey(midi)) return fret;
  if (y <= g.top + g.height * BLACK_KEY_DEPTH) return fret;
  // Debajo de una negra: la blanca de su lado.
  const side = col - fret < 0.5 ? fret - 1 : fret + 1;
  return Math.max(0, Math.min(g.count - 1, side));
}

const frets = (g: KeysNeckGeometry) => Array.from({ length: g.count }, (_, fret) => fret);

export default function KeysNeck({ g }: { g: KeysNeckGeometry }) {
  const left = g.drawX(g.colLeft(0));
  const right = g.drawX(g.colLeft(0) + g.count * g.colWidth);
  return (
    <g className="riff-keys-neck" pointerEvents="none">
      <rect x={Math.min(left, right) - 3} y={g.top - 3} width={Math.abs(right - left) + 6} height={g.height + 6} rx={6} fill="#111827" />
      {frets(g).filter((fret) => !isBlackKey(g.low + fret)).map((fret) => {
        const r = keyRect(fret, g);
        const color = keyColor(fret, g);
        return (
          <g key={fret} data-key={g.low + fret}>
            <rect x={r.x + 1} y={r.y} width={r.w - 2} height={r.h} rx={4} fill={pale(color, 0.82)} stroke={color} strokeOpacity={0.55} strokeWidth={2} />
            <rect x={r.x + 3} y={r.y + r.h - 10} width={r.w - 6} height={6} rx={3} fill={color} fillOpacity={0.35} />
          </g>
        );
      })}
      {frets(g).filter((fret) => isBlackKey(g.low + fret)).map((fret) => {
        const r = keyRect(fret, g);
        const color = keyColor(fret, g);
        return (
          <g key={fret} data-key={g.low + fret}>
            <rect x={r.x + 2} y={r.y} width={r.w - 4} height={r.h} rx={3} fill={dark(color, 0.5)} stroke={color} strokeOpacity={0.7} strokeWidth={2} />
            <rect x={r.x + 5} y={r.y + r.h - 8} width={r.w - 10} height={4} rx={2} fill={color} fillOpacity={0.5} />
          </g>
        );
      })}
    </g>
  );
}

// Brillo al tocar: cada tecla lleva siempre su velo intenso, oculto; tocar solo cambia `data-on`.
export function KeysHits({ g, on }: { g: KeysNeckGeometry; on: Set<number> }) {
  return (
    <g className="riff-keys-glows" pointerEvents="none">
      {[false, true].map((black) => frets(g).filter((fret) => isBlackKey(g.low + fret) === black).map((fret) => {
        const r = keyRect(fret, g);
        const lit = on.has(fret);
        return (
          <rect key={fret} className="riff-key-glow" data-on={lit} data-key={g.low + fret} x={r.x + 2} y={r.y + 1} width={r.w - 4} height={r.h - 2} rx={4} fill={keyColor(fret, g)} fillOpacity={0.8} stroke="#ffffff" strokeWidth={3} />
        );
      }))}
    </g>
  );
}

export function KeysHitStyles() {
  return (
    <style>{`
      .riff-key-glow { opacity: 0; transition: opacity 220ms ease-out; }
      .riff-key-glow[data-on='true'] { opacity: 1; transition-duration: 60ms; }
      @media (prefers-reduced-motion: reduce) { .riff-key-glow { transition: none; } }
    `}</style>
  );
}
