import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, listGuitarTracks, type Chart } from '../app/lib/riff/chart';
import { holdPoints, points, RiffSession, type RiffOptions } from '../app/lib/riff/session';
import { fretColor, RIFF_STRING_COLORS } from '../app/lib/riff/colors';
import { laneAt, laneRows } from '../app/lib/riff/lanes';
import { RIFF_LEVELS, RIFF_LEVEL_GROUPS } from '../app/lib/riff/levels';
import { reduceChart } from '../app/lib/riff/reduce';

// Fases 1.1 y 1.2 del juego tipo Rocksmith: chart sacado del .gp y motor con reloj simulado.

function loadScore(file: string) {
  return at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
}

test('chart de Feliz Navidad = las notas extraídas a mano (cuerda, traste) y tiempos crecientes', () => {
  const chart = buildChart(at, loadScore('feliz-navidad.gp'), 0);
  expect(chart.notes.map((n) => [n.string, n.fret])).toEqual([
    [2, 3], [1, 3], [1, 2], [1, 3], [1, 0],
    [2, 3], [1, 5], [1, 3], [1, 2], [2, 3],
    [2, 3], [1, 3], [1, 2], [1, 3], [1, 0],
    [2, 1], [2, 3], [2, 5], [2, 3], [2, 3], [2, 1],
    [2, 1], [2, 0],
  ]);
  for (let i = 1; i < chart.notes.length; i++) {
    expect(chart.notes[i].t).toBeGreaterThan(chart.notes[i - 1].t);
  }
  expect(chart.bars.length).toBe(5);
  expect(chart.drums).toEqual([]);
  expect(chart.beats.length).toBeGreaterThanOrEqual(5 * 3);
});

test('chart de Master of Puppets: pistas de guitarra, tempo 212 y notas fuera del mástil', () => {
  const score = loadScore('prueba-master-of-puppets.gp');
  const tracks = listGuitarTracks(score).map((t) => t.name);
  expect(tracks).toEqual(['Rhythm Guitar (James)', 'Rhythm Guitar (Kirk)']);

  const james = buildChart(at, score, 1, 12);
  expect(james.bpm).toBe(212);
  expect(james.notes.length).toBe(820);
  expect(james.skippedAboveMaxFret).toBe(0);
  // Compás 2 empieza a 4 negras de 212 bpm.
  expect(james.bars[1].t).toBeCloseTo((4 * 60) / 212, 5);

  // Batería del propio archivo, para el acompañamiento "Batería".
  expect(james.drums.length).toBeGreaterThan(100);
  expect(new Set(james.drums.map((d) => d.sound))).toEqual(new Set(['kick', 'snare', 'cymbal']));

  // Kirk llega al traste 22: esas 142 notas se recolocan (cuerda más aguda u octava abajo) y
  // ninguna se pierde.
  const full = buildChart(at, score, 2, 24);
  const kirk = buildChart(at, score, 2, 12);
  expect(kirk.movedAboveMaxFret).toBe(142);
  expect(kirk.skippedAboveMaxFret).toBe(0);
  expect(kirk.notes.length).toBe(full.notes.length);
  expect(kirk.notes.every((n) => n.fret >= 0 && n.fret <= 12)).toBe(true);
  const open: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
  const pitch = (n: { string: number; fret: number }) => open[n.string] + n.fret;
  // Cada nota recolocada corresponde a una original del mismo golpe: misma nota en otra cuerda,
  // o exactamente una octava más grave. Las que no se movieron quedan idénticas.
  const pending = [...full.notes];
  for (const n of kirk.notes) {
    const index = pending.findIndex((o) => o.t === n.t && (n.moved
      ? o.fret > 12 && pitch(o) === pitch(n) + (n.moved === 'octave' ? 12 : 0) && (n.moved === 'octave' || n.string < o.string)
      : o.string === n.string && o.fret === n.fret));
    expect(index, `nota ${n.string}/${n.fret} en t=${n.t}`).toBeGreaterThanOrEqual(0);
    pending.splice(index, 1);
  }
  expect(pending).toEqual([]);
  // Un acorde nunca acaba con dos notas en la misma cuerda.
  const byTime = new Map<number, number[]>();
  for (const n of kirk.notes) byTime.set(n.t, [...(byTime.get(n.t) ?? []), n.string]);
  for (const strings of byTime.values()) expect(new Set(strings).size).toBe(strings.length);
});

function fakeChart(): Chart {
  // 4/4 a 60 bpm (1 negra = 1 s). Notas en cuerda 1, trastes 2, 4, 5 en t = 0, 1, 2.
  return {
    trackName: 'prueba',
    bpm: 60,
    duration: 4,
    notes: [
      { id: 0, t: 0, dur: 1, string: 1, fret: 2, midi: 66, palmMute: false, tech: [] },
      { id: 1, t: 1, dur: 1, string: 1, fret: 4, midi: 68, palmMute: false, tech: [] },
      { id: 2, t: 2, dur: 1, string: 1, fret: 5, midi: 69, palmMute: false, tech: [] },
    ],
    bars: [{ number: 1, t: 0, end: 4 }],
    beats: [0, 1, 2, 3].map((t) => ({ t, q: t, isBarStart: t === 0 })),
    drums: [{ t: 0, sound: 'kick' }, { t: 0.5, sound: 'cymbal' }],
    movedAboveMaxFret: 0,
    skippedAboveMaxFret: 0,
  };
}

const ritmo: RiffOptions = { speed: 1, mode: 'ritmo', loop: false, fromBar: 1, toBar: 1 };

test('motor: `repeats` toca el tramo N veces seguidas y SUMA los puntos de todas las vueltas', () => {
  // fakeChart: 3 notas en 1 compás de 4/4 a 60 bpm; cuenta de entrada 4 s.
  const s = new RiffSession(fakeChart(), { ...ritmo, repeats: 3 }, 100, 'nada');
  expect(s.repeats).toBe(3);
  expect(s.maxScore).toBe(3 * 4 * 3);
  const seen: number[] = [];
  let firstLapScored = false;
  for (let real = 100; real < 140 && s.status !== 'finished'; real += 0.025) {
    s.advance(real);
    if (!seen.includes(s.repetition)) seen.push(s.repetition);
    // En cada vuelta se acierta la primera nota (cuerda 1, traste 2) justo a tiempo.
    if (s.status === 'playing' && Math.abs(s.songPos - 0) < 0.013 && !s.hitAt.has(0)) {
      s.judge({ string: 1, fret: 2, kind: 'pluck' }, real);
      if (s.repetition === 1) firstLapScored = s.totalScore === 4;
    }
  }
  expect(firstLapScored).toBe(true);
  expect(seen).toEqual([1, 2, 3]);
  expect(s.status).toBe('finished');
  // 4 puntos por vuelta, sumados (no se pierden al empezar la vuelta siguiente).
  expect(s.totalScore).toBe(12);
});

test('motor: `breaks` para la partida sola en cada parada; al seguir, cuenta de entrada SIN retroceder', () => {
  // twoBarChart: 2 compases de 4/4 a 60 bpm. Parada en t = 4 (inicio del compás 2).
  const s = new RiffSession(twoBarChart(), { ...ritmo, toBar: 2, breaks: [4] }, 100, 'metronomo');
  for (let real = 100; real < 107.9; real += 0.025) s.advance(real);
  expect(s.status).toBe('playing');
  s.advance(108.1); // t = 4,1 -> se queda en 4
  expect(s.status).toBe('paused');
  expect(s.stoppedAtBreak).toBe(1);
  expect(s.songPos).toBe(4);
  s.advance(120);
  expect(s.songPos).toBe(4);
  // Seguir: cuenta de entrada de 4 negras desde t = 4 (no un compás atrás).
  s.resume(120);
  expect(s.stoppedAtBreak).toBeNull();
  expect(s.status).toBe('countin');
  expect(s.countInTarget).toBe(8);
  expect(s.songPos).toBe(4);
  expect(s.takeClicks(120, 0.1).length).toBe(1);
  s.advance(124.5);
  expect(s.status).toBe('playing');
});

test('motor: acierto dentro de ±0,5 s suena normal; fuera o nota equivocada, bajito', () => {
  // Reloj real empieza en 100; cuenta de entrada de 4 s -> la nota 0 cae en real = 104.
  const s = new RiffSession(fakeChart(), ritmo, 100, 'nada');
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 103.45).hit).toBeNull(); // 0,55 s antes
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 104.25).hit).not.toBeNull(); // 0,25 s tarde
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 104.3).hit).toBeNull(); // ya acertada
  expect(s.judge({ string: 1, fret: 3, kind: 'pluck' }, 105).hit).toBeNull(); // traste equivocado
  expect(s.judge({ string: 1, fret: 4, kind: 'hammer' }, 105.1).hit).not.toBeNull(); // tapping cuenta
  expect(s.hitAt.size).toBe(2);
});

test('motor: slide solo cuenta a nota pegada', () => {
  const s = new RiffSession(fakeChart(), ritmo, 0, 'nada');
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 4).hit).not.toBeNull();
  expect(s.judge({ string: 1, fret: 4, kind: 'slide', from: { string: 1, fret: 2 } }, 5).hit).toBeNull();
  expect(s.judge({ string: 1, fret: 4, kind: 'slide', from: { string: 1, fret: 3 } }, 5.05).hit).not.toBeNull();
});

test('motor: a media velocidad la ventana de ±0,5 s sigue siendo en tiempo real', () => {
  const s = new RiffSession(fakeChart(), { ...ritmo, speed: 0.5 }, 0, 'nada');
  // Cuenta de 4 s de canción = 8 s reales; nota 1 (t=1) cae en real = 10.
  expect(s.judge({ string: 1, fret: 4, kind: 'pluck' }, 9.45).hit).toBeNull();
  expect(s.judge({ string: 1, fret: 4, kind: 'pluck' }, 9.75).hit).not.toBeNull();
});

test('motor: modo paso a paso se para en cada nota hasta tocarla', () => {
  const s = new RiffSession(fakeChart(), { ...ritmo, mode: 'paso' }, 0, 'nada');
  s.advance(50);
  expect(s.songPos).toBe(0);
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 60).hit).not.toBeNull();
  s.advance(70);
  expect(s.songPos).toBe(1);
});

test('motor: en paso a paso la siguiente nota vale aunque se toque antes de tiempo', () => {
  const s = new RiffSession(fakeChart(), { ...ritmo, mode: 'paso' }, 0, 'nada');
  s.advance(10);
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 10).hit).not.toBeNull();
  // La nota 1 (t=1) aún está lejos, pero es la pendiente: cuenta y la canción salta a ella.
  expect(s.judge({ string: 1, fret: 4, kind: 'pluck' }, 10.01).hit).not.toBeNull();
  expect(s.songPos).toBeGreaterThanOrEqual(1);
  // Una nota que NO es la pendiente sigue sin contar.
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 10.02).hit).toBeNull();
});

test('motor: termina tras el tramo, o vuelve a empezar en bucle limpiando aciertos', () => {
  const once = new RiffSession(fakeChart(), ritmo, 0, 'nada');
  once.advance(4 + 5.1);
  expect(once.status).toBe('finished');

  const loop = new RiffSession(fakeChart(), { ...ritmo, loop: true }, 0, 'nada');
  loop.judge({ string: 1, fret: 2, kind: 'pluck' }, 4);
  loop.advance(4 + 5.1);
  expect(loop.status).toBe('countin');
  expect(loop.loopCount).toBe(1);
  expect(loop.hitAt.size).toBe(0);
});

test('motor: acompañamiento -- cuenta de entrada siempre; luego metrónomo, batería o nada', () => {
  const s = new RiffSession(fakeChart(), ritmo, 10, 'nada');
  const clicks = s.takeClicks(10, 5);
  expect(clicks.map((c) => c.at)).toEqual([10, 11, 12, 13]);
  expect(clicks[0].volume).toBeGreaterThan(clicks[1].volume);
  expect(new RiffSession(fakeChart(), ritmo, 10, 'metronomo').takeClicks(10, 10).length).toBe(8);
  const drums = new RiffSession(fakeChart(), ritmo, 10, 'bateria').takeClicks(10, 10);
  expect(drums.slice(4).map((c) => [c.at, c.sound])).toEqual([[14, 'kick'], [14.5, 'cymbal']]);
});

test('motor: en modo con ritmo la canción suena de fondo sola; en paso a paso no', () => {
  const s = new RiffSession(fakeChart(), ritmo, 0, 'nada');
  const guide = s.takeGuideNotes(0, 10);
  expect(guide.map((g) => [g.at, g.midi])).toEqual([[4, 66], [5, 68], [6, 69]]);
  // No se repiten en la siguiente llamada.
  expect(s.takeGuideNotes(0, 10)).toEqual([]);
  // A media velocidad, la hora y la duración se estiran.
  const half = new RiffSession(fakeChart(), { ...ritmo, speed: 0.5 }, 0, 'nada').takeGuideNotes(0, 20);
  expect(half[0]).toMatchObject({ at: 8, duration: 2 });
  expect(new RiffSession(fakeChart(), { ...ritmo, mode: 'paso' }, 0, 'nada').takeGuideNotes(0, 10)).toEqual([]);
});

// Nivel traducido (ver reduce.ts): una nota traducida en cuerda 6 traste 0 que es "dueña" de las
// notas reales 0 y 1; la siguiente (traste 3) es dueña de la 2.
function translatedChart(): Chart {
  const real = fakeChart();
  return {
    ...real,
    sourceNotes: real.notes,
    notes: [
      { id: 0, t: 0, dur: 0, string: 6, fret: 0, midi: 40, palmMute: false, tech: [], sourceIds: [0, 1], phrase: 0 },
      { id: 1, t: 2, dur: 0, string: 6, fret: 3, midi: 43, palmMute: false, tech: [], sourceIds: [2], phrase: 0 },
    ],
  };
}

test('motor traducido: el mástil no suena; acertar abre la canción real; fallar no suena', () => {
  const s = new RiffSession(translatedChart(), ritmo, 0, 'nada');
  // Fondo: las notas REALES (cuerda 1), bajito porque aún no se ha acertado nada.
  const first = s.takeGuideNotes(0, 4.1);
  expect(first.map((g) => [g.id, g.midi, g.open])).toEqual([[0, 66, false]]);

  const wrong = s.judge({ string: 6, fret: 1, kind: 'pluck' }, 4);
  expect(wrong).toMatchObject({ gain: 0, hit: null });

  const hit = s.judge({ string: 6, fret: 0, kind: 'pluck' }, 4.05);
  expect(hit.gain).toBe(0);
  expect(hit.hit?.id).toBe(0);
  expect(s.openedBy(0)).toEqual([0, 1]);
  // La nota real 1 aún no estaba programada: sale ya abierta. La 2 es de otra nota traducida.
  expect(s.takeGuideNotes(4.05, 10).map((g) => [g.id, g.open])).toEqual([[1, true], [2, false]]);
});

test('motor traducido en paso a paso: el acierto hace sonar ya las notas reales de su golpe', () => {
  const s = new RiffSession(translatedChart(), { ...ritmo, mode: 'paso' }, 0, 'nada');
  s.advance(10);
  const hit = s.judge({ string: 6, fret: 0, kind: 'pluck' }, 10);
  expect(hit.playNow.map((n) => n.midi)).toEqual([66]);
  expect(s.takeGuideNotes(10, 10)).toEqual([]);
});

// Dos compases de 4/4 a 60 bpm: notas en t = 0, 1, 2 (compás 1) y 5, 6 (compás 2).
function twoBarChart(): Chart {
  const note = (id: number, t: number, fret: number) => ({ id, t, dur: 0.5, string: 1, fret, midi: 64 + fret, palmMute: false, tech: [] });
  return {
    trackName: 'prueba',
    bpm: 60,
    duration: 8,
    notes: [note(0, 0, 2), note(1, 1, 4), note(2, 2, 5), note(3, 5, 7), note(4, 6, 9)],
    bars: [{ number: 1, t: 0, end: 4 }, { number: 2, t: 4, end: 8 }],
    beats: [0, 1, 2, 3, 4, 5, 6, 7].map((t) => ({ t, q: t, isBarStart: t % 4 === 0 })),
    drums: [],
    movedAboveMaxFret: 0,
    skippedAboveMaxFret: 0,
  };
}

test('motor: PAUSA congela la canción; en pausa no se juzga nada ni suena fondo ni metrónomo', () => {
  const s = new RiffSession(twoBarChart(), { ...ritmo, toBar: 2 }, 0, 'metronomo');
  // Cuenta de 4 s: la nota de t=5 cae en real = 9.
  expect(s.judge({ string: 1, fret: 7, kind: 'pluck' }, 9).hit).not.toBeNull();
  s.pause(9.6);
  expect(s.status).toBe('paused');
  s.advance(30);
  expect(s.songPos).toBeCloseTo(5.6, 5);
  expect(s.judge({ string: 1, fret: 9, kind: 'pluck' }, 30)).toMatchObject({ gain: 1, hit: null });
  expect(s.takeClicks(30, 10)).toEqual([]);
  expect(s.takeGuideNotes(30, 10)).toEqual([]);
});

test('motor: CONTINUAR retrocede un compás, con cuenta de entrada, y esas notas vuelven a estar por tocar', () => {
  const s = new RiffSession(twoBarChart(), { ...ritmo, toBar: 2 }, 0, 'metronomo');
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 4).hit).not.toBeNull();
  expect(s.judge({ string: 1, fret: 7, kind: 'pluck' }, 9).hit).not.toBeNull();
  s.pause(9.6); // pausa en el compás 2
  s.resume(20);
  // Vuelve al inicio del compás anterior (compás 1, t=0) con 4 pulsos de cuenta de entrada.
  expect(s.status).toBe('countin');
  expect(s.countInTarget).toBe(0);
  expect(s.songPos).toBeCloseTo(-4, 5);
  expect(s.hitAt.size).toBe(0);
  const clicks = s.takeClicks(20, 4.5);
  expect(clicks.map((c) => c.at)).toEqual([20, 21, 22, 23, 24]);
  expect(clicks[0].volume).toBeGreaterThan(clicks[1].volume);
  // El fondo también vuelve a sonar desde ahí.
  expect(s.takeGuideNotes(20, 4.5).map((g) => g.id)).toEqual([0]);
  s.advance(24.1);
  expect(s.status).toBe('playing');
  // Se puede volver a acertar la primera nota.
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 24.1).hit).not.toBeNull();
});

test('motor: CONTINUAR desde el primer compás del tramo vuelve a su inicio (no se sale del tramo)', () => {
  const s = new RiffSession(twoBarChart(), { ...ritmo, fromBar: 2, toBar: 2 }, 0, 'nada');
  s.advance(5.5); // compás 2 empieza en real = 4
  s.pause(5.5);
  s.resume(10);
  expect(s.countInTarget).toBe(4);
});

test('motor: con cuerdas libres vale el traste en cualquier cuerda; sin ellas (Experto), cuerda y traste', () => {
  // twoBarChart: todas las notas en la cuerda 1. La primera (traste 2) cae en real = 4.
  const free = new RiffSession(twoBarChart(), { ...ritmo, toBar: 2, freeStrings: true }, 0, 'nada');
  expect(free.judge({ string: 6, fret: 2, kind: 'pluck' }, 4).hit?.id).toBe(0);
  // Traste equivocado en cualquier cuerda: no vale.
  expect(free.judge({ string: 3, fret: 5, kind: 'pluck' }, 5).hit).toBeNull();
  expect(free.judge({ string: 4, fret: 4, kind: 'pluck' }, 5).hit?.id).toBe(1);

  const strict = new RiffSession(twoBarChart(), { ...ritmo, toBar: 2 }, 0, 'nada');
  expect(strict.judge({ string: 6, fret: 2, kind: 'pluck' }, 4).hit).toBeNull();
  expect(strict.judge({ string: 1, fret: 2, kind: 'pluck' }, 4).hit?.id).toBe(0);
});

test('motor: paso a paso con cuerdas libres acepta la nota pendiente en otra cuerda', () => {
  const s = new RiffSession(twoBarChart(), { ...ritmo, mode: 'paso', toBar: 2, freeStrings: true }, 0, 'nada');
  s.advance(10);
  expect(s.judge({ string: 5, fret: 2, kind: 'pluck' }, 10).hit?.id).toBe(0);
  expect(s.judge({ string: 2, fret: 4, kind: 'pluck' }, 10.5).hit?.id).toBe(1);
});

test('arcoíris por traste: con 0-5, los 6 colores de las cuerdas en orden; con 0-10, tonos intermedios', () => {
  expect([0, 1, 2, 3, 4, 5].map((f) => fretColor(f, 0, 5))).toEqual(['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7']);
  expect(fretColor(0, 0, 10)).toBe('#ef4444');
  expect(fretColor(10, 0, 10)).toBe('#a855f7');
  expect(fretColor(4, 0, 10)).toBe('#facc15');
  expect(new Set(Array.from({ length: 11 }, (_, f) => fretColor(f, 0, 10))).size).toBe(11);
});

// --- Puntuación (solo en "Con ritmo"). fakeChart: cuerda 1, trastes 2, 4, 5 en t = 0, 1, 2; con la
// cuenta de 4 s y reloj desde 0, caen en real = 4, 5, 6.

test('puntos: tabla de márgenes y categorías (exacta 4/3/2, cercana 1/0,5, si no 0)', () => {
  expect([0, 0.2, 0.21, 0.3, 0.31, 0.5, 0.51].map((d) => points(true, d))).toEqual([4, 4, 3, 3, 2, 2, 0]);
  expect([0, 0.3, 0.31, 0.5, 0.51].map((d) => points(false, d))).toEqual([1, 1, 0.5, 0.5, 0]);
});

test('puntos: cada margen, a los dos lados de la nota', () => {
  for (const [offset, expected] of [[-0.15, 4], [0.15, 4], [-0.25, 3], [0.25, 3], [-0.45, 2], [0.45, 2]] as const) {
    const s = new RiffSession(fakeChart(), ritmo, 0, 'nada');
    s.judge({ string: 1, fret: 2, kind: 'pluck' }, 4 + offset);
    expect(s.scoreOf.get(0), `desviación ${offset}`).toMatchObject({ points: expected, exact: true });
  }
  const late = new RiffSession(fakeChart(), ritmo, 0, 'nada');
  late.judge({ string: 1, fret: 2, kind: 'pluck' }, 4.55);
  expect(late.scoreOf.size).toBe(0);
  expect(late.totalScore).toBe(0);
});

test('puntos: nota cercana (casilla de al lado en la cuerda, o cuerda vecina en el traste) y lejana', () => {
  const near = (event: { string: number; fret: number }, at: number) => {
    const s = new RiffSession(fakeChart(), ritmo, 0, 'nada');
    const result = s.judge({ ...event, kind: 'pluck' }, at);
    return { points: s.scoreOf.get(0)?.points ?? 0, hit: result.hit, gain: result.gain };
  };
  expect(near({ string: 1, fret: 3 }, 4.1)).toEqual({ points: 1, hit: null, gain: 0 }); // traste de al lado
  expect(near({ string: 1, fret: 1 }, 4.3)).toMatchObject({ points: 1 });
  expect(near({ string: 2, fret: 2 }, 3.6)).toMatchObject({ points: 0.5 }); // cuerda vecina, 0,4 s antes
  expect(near({ string: 2, fret: 3 }, 4)).toMatchObject({ points: 0 }); // en diagonal: lejana
  expect(near({ string: 1, fret: 7 }, 4)).toMatchObject({ points: 0 });
  expect(near({ string: 3, fret: 2 }, 4)).toMatchObject({ points: 0 });
  // Con cuerdas libres, "al lado" = traste ±1 en cualquier cuerda.
  const free = new RiffSession(fakeChart(), { ...ritmo, freeStrings: true }, 0, 'nada');
  free.judge({ string: 6, fret: 3, kind: 'pluck' }, 4);
  expect(free.scoreOf.get(0)).toMatchObject({ points: 1, exact: false });
});

test('puntos: no se acumulan -- la exacta sustituye a la cercana; cada nota y cada pulsación, una vez', () => {
  const s = new RiffSession(fakeChart(), ritmo, 0, 'nada');
  s.judge({ string: 1, fret: 3, kind: 'pluck' }, 3.9); // cercana: 1
  s.judge({ string: 1, fret: 1, kind: 'pluck' }, 3.95); // otra cercana a la misma nota: no cuenta
  expect(s.totalScore).toBe(1);
  s.judge({ string: 1, fret: 2, kind: 'pluck' }, 4.1); // exacta: 4 (sustituye)
  expect(s.scoreOf.get(0)).toMatchObject({ points: 4, exact: true });
  expect(s.totalScore).toBe(4);
  s.judge({ string: 1, fret: 2, kind: 'pluck' }, 4.15); // ya acertada: nada
  expect(s.totalScore).toBe(4);
  expect(s.scoreOf.size).toBe(1);
  // Una pulsación en el traste 4 entre la nota 0 (ya puntuada) y la 1 solo puntúa la 1.
  s.judge({ string: 1, fret: 4, kind: 'pluck' }, 4.6);
  expect(s.scoreOf.get(1)).toMatchObject({ points: 2, exact: true });
  expect(s.scoreOf.size).toBe(2);
  expect(s.maxScore).toBe(12);
});

test('puntos: al 50 % los márgenes siguen siendo en segundos reales', () => {
  // A media velocidad la nota 0 cae en real = 8.
  for (const [offset, expected] of [[0.15, 4], [0.25, 3], [0.45, 2]] as const) {
    const s = new RiffSession(fakeChart(), { ...ritmo, speed: 0.5 }, 0, 'nada');
    s.judge({ string: 1, fret: 2, kind: 'pluck' }, 8 + offset);
    expect(s.scoreOf.get(0)?.points).toBe(expected);
  }
});

test('puntos: paso a paso no puntúa nada, aunque sigue contando aciertos', () => {
  const s = new RiffSession(fakeChart(), { ...ritmo, mode: 'paso' }, 0, 'nada');
  s.advance(10);
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 10).hit?.id).toBe(0);
  s.judge({ string: 1, fret: 5, kind: 'pluck' }, 10.2);
  expect(s.hitAt.size).toBe(1);
  expect(s.scoreOf.size).toBe(0);
  expect(s.scoring).toBe(false);
});

test('puntos: continuar tras pausa y el bucle vuelven a dejar las notas por puntuar', () => {
  const s = new RiffSession(twoBarChart(), { ...ritmo, toBar: 2 }, 0, 'nada');
  s.judge({ string: 1, fret: 2, kind: 'pluck' }, 4);
  s.judge({ string: 1, fret: 7, kind: 'pluck' }, 9);
  expect(s.totalScore).toBe(8);
  s.pause(9.6);
  s.resume(20); // vuelve al compás 1: todo por puntuar otra vez
  expect(s.totalScore).toBe(0);
  const loop = new RiffSession(fakeChart(), { ...ritmo, loop: true }, 0, 'nada');
  loop.judge({ string: 1, fret: 2, kind: 'pluck' }, 4);
  loop.advance(4 + 5.1);
  expect(loop.totalScore).toBe(0);
});

// --- Notas repetidas con la pulsación MANTENIDA.

function bar42(level: 'medio' | 'avanzado') {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync('public/tabs/prueba-master-of-puppets.gp')), new at.Settings());
  const chart = reduceChart(buildChart(at, score, 2, 24), RIFF_LEVELS[level]);
  const options: RiffOptions = { speed: 0.5, mode: 'ritmo', loop: false, fromBar: 42, toBar: 42, freeStrings: true };
  const session = new RiffSession(chart, options, 0, 'nada');
  // Reloj real del instante de canción t (cuenta de entrada de 4 negras incluida).
  const realAt = (t: number) => (t - session.countInTarget) / options.speed + (4 * 60) / chart.bpm / options.speed;
  return { session, realAt, notes: session.notes };
}

test('mantener: el compás 42 entero con el traste 0 pulsado -- la primera según su tiempo y el resto según su hueco', () => {
  for (const level of ['medio', 'avanzado'] as const) {
    const { session, realAt, notes } = bar42(level);
    expect(notes).toHaveLength(9);
    const first = notes[0];
    // Se pulsa (en la cuerda 5: cuerdas libres) a tiempo y NO se suelta.
    session.judge({ string: 5, fret: first.fret, kind: 'pluck' }, realAt(first.t));
    for (let real = realAt(first.t); real <= realAt(notes[8].t) + 0.05; real += 0.025) {
      session.advance(real);
      session.autoHold([{ string: 5, fret: first.fret }]);
    }
    expect(session.hitAt.size).toBe(9);
    // Corcheas +2; la última llega a una semicorchea, +1.
    expect([...session.scoreOf.values()].map((s) => s.points)).toEqual([4, 2, 2, 2, 2, 2, 2, 2, 1]);
    expect(session.totalScore).toBe(19);
  }
});

test('mantener: al soltar, las siguientes ya no cuentan solas (hay que volver a pulsar)', () => {
  const { session, realAt, notes } = bar42('medio');
  session.judge({ string: 6, fret: notes[0].fret, kind: 'pluck' }, realAt(notes[0].t));
  let real = realAt(notes[0].t);
  for (; real <= realAt(notes[3].t) + 0.01; real += 0.025) {
    session.advance(real);
    session.autoHold([{ string: 6, fret: notes[0].fret }]);
  }
  expect(session.hitAt.size).toBe(4);
  // Suelta.
  for (; real <= realAt(notes[8].t) + 0.05; real += 0.025) {
    session.advance(real);
    session.autoHold([]);
  }
  expect(session.hitAt.size).toBe(4);
});

test('mantener: puntos según el hueco con la anterior (decisión del usuario)', () => {
  // semicorchea (o menos) +1, corchea +2, negra +1, blanca o más +½; lo intermedio, al valor más largo.
  expect([0.125, 0.25, 1 / 3, 0.5, 0.75, 1, 1.5, 2, 4, 8].map(holdPoints)).toEqual([1, 1, 2, 2, 1, 1, 0.5, 0.5, 0.5, 0.5]);
});

test('mantener: cuenta siempre, quede lo que quede; una nota distinta por medio corta la cadena', () => {
  // 60 bpm (negra = 1 s), todas en la cuerda 6.
  const note = (id: number, t: number, fret: number) => ({ id, t, dur: 0.2, string: 6, fret, midi: 40 + fret, palmMute: false, tech: [] });
  const chart: Chart = { ...twoBarChart(), notes: [note(0, 0, 0), note(1, 1, 0), note(2, 3, 0), note(3, 3.5, 3), note(4, 3.75, 0), note(5, 4, 0)] };
  const s = new RiffSession(chart, { ...ritmo, toBar: 2 }, 0, 'nada');
  s.judge({ string: 6, fret: 0, kind: 'pluck' }, 4);
  for (let real = 4; real <= 7.7; real += 0.025) {
    s.advance(real);
    s.autoHold([{ string: 6, fret: 0 }]);
  }
  // Nota 1 a una negra: +1. Nota 2 a una blanca: +½.
  expect(s.scoreOf.get(1)?.points).toBe(1);
  expect(s.scoreOf.get(2)?.points).toBe(0.5);
  // La nota 3 (traste 3) va por medio: la 4 ya no cuenta sola, aunque se siga pulsando el 0.
  expect(s.hitAt.has(3)).toBe(false);
  expect(s.hitAt.has(4)).toBe(false);
  // Se vuelve a pulsar en la 4 y se mantiene: la 5, a una semicorchea, +1.
  s.judge({ string: 6, fret: 0, kind: 'pluck' }, 7.75);
  for (let real = 7.75; real <= 8.1; real += 0.025) {
    s.advance(real);
    s.autoHold([{ string: 6, fret: 0 }]);
  }
  expect(s.scoreOf.get(5)?.points).toBe(1);
});

test('mantener: en paso a paso también avanza solo (sin puntos)', () => {
  const { notes } = bar42('medio');
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync('public/tabs/prueba-master-of-puppets.gp')), new at.Settings());
  const chart = reduceChart(buildChart(at, score, 2, 24), RIFF_LEVELS.medio);
  const s = new RiffSession(chart, { speed: 0.5, mode: 'paso', loop: false, fromBar: 42, toBar: 42, freeStrings: true }, 0, 'nada');
  s.advance(100);
  s.judge({ string: 6, fret: notes[0].fret, kind: 'pluck' }, 100);
  for (let real = 100; real <= 104; real += 0.025) {
    s.advance(real);
    s.autoHold([{ string: 6, fret: notes[0].fret }]);
  }
  expect(s.hitAt.size).toBe(9);
  expect(s.scoreOf.size).toBe(0);
});

test('motor: durante la partida el mástil no suena en NINGÚN nivel (Experto incluido); en pausa, sí', () => {
  const s = new RiffSession(fakeChart(), ritmo, 0, 'nada');
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 2).gain).toBe(0); // cuenta de entrada
  const hit = s.judge({ string: 1, fret: 2, kind: 'pluck' }, 4);
  expect(hit).toMatchObject({ gain: 0 });
  expect(hit.hit?.id).toBe(0);
  expect(s.judge({ string: 1, fret: 9, kind: 'pluck' }, 4.2).gain).toBe(0);
  // Experto: acertar abre su propia nota de fondo.
  expect(s.openedBy(0)).toEqual([0]);
  expect(s.takeGuideNotes(4.2, 1).map((g) => [g.id, g.open])).toEqual([[1, false]]);
  s.judge({ string: 1, fret: 4, kind: 'pluck' }, 4.9);
  s.pause(5);
  expect(s.judge({ string: 1, fret: 4, kind: 'pluck' }, 6).gain).toBe(1);
});

test('motor: Experto en paso a paso, el acierto hace sonar ya su nota real', () => {
  const s = new RiffSession(fakeChart(), { ...ritmo, mode: 'paso' }, 0, 'nada');
  s.advance(10);
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 10).playNow.map((n) => n.midi)).toEqual([66]);
});

// --- Verificación final (Actualización 1).

test('verificación: cuerdas libres SOLO en el modo trastes (no en Medio, Difícil ni Experto)', () => {
  expect(Object.entries(RIFF_LEVELS).filter(([, p]) => p.freeStrings).map(([k]) => k)).toEqual(['practica', 'facil', 'medio', 'avanzado']);
  // El modo trastes son justo esos niveles; el modo cuerdas, los demás.
  expect(RIFF_LEVEL_GROUPS.find((g) => g.id === 'trastes')!.levels).toEqual(['practica', 'facil', 'medio', 'avanzado']);
  expect(RIFF_LEVEL_GROUPS.find((g) => g.id === 'cuerdas')!.levels).toEqual(['medio-cuerdas', 'avanzado-cuerdas', 'dificil', 'experto']);
  // Experto no tiene perfil: useRiffController le pasa freeStrings: false (profile null).
  expect('experto' in RIFF_LEVELS).toBe(false);
});

test('verificación: al 50 % el metrónomo, la batería y la cuenta de entrada van a la mitad de velocidad', () => {
  const metro = new RiffSession(fakeChart(), { ...ritmo, speed: 0.5 }, 10, 'metronomo').takeClicks(10, 20);
  // 4 de cuenta + 4 pulsos del compás, uno cada 2 s reales (60 bpm al 50 %).
  expect(metro.map((c) => c.at)).toEqual([10, 12, 14, 16, 18, 20, 22, 24]);
  const drums = new RiffSession(fakeChart(), { ...ritmo, speed: 0.5 }, 10, 'bateria').takeClicks(10, 20);
  expect(drums.slice(4).map((c) => [c.at, c.sound])).toEqual([[18, 'kick'], [19, 'cymbal']]);
});

// La banda (petición del usuario): las otras pistas con altura suenan de fondo "como la batería".
test('chart: la banda son las demás pistas con altura (la otra guitarra y el bajo), sin la que se toca', () => {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync('public/tabs/prueba-master-of-puppets.gp')), new at.Settings());
  const kirk = buildChart(at, score, 2, 24);
  const james = buildChart(at, score, 1, 24);
  const guitar = (c: Chart) => c.band!.filter((n) => n.kind === 'guitar');
  const bass = (c: Chart) => c.band!.filter((n) => n.kind === 'bass');
  // Tocando Kirk, de fondo va James (y al revés): sus notas, en los mismos tiempos.
  expect(guitar(kirk).length).toBe(james.notes.length);
  expect(guitar(james).length).toBe(kirk.notes.length);
  expect(guitar(kirk).map((n) => n.midi).sort()).toEqual(james.notes.map((n) => n.midi).sort());
  // El bajo: del Mi1 (28) para arriba, siempre por debajo de la guitarra.
  expect(bass(kirk).length).toBeGreaterThan(100);
  expect(Math.min(...bass(kirk).map((n) => n.midi))).toBe(28);
  expect(Math.max(...bass(kirk).map((n) => n.midi))).toBeLessThan(52);
  // Ordenada por tiempo.
  kirk.band!.forEach((n, i) => { if (i > 0) expect(n.t).toBeGreaterThanOrEqual(kirk.band![i - 1].t); });
});

test('motor: la banda suena solo con "Batería" y en "Con ritmo"', () => {
  const chart: Chart = {
    ...fakeChart(),
    band: [
      { t: 0, dur: 0.5, midi: 40, kind: 'bass', palmMute: false },
      { t: 1, dur: 0.5, midi: 52, kind: 'guitar', palmMute: true },
    ],
  };
  const take = (backing: 'bateria' | 'metronomo' | 'nada', mode: 'ritmo' | 'paso') => {
    const s = new RiffSession(chart, { ...ritmo, mode }, 100, backing);
    const out = [];
    for (let real = 100; real < 106; real += 0.025) {
      s.advance(real);
      out.push(...s.takeBandNotes(real, 0.15));
    }
    return out;
  };
  const band = take('bateria', 'ritmo');
  expect(band.map((n) => [n.kind, n.midi])).toEqual([['bass', 40], ['guitar', 52]]);
  // Cada una a su hora: la cuenta de entrada son 4 s (60 bpm), así que la primera cae en real = 104.
  expect(band[0].at).toBeCloseTo(104, 1);
  expect(band[1].palmMute).toBe(true);
  expect(take('metronomo', 'ritmo')).toHaveLength(0);
  expect(take('nada', 'ritmo')).toHaveLength(0);
  expect(take('bateria', 'paso')).toHaveLength(0);
});

// Altura de las notas por nivel (lanes.ts, decisión del usuario 2026-10-27): fuera de Experto, las
// cuerdas se reparten centradas entre las filas de La (5) y Si (2); los Mi quedan para Experto.
test('carriles: 1 cuerda al centro, 2 arriba/abajo, 3 arriba/centro/abajo, 4 en las filas de La a Si', () => {
  expect([...laneRows([6])]).toEqual([[6, 3.5]]);
  expect([...laneRows([5, 6])]).toEqual([[6, 4.25], [5, 2.75]]);
  expect([...laneRows([4, 5, 6])]).toEqual([[6, 5], [5, 3.5], [4, 2]]);
  expect([...laneRows([3, 4, 5, 6])]).toEqual([[6, 5], [5, 4], [4, 3], [3, 2]]);
  for (const strings of [[6], [5, 6], [4, 5, 6], [3, 4, 5, 6]]) {
    for (const row of laneRows(strings).values()) {
      expect(row).toBeGreaterThanOrEqual(2);
      expect(row).toBeLessThanOrEqual(5);
    }
  }
  // Casillas: hasta la mitad del camino a la vecina; las de fuera, hasta el borde del mástil.
  const two = laneRows([5, 6]);
  expect(laneAt(two, 1)).toBe(5);
  expect(laneAt(two, 3.4)).toBe(5);
  expect(laneAt(two, 3.6)).toBe(6);
  expect(laneAt(two, 6)).toBe(6);
  expect(laneAt(laneRows([6]), 1)).toBe(6);
});

test('colores de cuerda de grave a aguda: rojo, verde, naranja, azul, amarillo, morado', () => {
  expect([6, 5, 4, 3, 2, 1].map((s) => RIFF_STRING_COLORS[s])).toEqual(['#ef4444', '#22c55e', '#f97316', '#3b82f6', '#facc15', '#a855f7']);
});
