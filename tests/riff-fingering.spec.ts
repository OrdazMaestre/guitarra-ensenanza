import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart } from '../app/lib/riff/chart';
import { OPEN_MIDI, PLACE_WEIGHTS, placeSequence, type LanePosition } from '../app/lib/riff/reduce';

// Referencia de calidad de la colocación por menor coste (reduce.ts, placeSequence): colocada SIN
// restricciones (6 cuerdas, trastes 0-22, sin mirar la tab), ¿cuántas notas sueltas de nuestras
// tablaturas pone exactamente donde las puso el tabulador? Con los pesos de PLACE_WEIGHTS, ~74 %
// (búsqueda en rejilla del 2026-10-26; los pesos iniciales daban ~70 %). Si se cambian los pesos,
// que no baje.
const positions: LanePosition[] = [];
for (let s = 1; s <= 6; s++) for (let f = 0; f <= 22; f++) positions.push({ string: s, fret: f, pitch: OPEN_MIDI[s] + f });

type Phrase = { pitch: number; t: number; string: number; fret: number }[];
const phrases: Phrase[] = [];
for (const file of fs.readdirSync('public/tabs').filter((f) => f.endsWith('.gp'))) {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
  score.tracks.forEach((track, index) => {
    const tuning = track.staves[0]?.tuning ?? [];
    if (!track.staves[0] || track.staves[0].isPercussion || tuning.length !== 6) return;
    if (tuning.join() !== [64, 59, 55, 50, 45, 40].join()) return;
    const chart = buildChart(at, score, index, 24);
    const byT = new Map<number, typeof chart.notes>();
    for (const n of chart.notes) {
      const k = Math.round(n.t * 1000);
      byT.set(k, [...(byT.get(k) ?? []), n]);
    }
    let cur: Phrase = [];
    for (const group of [...byT.values()]) {
      if (group.length !== 1 || group[0].moved) { if (cur.length) phrases.push(cur); cur = []; continue; }
      const n = group[0];
      if (cur.length && n.t - cur[cur.length - 1].t > 1) { phrases.push(cur); cur = []; }
      cur.push({ pitch: n.midi, t: n.t, string: n.string, fret: n.fret });
    }
    if (cur.length) phrases.push(cur);
  });
}

function agreement() {
  let ok = 0, total = 0;
  for (const ph of phrases) {
    const r = placeSequence(ph.map((n) => ({ pitch: n.pitch, t: n.t })), positions, { ...PLACE_WEIGHTS, tab: 0 });
    if (!r) continue;
    r.path.forEach((p, k) => { total++; if (p.string === ph[k].string && p.fret === ph[k].fret) ok++; });
  }
  return ok / total;
}

test('colocación libre: coincide con el tabulador humano en al menos el 73 % de las notas', () => {
  expect(phrases.reduce((a, p) => a + p.length, 0)).toBeGreaterThan(1000);
  expect(agreement()).toBeGreaterThanOrEqual(0.73);
});
