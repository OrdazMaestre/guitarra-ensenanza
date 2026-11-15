import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, listPlayableTracks, type Chart } from '../app/lib/riff/chart';
import { reduceChart } from '../app/lib/riff/reduce';
import { RIFF_LEVELS } from '../app/lib/riff/levels';
import { leadOf } from '../app/lib/riff/lead';
import { lowerBars } from '../app/lib/riff/lowerStrings';

// BAJAR UNA CUERDA (app/lib/riff/lowerStrings.ts, usuario 2026-11-15): en los niveles de varias cuerdas,
// una pista que casi no usa la cuerda 6 se coloca como si la tab estuviera una cuerda más abajo con los
// mismos trastes; los tramos con la cuerda 6 real y las notas agudas se quedan donde estaban.

function score(tex: string) {
  const importer = new at.importer.AlphaTexImporter();
  importer.initFromString(String.raw`\title "prueba" \tempo 100` + '\n' + tex, new at.Settings());
  return importer.readScore();
}
const TRACK = String.raw`\track "Guitarra" \staff \tuning (E4 B3 G3 D3 A2 E2) \instrument 29`;
// Riff "medio" en las cuerdas 5 y 4 (corcheas).
const MID = '7.5.8 7.5.8 5.5.8 7.5.8 7.4.8 5.4.8 7.5.8 0.5.8';
const LOW = '0.6.4 3.6.4 5.6.4 0.6.4';
const barOf = (chart: Chart, t: number) => chart.bars.findIndex((b) => t >= b.t - 1e-6 && t < b.end - 1e-6);
const placed = (chart: Chart, bar: number) => chart.notes.filter((n) => barOf(chart, n.t) === bar).map((n) => `${n.string}/${n.fret}`);
const CUERDAS = ['medio-cuerdas', 'avanzado-cuerdas', 'dificil', 'hibrido'] as const;

test('los compases "medios" bajan una cuerda con los mismos trastes; el tramo con la cuerda 6 real no cambia', () => {
  const s = score(`${TRACK}\n${Array(8).fill(MID).join(' | ')} | ${LOW} |`);
  const chart = buildChart(at, s, 0, 24, { fold: true });
  expect([...lowerBars(chart, RIFF_LEVELS['medio-cuerdas'])].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  const withRule = reduceChart(chart, RIFF_LEVELS['medio-cuerdas']);
  const without = reduceChart(chart, RIFF_LEVELS['medio-cuerdas'], { lowerStrings: false });
  // 5/7 -> 6/7, 4/7 -> 5/7, 5/0 -> 6/0: el dibujo de la tab, una cuerda más abajo.
  expect(placed(withRule, 0)).toEqual(['6/7', '6/7', '6/5', '6/7', '5/7', '5/5', '6/7', '6/0']);
  // El compás con la cuerda 6 real, igual que sin la regla.
  expect(placed(withRule, 8)).toEqual(placed(without, 8));
  // Lo que suena es la canción real (las notas de fondo no cambian).
  expect(withRule.sourceNotes).toBe(chart.notes);
});

test('un tramo corto (3 compases) sin la cuerda 6 no se baja; una pista que usa mucho la 6, tampoco', () => {
  const s = score(`${TRACK}\n${Array(3).fill(MID).join(' | ')} | ${LOW} | ${Array(8).fill(MID).join(' | ')} |`);
  const chart = buildChart(at, s, 0, 24, { fold: true });
  const bars = lowerBars(chart, RIFF_LEVELS['avanzado-cuerdas']);
  expect([0, 1, 2, 3].some((b) => bars.has(b))).toBe(false);
  expect(bars.has(4)).toBe(true);

  const busy = score(`${TRACK}\n${Array(4).fill(`${MID} | ${LOW}`).join(' | ')} |`);
  const busyChart = buildChart(at, busy, 0, 24, { fold: true });
  for (const level of CUERDAS) {
    expect(reduceChart(busyChart, RIFF_LEVELS[level]).notes).toEqual(reduceChart(busyChart, RIFF_LEVELS[level], { lowerStrings: false }).notes);
  }
});

test('una nota aguda en un compás bajado queda en la cuerda más aguda que usa el compás, por encima del pedal', () => {
  // Pedal en la La al aire con un agudo (1/12 = Mi5) encima, como Vektor c100.
  const bar = '0.5.8 0.5.8 12.1.8 0.5.8 0.5.8 7.4.8 0.5.8 0.5.8';
  const s = score(`${TRACK}\n${Array(8).fill(bar).join(' | ')} |`);
  const chart = buildChart(at, s, 0, 24, { fold: true });
  for (const level of ['avanzado-cuerdas', 'dificil'] as const) {
    const out = reduceChart(chart, RIFF_LEVELS[level]);
    const high = out.notes.filter((n) => chart.notes.find((r) => Math.abs(r.t - n.t) < 0.005 && r.string === 1));
    expect(high.length, level).toBeGreaterThan(0);
    // (El límite de cuerdas por compás deja 3 contiguas: 6-5-4, así que en Difícil la más aguda es la 4.)
    const top = Math.min(...out.notes.map((n) => n.string));
    expect(high.every((n) => n.string === top && n.midi > 40), `${level}: ${high.map((n) => `${n.string}/${n.fret}`).join(' ')}`).toBe(true);
    // Y el pedal, una cuerda más abajo.
    expect(out.notes.some((n) => n.string === 6 && n.fret === 0)).toBe(true);
  }
});

test('las canciones de la web no cambian (no cumplen la puerta)', () => {
  for (const file of fs.readdirSync('public/tabs').filter((f) => /\.gp\d?$/.test(f))) {
    const s = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(`public/tabs/${file}`)), new at.Settings());
    for (const track of listPlayableTracks(s)) {
      const chart = buildChart(at, s, track.index, 24, { fold: true });
      for (const level of CUERDAS) expect(lowerBars(chart, RIFF_LEVELS[level === 'hibrido' ? 'medio-cuerdas' : level]).size, `${file} / ${track.name} / ${level}`).toBe(0);
    }
  }
});

const VEKTOR = 'C:/Users/Enrique/Desktop/Mis cosas/Música/Tabs/Covers/Vektor - Fast Paced Society (ver 2 by QordisAlmighty).gp';
test('Vektor - Fast Paced Society: mucha más cuerda 6, las agudas arriba y L sigue a R en los riffs compartidos', () => {
  test.skip(!fs.existsSync(VEKTOR), 'archivo del usuario no disponible');
  const s = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(VEKTOR)), new at.Settings());
  const L = buildChart(at, s, 0, 24, { fold: true });
  const R = buildChart(at, s, 1, 24, { fold: true });
  const realAt = new Map<number, typeof L.notes>();
  for (const n of L.notes) realAt.set(Math.round(n.t * 1000), [...(realAt.get(Math.round(n.t * 1000)) ?? []), n]);
  const share = (c: Chart, string: number) => c.notes.filter((n) => n.string === string).length / c.notes.length;
  const key = (t: number) => Math.round(t * 1000);
  const realR = new Map<number, typeof R.notes>();
  for (const n of R.notes) realR.set(key(n.t), [...(realR.get(key(n.t)) ?? []), n]);
  // R sigue a L en sus golpes compartidos (misma nota guía real a la vez): % de golpes en el mismo sitio.
  const together = (lead: Chart, follower: Chart) => {
    const placedL = new Map(lead.notes.map((n) => [key(n.t), n]));
    let shared = 0;
    let same = 0;
    for (const n of follower.notes) {
      const l = placedL.get(key(n.t));
      const a = realAt.get(key(n.t));
      const b = realR.get(key(n.t));
      if (!l || !a || !b || leadOf(a).midi !== leadOf(b).midi) continue;
      shared++;
      if (l.string === n.string && l.fret === n.fret) same++;
    }
    return same / shared;
  };
  for (const level of ['medio-cuerdas', 'avanzado-cuerdas', 'dificil'] as const) {
    const profile = RIFF_LEVELS[level];
    const lead = reduceChart(L, profile);
    const before = reduceChart(L, profile, { lowerStrings: false });
    const follower = reduceChart(R, profile, { follow: lead });
    const followerBefore = reduceChart(R, profile, { follow: before, lowerStrings: false });
    // Agudas (nota guía real ≥ Sol4, 67): en la cuerda 6, casi nunca (antes: 10 / 0 / 0).
    const high = lead.notes.filter((n) => leadOf(realAt.get(Math.round(n.t * 1000))!).midi >= 67);
    const highOnLow = high.filter((n) => n.string === 6).length / high.length;
    console.log(`${level}: cuerda 6 ${Math.round(share(before, 6) * 100)} % -> ${Math.round(share(lead, 6) * 100)} %, agudas en la 6 ${Math.round(highOnLow * 100)} %`);
    expect(share(lead, 6)).toBeGreaterThan(share(before, 6) + 0.15);
    expect(highOnLow).toBeLessThan(level === 'medio-cuerdas' ? 0.15 : 0.03);
    // Vektor L y R no son idénticas (72-90 % sin la regla): que no empeore más de 3 puntos.
    const nowTogether = together(lead, follower);
    const beforeTogether = together(before, followerBefore);
    console.log(`${level}: L y R juntas ${Math.round(beforeTogether * 1000) / 10} % -> ${Math.round(nowTogether * 1000) / 10} %`);
    expect(nowTogether).toBeGreaterThan(beforeTogether - 0.03);
  }
  // Los trozos con la cuerda 6 REAL no salen perjudicados: sus notas 6/x caen exactas en su sitio de la tab
  // al menos tantas veces como sin la regla (medido: L Medio 6 -> 70, Avanzado 28 -> 44, Difícil 34 -> 50).
  for (const [track, chart] of [['L', L], ['R', R]] as const) {
    const real = new Map<number, typeof chart.notes>();
    for (const n of chart.notes) real.set(key(n.t), [...(real.get(key(n.t)) ?? []), n]);
    const exact = (c: Chart) => c.notes.filter((n) => {
      const r = leadOf(real.get(key(n.t))!);
      return r.string === 6 && n.string === 6 && n.fret === r.fret;
    }).length;
    for (const level of ['medio-cuerdas', 'avanzado-cuerdas', 'dificil'] as const) {
      const now = exact(reduceChart(chart, RIFF_LEVELS[level]));
      const before = exact(reduceChart(chart, RIFF_LEVELS[level], { lowerStrings: false }));
      console.log(`${track} ${level}: 6/x reales exactas ${before} -> ${now}`);
      expect(now).toBeGreaterThanOrEqual(before);
    }
  }
});
