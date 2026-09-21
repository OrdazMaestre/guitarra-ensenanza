import { majorChords, minorChords, type OpenChord } from '../chordBank';
import { degreeOfNote, SCALE_TABLES, type ScaleDegree, type ScaleId } from '../degreeTables';
import { enunciadosDegree } from '../enunciados';
import { noteNameForFret } from '../musicNotes';
import { pickOne, shuffle, type Rng } from '../shuffle';
import type { QuestionBankEntry } from '../questionBank.types';
import type { QuizDiagram, QuizMode, RuntimeQuestion } from '../types';

function baseQuestion(entry: QuestionBankEntry, index: number): Pick<RuntimeQuestion, 'dificultad' | 'id' | 'origenId' | 'tema'> {
  return {
    id: `${entry.id}#${index}`,
    origenId: entry.id,
    tema: entry.tema,
    dificultad: entry.dificultad === 'facil' ? 'facil' : 'dificil',
  };
}

const SCALE_LABEL: Record<ScaleId, string> = {
  'sol-mayor': 'Sol Mayor',
  'mi-menor': 'Mi menor',
  'do-mayor': 'Do Mayor',
  'la-menor': 'La menor',
};

const ORDINAL_WORD = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima'];

function ordinalForDegree(degree: ScaleDegree): string {
  return ORDINAL_WORD[Number(degree.degree) - 1];
}

/** Posiciones (traste 0-5, las 6 cuerdas) cuya nota pertenece a la escala dada. */
function positionsInScale(scaleId: ScaleId): { fret: number; string: number }[] {
  const notes = SCALE_TABLES[scaleId].notes;
  const positions: { fret: number; string: number }[] = [];
  for (let string = 1; string <= 6; string += 1) {
    for (let fret = 0; fret <= 5; fret += 1) {
      if (notes.includes(noteNameForFret(string, fret))) positions.push({ string, fret });
    }
  }
  return positions;
}

/** 9.3.2 — grado (en ordinal) que ocupa una nota marcada en el mástil, dentro de una de las 4
 * escalas. La nota se elige entre las que SÍ pertenecen a la escala (si no, no tendría grado). */
export function generateNoteDegree(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const scaleId = pickOne(Object.keys(SCALE_TABLES) as ScaleId[], rng);
  const position = pickOne(positionsInScale(scaleId), rng);
  const note = noteNameForFret(position.string, position.fret);
  const degree = degreeOfNote(scaleId, note);
  if (!degree) throw new Error(`Nota ${note} inesperadamente fuera de la escala ${scaleId}`);
  const correct = ordinalForDegree(degree);
  const distractors = shuffle(ORDINAL_WORD.filter((word) => word !== correct), rng).slice(0, 3);
  const opciones = shuffle(
    [
      { texto: correct, correcta: true },
      ...distractors.map((texto) => ({ texto, correcta: false })),
      { texto: 'Una nota cualquiera, sin compromiso', correcta: false },
    ],
    rng,
  );
  const diagrama: QuizDiagram = { type: 'fretboard-marks', startFret: 0, endFret: 5, positions: [position] };
  return [{
    ...baseQuestion(entry, 0),
    enunciado: enunciadosDegree['9.3.2'](SCALE_LABEL[scaleId]),
    opciones,
    diagrama,
  }];
}

/** 9.3.5 — notas del acorde con séptima de un grado al azar, en cualquiera de las 4 escalas. */
export function generateSeventhChordNotes(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const scaleId = pickOne(Object.keys(SCALE_TABLES) as ScaleId[], rng);
  const table = SCALE_TABLES[scaleId];
  const degree = pickOne(table.degrees, rng);
  const correct = degree.seventhNotes.join('-');
  const otherDegrees = shuffle(table.degrees.filter((d) => d !== degree), rng).slice(0, 3);
  const opciones = shuffle(
    [
      { texto: correct, correcta: true },
      ...otherDegrees.map((d) => ({ texto: d.seventhNotes.join('-'), correcta: false })),
      { texto: 'Las de un acorde que se hizo mayor de edad', correcta: false },
    ],
    rng,
  );
  return [{
    ...baseQuestion(entry, 0),
    enunciado: enunciadosDegree['9.3.5'](degree.roman, SCALE_LABEL[scaleId]),
    opciones,
  }];
}

/** 9.3.7 — complementaria de 9.3.5: se da el acorde con séptima por su NOMBRE (ej. "GMaj7"), sin
 * decir de qué grado/escala sale, y se pregunta qué notas tiene. Prueba la fórmula del acorde en
 * sí (1-3-5-7), no la derivación desde grado+escala -- por eso el enunciado no debe filtrar el
 * grado/escala de origen aunque el generador los use internamente para elegir el acorde y sus
 * distractores (misma técnica que 9.3.5: distractores = otros grados de la MISMA escala, para que
 * sigan siendo acordes plausibles y no notas inventadas). */
export function generateSeventhChordByName(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const scaleId = pickOne(Object.keys(SCALE_TABLES) as ScaleId[], rng);
  const table = SCALE_TABLES[scaleId];
  const degree = pickOne(table.degrees, rng);
  const correct = degree.seventhNotes.join('-');
  const otherDegrees = shuffle(table.degrees.filter((d) => d !== degree), rng).slice(0, 3);
  const opciones = shuffle(
    [
      { texto: correct, correcta: true },
      ...otherDegrees.map((d) => ({ texto: d.seventhNotes.join('-'), correcta: false })),
      { texto: 'Las que le apetezcan al acorde ese día', correcta: false },
    ],
    rng,
  );
  return [{
    ...baseQuestion(entry, 0),
    enunciado: enunciadosDegree['9.3.7'](degree.seventhName),
    opciones,
  }];
}

const openChordByEnglish = new Map<string, OpenChord & { quality: 'mayor' | 'menor' }>([
  ...majorChords.map((c): [string, OpenChord & { quality: 'mayor' }] => [c.english, { ...c, quality: 'mayor' }]),
  ...minorChords.map((c): [string, OpenChord & { quality: 'menor' }] => [c.english, { ...c, quality: 'menor' }]),
]);

/** 9.3.6 — a qué grado (I-VII) corresponde el acorde del dibujo, dentro de una escala dada. Solo
 * se eligen grados NO disminuidos: ningún acorde disminuido tiene todavía digitación definida en
 * el sitio (mismo motivo documentado en generators/chordBankQuestions.ts para 9.2.1), así que no
 * hay diagrama posible para "vii disminuido"/"ii disminuido". El grado disminuido SÍ puede
 * aparecer como distractor de texto (no necesita dibujarse para eso). */
export function generateChordDegreeNumber(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const scaleId = pickOne(Object.keys(SCALE_TABLES) as ScaleId[], rng);
  const table = SCALE_TABLES[scaleId];
  const drawableDegrees = table.degrees.filter((d) => openChordByEnglish.has(d.triadName));
  const degree = pickOne(drawableDegrees, rng);
  const chord = openChordByEnglish.get(degree.triadName)!;
  const distractors = shuffle(table.degrees.filter((d) => d !== degree), rng).slice(0, 3);
  const opciones = shuffle(
    [
      { texto: degree.roman, correcta: true },
      ...distractors.map((d) => ({ texto: d.roman, correcta: false })),
      { texto: 'El número de la suerte', correcta: false },
    ],
    rng,
  );
  const diagrama: QuizDiagram = { type: 'chord-diagram', chordEnglish: chord.english, quality: chord.quality };
  return [{
    ...baseQuestion(entry, 0),
    enunciado: enunciadosDegree['9.3.6'](SCALE_LABEL[scaleId]),
    opciones,
    diagrama,
  }];
}
