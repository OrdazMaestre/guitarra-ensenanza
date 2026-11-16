import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, listPlayableTracks } from '../app/lib/riff/chart';
import { absorbedTracks, gapFillPlan } from '../app/lib/riff/fillGaps';

// Rellenar los ratos largos sin tocar con COMPASES ENTEROS de otra pista (usuario, 2026-11-15,
// app/lib/riff/fillGaps.ts). Canciones pequeñas escritas en alphaTex: 1 compás = 4 negras a 120 = 2 s.

function score(tex: string) {
  const importer = new at.importer.AlphaTexImporter();
  importer.initFromString(String.raw`\title "prueba" \tempo 120` + '\n' + tex, new at.Settings());
  return importer.readScore();
}

const MAIN = String.raw`\track "Principal" \staff \tuning (B3 F#3 D3 A2 E2 A1) \instrument 29`;
// Afinación Drop D: cada cuerda 5 semitonos por encima de la principal (como Nile - User Maat Re).
const INTRO = String.raw`\track "Intro" \staff \tuning (E4 B3 G3 D3 A2 D2) \instrument 24`;
const STD = (name: string, program = 29) => String.raw`\track "${name}" \staff \tuning (E4 B3 G3 D3 A2 E2) \instrument ${program}`;
const RIFF = '0.6.4 2.6.4 3.6.4 5.6.4';
const barsOf = (t: number) => Math.floor(t / 2) + 1;

test('A: la intro de otra pista (otra afinación) entra en los compases vacíos, traducida, y sale de la banda', () => {
  const s = score(`${MAIN}
r.1 | r.1 | ${RIFF} | ${RIFF} | r.1 | ${RIFF} | ${RIFF} |
${INTRO}
0.6.2 2.6.2 | 3.5.2 5.4.2 | r.1 | r.1 | 7.6.1 | r.1 | r.1 |`);
  const chart = buildChart(at, s, 0);
  expect(chart.filled).toEqual([{ bar: 1, track: 1 }, { bar: 2, track: 1 }]);
  // Misma cuerda, traste de la misma altura en la afinación de la principal: +5.
  const intro = chart.notes.filter((n) => n.t < 4).map((n) => `${n.string}/${n.fret}`);
  expect(intro).toEqual(['6/5', '6/7', '5/8', '4/10']);
  // Un compás vacío suelto (el 5) es un respiro: no se rellena, y esa nota sigue de fondo.
  expect(chart.notes.some((n) => barsOf(n.t) === 5)).toBe(false);
  const band = chart.band!.filter((n) => n.track === 1);
  expect(band.map((n) => barsOf(n.t))).toEqual([5]);
  // La intro todavía suena de fondo en el compás 5: sigue en "Suenan de fondo" y en "Tocas".
  expect(chart.bandTracks!.map((b) => b.name)).toContain('Intro');
  expect(listPlayableTracks(s).map((t) => t.name)).toEqual(['Principal', 'Intro']);
});

test('A: un trozo que cabe entero en los huecos deja de salir en "Tocas" y en "Suenan de fondo"', () => {
  const s = score(`${MAIN}
r.1 | r.1 | ${RIFF} | ${RIFF} | ${RIFF} |
${INTRO}
0.6.2 2.6.2 | 3.5.2 5.4.2 | r.1 | r.1 | r.1 |`);
  expect([...absorbedTracks(s)]).toEqual([1]);
  expect(listPlayableTracks(s).map((t) => t.name)).toEqual(['Principal']);
  const chart = buildChart(at, s, 0);
  expect(chart.band!.filter((n) => n.track === 1)).toHaveLength(0);
  expect(chart.bandTracks!.map((b) => b.name)).not.toContain('Intro');
});

test('A: una capa ENCIMA de la principal (fills, solos) no entra; dos trozos a la vez, solo uno', () => {
  const fills = score(`${STD('Principal')}
r.1 | r.1 | ${RIFF} | ${RIFF} |
${STD('Fills')}
5.1.1 | r.1 | 7.1.2 8.1.2 | 7.1.1 |`);
  expect(gapFillPlan(fills, 0).bars.size).toBe(0);

  const two = score(`${STD('Principal')}
r.1 | r.1 | ${RIFF} | ${RIFF} | ${RIFF} |
${STD('Limpia', 27)}
0.6.4 2.6.4 3.6.4 5.6.4 | 0.6.2 2.6.2 | r.1 | r.1 | r.1 |
${STD('Efecto', 27)}
12.1.1 | 12.1.1 | r.1 | r.1 | r.1 |`);
  const chart = buildChart(at, two, 0);
  // Nunca dos donantes en un compás: la que más notas tiene en el tramo; la otra, de fondo.
  expect(chart.filled).toEqual([{ bar: 1, track: 1 }, { bar: 2, track: 1 }]);
  expect(chart.notes.filter((n) => n.t < 4)).toHaveLength(6);
  expect(chart.band!.filter((n) => n.track === 2)).toHaveLength(2);
  expect(chart.band!.filter((n) => n.track === 1)).toHaveLength(0);
});

test('solo guitarras y bajos de verdad: una voz o un teclado en pentagrama de guitarra no se mezclan', () => {
  const s = score(`${STD('Principal')}
r.1 | r.1 | ${RIFF} | ${RIFF} | ${RIFF} |
${STD('Órgano', 16)}
0.6.2 2.6.2 | 3.5.2 5.4.2 | r.1 | r.1 | r.1 |`);
  expect(gapFillPlan(s, 0).bars.size).toBe(0);
  expect(listPlayableTracks(s).map((t) => t.name)).toEqual(['Principal', 'Órgano']);
});

test('B: 2 solos + 1 rítmica pasan a 2 rítmicas con su solo; sin voces de más', () => {
  const s = score(`${STD('Rítmica')}
${RIFF} | ${RIFF} | ${RIFF} | ${RIFF} | ${RIFF} | ${RIFF} |
${STD('Solo A')}
r.1 | r.1 | 12.1.8 14.1.8 15.1.8 14.1.8 12.1.2 | 15.1.1 | r.1 | r.1 |
${STD('Solo B')}
r.1 | r.1 | r.1 | r.1 | 17.1.8 15.1.8 14.1.8 15.1.8 17.1.2 | 19.1.1 |`);
  const a = buildChart(at, s, 1);
  expect(a.filled!.map((f) => [f.bar, f.track])).toEqual([[1, 0], [2, 0], [5, 0], [6, 0]]);
  // Tocando el solo A: la rítmica en 1-2 y 5-6, su solo en 3-4.
  expect(a.notes.filter((n) => barsOf(n.t) === 1).map((n) => `${n.string}/${n.fret}`)).toEqual(['6/0', '6/2', '6/3', '6/5']);
  // La banda pone la rítmica real solo durante el solo A, y el solo B en el suyo.
  expect([...new Set(a.band!.filter((n) => n.track === 0).map((n) => barsOf(n.t)))]).toEqual([3, 4]);
  expect([...new Set(a.band!.filter((n) => n.track === 2).map((n) => barsOf(n.t)))]).toEqual([5, 6]);
  // Nunca más notas a la vez que en el original: en cada compás, tú + banda = original.
  for (let bar = 1; bar <= 6; bar++) {
    const original = s.tracks.reduce((sum, track) => sum + track.staves[0].bars[bar - 1].voices[0].beats.reduce((k, beat) => k + beat.notes.length, 0), 0);
    const now = a.notes.filter((n) => barsOf(n.t) === bar).length + a.band!.filter((n) => barsOf(n.t) === bar).length;
    expect(now, `compás ${bar}`).toBe(original);
  }
  // La rítmica sola no cambia y los solos se siguen pudiendo tocar.
  expect(buildChart(at, s, 0).filled).toBeUndefined();
  expect(listPlayableTracks(s).map((t) => t.name)).toEqual(['Rítmica', 'Solo A', 'Solo B']);
});

test('B: con dos guitarras grandes no se sabe de quién es el solo: no se toca', () => {
  const s = score(`${STD('Rítmica 1')}
${RIFF} | ${RIFF} | ${RIFF} | ${RIFF} |
${STD('Rítmica 2')}
${RIFF} | ${RIFF} | ${RIFF} | ${RIFF} |
${STD('Solo')}
r.1 | r.1 | 12.1.1 | 14.1.1 |`);
  expect(gapFillPlan(s, 2).bars.size).toBe(0);
});

// La canción que motivó esto, si está en el ordenador del usuario (no está en el repositorio).
const NILE = 'C:/Users/Enrique/Desktop/Mis cosas/Música/Tabs/Covers/Nile - User Maat Re.gp5';
test('Nile - User Maat Re: la intro oriental entra en las dos guitarras (c1-4) y no suena dos veces', () => {
  test.skip(!fs.existsSync(NILE), 'archivo del usuario no disponible');
  const s = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(NILE)), new at.Settings());
  for (const track of [0, 1]) {
    const chart = buildChart(at, s, track);
    // La intro se repite: cada compás sale una vez por cada pasada.
    expect([...new Set(chart.filled!.map((f) => f.bar))]).toEqual([1, 2, 3, 4]);
    expect(new Set(chart.filled!.map((f) => f.track))).toEqual(new Set([3]));
    expect(chart.band!.filter((n) => n.track === 3)).toHaveLength(0);
  }
  // (Y la batería, la última: también se toca, drums.ts.)
  expect(listPlayableTracks(s).filter((t) => t.kind !== 'drums').map((t) => t.name)).toEqual(['Dallas Toller-Wade', 'Karl Sanders']);
});
