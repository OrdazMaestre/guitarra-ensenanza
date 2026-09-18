import { enunciadosNotation } from '../enunciados';
import { CHROMATIC_NOTES, NATURAL_NOTES, spanishForInternational } from '../musicNotes';
import { randomInt, shuffle, type Rng } from '../shuffle';
import type { QuestionBankEntry } from '../questionBank.types';
import type { QuizMode, RuntimeQuestion } from '../types';

function baseQuestion(entry: QuestionBankEntry, index: number): Pick<RuntimeQuestion, 'dificultad' | 'id' | 'origenId' | 'tema'> {
  return {
    id: `${entry.id}#${index}`,
    origenId: entry.id,
    tema: entry.tema,
    dificultad: entry.dificultad === 'facil' ? 'facil' : 'dificil',
  };
}

/** 2.1 — se muestra una nota en un sistema (internacional o español) y hay que dar su equivalente
 * en el otro. Los 3 distractores (además del correcto y la graciosa fija) son notas vecinas en
 * semitonos (±1, ±2, ±3) ya convertidas al mismo sistema de la respuesta, para que el alumno tenga
 * que fijarse en la nota exacta y no solo en "algo parecido". */
export function generateNoteNotationSwap(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const index = randomInt(0, 11, rng);
  const showInternational = rng() < 0.5;
  const intlNote = CHROMATIC_NOTES[index];
  const spanishNote = spanishForInternational(intlNote);
  const shown = showInternational ? intlNote : spanishNote;
  const correctAnswer = showInternational ? spanishNote : intlNote;

  const neighborOffsets = shuffle([1, -1, 2, -2, 3, -3], rng);
  const distractors: string[] = [];
  for (const offset of neighborOffsets) {
    if (distractors.length >= 3) break;
    const neighborIndex = ((index + offset) % 12 + 12) % 12;
    const neighborIntl = CHROMATIC_NOTES[neighborIndex];
    const neighborAnswer = showInternational ? spanishForInternational(neighborIntl) : neighborIntl;
    if (neighborAnswer !== correctAnswer && !distractors.includes(neighborAnswer)) distractors.push(neighborAnswer);
  }

  const opciones = shuffle(
    [
      { texto: correctAnswer, correcta: true },
      ...distractors.map((texto) => ({ texto, correcta: false })),
      { texto: 'Do de pecho', correcta: false },
    ],
    rng,
  );
  return [{
    ...baseQuestion(entry, 0),
    enunciado: enunciadosNotation['2.1'](shown),
    opciones,
  }];
}

const NEXT_NATURAL: Record<string, string> = { C: 'D', D: 'E', F: 'G', G: 'A', A: 'B' };
const PREV_NATURAL: Record<string, string> = { D: 'C', E: 'D', G: 'F', A: 'G', B: 'A' };

/** 9.11 — "X# va antes de...". Excluye E/B porque E#=F y B#=C ya son la nota natural siguiente
 * (la pregunta no tendría sentido: la respuesta sería trivialmente esa misma nota). */
export function generateSharpPrecedes(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const options = Object.keys(NEXT_NATURAL);
  const x = options[randomInt(0, options.length - 1, rng)];
  const correct = NEXT_NATURAL[x];
  const distractors = NATURAL_NOTES.filter((n) => n !== correct && n !== x).slice(0, 3);
  const opciones = shuffle(
    [
      { texto: correct, correcta: true },
      ...distractors.map((texto) => ({ texto, correcta: false })),
      { texto: 'Antes y despues, como una peli de Almodovar', correcta: false },
    ],
    rng,
  );
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosNotation['9.11'](x), opciones }];
}

/** 9.11.1 — "Xb va despues de...". Excluye C/F porque Cb=B y Fb=E ya son la nota natural anterior. */
export function generateFlatFollows(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const options = Object.keys(PREV_NATURAL);
  const x = options[randomInt(0, options.length - 1, rng)];
  const correct = PREV_NATURAL[x];
  const distractors = NATURAL_NOTES.filter((n) => n !== correct && n !== x).slice(0, 3);
  const opciones = shuffle(
    [
      { texto: correct, correcta: true },
      ...distractors.map((texto) => ({ texto, correcta: false })),
      { texto: 'Despues de las clases de solfeo', correcta: false },
    ],
    rng,
  );
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosNotation['9.11.1'](x), opciones }];
}
