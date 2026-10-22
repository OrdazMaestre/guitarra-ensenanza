import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, listGuitarTracks, type Chart } from '../app/lib/riff/chart';
import { HIT_GAIN, MISS_GAIN, RiffSession, type RiffOptions } from '../app/lib/riff/session';

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

test('motor: acierto dentro de ±0,3 s suena normal; fuera o nota equivocada, bajito', () => {
  // Reloj real empieza en 100; cuenta de entrada de 4 s -> la nota 0 cae en real = 104.
  const s = new RiffSession(fakeChart(), ritmo, 100, 'nada');
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 103.6).gain).toBe(MISS_GAIN); // 0,4 s antes
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 104.25).gain).toBe(HIT_GAIN); // 0,25 s tarde
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 104.3).gain).toBe(MISS_GAIN); // ya acertada
  expect(s.judge({ string: 1, fret: 3, kind: 'pluck' }, 105).gain).toBe(MISS_GAIN); // traste equivocado
  expect(s.judge({ string: 1, fret: 4, kind: 'hammer' }, 105.1).gain).toBe(HIT_GAIN); // tapping cuenta
  expect(s.hitAt.size).toBe(2);
});

test('motor: slide solo cuenta a nota pegada', () => {
  const s = new RiffSession(fakeChart(), ritmo, 0, 'nada');
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 4).gain).toBe(HIT_GAIN);
  expect(s.judge({ string: 1, fret: 4, kind: 'slide', from: { string: 1, fret: 2 } }, 5).gain).toBe(MISS_GAIN);
  expect(s.judge({ string: 1, fret: 4, kind: 'slide', from: { string: 1, fret: 3 } }, 5.05).gain).toBe(HIT_GAIN);
});

test('motor: a media velocidad la ventana de ±0,3 s sigue siendo en tiempo real', () => {
  const s = new RiffSession(fakeChart(), { ...ritmo, speed: 0.5 }, 0, 'nada');
  // Cuenta de 4 s de canción = 8 s reales; nota 1 (t=1) cae en real = 10.
  expect(s.judge({ string: 1, fret: 4, kind: 'pluck' }, 9.6).gain).toBe(MISS_GAIN);
  expect(s.judge({ string: 1, fret: 4, kind: 'pluck' }, 9.75).gain).toBe(HIT_GAIN);
});

test('motor: modo paso a paso se para en cada nota hasta tocarla', () => {
  const s = new RiffSession(fakeChart(), { ...ritmo, mode: 'paso' }, 0, 'nada');
  s.advance(50);
  expect(s.songPos).toBe(0);
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 60).gain).toBe(HIT_GAIN);
  s.advance(70);
  expect(s.songPos).toBe(1);
});

test('motor: en paso a paso la siguiente nota vale aunque se toque antes de tiempo', () => {
  const s = new RiffSession(fakeChart(), { ...ritmo, mode: 'paso' }, 0, 'nada');
  s.advance(10);
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 10).gain).toBe(HIT_GAIN);
  // La nota 1 (t=1) aún está lejos, pero es la pendiente: cuenta y la canción salta a ella.
  expect(s.judge({ string: 1, fret: 4, kind: 'pluck' }, 10.01).gain).toBe(HIT_GAIN);
  expect(s.songPos).toBeGreaterThanOrEqual(1);
  // Una nota que NO es la pendiente sigue sin contar.
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 10.02).gain).toBe(MISS_GAIN);
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

test('motor traducido: el mástil no suena; acertar abre la canción real; fallar suena a clac', () => {
  const s = new RiffSession(translatedChart(), ritmo, 0, 'nada');
  // Fondo: las notas REALES (cuerda 1), bajito porque aún no se ha acertado nada.
  const first = s.takeGuideNotes(0, 4.1);
  expect(first.map((g) => [g.id, g.midi, g.open])).toEqual([[0, 66, false]]);

  const wrong = s.judge({ string: 6, fret: 1, kind: 'pluck' }, 4);
  expect(wrong).toMatchObject({ gain: 0, hit: null, deadNote: true });

  const hit = s.judge({ string: 6, fret: 0, kind: 'pluck' }, 4.05);
  expect(hit.gain).toBe(0);
  expect(hit.deadNote).toBe(false);
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
  expect(s.judge({ string: 1, fret: 7, kind: 'pluck' }, 9).gain).toBe(HIT_GAIN);
  s.pause(9.6);
  expect(s.status).toBe('paused');
  s.advance(30);
  expect(s.songPos).toBeCloseTo(5.6, 5);
  expect(s.judge({ string: 1, fret: 9, kind: 'pluck' }, 30)).toMatchObject({ gain: 1, hit: null, deadNote: false });
  expect(s.takeClicks(30, 10)).toEqual([]);
  expect(s.takeGuideNotes(30, 10)).toEqual([]);
});

test('motor: CONTINUAR retrocede un compás, con cuenta de entrada, y esas notas vuelven a estar por tocar', () => {
  const s = new RiffSession(twoBarChart(), { ...ritmo, toBar: 2 }, 0, 'metronomo');
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 4).gain).toBe(HIT_GAIN);
  expect(s.judge({ string: 1, fret: 7, kind: 'pluck' }, 9).gain).toBe(HIT_GAIN);
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
  expect(s.judge({ string: 1, fret: 2, kind: 'pluck' }, 24.1).gain).toBe(HIT_GAIN);
});

test('motor: CONTINUAR desde el primer compás del tramo vuelve a su inicio (no se sale del tramo)', () => {
  const s = new RiffSession(twoBarChart(), { ...ritmo, fromBar: 2, toBar: 2 }, 0, 'nada');
  s.advance(5.5); // compás 2 empieza en real = 4
  s.pause(5.5);
  s.resume(10);
  expect(s.countInTarget).toBe(4);
});
