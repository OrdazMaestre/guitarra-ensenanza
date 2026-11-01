import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, listGuitarTracks, type Chart } from '../app/lib/riff/chart';
import { relocatePassages } from '../app/lib/riff/relocate';

// Experto: los pasajes que pasan del traste 12 se mueven ENTEROS (app/lib/riff/relocate.ts; petición
// del usuario, 2026-11-01, reglas revisadas con el agente de música): subir de cuerda si se salen en la
// cuerda 2 o más grave; una octava abajo con la misma digitación si se salen en la cuerda 1.

const OPEN: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const openMidi = (string: number) => OPEN[string];

function fullChart(file: string, track: string): Chart {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
  return buildChart(at, score, listGuitarTracks(score).find((g) => g.name === track)!.index, 24);
}

const SONGS: Array<[string, string, string]> = [
  ['Master of Puppets (Kirk)', 'prueba-master-of-puppets.gp', 'Rhythm Guitar (Kirk)'],
  ['Iron Rain (MAIkael)', 'iron-rain.gp', 'MAIkael'],
  ['Electric Warlock', 'electric-warlock.gp', 'distorted electric guitar'],
];

const barOf = (chart: Chart, t: number) => chart.bars.find((b) => t >= b.t - 1e-6 && t < b.end - 1e-6)!.number;

// Un compás como texto: golpes separados por espacios, notas de un golpe por "+" ("1/5 2/1+3/2").
function barText(chart: Chart, notes: Chart['notes'], number: number) {
  const bar = chart.bars.find((b) => b.number === number)!;
  const onsets: string[][] = [];
  let lastT = Number.NEGATIVE_INFINITY;
  for (const note of [...notes].filter((n) => n.t >= bar.t - 1e-6 && n.t < bar.end - 1e-6).sort((a, b) => a.t - b.t || a.string - b.string)) {
    if (Math.abs(note.t - lastT) < 0.005) onsets[onsets.length - 1].push(`${note.string}/${note.fret}`);
    else onsets.push([`${note.string}/${note.fret}`]);
    lastT = note.t;
  }
  return onsets.map((o) => o.join('+')).join(' ');
}

for (const [name, file, track] of SONGS) {
  test(`${name}: pasajes enteros, en el mástil, a su altura (real o una octava abajo) y repetidos igual`, () => {
    const full = fullChart(file, track);
    const { notes, passages } = relocatePassages(full.notes, full.bars, full.beats, 12, openMidi);

    // 1) Todo en 0-12 (sin recurrir a la recolocación nota a nota) y, en los golpes con notas movidas,
    // nunca dos notas en una cuerda (la tablatura de Electric Warlock ya trae choques de dos voces en la
    // cuerda 6 en compases que no se tocan).
    expect(notes.every((n) => n.fret >= 0 && n.fret <= 12)).toBe(true);
    const byTime = new Map<number, number[]>();
    notes.forEach((n, i) => byTime.set(Math.round(n.t * 1000), [...(byTime.get(Math.round(n.t * 1000)) ?? []), i]));
    for (const onset of byTime.values()) {
      if (!onset.some((i) => notes[i].moved)) continue;
      expect(new Set(onset.map((i) => notes[i].string)).size).toBe(onset.length);
      // Un acorde nunca se parte entre dos octavas: conserva el orden de altura de sus notas.
      const byNow = [...onset].sort((a, b) => notes[a].midi - notes[b].midi);
      const real = byNow.map((i) => full.notes[i].midi);
      expect(real).toEqual([...real].sort((a, b) => a - b));
    }

    // 2-3) Fuera de los trozos, idénticas; dentro, misma altura (subir de cuerda) o 12 por debajo.
    notes.forEach((n, i) => {
      const o = full.notes[i];
      if (!n.moved) expect([n.string, n.fret]).toEqual([o.string, o.fret]);
      else expect(n.midi).toBe(o.midi - (n.moved === 'octave' ? 12 : 0));
    });

    for (const passage of passages) {
      const moved = passage.notes.filter((i) => notes[i].moved);
      // 9) Un trozo de subir de cuerda nunca tenía notas en la cuerda 1.
      if (passage.mode === 'string') for (const i of passage.notes) expect(full.notes[i].string).not.toBe(1);
      // 4) En un trozo de octava, un único desplazamiento de cuerda k por compás, y las distancias
      // entre trastes de una misma cuerda se conservan.
      if (passage.mode === 'octave') {
        const kByBar = new Map<number, Set<number>>();
        for (const i of moved) {
          const bar = barOf(full, full.notes[i].t);
          kByBar.set(bar, (kByBar.get(bar) ?? new Set()).add(notes[i].string - full.notes[i].string));
        }
        for (const ks of kByBar.values()) expect(ks.size).toBe(1);
      }
      // 6) Dentro del trozo, el sentido de cada intervalo entre golpes seguidos se conserva.
      const onsetTops = new Map<number, { real: number; now: number }>();
      for (const i of moved) {
        const key = Math.round(full.notes[i].t * 1000);
        const prev = onsetTops.get(key);
        onsetTops.set(key, { real: Math.max(prev?.real ?? -1, full.notes[i].midi), now: Math.max(prev?.now ?? -1, notes[i].midi) });
      }
      const seq = [...onsetTops.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
      for (let k = 1; k < seq.length; k++) expect(Math.sign(seq[k].now - seq[k - 1].now)).toBe(Math.sign(seq[k].real - seq[k - 1].real));
    }
  });
}

test('compases de referencia (revisados con el agente de música)', () => {
  const kirk = fullChart('prueba-master-of-puppets.gp', 'Rhythm Guitar (Kirk)');
  const k = relocatePassages(kirk.notes, kirk.bars, kirk.beats, 12, openMidi).notes;
  // 5) Todo en el 12 o más: misma digitación, el 12 como cuerda al aire.
  expect(barText(kirk, k, 9)).toBe('1/5 1/0 2/1 2/0 2/1 1/0 1/5 1/0 2/1 2/0 2/1 1/0');
  expect(barText(kirk, k, 13)).toBe('2/5 1/7 1/7 1/5 1/5 1/5 1/5 1/3 1/3 1/3 1/2 1/2 1/2 1/2');
  expect(barText(kirk, k, 27)).toBe('1/2+2/5 1/2 2/5 1/2 2/5 2/5 1/2');
  // Bloques de posición: c24 (trastes 10-15 reales) va solo, en la cuerda 3, junto a la mano de c23
  // (que no se mueve); c25-c30 (14-19 reales, la misma posición) llevan un solo k, k = 0. El salto de
  // posición cae entre c24 y c25, donde lo da Kirk.
  expect(barText(kirk, k, 24)).toBe('3/11 3/9 3/7 3/7 3/11 3/9 3/7 3/12 3/11 3/9');
  expect(barText(kirk, k, 25)).toBe('1/5 1/4 1/2 1/2 1/7 1/5 1/2 1/2 1/5 1/4 1/2 1/2 1/7 1/5 1/2 1/2');
  // c17: la nota larga entra en el trozo (5/2) porque al salir de él la melodía real sube: así se
  // conserva el sentido a los dos lados (aceptado por el agente de música).
  expect(barText(kirk, k, 17)).toBe('5/2');
  // 8) Compases reales idénticos salen idénticos.
  expect(barText(kirk, k, 11)).toBe(barText(kirk, k, 9));
  expect(barText(kirk, k, 26)).toBe(barText(kirk, k, 25));

  const mai = fullChart('iron-rain.gp', 'MAIkael');
  const m = relocatePassages(mai.notes, mai.bars, mai.beats, 12, openMidi).notes;
  // Sube de cuerda; el pedal al aire no se mueve. c36 = c34.
  expect(barText(mai, m, 34)).toBe('2/8 6/0 2/10 6/0 6/0 2/8 6/0 2/10');
  expect(barText(mai, m, 36)).toBe(barText(mai, m, 34));
  expect(barText(mai, m, 37)).toBe('4/2 3/4 2/7 2/8 2/10 2/10 2/10');
  // c40 y c41 están en la misma posición real (trastes 11-17): un solo k para los dos (k = 0 no cabe en
  // c41), así la mano no salta entre ellos, como en la tablatura.
  expect(barText(mai, m, 40)).toBe('6/10 5/7 4/5 3/4 3/7 2/8 2/7 3/7');
  // La línea baja; la capa grave (5/2+6/0) se queda donde está.
  expect(barText(mai, m, 41)).toBe('4/7 4/5 4/4 5/5 6/5 5/2+6/0 5/2+6/0 5/2+6/0');
  expect(barText(mai, m, 72)).toBe('2/7 2/3 3/4 4/4 2/3 2/8 2/3 3/4 4/4 2/3 2/7 3/7');
  // Acorde 3/4+4/2 (power chord de Mi) movido ENTERO: el power chord de Mi al aire, y siguen los 6/0.
  expect(barText(mai, m, 9)).toBe('3/7 3/11 3/4 3/2 5/2+6/0 6/0 6/0');

  const ew = fullChart('electric-warlock.gp', 'distorted electric guitar');
  const e = relocatePassages(ew.notes, ew.bars, ew.beats, 12, openMidi).notes;
  // c86-c87, la misma posición real (trastes 10-16): un solo k (k = 0 no cabe en c87), sin saltar de cuerda.
  expect(barText(ew, e, 86)).toBe('2/9 2/9 2/5 2/5');
  expect(barText(ew, e, 87)).toBe('2/6 2/6 2/3');
});

// 10) Ya no se amontona todo en la cuerda 1: en los compases movidos, nunca más que en la tablatura.
test('cuerda 1: en los compases con notas por encima del 12, no más que en la tablatura real', () => {
  for (const [, file, track] of SONGS) {
    const full = fullChart(file, track);
    const { notes } = relocatePassages(full.notes, full.bars, full.beats, 12, openMidi);
    const high = new Set(full.notes.filter((n) => n.fret > 12).map((n) => barOf(full, n.t)));
    const share = (list: Chart['notes']) => {
      const inHigh = list.filter((n) => high.has(barOf(full, n.t)));
      return inHigh.filter((n) => n.string === 1).length / inHigh.length;
    };
    expect(share(notes), file).toBeLessThanOrEqual(share(full.notes));
  }
});

test('sin notas por encima del máximo, no cambia nada', () => {
  const full = fullChart('iron-rain.gp', 'MAIkael');
  const { notes, passages } = relocatePassages(full.notes, full.bars, full.beats, 24, openMidi);
  expect(passages).toEqual([]);
  expect(notes).toEqual(full.notes);
});
