// MÁSTIL EN MODO BATERÍA (usuario, 2026-11-16, a partir de su imagen): con la pista de batería en Riff-Hero el
// mástil se dibuja como una batería vista de frente, cada instrumento en SU columna (la que se toca):
//   Z plato · X bombo · C caja · V tom agudo · B tom grave · N plato fuerte
// El bombo es DOBLE, grande y en el centro, detrás de todo: del izquierdo solo asoma una parte en la
// columna X (lo único dibujado en X), como en la imagen. Colores = el arcoíris de las gemas (`fretColor`).
// SVG fijo dentro del `<svg>` del mástil (coordenadas del viewBox); la animación de los golpes va aparte, en
// `DrumHits` (siempre montada, solo cambia `data-on`), sin re-render del mástil (PressMarks).
import { fretColor } from '../../../lib/riff/colors';
import { CRASH, DRUM_PADS, HIGH_TOM, HIHAT, KICK, LOW_TOM, SNARE } from '../../../lib/riff/drums';

export interface DrumNeckGeometry {
  // Centro de la columna de un pad (ya con el modo zurdo aplicado).
  cx: (pad: number) => number;
  colWidth: number;
  left: number;
  right: number;
  top: number;
  height: number;
  // Altura a la que caen las notas (la línea de golpe).
  hitY: number;
  touch: boolean;
  // Hasta dónde (y del viewBox) pueden bajar los bombos ENTEROS, saliéndose del mástil por abajo y quedando
  // detrás de la barra MIDI (usuario, 2026-11-16: así la barra no baja más). Si no caben a su tamaño, se
  // achican lo justo. Sin él, recortados a la tabla como al principio.
  maxBottom?: number;
}

// Hasta dónde puede pintarse la batería (los bombos incluidos).
const drawBottom = (g: DrumNeckGeometry) => g.maxBottom ?? g.top + g.height;

export const drumPadColor = (pad: number) => fretColor(pad, 0, 5);

const CLIP_ID = 'riff-drum-neck-clip';

// Medidas compartidas por el dibujo fijo y la capa iluminada. Todo se coloca alrededor de la LÍNEA DE
// GOLPE (así el mástil alto del móvil en vertical no deja los instrumentos sueltos) con la unidad `s`
// (ancho de columna, sin pasar del alto). Tambores encima de la línea, platos más arriba, bombos debajo.
function layout(g: DrumNeckGeometry) {
  const w = g.colWidth;
  const h = g.height;
  const s = Math.min(w, h);
  // Bombos enteros: su centro está 0,55 r bajo la línea de golpe y el halo llega a r + 10.
  const kickR = g.maxBottom === undefined ? 0.75 * w : Math.max(0.3 * w, Math.min(0.75 * w, (g.maxBottom - g.hitY - 10) / 1.55));
  const center = (g.left + g.right) / 2;
  const keyH = Math.min(h * 0.17, w * 0.32, 40);
  const keyY = g.top + h - keyH - Math.min(6, h * 0.04);
  return {
    w,
    h,
    kicks: [center - kickR, center + kickR].map((x) => ({ x, y: g.hitY + kickR * 0.55, r: kickR })),
    keyH,
    keyY,
    floor: Math.min(keyY - 4, g.hitY + s * 0.45),
    drum: (pad: number) => {
      const scale = pad === SNARE ? 0.72 : pad === HIGH_TOM ? 0.6 : 0.8;
      const rx = (w * scale) / 2;
      const shell = rx * 0.75;
      return { x: g.cx(pad), y: g.hitY - s * 0.06 - shell, rx, ry: rx * 0.32, shell };
    },
    cymbal: (pad: number) => {
      const rx = w * (pad === CRASH ? 0.46 : 0.4);
      return { x: g.cx(pad), y: g.hitY - s * 0.5, rx, ry: rx * 0.24 };
    },
  };
}

function Drum({ g, pad }: { g: DrumNeckGeometry; pad: number }) {
  const d = layout(g).drum(pad);
  const color = drumPadColor(pad);
  const head = pad === SNARE ? '#e5e7eb' : '#1f2937';
  return (
    <g data-pad={DRUM_PADS[pad].name} className="riff-drum-piece">
      <rect x={d.x - d.rx} y={d.y} width={d.rx * 2} height={d.shell} fill="#111827" stroke={color} strokeWidth={2} />
      <ellipse cx={d.x} cy={d.y + d.shell} rx={d.rx} ry={d.ry} fill="#111827" stroke={color} strokeWidth={2} />
      <rect x={d.x - d.rx + 1} y={d.y} width={d.rx * 2 - 2} height={d.shell} fill="#111827" />
      {[0.25, 0.5, 0.75].map((k) => (
        <line key={k} x1={d.x - d.rx + 2 * d.rx * k} x2={d.x - d.rx + 2 * d.rx * k} y1={d.y + 2} y2={d.y + d.shell} stroke="#9ca3af" strokeWidth={1.5} opacity={0.6} />
      ))}
      <ellipse cx={d.x} cy={d.y} rx={d.rx + 4} ry={d.ry + 2} fill="none" stroke={color} strokeWidth={8} opacity={0.3} />
      <ellipse cx={d.x} cy={d.y} rx={d.rx} ry={d.ry} fill={head} stroke={color} strokeWidth={3} />
    </g>
  );
}

function Cymbal({ g, pad }: { g: DrumNeckGeometry; pad: number }) {
  const l = layout(g);
  const c = l.cymbal(pad);
  const color = drumPadColor(pad);
  const floor = l.floor;
  return (
    <g data-pad={DRUM_PADS[pad].name} className="riff-drum-piece">
      <line x1={c.x} x2={c.x} y1={c.y} y2={floor} stroke="#9ca3af" strokeWidth={3} />
      <line x1={c.x} x2={c.x - c.rx * 0.35} y1={floor - 14} y2={floor} stroke="#9ca3af" strokeWidth={2} />
      <line x1={c.x} x2={c.x + c.rx * 0.35} y1={floor - 14} y2={floor} stroke="#9ca3af" strokeWidth={2} />
      <ellipse cx={c.x} cy={c.y} rx={c.rx + 5} ry={c.ry + 3} fill="none" stroke={color} strokeWidth={9} opacity={0.3} />
      <ellipse cx={c.x} cy={c.y} rx={c.rx} ry={c.ry} fill="url(#riff-drum-gold)" stroke={color} strokeWidth={3} />
      <ellipse cx={c.x} cy={c.y} rx={c.rx * 0.55} ry={c.ry * 0.55} fill="none" stroke="#a16207" strokeWidth={1} opacity={0.6} />
      <ellipse cx={c.x} cy={c.y - 1} rx={c.rx * 0.12} ry={c.ry * 0.35} fill="#fde68a" stroke="#a16207" strokeWidth={1} />
    </g>
  );
}

export default function DrumKitNeck({ g }: { g: DrumNeckGeometry }) {
  const l = layout(g);
  const kickColor = drumPadColor(KICK);
  const columns = DRUM_PADS.map(({ pad }) => pad);
  return (
    <g className="riff-drum-kit" pointerEvents="none">
      <defs>
        <clipPath id={CLIP_ID}>
          <rect x={g.left} y={g.top} width={g.right - g.left} height={drawBottom(g) - g.top} />
        </clipPath>
        <linearGradient id="riff-drum-gold" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="0.55" stopColor="#d4a017" />
          <stop offset="1" stopColor="#92400e" />
        </linearGradient>
      </defs>
      <rect x={g.left} y={g.top} width={g.right - g.left} height={g.height} fill="#0b1220" />
      {columns.map((pad) => (
        <rect key={`col-${pad}`} x={g.cx(pad) - l.w / 2} y={g.top} width={l.w} height={g.height} fill={drumPadColor(pad)} opacity={0.1} />
      ))}
      {columns.map((pad) => (
        <rect key={`edge-${pad}`} x={g.cx(pad) - l.w / 2 + 1.5} y={g.top + 1.5} width={l.w - 3} height={g.height - 3} fill="none" stroke={drumPadColor(pad)} strokeWidth={2} opacity={0.55} />
      ))}
      <g clipPath={`url(#${CLIP_ID})`} data-pad={DRUM_PADS[KICK].name} className="riff-drum-piece">
        {l.kicks.map((k, i) => (
          <g key={i}>
            <circle cx={k.x} cy={k.y} r={k.r + 5} fill="none" stroke={kickColor} strokeWidth={10} opacity={0.3} />
            <circle cx={k.x} cy={k.y} r={k.r} fill="#0f172a" stroke={kickColor} strokeWidth={4} />
            <circle cx={k.x} cy={k.y} r={k.r * 0.86} fill="none" stroke="#475569" strokeWidth={2} />
            {i === 0 && (
              <path
                d={`M ${k.x + k.r * 0.08} ${k.y - k.r * 0.62} L ${k.x - k.r * 0.18} ${k.y - k.r * 0.12} L ${k.x + k.r * 0.02} ${k.y - k.r * 0.12} L ${k.x - k.r * 0.1} ${k.y + k.r * 0.3} L ${k.x + k.r * 0.22} ${k.y - k.r * 0.22} L ${k.x + k.r * 0.02} ${k.y - k.r * 0.22} Z`}
                fill="#64748b"
                opacity={0.7}
              />
            )}
          </g>
        ))}
      </g>
      <Drum g={g} pad={LOW_TOM} />
      <Drum g={g} pad={HIGH_TOM} />
      <Drum g={g} pad={SNARE} />
      <Cymbal g={g} pad={HIHAT} />
      <Cymbal g={g} pad={CRASH} />
    </g>
  );
}

// Velo de un color mezclado hacia blanco (`k` = cuánto blanco).
function pale(hex: string, k: number): string {
  const c = [1, 3, 5].map((j) => parseInt(hex.slice(j, j + 2), 16));
  return `#${c.map((v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

// La misma superficie en datos (coordenadas del viewBox), para que la autopista la pinte de gris cuando una
// nota se falla o pasa sin tocarla: el "fantasma" de la batería (RiffHighway, como la gema gris de la guitarra).
// `clip` = la tabla, porque los bombos se salen por abajo.
export function drumSurfaceShapes(g: DrumNeckGeometry, pad: number): { ellipses: Array<{ x: number; y: number; rx: number; ry: number }>; clip: { x: number; y: number; w: number; h: number } } {
  const l = layout(g);
  const clip = { x: g.left, y: g.top, w: g.right - g.left, h: drawBottom(g) - g.top };
  if (pad === KICK) return { clip, ellipses: l.kicks.map((k) => ({ x: k.x, y: k.y, rx: k.r * 0.86, ry: k.r * 0.86 })) };
  if (pad === HIHAT || pad === CRASH) {
    const c = l.cymbal(pad);
    return { clip, ellipses: [{ x: c.x, y: c.y, rx: c.rx, ry: c.ry }] };
  }
  const d = l.drum(pad);
  return { clip, ellipses: [{ x: d.x, y: d.y, rx: d.rx, ry: d.ry }] };
}

// La superficie que se tiñe de cada pieza (parche, plato o los dos bombos), con el relleno dado.
function surface(g: DrumNeckGeometry, pad: number, props: React.SVGProps<SVGElement>) {
  const l = layout(g);
  if (pad === KICK) {
    return (
      <g clipPath={`url(#${CLIP_ID})`}>
        {l.kicks.map((k, i) => <circle key={i} cx={k.x} cy={k.y} r={k.r * 0.86} {...(props as React.SVGProps<SVGCircleElement>)} />)}
      </g>
    );
  }
  if (pad === HIHAT || pad === CRASH) {
    const c = l.cymbal(pad);
    return <ellipse cx={c.x} cy={c.y} rx={c.rx} ry={c.ry} {...(props as React.SVGProps<SVGEllipseElement>)} />;
  }
  const d = l.drum(pad);
  return <ellipse cx={d.x} cy={d.y} rx={d.rx} ry={d.ry} {...(props as React.SVGProps<SVGEllipseElement>)} />;
}

// ANIMACIÓN (usuario, 2026-11-16, ligera de carga): cada pieza lleva SIEMPRE dos velos de su color, el
// PÁLIDO (sin tocar) y el INTENSO (al tocar); golpear solo cambia `data-on` y el CSS funde la OPACIDAD
// (nada de filter, escalas ni animaciones infinitas). Siempre montado: lo pinta PressMarks (su propio
// estado, el mástil grande no se re-renderiza). Encima van la línea de golpe y las teclas.
export function DrumHits({ g, on }: { g: DrumNeckGeometry; on: Set<number> }) {
  const l = layout(g);
  return (
    <g className="riff-drum-glows" pointerEvents="none">
      {DRUM_PADS.map(({ pad, name }) => {
        const color = drumPadColor(pad);
        const lit = on.has(pad);
        return (
          <g className={lit ? 'riff-drum-glow riff-drum-hit' : 'riff-drum-glow'} data-on={lit} data-pad={name} key={pad}>
            <rect className="riff-drum-strong" x={g.cx(pad) - l.w / 2} y={g.top} width={l.w} height={g.height} fill={color} fillOpacity={0.18} />
            <g className="riff-drum-pale">{surface(g, pad, { fill: pale(color, 0.55), fillOpacity: 0.3 })}</g>
            <g className="riff-drum-strong">{surface(g, pad, { fill: color, fillOpacity: 0.75, stroke: '#ffffff', strokeWidth: 3 })}</g>
          </g>
        );
      })}
      <line x1={g.left} x2={g.right} y1={g.hitY} y2={g.hitY} stroke="#22c55e" strokeWidth={12} opacity={0.25} />
      <line className="riff-drum-hitline" x1={g.left} x2={g.right} y1={g.hitY} y2={g.hitY} stroke="#4ade80" strokeWidth={4} />
      {/* Sin recuadros de las teclas (usuario, 2026-11-16): bajo el mástil vuelven los números de traste. */}
    </g>
  );
}

// Fundidos de la animación: SOLO opacidad (encender rápido, apagar despacio), nada de filter ni escalas.
export function DrumHitStyles() {
  return (
    <style>{`
      .riff-drum-glow .riff-drum-pale { opacity: 1; transition: opacity 220ms ease-out; }
      .riff-drum-glow .riff-drum-strong { opacity: 0; transition: opacity 220ms ease-out; }
      .riff-drum-glow[data-on='true'] .riff-drum-pale { opacity: 0; transition-duration: 60ms; }
      .riff-drum-glow[data-on='true'] .riff-drum-strong { opacity: 1; transition-duration: 60ms; }
      @media (prefers-reduced-motion: reduce) {
        .riff-drum-glow .riff-drum-pale, .riff-drum-glow .riff-drum-strong { transition: none; }
      }
    `}</style>
  );
}
