import { test, expect } from '@playwright/test';
import { laneLookaheadSeconds, laneSpeedFactor, stretchesLane } from '../app/lib/riff/levels';
import { RIFF_TUTORIAL } from '../app/components/guitar/riff/riffTutorial';
import type { ChartNote } from '../app/lib/riff/chart';
import { RIFF_STRING_COLORS, stringFretColor } from '../app/lib/riff/colors';
import { barsAheadSeconds, FADE_IN_SECONDS, FADE_OUT_SECONDS, mirroredFadeInSeconds, notesOnString, STRING_MIN_ALPHA, stringAlpha, usageLevel, ZONE_LOOKAHEAD_BARS } from '../app/lib/riff/visuals';

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

test('carril estirado: desde Fácil (trastes) y en todo el modo cuerdas, a 100 % compases un 33 % más largos que a 75 %', () => {
  expect(stretchesLane('practica')).toBe(false);
  for (const level of ['facil', 'medio', 'avanzado', 'medio-cuerdas', 'avanzado-cuerdas', 'dificil', 'experto'] as const) expect(stretchesLane(level), level).toBe(true);
  // Segundos reales en pantalla: 1,8 s a 100 %, 2,22 s a 90 %; a 75 % y 50 %, igual que antes.
  expect(laneLookaheadSeconds(3.2, 1, true)).toBeCloseTo(1.8);
  expect(laneLookaheadSeconds(3.2, 0.9, true)).toBeCloseTo(2.222, 2);
  // Lo que ocupa un segundo de canción en el carril: 1 / (speed × lookahead). A 100 %, 4/3 de lo de 75 %.
  const spacing = (speed: number) => 1 / (speed * laneLookaheadSeconds(3.2, speed, true));
  expect(spacing(1) / spacing(0.75)).toBeCloseTo(4 / 3);
  expect(laneLookaheadSeconds(3.2, 0.75, true)).toBe(3.2);
  expect(laneLookaheadSeconds(3.2, 0.5, true)).toBe(3.2);
  expect(laneLookaheadSeconds(3.2, 1, false)).toBe(3.2);
});

// Petición del usuario (2026-10-31): la marca de la columna se enciende a la mitad de velocidad de lo
// que tarda en irse tras llegar la nota (dura 0,5 + 0,5 s en irse -> 2 s de subida).
test('columna de traste: la subida dura el doble de lo que tarda en irse tras llegar la nota', () => {
  const notes = [note(0, 10, 0.5)];
  const after = 0.5 + FADE_OUT_SECONDS;
  expect(mirroredFadeInSeconds(notes[0], 1)).toBeCloseTo(2 * after);
  expect(usageLevel(notes, 10 - 2 * after, 1, 0, mirroredFadeInSeconds)).toBeCloseTo(0);
  expect(usageLevel(notes, 10 - after, 1, 0, mirroredFadeInSeconds)).toBeCloseTo(0.5);
  expect(usageLevel(notes, 10, 1, 0, mirroredFadeInSeconds)).toBeCloseTo(1);
  // Tras llegar: igual que antes (encendida mientras suena, se va en FADE_OUT_SECONDS).
  expect(usageLevel(notes, 10 + after, 1, 0, mirroredFadeInSeconds)).toBeCloseTo(0);
  // Tiempos reales: al 50 %, la nota dura 1 s real, así que la subida es de 3 s reales = 1,5 s de canción.
  expect(usageLevel(notes, 10 - 1.5, 0.5, 0, mirroredFadeInSeconds)).toBeCloseTo(0);
  // Por defecto (cuerdas), sin cambios: 1 s.
  expect(usageLevel(notes, 9.5, 1)).toBeCloseTo(0.5);
});

// Degradado de las gemas por traste en los niveles con cuerdas (petición del usuario, 2026-11-08).
test('degradado: oscuro en el 0, el color de la cuerda a mitad de su tope y claro en el tope', () => {
  const brightness = (hex: string) => [1, 3, 5].reduce((sum, j) => sum + parseInt(hex.slice(j, j + 2), 16), 0);
  for (const [string, cap] of [[6, 10], [5, 11], [4, 12], [3, 12]] as const) {
    expect(stringFretColor(string, cap / 2, cap)).toBe(RIFF_STRING_COLORS[string]);
    const shades = Array.from({ length: cap + 1 }, (_, fret) => brightness(stringFretColor(string, fret, cap)));
    for (let fret = 1; fret <= cap; fret++) expect(shades[fret]).toBeGreaterThanOrEqual(shades[fret - 1]);
    // Suave (usuario, 2026-11-08): ni tan oscuro ni tan claro como para confundir cuerdas.
    expect(shades[0]).toBeLessThan(brightness(RIFF_STRING_COLORS[string]) * 0.75);
    expect(shades[0]).toBeGreaterThan(brightness(RIFF_STRING_COLORS[string]) * 0.55);
    expect(shades[cap]).toBeGreaterThan(brightness(RIFF_STRING_COLORS[string]) * 1.1);
  }
  // Híbrido (tope 5): vivo en el 2-3.
  const vivid = brightness(RIFF_STRING_COLORS[6]);
  expect(Math.abs(brightness(stringFretColor(6, 2.5, 5)) - vivid)).toBe(0);
  expect(brightness(stringFretColor(6, 3, 5))).toBeGreaterThan(vivid);
});

test('zonas de 2 cuerdas: se atenúan si van a pasar 2 compases sin usarse', () => {
  expect(ZONE_LOOKAHEAD_BARS).toBe(2);
  const bars = Array.from({ length: 8 }, (_, k) => ({ t: k * 2, end: (k + 1) * 2 }));
  const ahead = barsAheadSeconds(bars, 0, ZONE_LOOKAHEAD_BARS, 4);
  expect(ahead).toBeCloseTo(4, 6);
  // Una nota dentro de 2 compases: encendida; a 3 compases (y más de 1 s de margen), atenuada.
  expect(stringAlpha([note(0, 3.5, 0.2, 5)], 0, 1, ahead)).toBe(1);
  expect(stringAlpha([note(0, 6.5, 0.2, 5)], 0, 1, ahead)).toBe(STRING_MIN_ALPHA);
});

// Frases (petición del usuario, 2026-11-09).
test('frases: una por nivel en la cuenta atrás; en Experto, al azar y sin repetirse seguidas', async () => {
  const { COUNTDOWN_PHRASES, EXPERTO_PHRASES, ambientPhrase, PHRASE_PERIOD_SECONDS } = await import('../app/lib/riff/phrases');
  expect(COUNTDOWN_PHRASES.practica).toBe('Practica');
  expect(COUNTDOWN_PHRASES.hibrido).toBe('Ponte a prueba');
  expect(COUNTDOWN_PHRASES.dificil).toBe('Estás loco');
  expect(COUNTDOWN_PHRASES.experto).toBe('Se acabó el juego');
  expect(EXPERTO_PHRASES).not.toContain('Se acabó el juego');
  // Una frase por periodo, al centro de su ventana; misma semilla -> mismo orden; nunca dos iguales seguidas.
  const seen: string[] = [];
  for (let cycle = 0; cycle < EXPERTO_PHRASES.length * 3; cycle++) {
    const phrase = ambientPhrase(EXPERTO_PHRASES, cycle * PHRASE_PERIOD_SECONDS + 5, 42);
    expect(phrase!.alpha).toBe(1);
    expect(phrase).not.toBeNull();
    seen.push(phrase!.text);
  }
  for (let k = 1; k < seen.length; k++) expect(seen[k]).not.toBe(seen[k - 1]);
  expect(new Set(seen.slice(0, EXPERTO_PHRASES.length)).size).toBe(EXPERTO_PHRASES.length);
  expect(ambientPhrase(EXPERTO_PHRASES, 5, 42)!.text).toBe(seen[0]);
  // Siempre visible: solo el fundido al cambiar de frase.
  for (let t = 0.6; t < 3 * PHRASE_PERIOD_SECONDS; t += 0.5) expect(ambientPhrase(EXPERTO_PHRASES, t, 42)).not.toBeNull();
  expect(ambientPhrase(EXPERTO_PHRASES, 0.3, 42)!.alpha).toBeCloseTo(0.5, 5);
  expect(ambientPhrase(EXPERTO_PHRASES, PHRASE_PERIOD_SECONDS - 0.3, 42)!.alpha).toBeCloseTo(0.5, 5);
});

// Velocidad del carril (usuario, 2026-11-13): un 25 % más en los niveles de varias cuerdas (modo trastes
// igual) y, en la partida tutorial, un 15 % más en cada paso de mecánicas: 100 %, 115 %, 132 %.
test('velocidad del carril: varias cuerdas +25 %, tutorial +15 % por paso', () => {
  for (const level of ['practica', 'facil', 'medio', 'avanzado'] as const) expect(laneSpeedFactor(level), level).toBe(1);
  for (const level of ['medio-cuerdas', 'avanzado-cuerdas', 'dificil', 'hibrido', 'experto'] as const) expect(laneSpeedFactor(level), level).toBe(1.25);
  expect(laneLookaheadSeconds(3.8, 0.5, true, 1.25)).toBeCloseTo(3.04);
  expect(laneLookaheadSeconds(3.8, 1, true, 1.25)).toBeCloseTo(3.8 * 0.5625 / 1.25);
  expect(RIFF_TUTORIAL.map((part) => part.laneSpeed)).toEqual([1, 1.15, 1.15 ** 2]);
});

// Tutorial en PC (usuario, 2026-11-13): tapear empieza por las dos teclas; deslizar, N V X Z y vuelta con
// las teclas (normal y luego con las graves mantenidas) y después el cursor.
test('tutorial en PC: fotogramas de teclado de tapear y deslizar', async () => {
  const { slideFrame, SLIDE_CYCLE_STEPS, TAP_VARIANTS } = await import('../app/components/guitar/riff/tutorialKeyFrames');
  expect(TAP_VARIANTS[0]).toBe('keys');
  const frames = Array.from({ length: SLIDE_CYCLE_STEPS }, (_, tick) => slideFrame(tick));
  const slide = frames.filter((f) => f.variant === 'keys-slide');
  const legato = frames.filter((f) => f.variant === 'keys-legato');
  // Recorrido N(5) V(3) X(1) Z(0) y vuelta, una tecla cada vez.
  expect(slide.map((f) => f.sounding)).toEqual([5, 3, 1, 0, 1, 3, 5]);
  expect(slide.every((f) => f.held.length === 1 && f.held[0] === f.sounding)).toBe(true);
  // Con las graves mantenidas: bajar suelta las agudas (pull-off), subir las vuelve a pulsar (hammer-on).
  expect(legato.map((f) => f.held)).toEqual([[0, 1, 3, 5], [0, 1, 3], [0, 1], [0], [0, 1], [0, 1, 3], [0, 1, 3, 5]]);
  expect(legato.every((f) => f.sounding === Math.max(...f.held))).toBe(true);
  // El orden: teclas, teclas con graves, cursor; y vuelve a empezar.
  expect(frames[0].variant).toBe('keys-slide');
  expect(frames[SLIDE_CYCLE_STEPS - 1].variant).toBe('cursor');
  expect(slideFrame(SLIDE_CYCLE_STEPS).variant).toBe('keys-slide');
});
