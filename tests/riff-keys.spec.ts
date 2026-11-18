import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, isKeysTrack, listPlayableTracks } from '../app/lib/riff/chart';
import { BLACK_STRING, isBlackKey, KEYS_MIN_SOUND_MIDI, keysSoundMidi, reduceKeys, WHITE_STRING } from '../app/lib/riff/keys';
import { RiffSession, type RiffOptions } from '../app/lib/riff/session';
import { KEYS_LEVEL_ORDER, RIFF_LEVELS } from '../app/lib/riff/levels';

// Teclado jugable (keys.ts, usuario 2026-11-18): pistas de piano/órgano/sinte, niveles que filtran por
// tiempo como el modo trastes y notas REALES recolocadas a la octava del nivel.

function score(tex: string) {
  const importer = new at.importer.AlphaTexImporter();
  importer.initFromString(String.raw`\title "prueba" \tempo 120` + '\n' + tex, new at.Settings());
  return importer.readScore();
}

const GUITAR = String.raw`\track "Guitarra" \staff \tuning (E4 B3 G3 D3 A2 E2) \instrument 29 0.6.4 2.5.4 |`;
// Un piano: escala de Do grave (Do3) que sube, y un acorde Do-Mi-Sol al final.
const PIANO = String.raw`\track "Piano" \staff \instrument 0 C3.4 D3.4 E3.4 F3.4 | G3.4 A3.4 B3.4 C4.4 | (C3 E3 G3 C5).1 |`;

test('detección: pianos, órganos y sintes son teclado, aunque vayan en pentagrama de guitarra', () => {
  const s = score(`${GUITAR}\n${PIANO}\n` + String.raw`\track "Sinte en guitarra" \staff \tuning (E4 B3 G3 D3 A2 E2) \instrument 81 0.6.4 2.6.4 |`);
  expect(s.tracks.map((t) => isKeysTrack(t))).toEqual([false, true, true]);
  expect(listPlayableTracks(s).map((t) => [t.name, t.kind])).toEqual([['Guitarra', 'guitar'], ['Piano', 'keys'], ['Sinte en guitarra', 'keys']]);
  const chart = buildChart(at, s, 1);
  expect(chart.kit).toBe('keys');
  expect(chart.notes.slice(0, 8).map((n) => n.midi)).toEqual([48, 50, 52, 53, 55, 57, 59, 60]);
  // Y el teclado de fondo, con su voz (kind 'keys').
  const guitarChart = buildChart(at, s, 0);
  expect(new Set(guitarChart.band!.filter((n) => n.track === 1).map((n) => n.kind))).toEqual(new Set(['keys']));
});

test('niveles: notas reales en la octava del nivel, blancas en la 6 y negras en la 5, acordes 1/1/2/3', () => {
  const s = score(`${GUITAR}\n${PIANO}`);
  const real = buildChart(at, s, 1);
  for (const level of KEYS_LEVEL_ORDER) {
    const profile = RIFF_LEVELS[level];
    const rule = profile.keys!;
    const chart = reduceKeys(real, profile);
    for (const note of chart.notes) {
      expect(note.midi, level).toBeGreaterThanOrEqual(rule.low);
      expect(note.midi, level).toBeLessThanOrEqual(rule.high);
      expect(note.fret).toBe(note.midi - rule.low);
      expect(note.string).toBe(isBlackKey(note.midi) ? BLACK_STRING : WHITE_STRING);
    }
    // La escala sube siempre (la frase se mueve en bloque de octavas, no nota a nota).
    const scale = chart.notes.filter((n) => n.t < 3.9);
    for (let i = 1; i < scale.length; i++) expect(scale[i].midi, level).toBeGreaterThan(scale[i - 1].midi);
    // El nombre de cada nota es el real.
    const realPcs = new Set(real.notes.map((n) => n.midi % 12));
    for (const note of chart.notes) expect(realPcs.has(note.midi % 12)).toBe(true);
    const last = chart.notes.filter((n) => n.t > 3.9);
    expect(last.length, level).toBe(Math.min(rule.maxChord, 3));
    // La melodía (la más aguda, Do) siempre está.
    expect(last.some((n) => n.midi % 12 === 0), level).toBe(true);
  }
});

test('niveles: densidad creciente y cada nota real tiene dueña', () => {
  const tex = String.raw`\track "Piano" \staff \instrument 0 ` + Array.from({ length: 8 }, () => 'C4.16 D4.16 E4.16 F4.16 G4.16 A4.16 B4.16 C5.16 C5.16 B4.16 A4.16 G4.16 F4.16 E4.16 D4.16 C4.16 |').join(' ');
  const s = score(`${GUITAR}\n${tex}`);
  const real = buildChart(at, s, 1);
  const counts = KEYS_LEVEL_ORDER.map((level) => reduceKeys(real, RIFF_LEVELS[level]).notes.length);
  for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
  expect(counts[0]).toBeLessThan(counts[3]);
  const chart = reduceKeys(real, RIFF_LEVELS['teclado-facil']);
  const owned = chart.notes.flatMap((n) => n.sourceIds ?? []);
  expect(new Set(owned).size).toBe(owned.length);
});

// SONIDO (usuario, 2026-11-18): se ve traducido, suena lo REAL con un suelo de graves (Do3, 48): lo de debajo
// sube de octava (la voz del MiniKeyboard enmascaraba los graves), lo de arriba suena tal cual.
test('sonido: suelo de graves en Do3 y agudos reales; cada nota del nivel sabe a qué altura suena', () => {
  const s = score(`${GUITAR}\n${PIANO}`);
  const real = buildChart(at, s, 1);
  const chart = reduceKeys(real, RIFF_LEVELS['teclado-medio']);
  for (const note of chart.sourceNotes!) {
    const sounding = note.midi + (note.soundShift ?? 0);
    expect(sounding).toBe(note.midi >= KEYS_MIN_SOUND_MIDI ? note.midi : keysSoundMidi(note.midi));
    expect(sounding).toBeGreaterThanOrEqual(KEYS_MIN_SOUND_MIDI);
  }
  // El acorde final (Do3 Mi3 Sol3 Do5): la melodía Do5 se ve en Do4..Do5 y suena en Do5 (72).
  const top = chart.notes.filter((n) => n.t > 3.9).reduce((a, b) => (b.midi > a.midi ? b : a));
  expect(top.midi + (top.soundShift ?? 0)).toBe(72);
  // Cada nota del nivel suena como su nota real dueña de su misma clase (con el suelo).
  for (const note of chart.notes) {
    // (En un acorde con Do3 y Do5, las dos son "Do": vale cualquiera de las del golpe con su nombre.)
    const own = note.sourceIds!.map((id) => real.notes[id]).filter((r) => Math.abs(r.t - note.t) < 0.005 && r.midi % 12 === note.midi % 12);
    if (own.length) expect(own.map((r) => keysSoundMidi(r.midi))).toContain(note.midi + (note.soundShift ?? 0));
  }
});

// FILA AGUDA (usuario, 2026-11-18): la fila Q y la de números valen por la NOTA EXACTA que suena, no por la tecla
// del trozo que se ve. Mi5 (76) se ve en Mi4 (64): valen la tecla del trozo (sin exactMidi) y la nota exacta 76;
// no valen 64 ni 74 con la fila aguda.
test('fila aguda: vale la nota exacta que suena, no la misma tecla en otra octava', () => {
  const s = score(`${GUITAR}\n` + String.raw`\track "Piano" \staff \instrument 0 E5.1 |`);
  const chart = reduceKeys(buildChart(at, s, 1), RIFF_LEVELS['teclado-principiante']);
  expect(chart.notes.map((n) => [n.midi, n.midi + (n.soundShift ?? 0)])).toEqual([[64, 76]]);
  const note = chart.notes[0];
  const options: RiffOptions = { speed: 1, mode: 'ritmo', loop: false, fromBar: 1, toBar: 1 };
  // Cuenta de entrada de 4 negras a 120 = 2 s: la nota cae en real = 102.
  const judge = (exactMidi?: number) => {
    const session = new RiffSession(chart, options, 100, { click: 'nada', muted: [] });
    return session.judge({ string: note.string, fret: note.fret, kind: 'pluck', ...(exactMidi !== undefined ? { exactMidi } : {}) }, 102).hit !== null;
  };
  expect(judge()).toBe(true);
  expect(judge(76)).toBe(true);
  expect(judge(64)).toBe(false);
  expect(judge(74)).toBe(false);
});

// Las canciones del usuario con teclado (si están en este ordenador).
const TABS = 'C:/Users/Enrique/Desktop/Mis cosas/Música/Tabs/Covers/';
for (const [file, trackName] of [['Deep Purple - Maybe Im A Leo (ver 2 by Aleandre83).gp', 'Jon Lord - Organ'], ['Pink Floyd - Time (ver 4 by Rock Glenn).gp', 'Keyboard 1'], ['Deep Purple - You Cant Do It Right With The One You Love (ver 2 by microbamba).gpx', 'Organ']] as const) {
  test(`canción real: ${file}`, () => {
    test.skip(!fs.existsSync(TABS + file), 'archivo del usuario no disponible');
    const s = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(TABS + file)), new at.Settings());
    const track = listPlayableTracks(s).find((t) => t.name === trackName)!;
    expect(track.kind).toBe('keys');
    const real = buildChart(at, s, track.index);
    expect(real.notes.length).toBeGreaterThan(50);
    // Suelo de graves: nada suena por debajo de Do3 (el órgano de Maybe I'm a Leo baja a Mi2).
    const sounding = reduceKeys(real, RIFF_LEVELS['teclado-principiante']).sourceNotes!.map((n) => n.midi + (n.soundShift ?? 0));
    expect(Math.min(...sounding)).toBeGreaterThanOrEqual(KEYS_MIN_SOUND_MIDI);
    let previous = 0;
    for (const level of KEYS_LEVEL_ORDER) {
      const chart = reduceKeys(real, RIFF_LEVELS[level]);
      const rule = RIFF_LEVELS[level].keys!;
      expect(chart.notes.every((n) => n.midi >= rule.low && n.midi <= rule.high)).toBe(true);
      // Dirección de la MELODÍA (la nota real más aguda de cada golpe y la tecla que le toca).
      const times = [...new Set(chart.notes.map((n) => n.t))];
      const melody = times.map((t) => {
        const top = Math.max(...real.notes.filter((m) => Math.abs(m.t - t) < 0.005).map((m) => m.midi));
        const key = chart.notes.find((n) => n.t === t && n.midi % 12 === top % 12);
        return { real: top, placed: key?.midi ?? -1 };
      });
      let same = 0, total = 0;
      for (let i = 1; i < melody.length; i++) {
        const a = melody[i - 1];
        const b = melody[i];
        // Un salto de octava exacta (Mi3 → Mi2) en una sola octava de teclas es la misma tecla: no cuenta.
        if (a.placed < 0 || b.placed < 0 || (b.real - a.real) % 12 === 0) continue;
        total++;
        if (Math.sign(b.real - a.real) === Math.sign(b.placed - a.placed)) same++;
      }
      console.log(file, level, chart.notes.length, 'de', real.notes.length, `dirección ${(100 * same / Math.max(1, total)).toFixed(0)} %`);
      // Con una sola octava (Do4-Do5) cada nota tiene UNA tecla (menos el Do): un salto que cruza el Do da la
      // vuelta a la fuerza. Avanzado (La3-Fa5) tiene sitio para casi todo.
      expect(same / Math.max(1, total), `${level}: dirección`).toBeGreaterThanOrEqual(level === 'teclado-avanzado' ? 0.9 : 0.75);
      expect(chart.notes.length, level).toBeGreaterThanOrEqual(previous * 0.95);
      previous = chart.notes.length;
    }
  });
}
