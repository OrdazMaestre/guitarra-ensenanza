'use client';
import { type MutableRefObject, type RefObject, useEffect, useRef } from 'react';
import type { FretboardGeometry } from '../ReducedFretboardDiagram';
import { getAudioCurrentTime } from '@/app/lib/guitarAudioEngine';
import type { Chart, ChartNote } from '@/app/lib/riff/chart';
import { COUNT_IN_BEATS, type RiffSession } from '@/app/lib/riff/session';

// Autopista 3D tipo Rocksmith dibujada en un <canvas> 2D (proyección en perspectiva hecha a mano,
// sin WebGL). El canvas se superpone al mástil interactivo (`pointer-events: none`) y cubre desde
// arriba del todo hasta el borde inferior del <svg>: así, en z = 0, cada gema cae EXACTAMENTE en
// su cuerda y su traste del mástil real (las coordenadas salen de `geometryRef`, que publica
// ReducedFretboardDiagram -- respeta zurdo, clavijas y cualquier tamaño).
//
// Proyección: todo converge hacia un punto de fuga por encima del canvas. Un punto del mástil
// (x0, y0) a `z` segundos en el futuro se dibuja en vp + (p0 - vp) * s(z), con s(z) = 1/(1 + a·z);
// `a` se calcula para que lo que está a LOOKAHEAD segundos llegue justo al borde superior.

// Colores por cuerda (decisión del usuario): 6 rojo, 5 naranja, 4 amarillo, 3 verde, 2 azul,
// 1 morado. Dentro del juego el rojo es el de la cuerda 6; por eso un fallo se pinta en GRIS.
export const RIFF_STRING_COLORS: Record<number, string> = {
  1: '#a855f7',
  2: '#3b82f6',
  3: '#22c55e',
  4: '#facc15',
  5: '#f97316',
  6: '#ef4444',
};

const LOOKAHEAD_SECONDS = 2.4;
const HIT_FX_SECONDS = 0.35;
const MISS_FADE_SECONDS = 0.45;
const TOP_MARGIN = 10;
// Desde cuántos segundos antes de llegar se dibuja la guía de aterrizaje.
const APPROACH_SECONDS = 0.6;

const TECH_LABEL: Record<string, string> = { hammer: 'H', pull: 'P', slide: 'S', bend: 'B' };

// Principiante (colorBy 'fret'): cada traste 0-5 con los mismos colores de las cuerdas, en orden
// (0 rojo, 1 naranja, 2 amarillo, 3 verde, 4 azul, 5 morado). Decisión del usuario.
const FRET_COLORS: Record<number, string> = {
  0: RIFF_STRING_COLORS[6],
  1: RIFF_STRING_COLORS[5],
  2: RIFF_STRING_COLORS[4],
  3: RIFF_STRING_COLORS[3],
  4: RIFF_STRING_COLORS[2],
  5: RIFF_STRING_COLORS[1],
};

interface Props {
  // Cuerdas del nivel (se pintan de color en el mástil); por defecto, las 6.
  activeStrings?: number[];
  chart: Chart;
  colorBy?: 'fret' | 'string';
  geometryRef: MutableRefObject<FretboardGeometry | null>;
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

export default function RiffHighway({ activeStrings, chart, colorBy = 'string', geometryRef, previewTime, sessionRef, stageRef }: Props) {
  const stringsKey = (activeStrings ?? [1, 2, 3, 4, 5, 6]).join(',');
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
      const fretPx = (fret: number, string: number) => ({ x: toX(geo.fretX(fret), geo.stringY(string)), y: toY(geo.fretX(fret), geo.stringY(string)) });
      const lineXs = geo.fretLineXs.map((x) => toX(x, geo.stringY(1)));
      const boardLeft = Math.min(...lineXs);
      const boardRight = Math.max(...lineXs);
      const y1 = toY(0, geo.stringY(1));
      const y6 = toY(0, geo.stringY(6));
      const rowGap = (y6 - y1) / 5;
      const colW = (boardRight - boardLeft) / Math.max(1, lineXs.length - 1);

      const session = sessionRef.current;
      // advance() es idempotente: el temporizador de useRiffGame también lo llama.
      if (session) session.advance(getAudioCurrentTime());
      const speed = session?.options.speed ?? 1;
      const songPos = session ? session.songPos : previewRef.current;

      // Punto de fuga y escala.
      const vpX = (boardLeft + boardRight) / 2;
      const vpY = -Math.max(120, y1 * 0.9);
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
        if (col < 0 || col + 1 >= lineXs.length) continue;
        const xa = lineXs[col];
        const xb = lineXs[col + 1];
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
      for (const x of lineXs) {
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

      // Cuerdas de colores sobre el mástil mientras se juega.
      if (session) {
        for (const string of stringsKey.split(',').map(Number)) {
          const y = toY(0, geo.stringY(string));
          ctx.strokeStyle = RIFF_STRING_COLORS[string];
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(boardLeft, y);
          ctx.lineTo(boardRight, y);
          ctx.stroke();
        }
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
      const gemH = Math.max(rowGap * 0.8, 14);

      // Cajas de acorde: notas que suenan a la vez (aún no acertadas ni pasadas) van enmarcadas
      // juntas, como en Rocksmith. Se dibujan antes que las gemas para quedar por detrás.
      const chordGroups = new Map<number, ChartNote[]>();
      for (const note of toDraw) {
        if (session?.hitAt.has(note.id) || zOf(note.t) < 0) continue;
        const key = Math.round(note.t * 1000);
        const group = chordGroups.get(key);
        if (group) group.push(note);
        else chordGroups.set(key, [note]);
      }
      for (const group of chordGroups.values()) {
        if (group.length < 2) continue;
        const pts = group.map((note) => {
          const base = fretPx(note.fret, note.string);
          return project(base.x, base.y, zOf(note.t));
        });
        const s = pts[0].s;
        const pad = gemH * 0.75 * s;
        const minX = Math.min(...pts.map((pt) => pt.x)) - gemW * s * 0.5 - pad * 0.4;
        const maxX = Math.max(...pts.map((pt) => pt.x)) + gemW * s * 0.5 + pad * 0.4;
        const minY = Math.min(...pts.map((pt) => pt.y)) - pad;
        const maxY = Math.max(...pts.map((pt) => pt.y)) + pad;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = Math.max(1, 2 * s);
        roundRect(ctx, minX, minY, maxX - minX, maxY - minY, 8 * s);
        ctx.fill();
        ctx.stroke();
      }

      for (const note of toDraw) {
        const base = fretPx(note.fret, note.string);
        const z = zOf(note.t);
        const hitSongT = session?.hitAt.get(note.id);
        const color = (colorBy === 'fret' ? FRET_COLORS[note.fret] : RIFF_STRING_COLORS[note.string]) ?? '#ffffff';

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
        if (session && !missed && z < APPROACH_SECONDS) {
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
        ctx.shadowColor = missed ? 'transparent' : color;
        ctx.shadowBlur = missed ? 0 : 14 * p.s;
        ctx.fillStyle = missed ? '#6b7280' : color;
        roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, 6 * p.s);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = note.palmMute ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = Math.max(1, 2 * p.s);
        ctx.stroke();

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

      // Cuenta atrás y fin.
      if (session) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (session.status === 'countin') {
          const beat = 60 / chart.bpm;
          const left = Math.min(COUNT_IN_BEATS, Math.ceil((session.startT - songPos) / beat));
          if (left > 0) {
            ctx.font = `950 ${Math.max(40, y1 * 0.35)}px system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillText(String(left), vpX, y1 * 0.45);
          }
        } else if (session.status === 'finished') {
          ctx.font = `950 ${Math.max(28, y1 * 0.22)}px system-ui, sans-serif`;
          ctx.fillStyle = '#86efac';
          ctx.fillText('¡CANCIÓN TERMINADA!', vpX, y1 * 0.45);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [chart, colorBy, geometryRef, sessionRef, stageRef, stringsKey]);

  return <canvas aria-hidden="true" className="riff-highway" data-testid="riff-highway" ref={canvasRef} />;
}
