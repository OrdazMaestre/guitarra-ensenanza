import { test, expect } from '@playwright/test';
import type { ChartNote } from '../app/lib/riff/chart';
import { barsAheadSeconds, FADE_IN_SECONDS, FADE_OUT_SECONDS, notesOnString, STRING_MIN_ALPHA, stringAlpha, usageLevel } from '../app/lib/riff/visuals';

// Transparencia de cuerdas / brillo de columnas del juego (app/lib/riff/visuals.ts): solo depende
// del tiempo de canción, igual que las gemas, así que va siempre sincronizada con ellas.

const note = (id: number, t: number, dur: number, string = 1): ChartNote => ({ id, t, dur, string, fret: 0, midi: 64, palmMute: false, tech: [] });

test('cuerda: transparente sin notas; recupera su tono durante el segundo anterior a la nota', () => {
  const notes = [note(0, 10, 0.5)];
  expect(stringAlpha(notes, 5, 1)).toBeCloseTo(STRING_MIN_ALPHA);
  expect(stringAlpha(notes, 10 - FADE_IN_SECONDS, 1)).toBeCloseTo(STRING_MIN_ALPHA);
  expect(usageLevel(notes, 9.5, 1)).toBeCloseTo(0.5);
  expect(stringAlpha(notes, 10, 1)).toBeCloseTo(1);
  // Mientras suena, a tope.
  expect(stringAlpha(notes, 10.4, 1)).toBeCloseTo(1);
});

test('cuerda: se apaga en 0,5 s cuando acaba su última nota', () => {
  const notes = [note(0, 10, 0.5)];
  expect(usageLevel(notes, 10.5 + FADE_OUT_SECONDS / 2, 1)).toBeCloseTo(0.5);
  expect(stringAlpha(notes, 10.5 + FADE_OUT_SECONDS, 1)).toBeCloseTo(STRING_MIN_ALPHA);
  expect(stringAlpha(notes, 12, 1)).toBeCloseTo(STRING_MIN_ALPHA);
});

test('cuerda: notas seguidas o solapadas la mantienen encendida (sin parpadeos)', () => {
  const notes = [note(0, 10, 0.2), note(1, 10.8, 0.2), note(2, 11, 3), note(3, 11.2, 0.1)];
  for (let t = 9.9; t <= 14; t += 0.05) expect(usageLevel(notes, t, 1), `t=${t.toFixed(2)}`).toBeGreaterThan(0.89);
  // La nota larga (2, hasta 14) sigue encendida aunque haya acabado la corta posterior (3).
  expect(usageLevel(notes, 13.9, 1)).toBeCloseTo(1);
});

test('cuerda: los tiempos son reales -- al 50 % la recuperación empieza 0,5 s de canción antes', () => {
  const notes = [note(0, 10, 0.5)];
  expect(usageLevel(notes, 9.5, 0.5)).toBeCloseTo(0);
  expect(usageLevel(notes, 9.75, 0.5)).toBeCloseTo(0.5);
});

test('notas por cuerda, cacheadas', () => {
  const notes = [note(0, 1, 0, 1), note(1, 2, 0, 6), note(2, 3, 0, 1)];
  expect(notesOnString(notes, 1).map((n) => n.id)).toEqual([0, 2]);
  expect(notesOnString(notes, 1)).toBe(notesOnString(notes, 1));
  expect(notesOnString(notes, 4)).toEqual([]);
});

// Petición del usuario (2026-10-27): una cuerda se queda encendida si se va a usar en los próximos
// 4 compases (antes parpadeaba: solo se encendía el segundo anterior a cada nota).
test('cuerda: encendida mientras tenga una nota dentro de la ventana de 4 compases', () => {
  const ahead = 8; // 4 compases de 2 s
  const notes = [note(0, 10, 0.2), note(1, 16, 0.2), note(2, 40, 0.2)];
  // Entre 10 y 16 (6 s de hueco, dentro de la ventana): encendida todo el rato.
  for (let t = 10; t <= 16; t += 0.1) expect(stringAlpha(notes, t, 1, ahead), `t=${t.toFixed(1)}`).toBeCloseTo(1);
  // Ya antes de la primera nota: a 8 s de ella está encendida; un segundo antes de eso, apagada.
  expect(stringAlpha(notes, 2, 1, ahead)).toBeCloseTo(1);
  expect(stringAlpha(notes, 1, 1, ahead)).toBeCloseTo(STRING_MIN_ALPHA);
  // Tras la nota de 16, la siguiente (40) queda lejos: se apaga en 0,5 s...
  expect(stringAlpha(notes, 16.2 + FADE_OUT_SECONDS, 1, ahead)).toBeCloseTo(STRING_MIN_ALPHA);
  // ...y vuelve a encenderse cuando la nota de 40 entra en la ventana.
  expect(stringAlpha(notes, 32, 1, ahead)).toBeCloseTo(1);
  expect(stringAlpha(notes, 30, 1, ahead)).toBeCloseTo(STRING_MIN_ALPHA);
});

test('ventana de compases: 4 veces el compás que suena', () => {
  const bars = [{ t: 0, end: 2 }, { t: 2, end: 5 }, { t: 5, end: 7 }];
  expect(barsAheadSeconds(bars, 1, 4, 99)).toBe(8);
  expect(barsAheadSeconds(bars, 3, 4, 99)).toBe(12);
  expect(barsAheadSeconds([], 3, 4, 99)).toBe(99);
});
