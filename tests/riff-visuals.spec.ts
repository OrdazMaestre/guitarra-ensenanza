import { test, expect } from '@playwright/test';
import type { ChartNote } from '../app/lib/riff/chart';
import { FADE_IN_SECONDS, FADE_OUT_SECONDS, notesOnString, STRING_MIN_ALPHA, stringAlpha, usageLevel } from '../app/lib/riff/visuals';

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
