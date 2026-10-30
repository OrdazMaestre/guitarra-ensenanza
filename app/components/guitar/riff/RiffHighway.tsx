'use client';
import { type MutableRefObject, type RefObject, useEffect, useRef } from 'react';
import type { FretboardGeometry } from '../ReducedFretboardDiagram';
import { getAudioCurrentTime } from '@/app/lib/guitarAudioEngine';
import type { Chart, ChartNote } from '@/app/lib/riff/chart';
import { fretColor, RIFF_STRING_COLORS } from '@/app/lib/riff/colors';
import { COUNT_IN_BEATS, type RiffSession } from '@/app/lib/riff/session';
import { barsAheadSeconds, notesOnFret, notesOnString, STRING_LOOKAHEAD_BARS, stringAlpha, usageLevel } from '@/app/lib/riff/visuals';

export { RIFF_STRING_COLORS };

// Autopista 3D tipo Rocksmith dibujada en un <canvas> 2D (proyección en perspectiva hecha a mano,
// sin WebGL). El canvas se superpone al mástil interactivo (`pointer-events: none`) y cubre desde
// arriba del todo hasta el borde inferior del <svg>: así, en z = 0, cada gema cae EXACTAMENTE en
// su cuerda y su traste del mástil real (las coordenadas salen de `geometryRef`, que publica
// ReducedFretboardDiagram -- respeta zurdo, clavijas y cualquier tamaño).
//
// Proyección: todo converge hacia un punto de fuga por encima del canvas. Un punto del mástil
// (x0, y0) a `z` segundos en el futuro se dibuja en vp + (p0 - vp) * s(z), con s(z) = 1/(1 + a·z);
// `a` se calcula para que lo que está a LOOKAHEAD segundos llegue justo al borde superior.

// Petición del usuario (2026-10-25): las notas aparecen antes, más al fondo (3,2 s en vez de 2,4) y
// a la vez bajan más deprisa junto al mástil (más separadas, se distingue mejor el orden). Las dos
// cosas a la vez salen de acercar el punto de fuga (`VANISHING_RATIO`, antes 0,9): perspectiva más
// marcada, ~35 % más de separación cerca del mástil.
const LOOKAHEAD_SECONDS = 3.2;
const VANISHING_RATIO = 0.35;
const HIT_FX_SECONDS = 0.35;
// Etiquetas de puntos ("¡Perfecto!", "+3"...): cuánto duran (segundos reales) y cuántas a la vez.
const SCORE_LABEL_SECONDS = 0.8;
const MAX_SCORE_LABELS = 4;
// Cuerdas libres: las 6 cuerdas, medio transparentes (decisión del usuario).
// Cuerdas libres: relleno permanente de cada traste con su color, tenue (0,2; el usuario pidió
// destacarlo un poco más que el 0,1 de antes). Las cuerdas no se
// dibujan: no hacen falta y liaban (decisión del usuario).
const FREE_FRET_TINT_ALPHA = 0.2;
const MISS_FADE_SECONDS = 0.45;
// Notas que ya puntuaron y vuelven a pasar tras continuar una pausa (`RiffSession.locked`).
const LOCKED_COLOR = '#9ca3af';
const TOP_MARGIN = 10;
// Desde cuántos segundos antes de llegar se dibuja la guía de aterrizaje.
const APPROACH_SECONDS = 0.6;

const TECH_LABEL: Record<string, string> = { hammer: 'H', pull: 'P', slide: 'S', bend: 'B' };

interface Props {
  // Cuerdas del nivel (se pintan de color en el mástil); por defecto, las 6.
  activeStrings?: number[];
  chart: Chart;
  colorBy?: 'fret' | 'string';
  // Trastes del nivel (para repartir el arcoíris de colorBy 'fret').
  fretRange?: [number, number];
  // Cuerdas libres: cada gema ocupa la COLUMNA entera de su traste (vale cualquier cuerda).
  freeStrings?: boolean;
  geometryRef: MutableRefObject<FretboardGeometry | null>;
  // Bucle activado = "modo práctica" (no puntúa): marca de agua "PRÁCTICA" sobre el carril.
  practice?: boolean;
  // Tiempo de canción que se enseña cuando no hay partida (vista previa quieta).
  previewTime: number;
  sessionRef: MutableRefObject<RiffSession | null>;
  stageRef: RefObject<HTMLDivElement | null>;
}

function firstIndexAtOrAfter(notes: ChartNote[], t: number) {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function scoreText(points: number) {
  if (points >= 4) return '+4 PERFECTO';
  return points === 0.5 ? '+½' : `+${points}`;
}

// Color de cada puntuación (decisión del usuario, 2026-10-30): +½ y +1 blanco, +2 amarillo, +3 naranja,
// +4 rojo vivo. Dentro del juego el rojo ya es un color "de juego" (cuerda 6), no el rojo de nota especial.
const SCORE_COLORS: Record<string, string> = { '0.5': '#ffffff', '1': '#ffffff', '2': '#fde047', '3': '#fb923c', '4': '#ef2b2b' };

export function formatScore(points: number) {
  return Number.isInteger(points) ? String(points) : points.toFixed(1).replace('.', ',');
}

// Nota por id, cacheado por sesión (para colocar las etiquetas de puntos).
const notesById = new WeakMap<RiffSession, Map<number, ChartNote>>();
function noteById(session: RiffSession, id: number) {
  let map = notesById.get(session);
  if (!map) {
    map = new Map(session.notes.map((note) => [note.id, note]));
    notesById.set(session, map);
  }
  return map.get(id);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export default function RiffHighway({ activeStrings, chart, colorBy = 'string', fretRange, freeStrings = false, geometryRef, practice = false, previewTime, sessionRef, stageRef }: Props) {
  // Con cuerdas libres se usan las 6.
  const stringsKey = (freeStrings ? [1, 2, 3, 4, 5, 6] : activeStrings ?? [1, 2, 3, 4, 5, 6]).join(',');
  const [minFret, maxFret] = fretRange ?? [0, 5];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef(previewTime);
  useEffect(() => { previewRef.current = previewTime; }, [previewTime]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      const geo = geometryRef.current;
      const svg = geo?.svg;
      if (!canvas || !stage || !geo || !svg) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;

      const stageRect = stage.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const cssW = stageRect.width;
      const cssH = Math.max(0, svgRect.bottom - stageRect.top);
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // viewBox -> píxeles del canvas.
      const toX = (x: number, y: number) => ctm.a * x + ctm.c * y + ctm.e - stageRect.left;
      const toY = (x: number, y: number) => ctm.b * x + ctm.d * y + ctm.f - stageRect.top;
      // Las notas caen a la altura de su "carril" (lanes.ts: en Experto, su cuerda real; en el resto,
      // las cuerdas del nivel repartidas por el centro del mástil).
      const laneY = geo.laneY ?? geo.stringY;
      const fretPx = (fret: number, string: number) => ({ x: toX(geo.fretX(fret), laneY(string)), y: toY(geo.fretX(fret), laneY(string)) });
      const lineXs = geo.fretLineXs.map((x) => toX(x, geo.stringY(1)));
      // Casilla del traste 0 en el juego (tan ancha como las demás): entra en la autopista.
      const openXs = geo.openColumn ? geo.openColumn.map((x) => toX(x, geo.stringY(1))) : [];
      const edgeXs = [...lineXs, ...openXs];
      const boardLeft = Math.min(...edgeXs);
      const boardRight = Math.max(...edgeXs);
      const y1 = toY(0, geo.stringY(1));
      const y6 = toY(0, geo.stringY(6));
      const rowGap = (y6 - y1) / 5;
      const colW = (boardRight - boardLeft) / Math.max(1, lineXs.length - 1);
      // Rectángulo (en píxeles) de la columna de un traste sobre el mástil, de la cuerda 1 a la 6.
      const columnRect = (fret: number) => {
        const i = fret - geo.startFret - (geo.startFret === 0 ? 1 : 0);
        if (fret === 0 && geo.startFret === 0) {
          if (openXs.length === 2) return { x: Math.min(...openXs), y: y1, w: Math.abs(openXs[1] - openXs[0]), h: y6 - y1 };
          // Cuerda al aire: la franja antes de la cejuela.
          const x = fretPx(0, 1).x;
          return { x: x - colW * 0.35, y: y1, w: colW * 0.7, h: y6 - y1 };
        }
        if (i < 0 || i + 1 >= lineXs.length) return null;
        const xa = Math.min(lineXs[i], lineXs[i + 1]);
        return { x: xa, y: y1, w: Math.abs(lineXs[i + 1] - lineXs[i]), h: y6 - y1 };
      };

      const session = sessionRef.current;
      // advance() es idempotente: el temporizador de useRiffGame también lo llama.
      if (session) session.advance(getAudioCurrentTime());
      const speed = session?.options.speed ?? 1;
      const songPos = session ? session.songPos : previewRef.current;

      // Punto de fuga y escala.
      const vpX = (boardLeft + boardRight) / 2;
      const vpY = -Math.max(50, y1 * VANISHING_RATIO);
      const sL = (TOP_MARGIN - vpY) / (y1 - vpY);
      const a = (1 / sL - 1) / LOOKAHEAD_SECONDS;
      const scaleAt = (z: number) => 1 / (1 + a * Math.max(z, 0));
      const project = (x: number, y: number, z: number) => {
        const s = scaleAt(z);
        return { x: vpX + (x - vpX) * s, y: vpY + (y - vpY) * s, s };
      };
      const zOf = (t: number) => (t - songPos) / speed;

      // Suelo de la autopista (encima del mástil).
      const nearL = project(boardLeft, y1, 0);
      const nearR = project(boardRight, y1, 0);
      const farL = project(boardLeft, y1, LOOKAHEAD_SECONDS);
      const farR = project(boardRight, y1, LOOKAHEAD_SECONDS);
      const floor = ctx.createLinearGradient(0, farL.y, 0, nearL.y);
      floor.addColorStop(0, '#05070d');
      floor.addColorStop(1, '#14223a');
      ctx.fillStyle = floor;
      ctx.beginPath();
      ctx.moveTo(nearL.x, nearL.y);
      ctx.lineTo(nearR.x, nearR.y);
      ctx.lineTo(farR.x, farR.y);
      ctx.lineTo(farL.x, farL.y);
      ctx.closePath();
      ctx.fill();

      // Carriles iluminados: trastes que se van a usar pronto (la "zona de mano").
      const visibleFrom = firstIndexAtOrAfter(chart.notes, songPos - MISS_FADE_SECONDS * speed);
      const soonFrets = new Set<number>();
      for (let i = visibleFrom; i < chart.notes.length; i++) {
        const note = chart.notes[i];
        const z = zOf(note.t);
        if (z > LOOKAHEAD_SECONDS) break;
        if (z >= -0.1) soonFrets.add(note.fret);
      }
      for (const fret of soonFrets) {
        const col = fret - geo.startFret - (geo.startFret === 0 ? 1 : 0);
        const open = col < 0 && openXs.length === 2;
        if ((col < 0 && !open) || col + 1 >= lineXs.length) continue;
        const xa = open ? openXs[0] : lineXs[col];
        const xb = open ? openXs[1] : lineXs[col + 1];
        const p1 = project(xa, y1, 0);
        const p2 = project(xb, y1, 0);
        const p3 = project(xb, y1, LOOKAHEAD_SECONDS);
        const p4 = project(xa, y1, LOOKAHEAD_SECONDS);
        ctx.fillStyle = 'rgba(148, 197, 255, 0.10)';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
      }

      // Líneas de traste que fugan hacia el fondo.
      ctx.lineWidth = 1;
      for (const x of edgeXs) {
        const p0 = project(x, y1, 0);
        const p1 = project(x, y1, LOOKAHEAD_SECONDS);
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.28)';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }

      // Líneas de pulso y de compás.
      for (const beat of chart.beats) {
        const z = zOf(beat.t);
        if (z < 0 || z > LOOKAHEAD_SECONDS) continue;
        const l = project(boardLeft, y1, z);
        const r = project(boardRight, y1, z);
        ctx.strokeStyle = beat.isBarStart ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = beat.isBarStart ? 2 * l.s : 1;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(r.x, r.y);
        ctx.stroke();
      }

      // Bucle activado = "modo práctica" (petición del usuario): "PRÁCTICA" muy transparente sobre el
      // carril, por debajo de las notas para no tapar nada.
      if (practice) {
        const midY = (farL.y + nearL.y) / 2;
        // Lo más grande posible sin salirse del carril a esa altura (el carril se estrecha al fondo).
        const widthAtMid = ((farR.x - farL.x) + (nearR.x - nearL.x)) / 2 * 0.86;
        let size = (nearL.y - farL.y) * 0.45;
        ctx.font = `950 ${size}px system-ui, sans-serif`;
        size = Math.max(20, size * Math.min(1, widthAtMid / ctx.measureText('PRÁCTICA').width));
        ctx.font = `950 ${size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
        ctx.fillText('PRÁCTICA', vpX, midY);
      }

      // Cuerdas libres: la COLUMNA entera del traste objetivo se ilumina con su color, con las mismas
      // curvas que las cuerdas (sube el segundo anterior a la nota, baja 0,5 s después).
      if (session && freeStrings) {
        for (let fret = minFret; fret <= maxFret; fret++) {
          const col = columnRect(fret);
          if (!col) continue;
          const color = fretColor(fret, minFret, maxFret);
          ctx.globalAlpha = FREE_FRET_TINT_ALPHA;
          ctx.fillStyle = color;
          ctx.fillRect(col.x, col.y, col.w, col.h);
          const level = usageLevel(notesOnFret(chart.notes, fret), songPos, speed);
          if (level <= 0.01) continue;
          ctx.globalAlpha = level * 0.4;
          ctx.fillStyle = color;
          ctx.fillRect(col.x, col.y, col.w, col.h);
          ctx.globalAlpha = level;
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(col.x + 1.5, col.y + 1.5, col.w - 3, col.h - 3);
        }
        ctx.globalAlpha = 1;
      }

      // Cuerdas de colores sobre el mástil mientras se juega (las del <svg> se esconden con la clase
      // `riff-live`). En Experto, las que no se van a usar se vuelven transparentes y recuperan su
      // tono el segundo anterior a su próxima nota (`stringAlpha`, mismo reloj que las gemas). Con
      // cuerdas libres no se dibujan (lo que manda es la columna del traste, ver arriba). Brillo
      // moderado (sombra de su color).
      if (session && !freeStrings) {
        // Encendidas mientras tengan alguna nota en los próximos STRING_LOOKAHEAD_BARS compases.
        const stringAhead = barsAheadSeconds(chart.bars, songPos, STRING_LOOKAHEAD_BARS, (STRING_LOOKAHEAD_BARS * 4 * 60) / chart.bpm);
        for (const string of stringsKey.split(',').map(Number)) {
          const y = toY(0, laneY(string));
          ctx.strokeStyle = RIFF_STRING_COLORS[string];
          ctx.globalAlpha = stringAlpha(notesOnString(chart.notes, string), songPos, speed, stringAhead);
          ctx.shadowColor = RIFF_STRING_COLORS[string];
          ctx.shadowBlur = 6;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(boardLeft, y);
          ctx.lineTo(boardRight, y);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      // Notas: de la más lejana a la más cercana.
      const toDraw: ChartNote[] = [];
      for (let i = visibleFrom; i < chart.notes.length; i++) {
        const note = chart.notes[i];
        if (zOf(note.t) > LOOKAHEAD_SECONDS) break;
        toDraw.push(note);
      }
      toDraw.reverse();
      const gemW = Math.max(colW * 0.62, 22);
      // Modo trastes (una sola fila de notas, en el centro): gemas más altas (petición del usuario).
      const gemH = freeStrings ? Math.max(rowGap * 1.1, 18) : Math.max(rowGap * 0.8, 14);

      // Acordes (petición del usuario: que se lea la FORMA de un vistazo y no se confundan con los
      // punteos): sin caja; las gemas de un mismo golpe se unen, por orden de cuerda, con
      // conectores brillantes, y llevan un borde doble. Al acercarse al mástil, la misma forma se
      // dibuja también sobre las cuerdas, donde hay que pisar. Por detrás de las gemas.
      const chordGroups = new Map<number, ChartNote[]>();
      for (const note of toDraw) {
        if (session?.hitAt.has(note.id) || zOf(note.t) < 0) continue;
        const key = Math.round(note.t * 1000);
        const group = chordGroups.get(key);
        if (group) group.push(note);
        else chordGroups.set(key, [note]);
      }
      const chordIds = new Set<number>();
      const strokeShape = (points: { x: number; y: number }[], width: number) => {
        ctx.beginPath();
        points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.lineWidth = width;
        ctx.stroke();
      };
      for (const group of chordGroups.values()) {
        if (group.length < 2 || freeStrings) continue;
        for (const note of group) chordIds.add(note.id);
        const sorted = [...group].sort((x, y) => x.string - y.string);
        const z = zOf(sorted[0].t);
        const pts = sorted.map((note) => {
          const base = fretPx(note.fret, note.string);
          return project(base.x, base.y, z);
        });
        const s = pts[0].s;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 12 * s;
        ctx.globalAlpha = 0.9;
        strokeShape(pts, Math.max(3, 7 * s));
        if (session && z < APPROACH_SECONDS) {
          ctx.globalAlpha = 0.9 - (Math.max(0, z) / APPROACH_SECONDS) * 0.6;
          strokeShape(sorted.map((note) => fretPx(note.fret, note.string)), 4);
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      for (const note of toDraw) {
        // La gema cae sobre su carril (en los niveles de cuerdas libres, el del centro del mástil).
        // Con cuerdas libres, además, al llegar se ilumina la COLUMNA entera del traste: vale cualquier cuerda.
        const base = fretPx(note.fret, note.string);
        const z = zOf(note.t);
        // Nota que ya puntuó antes de una PAUSA y vuelve a pasar al continuar: cae igual, pero GRIS
        // (no vuelve a contar; petición del usuario), sin brillo ni guía de aterrizaje.
        const locked = !!session?.locked.has(note.id);
        const hitSongT = locked ? undefined : session?.hitAt.get(note.id);
        const color = locked ? LOCKED_COLOR : (colorBy === 'fret' ? fretColor(note.fret, minFret, maxFret) : RIFF_STRING_COLORS[note.string]) ?? '#ffffff';

        if (hitSongT !== undefined) {
          const elapsed = (songPos - hitSongT) / speed;
          if (elapsed > HIT_FX_SECONDS) continue;
          const at = project(base.x, base.y, Math.max(0, (note.t - hitSongT) / speed));
          const k = elapsed / HIT_FX_SECONDS;
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = color;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(at.x, at.y, gemH * at.s * (0.8 + k * 1.6), 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = color;
          for (let p = 0; p < 8; p++) {
            const ang = (p / 8) * Math.PI * 2;
            const dist = gemH * at.s * (0.6 + k * 2.4);
            ctx.beginPath();
            ctx.arc(at.x + Math.cos(ang) * dist, at.y + Math.sin(ang) * dist, 3 * (1 - k) + 1, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          continue;
        }

        const missed = !!session && z < 0;
        if (missed && -z > MISS_FADE_SECONDS) continue;
        const p = project(base.x, base.y, Math.max(z, 0));
        const w = gemW * p.s;
        const h = gemH * p.s;

        // Cola de las notas largas.
        const durReal = note.dur / speed;
        if (!missed && durReal > 0.25) {
          const zEnd = Math.min(Math.max(z, 0) + durReal, LOOKAHEAD_SECONDS);
          const e = project(base.x, base.y, zEnd);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.45;
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(3, w * 0.22);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(e.x, e.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Guía de aterrizaje (como la "sombra" de Rocksmith): al pasar sobre el mástil, una gema de
        // una cuerda grave cruza las cuerdas agudas antes de llegar a la suya. La línea hasta su
        // sitio y el aro que se cierra sobre su cuerda/traste dejan claro DÓNDE va a caer.
        if (session && !missed && !locked && z < APPROACH_SECONDS && !freeStrings) {
          const k = Math.max(0, z) / APPROACH_SECONDS;
          ctx.globalAlpha = 0.9 - k * 0.6;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(base.x, base.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(base.x, base.y, gemH * (0.9 + k * 1.6), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        ctx.globalAlpha = missed ? Math.max(0, 1 + z / MISS_FADE_SECONDS) * 0.8 : 1;
        ctx.shadowColor = missed || locked ? 'transparent' : color;
        ctx.shadowBlur = missed || locked ? 0 : 14 * p.s;
        ctx.fillStyle = missed ? '#6b7280' : color;
        // Cuerda al aire (traste 0): un CÍRCULO grande en vez de la barra del resto (petición del
        // usuario), para distinguirla de un vistazo.
        const open = note.fret === 0;
        const radius = Math.max(h * 0.95, 9);
        if (open) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        } else {
          roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, 6 * p.s);
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = note.palmMute ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = Math.max(1, 2 * p.s);
        ctx.stroke();
        if (chordIds.has(note.id)) {
          // Borde doble: nota de acorde.
          const gap = Math.max(2, 4 * p.s);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1, 2 * p.s);
          if (open) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius + gap, 0, Math.PI * 2);
          } else {
            roundRect(ctx, p.x - w / 2 - gap, p.y - h / 2 - gap, w + gap * 2, h + gap * 2, 8 * p.s);
          }
          ctx.stroke();
        }

        const fontSize = Math.max(9, h * 0.78);
        ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, 3 * p.s);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.strokeText(String(note.fret), p.x, p.y + 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(note.fret), p.x, p.y + 1);

        const tags = [...note.tech.map((tech) => TECH_LABEL[tech]), note.palmMute ? 'PM' : ''].filter(Boolean).join(' ');
        if (tags && p.s > 0.45 && !missed) {
          ctx.font = `800 ${Math.max(9, fontSize * 0.6)}px system-ui, sans-serif`;
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(tags, p.x, p.y - h * 0.95);
        }

        ctx.globalAlpha = 1;
      }

      // Puntos de cada nota ENCIMA DEL MÁSTIL, centrados sobre su traste (petición del usuario: en
      // el móvil, los de los trastes 0 y 1, puestos al lado de la nota, salían en el mismo sitio y
      // parecía que el 0 no se acertaba). Suben un poco y se apagan. Se calculan desde la sesión en
      // cada frame (sin temporizadores propios): duran SCORE_LABEL_SECONDS, como mucho una por traste
      // y MAX_SCORE_LABELS a la vez (las más nuevas). El texto se encoge para no salirse de su
      // columna; "PERFECTO" va en una línea pequeña encima del "+4". Las de notas bloqueadas tras una
      // pausa no vuelven a salir al pasar otra vez por ellas (parecería que puntúan de nuevo).
      if (session?.rated) {
        const labels = [...session.scoreOf.entries()]
          .filter(([id, score]) => score.points > 0 && !session.locked.has(id) && (songPos - score.at) / speed >= 0 && (songPos - score.at) / speed < SCORE_LABEL_SECONDS)
          .sort((a, b) => b[1].at - a[1].at);
        const usedFrets = new Set<number>();
        let shown = 0;
        const fitted = (text: string, size: number, maxWidth: number) => {
          ctx.font = `950 ${size}px system-ui, sans-serif`;
          const width = ctx.measureText(text).width;
          const fit = width > maxWidth ? Math.max(10, (size * maxWidth) / width) : size;
          ctx.font = `950 ${fit}px system-ui, sans-serif`;
          return fit;
        };
        const drawText = (text: string, x: number, y: number, color: string) => {
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.strokeText(text, x, y);
          ctx.fillStyle = color;
          ctx.fillText(text, x, y);
        };
        for (const [id, score] of labels) {
          const note = noteById(session, id);
          if (!note || usedFrets.has(note.fret) || shown >= MAX_SCORE_LABELS) continue;
          const col = columnRect(note.fret);
          if (!col) continue;
          usedFrets.add(note.fret);
          shown++;
          const k = (songPos - score.at) / speed / SCORE_LABEL_SECONDS;
          const perfect = score.points >= 4;
          const x = col.x + col.w / 2;
          const y = y1 - 6 - k * rowGap * 0.8;
          const color = SCORE_COLORS[String(score.points)] ?? '#ffffff';
          ctx.globalAlpha = k < 0.6 ? 1 : Math.max(0, (1 - k) / 0.4);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          const size = fitted(perfect ? '+4' : scoreText(score.points), Math.max(15, rowGap * 0.8), col.w * 0.95);
          drawText(perfect ? '+4' : scoreText(score.points), x, y, color);
          if (perfect) {
            fitted('PERFECTO', size * 0.55, col.w * 0.95);
            drawText('PERFECTO', x, y - size, color);
          }
        }
        ctx.globalAlpha = 1;
        // El marcador total va FUERA de la autopista, entre el mástil y la barra de controles
        // (RiffScore en ReducedFretboardDiagram).
      }

      // Cuenta atrás y fin.
      if (session) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (session.status === 'countin') {
          const beat = 60 / chart.bpm;
          const left = Math.min(COUNT_IN_BEATS, Math.ceil((session.countInTarget - songPos) / beat));
          if (left > 0) {
            ctx.font = `950 ${Math.max(40, y1 * 0.35)}px system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillText(String(left), vpX, y1 * 0.45);
          }
        } else if (session.status === 'finished') {
          ctx.font = `950 ${Math.max(28, y1 * 0.22)}px system-ui, sans-serif`;
          ctx.fillStyle = '#86efac';
          ctx.fillText('¡CANCIÓN TERMINADA!', vpX, y1 * 0.45);
          if (session.scoring) {
            ctx.font = `900 ${Math.max(20, y1 * 0.12)}px system-ui, sans-serif`;
            ctx.fillStyle = '#fde047';
            ctx.fillText(`${formatScore(session.totalScore)} / ${session.maxScore} puntos`, vpX, y1 * 0.45 + Math.max(36, y1 * 0.2));
          }
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [chart, colorBy, freeStrings, geometryRef, maxFret, minFret, practice, sessionRef, stageRef, stringsKey]);

  return <canvas aria-hidden="true" className="riff-highway" data-testid="riff-highway" ref={canvasRef} />;
}
