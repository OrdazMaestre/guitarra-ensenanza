import { enunciadosArithmetic } from '../enunciados';
import { OPEN_STRING_MIDI } from '../musicNotes';
import { pickOne, randomInt, shuffle, type Rng } from '../shuffle';
import type { QuestionBankEntry } from '../questionBank.types';
import type { QuizMode, RuntimeQuestion } from '../types';

/** Distractores numéricos cercanos al valor correcto, sin negativos, sin duplicar `correct` ni
 * los valores ya reservados (ej. la opción graciosa fija cuando también es un número). */
function numericDistractors(correct: number, count: number, reserved: number[]): number[] {
  const taken = new Set([correct, ...reserved]);
  const result: number[] = [];
  let offset = 1;
  const deltas = [1, -1, 2, -2, 3, -3];
  let deltaIndex = 0;
  while (result.length < count && deltaIndex < deltas.length) {
    const candidate = correct + deltas[deltaIndex];
    deltaIndex += 1;
    if (candidate >= 0 && !taken.has(candidate)) {
      taken.add(candidate);
      result.push(candidate);
    }
  }
  // Fallback improbable (solo si los deltas de arriba no bastaron): sigue subiendo.
  while (result.length < count) {
    const candidate = correct + 3 + offset;
    offset += 1;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      result.push(candidate);
    }
  }
  return result;
}

function baseQuestion(entry: QuestionBankEntry, index: number): Pick<RuntimeQuestion, 'dificultad' | 'id' | 'origenId' | 'tema'> {
  return {
    id: `${entry.id}#${index}`,
    origenId: entry.id,
    tema: entry.tema,
    dificultad: entry.dificultad === 'facil' ? 'facil' : 'dificil',
  };
}

/** 1.2 — distancia en semitonos entre dos trastes X-Y (0-24). Un traste = un semitono siempre,
 * no depende de cuerda ni afinación. */
export function generateFretDistance(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const x = randomInt(0, 24, rng);
  let y = randomInt(0, 24, rng);
  while (y === x) y = randomInt(0, 24, rng);
  const correct = Math.abs(y - x);
  const distractors = numericDistractors(correct, 3, [42]);
  const opciones = shuffle(
    [
      { texto: String(correct), correcta: true },
      ...distractors.map((d) => ({ texto: String(d), correcta: false })),
      { texto: '42', correcta: false },
    ],
    rng,
  );
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosArithmetic['1.2'](x, y), opciones }];
}

/** Semitonos -> texto en tonos, con medios tonos para distancias impares (3 semitonos = "1 tono y
 * medio", 1 semitono = "medio tono"). */
function tonosLabel(semitonos: number): string {
  const tonosEnteros = Math.floor(semitonos / 2);
  if (semitonos % 2 === 0) return String(tonosEnteros);
  if (tonosEnteros === 0) return 'medio tono';
  return `${tonosEnteros} tono${tonosEnteros === 1 ? '' : 's'} y medio`;
}

/** 1.6 — igual que 1.2 pero pidiendo el resultado en tonos, no semitonos: cualquier distancia
 * (par o impar) vale, las impares se expresan con "medio tono" via tonosLabel(). */
export function generateFretDistanceTones(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const x = randomInt(0, 24, rng);
  let y = randomInt(0, 24, rng);
  while (y === x) y = randomInt(0, 24, rng);
  const correctSemitonos = Math.abs(y - x);
  const distractorSemitonos = numericDistractors(correctSemitonos, 3, []);
  const opciones = shuffle(
    [
      { texto: tonosLabel(correctSemitonos), correcta: true },
      ...distractorSemitonos.map((d) => ({ texto: tonosLabel(d), correcta: false })),
      { texto: '42', correcta: false },
    ],
    rng,
  );
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosArithmetic['1.6'](x, y), opciones }];
}

/** 9.1 — distancia en semitonos entre dos notas marcadas en el mástil (frets 0-12, dos cuerdas
 * cualquiera, pueden repetirse). Semitonos = diferencia de MIDI real, no de número de traste, así
 * que si están en cuerdas distintas hay que pasar por OPEN_STRING_MIDI. */
export function generateNeckNoteDistance(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const posA = { string: randomInt(1, 6, rng), fret: randomInt(0, 12, rng) };
  let posB = { string: randomInt(1, 6, rng), fret: randomInt(0, 12, rng) };
  while (posB.string === posA.string && posB.fret === posA.fret) {
    posB = { string: randomInt(1, 6, rng), fret: randomInt(0, 12, rng) };
  }
  const midiA = OPEN_STRING_MIDI[posA.string] + posA.fret;
  const midiB = OPEN_STRING_MIDI[posB.string] + posB.fret;
  const correct = Math.abs(midiB - midiA);
  const distractors = numericDistractors(correct, 3, []);
  const opciones = shuffle(
    [
      { texto: String(correct), correcta: true },
      ...distractors.map((d) => ({ texto: String(d), correcta: false })),
      { texto: 'una eternidad', correcta: false },
    ],
    rng,
  );
  return [{
    ...baseQuestion(entry, 0),
    enunciado: enunciadosArithmetic['9.1'](),
    opciones,
    diagrama: { type: 'fretboard-marks', startFret: 0, endFret: 12, positions: [posA, posB] },
  }];
}

/** 9.2 — semitonos = tonos * 2. */
export function generateTonesToSemitones(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const x = randomInt(1, 6, rng);
  const correct = x * 2;
  const distractors = numericDistractors(correct, 3, []);
  const opciones = shuffle(
    [
      { texto: String(correct), correcta: true },
      ...distractors.map((d) => ({ texto: String(d), correcta: false })),
      { texto: 'los que tu quieras', correcta: false },
    ],
    rng,
  );
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosArithmetic['9.2'](x), opciones }];
}

/** 9.3 — tonos = semitonos / 2. X siempre par para que el resultado sea un número limpio. */
export function generateSemitonesToTones(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const x = pickOne([2, 4, 6, 8, 10, 12], rng);
  const correct = x / 2;
  const distractors = numericDistractors(correct, 3, []);
  const opciones = shuffle(
    [
      { texto: String(correct), correcta: true },
      ...distractors.map((d) => ({ texto: String(d), correcta: false })),
      { texto: 'medio y medio', correcta: false },
    ],
    rng,
  );
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosArithmetic['9.3'](x), opciones }];
}
