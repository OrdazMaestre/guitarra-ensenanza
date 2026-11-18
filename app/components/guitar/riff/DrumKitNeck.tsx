// MÁSTIL EN MODO BATERÍA (usuario, 2026-11-16, a partir de su imagen): con la pista de batería en Riff-Hero el
// mástil se dibuja como una batería vista de frente, cada instrumento en SU columna (la que se toca):
//   Z bombo · X plato · C caja · V tom agudo · B tom grave · N plato fuerte
// El bombo es DOBLE, grande, entero y detrás de todo (usuario, 2026-11-17): el derecho en V y el izquierdo,
// girado con perspectiva, con el parche en X-C y el casco hasta la columna Z. Colores = el arcoíris de las gemas (`fretColor`).
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
  // Unidades del viewBox que mide un píxel de pantalla (para medidas en px, como la altura de los platos).
  unitsPerPx?: number;
}

// Los platos, con el borde de arriba a esta distancia (px de pantalla) del borde superior del fondo
// (usuario, 2026-11-18: tan altos como se pueda, como en una batería de verdad).
const CYMBAL_TOP_GAP_PX = 15;
// ...y el plato de la X (el que más se toca), 15 px más abajo.
const HIHAT_EXTRA_DROP_PX = 15;

// Hasta dónde puede pintarse la batería (los bombos incluidos).
const drawBottom = (g: DrumNeckGeometry) => g.maxBottom ?? g.top + g.height;

export const drumPadColor = (pad: number) => fretColor(pad, 0, 5);

const CLIP_ID = 'riff-drum-neck-clip';
// Recorte de las capas de los BOMBOS: la tabla menos las otras piezas, para que queden detrás (drumOccluders).
const KICK_CLIP_ID = 'riff-drum-kick-clip';
// Logo de la web (dibujo blanco sobre negro): en los parches de los bombos, con `mix-blend-mode: screen`.
const LOGO_SRC = '/android-chrome-192x192.png';

// Medidas compartidas por el dibujo fijo y la capa iluminada. Todo se coloca alrededor de la LÍNEA DE
// GOLPE (así el mástil alto del móvil en vertical no deja los instrumentos sueltos) con la unidad `s`
// (ancho de columna, sin pasar del alto). Tambores encima de la línea, platos más arriba, bombos debajo.
function layout(g: DrumNeckGeometry) {
  const w = g.colWidth;
  const h = g.height;
  // DOBLE BOMBO (usuario, 2026-11-17): de una columna de radio, entero (sin cortes por arriba ni por abajo: el
  // halo llega a r + 10) y su centro 0,35 r bajo la línea de golpe; por abajo puede bajar hasta `maxBottom`
  // (detrás de la barra MIDI). Una columna más a la derecha que el borde de la Z: el izquierdo, en X y C, y el
  // derecho, en V. El IZQUIERDO va GIRADO, con perspectiva como en una batería de verdad: su parche se ve
  // estrecho (`rx` < `ry`) y su casco (`back`) se alarga hacia la izquierda hasta ocupar la columna Z.
  const bottomRoom = (g.maxBottom ?? g.top + h) - g.hitY - 10;
  const topRoom = g.hitY - g.top - 10;
  const kickR = Math.max(0.3 * w, Math.min(w, bottomRoom / 1.35, topRoom / 0.65));
  const kickY = g.hitY + kickR * 0.35;
  // Hacia dónde crecen las columnas (zurdo: al revés).
  const dir = Math.sign(g.cx(1) - g.cx(0)) || 1;
  const firstKick = g.cx(KICK) + dir * (w / 2) + dir * kickR;
  const keyH = Math.min(h * 0.17, w * 0.32, 40);
  const keyY = g.top + h - keyH - Math.min(6, h * 0.04);
  return {
    w,
    h,
    kicks: [
      // Girado: parche al 70 % de ancho y casco hacia fuera (hacia la Z), su fondo más pequeño (más lejos).
      { x: firstKick, y: kickY, r: kickR, rx: kickR * 0.7, ry: kickR, back: { x: firstKick - dir * 1.2 * w, rx: kickR * 0.5, ry: kickR * 0.9 } },
      { x: firstKick + dir * 2 * kickR, y: kickY, r: kickR, rx: kickR, ry: kickR, back: null },
    ],
    keyH,
    keyY,
    // El "suelo" de la batería: el borde de abajo de los bombos (ahí apoyan también los pies de los platos).
    floor: kickY + kickR,
    drum: (pad: number) => {
      // Tom agudo (V) entre la caja (C) y el tom grave (B) (usuario, 2026-11-17).
      const scale = pad === SNARE ? 0.72 : pad === HIGH_TOM ? 0.76 : 0.8;
      const rx = (w * scale) / 2;
      const shell = rx * 0.75;
      // Medio casco por encima de la línea de golpe (usuario, 2026-11-18: así hay sitio para subir los platos).
      return { x: g.cx(pad), y: g.hitY - shell * 0.5, rx, ry: rx * 0.32, shell };
    },
    cymbal: (pad: number) => {
      const rx = w * (pad === CRASH ? 0.46 : 0.4);
      const ry = rx * 0.24;
      // MÁS ALTOS que los tambores, con el pie más largo, como en una batería de verdad (usuario, 2026-11-18):
      // su borde de arriba, a CYMBAL_TOP_GAP_PX del borde superior del fondo.
      // El plato de la X, 15 px más abajo que el plato fuerte (usuario, 2026-11-18).
      const gapPx = CYMBAL_TOP_GAP_PX + (pad === HIHAT ? HIHAT_EXTRA_DROP_PX : 0);
      return { x: g.cx(pad), y: g.top + gapPx * (g.unitsPerPx ?? 1) + ry, rx, ry };
    },
  };
}

function Drum({ g, pad }: { g: DrumNeckGeometry; pad: number }) {
  const d = layout(g).drum(pad);
  const color = drumPadColor(pad);
  const head = pad === SNARE ? '#e5e7eb' : '#1f2937';
  return (
    <g data-pad={DRUM_PADS[pad].name} className="riff-drum-piece">
      <rect x={d.x - d.rx} y={d.y} width={d.rx * 2} height={d.shell} fill={wall(color)} stroke={color} strokeWidth={2} />
      <ellipse cx={d.x} cy={d.y + d.shell} rx={d.rx} ry={d.ry} fill={wall(color)} stroke={color} strokeWidth={2} />
      <rect x={d.x - d.rx + 1} y={d.y} width={d.rx * 2 - 2} height={d.shell} fill={wall(color)} />
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
      {/* Pie del plato en el color de su columna, con el mismo contorno semitransparente que el plato y los
          parches (usuario, 2026-11-17): primero el contorno ancho y transparente, encima el pie. */}
      {[
        [c.x, c.y, c.x, floor, 3],
        [c.x, floor - 14, c.x - c.rx * 0.35, floor, 2],
        [c.x, floor - 14, c.x + c.rx * 0.35, floor, 2],
      ].map(([x1, y1, x2, y2, width], i) => (
        <g key={i}>
          <line x1={x1} x2={x2} y1={y1} y2={y2} stroke={color} strokeWidth={width + 7} strokeLinecap="round" opacity={0.3} />
          <line x1={x1} x2={x2} y1={y1} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" />
        </g>
      ))}
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
        <clipPath id={KICK_CLIP_ID}>
          <path clipRule="evenodd" d={kickClipPath(g)} />
        </clipPath>
        <linearGradient id="riff-drum-gold" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="0.55" stopColor="#d4a017" />
          <stop offset="1" stopColor="#92400e" />
        </linearGradient>
      </defs>
      {/* Clases para el tema claro de la batería suelta (riff-drum-standalone): tabla blanca y columnas pálidas. */}
      <rect className="riff-drum-board" x={g.left} y={g.top} width={g.right - g.left} height={g.height} fill="#0b1220" />
      {columns.map((pad) => (
        <rect className="riff-drum-col" key={`col-${pad}`} x={g.cx(pad) - l.w / 2} y={g.top} width={l.w} height={g.height} fill={drumPadColor(pad)} opacity={0.1} />
      ))}
      {columns.map((pad) => (
        <rect key={`edge-${pad}`} x={g.cx(pad) - l.w / 2 + 1.5} y={g.top + 1.5} width={l.w - 3} height={g.height - 3} fill="none" stroke={drumPadColor(pad)} strokeWidth={2} opacity={0.55} />
      ))}
      <g clipPath={`url(#${CLIP_ID})`} data-pad={DRUM_PADS[KICK].name} className="riff-drum-piece">
        {l.kicks.map((k, i) => (
          <g key={i}>
            {/* Casco del bombo girado: el fondo (elipse lejana) unido al parche por arriba y por abajo. */}
            {k.back && (
              <>
                <ellipse cx={k.back.x} cy={k.y} rx={k.back.rx} ry={k.back.ry} fill={wall(kickColor)} stroke={kickColor} strokeWidth={3} />
                <path d={`M ${k.back.x} ${k.y - k.back.ry} L ${k.x} ${k.y - k.ry} L ${k.x} ${k.y + k.ry} L ${k.back.x} ${k.y + k.back.ry} Z`} fill={wall(kickColor)} />
                <line x1={k.back.x} y1={k.y - k.back.ry} x2={k.x} y2={k.y - k.ry} stroke={kickColor} strokeWidth={3} />
                <line x1={k.back.x} y1={k.y + k.back.ry} x2={k.x} y2={k.y + k.ry} stroke={kickColor} strokeWidth={3} />
                {[0.33, 0.66].map((t) => (
                  <line key={t} x1={k.back.x + (k.x - k.back.x) * t} x2={k.back.x + (k.x - k.back.x) * t} y1={k.y - (k.back.ry + (k.ry - k.back.ry) * t) + 3} y2={k.y + (k.back.ry + (k.ry - k.back.ry) * t) - 3} stroke="#9ca3af" strokeWidth={1.5} opacity={0.5} />
                ))}
              </>
            )}
            <ellipse cx={k.x} cy={k.y} rx={k.rx + 5} ry={k.ry + 5} fill="none" stroke={kickColor} strokeWidth={10} opacity={0.3} />
            <ellipse cx={k.x} cy={k.y} rx={k.rx} ry={k.ry} fill="#0f172a" stroke={kickColor} strokeWidth={4} />
            <ellipse cx={k.x} cy={k.y} rx={k.rx * 0.86} ry={k.ry * 0.86} fill="none" stroke="#475569" strokeWidth={2} />
            {/* El logo de la web en los DOS bombos (usuario, 2026-11-18), del tamaño del parche interior; en el
                girado, estrecho como su parche. `screen` quita el negro del PNG y deja solo el dibujo blanco. */}
            <image
              className="riff-drum-logo"
              height={k.ry * 1.5}
              href={LOGO_SRC}
              opacity={0.85}
              preserveAspectRatio="none"
              style={{ mixBlendMode: 'screen' }}
              width={k.rx * 1.5}
              x={k.x - k.rx * 0.75}
              y={k.y - k.ry * 0.75}
            />
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

// PAREDES de los tambores (bombos, caja y toms) en el color de su columna, oscurecido para que el parche y
// los tornillos se sigan leyendo (usuario, 2026-11-17).
function wall(hex: string): string {
  const c = [1, 3, 5].map((j) => parseInt(hex.slice(j, j + 2), 16));
  const dark = [0x11, 0x18, 0x27];
  return `#${c.map((v, i) => Math.round(dark[i] + (v - dark[i]) * 0.55).toString(16).padStart(2, '0')).join('')}`;
}

// Velo de un color mezclado hacia blanco (`k` = cuánto blanco).
function pale(hex: string, k: number): string {
  const c = [1, 3, 5].map((j) => parseInt(hex.slice(j, j + 2), 16));
  return `#${c.map((v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

// SILUETAS de las piezas que no son los bombos (coordenadas del viewBox), para que las capas de color y la
// marca gris de los BOMBOS queden detrás de ellas (usuario, 2026-11-18: al aparecer, por grandes, tapaban
// tambores y platos). Tambores: cilindro (parche, casco y borde de abajo) en una sola silueta; platos: su elipse
// con el halo. No se solapan entre sí (cada una en su columna), así que vale el relleno `evenodd`.
export type DrumOccluder =
  | { kind: 'cylinder'; x: number; y: number; rx: number; ry: number; shell: number }
  | { kind: 'ellipse'; x: number; y: number; rx: number; ry: number };

export function drumOccluders(g: DrumNeckGeometry): DrumOccluder[] {
  const l = layout(g);
  const drums = [SNARE, HIGH_TOM, LOW_TOM].map((pad) => {
    const d = l.drum(pad);
    return { kind: 'cylinder' as const, x: d.x, y: d.y, rx: d.rx + 1, ry: d.ry + 1, shell: d.shell };
  });
  const cymbals = [HIHAT, CRASH].map((pad) => {
    const c = l.cymbal(pad);
    return { kind: 'ellipse' as const, x: c.x, y: c.y, rx: c.rx + 5, ry: c.ry + 3 };
  });
  return [...drums, ...cymbals];
}

// La silueta en un `d` de SVG (los tramos curvos, con arcos).
function occluderPath(o: DrumOccluder): string {
  if (o.kind === 'ellipse') {
    return `M ${o.x - o.rx} ${o.y} A ${o.rx} ${o.ry} 0 1 0 ${o.x + o.rx} ${o.y} A ${o.rx} ${o.ry} 0 1 0 ${o.x - o.rx} ${o.y} Z`;
  }
  const bottom = o.y + o.shell;
  return `M ${o.x - o.rx} ${o.y} L ${o.x - o.rx} ${bottom} A ${o.rx} ${o.ry} 0 0 0 ${o.x + o.rx} ${bottom} L ${o.x + o.rx} ${o.y} A ${o.rx} ${o.ry} 0 0 0 ${o.x - o.rx} ${o.y} Z`;
}

// Tabla entera menos las siluetas (`evenodd`): el recorte de las capas de los bombos.
function kickClipPath(g: DrumNeckGeometry): string {
  const bottom = drawBottom(g);
  return [`M ${g.left} ${g.top} H ${g.right} V ${bottom} H ${g.left} Z`, ...drumOccluders(g).map(occluderPath)].join(' ');
}

// La misma superficie en datos (coordenadas del viewBox), para que la autopista la pinte de gris cuando una
// nota se falla o pasa sin tocarla: el "fantasma" de la batería (RiffHighway, como la gema gris de la guitarra).
// `clip` = la tabla, porque los bombos se salen por abajo.
export function drumSurfaceShapes(g: DrumNeckGeometry, pad: number): { ellipses: Array<{ x: number; y: number; rx: number; ry: number }>; clip: { x: number; y: number; w: number; h: number } } {
  const l = layout(g);
  const clip = { x: g.left, y: g.top, w: g.right - g.left, h: drawBottom(g) - g.top };
  if (pad === KICK) return { clip, ellipses: l.kicks.map((k) => ({ x: k.x, y: k.y, rx: k.rx * 0.86, ry: k.ry * 0.86 })) };
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
      <g clipPath={`url(#${KICK_CLIP_ID})`}>
        {l.kicks.map((k, i) => <ellipse key={i} cx={k.x} cy={k.y} rx={k.rx * 0.86} ry={k.ry * 0.86} {...(props as React.SVGProps<SVGEllipseElement>)} />)}
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
      {/* Sin la línea verde de golpe que cruzaba la batería (usuario, 2026-11-17). */}
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
