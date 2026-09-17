import { majorChords, minorChords, type OpenChord } from '../chordBank';
import { SCALE_TABLES } from '../degreeTables';
import { enunciadosTheory } from '../enunciados';
import { CHROMATIC_NOTES, noteNameForFret } from '../musicNotes';
import { pick, pickOne, randomInt, shuffle, type Rng } from '../shuffle';
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

// Afinaciones alternativas reales y conocidas, ninguna empieza en sostenido/bemol (regla del JSON).
const KNOWN_STANDARD_TUNINGS = ['E-A-D-G-B-E', 'D-A-D-G-B-E', 'D-A-D-G-A-D', 'D-G-D-G-B-D'];
// Afinaciones inventadas, sin uso real, para que quede claro cuál "NO es estandar".
const NON_STANDARD_TUNINGS = ['C-F-A#-D#-G-C', 'G-C-F-A#-D-G', 'E-G-C-F-A-D'];

/** 2.2.2 — cuál de 4 afinaciones NO es estándar. */
export function generateNonStandardTuning(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const standardShown = pick(KNOWN_STANDARD_TUNINGS, 3, rng);
  const nonStandard = pickOne(NON_STANDARD_TUNINGS, rng);
  const opciones = shuffle(
    [
      { texto: nonStandard, correcta: true },
      ...standardShown.map((texto) => ({ texto, correcta: false })),
      { texto: 'Afinacion de ukelele (GCEA)', correcta: false },
    ],
    rng,
  );
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosTheory['2.2.2'](), opciones }];
}

/** 3.2 — cuerda 1-2 aguda, 3-4 media, 5-6 grave. */
export function generateStringRegister(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const string = randomInt(1, 6, rng);
  const correct = string <= 2 ? 'aguda' : string <= 4 ? 'media' : 'grave';
  const opciones = shuffle(
    [
      { texto: 'aguda', correcta: correct === 'aguda' },
      { texto: 'media', correcta: correct === 'media' },
      { texto: 'grave', correcta: correct === 'grave' },
      { texto: 'eso que es?', correcta: false },
      { texto: 'Depende del humor de la cuerda', correcta: false },
    ],
    rng,
  );
  const diagrama: QuizDiagram = { type: 'string-marker', string };
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosTheory['3.2'](), opciones, diagrama }];
}

/** 6.3 — nota en un traste 0-5 marcado en una cuerda concreta. */
export function generateFretNote(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const string = randomInt(1, 6, rng);
  const fret = randomInt(0, 5, rng);
  const correct = noteNameForFret(string, fret);
  const correctIndex = CHROMATIC_NOTES.indexOf(correct);
  const neighborOffsets = shuffle([1, -1, 2, -2], rng);
  const distractors: string[] = [];
  for (const offset of neighborOffsets) {
    if (distractors.length >= 3) break;
    const note = CHROMATIC_NOTES[((correctIndex + offset) % 12 + 12) % 12];
    if (note !== correct && note !== 'F#' && !distractors.includes(note)) distractors.push(note);
  }
  const opciones = shuffle(
    [
      { texto: correct, correcta: true },
      ...distractors.map((texto) => ({ texto, correcta: false })),
      { texto: 'Fa# de la suerte', correcta: false },
    ],
    rng,
  );
  const diagrama: QuizDiagram = { type: 'fretboard-marks', startFret: 0, endFret: 5, positions: [{ string, fret }] };
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosTheory['6.3'](), opciones, diagrama }];
}

/** 8.1.3 — blue note de cualquier tónica/modo. Fórmula (confirmada contra 8.1.1/8.1.2, ver
 * questionBank.json): se calcula sobre la relativa MENOR (si el modo es mayor, la relativa menor
 * está 3 semitonos por debajo de la tónica) y la blue note es la quinta bemol de esa tónica menor
 * (+6 semitonos). Con Sol Mayor da Bb, con Mi menor da Bb — coincide con 8.1.1/8.1.2 a propósito. */
export function generateBlueNoteFormula(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const tonicIndex = randomInt(0, 11, rng);
  const modo: 'mayor' | 'menor' = rng() < 0.5 ? 'mayor' : 'menor';
  const minorTonicIndex = modo === 'mayor' ? ((tonicIndex - 3) % 12 + 12) % 12 : tonicIndex;
  const blueNoteIndex = (minorTonicIndex + 6) % 12;
  const correct = CHROMATIC_NOTES[blueNoteIndex];
  const neighborOffsets = shuffle([1, -1, 2, -2], rng);
  const distractors: string[] = [];
  for (const offset of neighborOffsets) {
    if (distractors.length >= 3) break;
    const note = CHROMATIC_NOTES[((blueNoteIndex + offset) % 12 + 12) % 12];
    if (note !== correct && !distractors.includes(note)) distractors.push(note);
  }
  const opciones = shuffle(
    [
      { texto: correct, correcta: true },
      ...distractors.map((texto) => ({ texto, correcta: false })),
      { texto: 'La que se cuela sin avisar', correcta: false },
    ],
    rng,
  );
  const tonicName = CHROMATIC_NOTES[tonicIndex];
  return [{
    ...baseQuestion(entry, 0),
    enunciado: enunciadosTheory['8.1.3'](tonicName, modo),
    opciones,
  }];
}

const GENRE_CENTURY: Record<string, string> = { clasica: 'XVII', blues: 'XIX', jazz: 'XX', rock: 'XX' };
const GENRE_LABEL: Record<string, string> = { clasica: 'la música clásica', blues: 'el blues', jazz: 'el jazz', rock: 'el rock' };

/** 8.1.5 — siglo de inicio del género, mapping fijo. Opciones ya vienen fijas en el JSON. */
export function generateGenreCentury(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const genre = pickOne(Object.keys(GENRE_CENTURY), rng);
  const correct = GENRE_CENTURY[genre];
  const opciones = shuffle(
    entry.opciones.map((texto) => ({ texto, correcta: texto === correct })),
    rng,
  );
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosTheory['8.1.5'](GENRE_LABEL[genre]), opciones }];
}

const OPEN_STRING_NOTE_CLASSES = ['E', 'A', 'D', 'G', 'B'];
const NOT_OPEN_CANDIDATES = ['C', 'F'];

/** 9.10 — qué nota NO está entre las cuerdas al aire de la afinación estándar. Se muestran 4 de
 * las 5 clases de nota realmente al aire (se descarta 1 al azar) + la nota correcta (C o F). */
export function generateNoteNotOpenString(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const correct = pickOne(NOT_OPEN_CANDIDATES, rng);
  const shownOpenNotes = pick(OPEN_STRING_NOTE_CLASSES, 4, rng);
  const opciones = shuffle(
    [
      { texto: correct, correcta: true },
      ...shownOpenNotes.map((texto) => ({ texto, correcta: false })),
    ],
    rng,
  );
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosTheory['9.10'](), opciones }];
}

type DiagramKind = 'acorde' | 'arpegio' | 'pentatonica' | 'escala';

const SOL_MAYOR_PENTATONIC = ['G', 'A', 'B', 'D', 'E'];

function chordToPositions(chord: OpenChord): { fret: number; string: number }[] {
  const positions = chord.markers.map((m) => ({ string: m.string, fret: m.fret }));
  for (const string of chord.open ?? []) positions.push({ string, fret: 0 });
  return positions;
}

function scalePositions(noteClasses: string[], startFret: number, endFret: number): { fret: number; string: number }[] {
  const positions: { fret: number; string: number }[] = [];
  for (let string = 1; string <= 6; string += 1) {
    for (let fret = startFret; fret <= endFret; fret += 1) {
      if (noteClasses.includes(noteNameForFret(string, fret))) positions.push({ string, fret });
    }
  }
  return positions;
}

/** 9.1.2 — genera uno de 4 tipos de dibujo (acorde/arpegio/pentatonica/escala) y pregunta cuál es.
 * Acorde y arpegio comparten las mismas posiciones (un acorde real del banco): el arpegio se
 * distingue en que QuestionCard (Fase 4) las dibuja en orden (`diagrama.ordered`), no todas a la
 * vez. Pentatónica/escala usan las notas reales de Sol Mayor (ver 8.4/9.1.1) recortadas a
 * trastes 0-5, para que el número de puntos marcados (5 vs 7) también sea una pista visual. */
export function generateDiagramKind(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const kind = pickOne<DiagramKind>(['acorde', 'arpegio', 'pentatonica', 'escala'], rng);
  let diagrama: QuizDiagram;
  if (kind === 'acorde' || kind === 'arpegio') {
    const chord = pickOne([...majorChords, ...minorChords], rng);
    diagrama = { type: 'fretboard-marks', startFret: 0, endFret: 5, positions: chordToPositions(chord), ordered: kind === 'arpegio' };
  } else if (kind === 'pentatonica') {
    diagrama = { type: 'fretboard-marks', startFret: 0, endFret: 5, positions: scalePositions(SOL_MAYOR_PENTATONIC, 0, 5) };
  } else {
    diagrama = { type: 'fretboard-marks', startFret: 0, endFret: 5, positions: scalePositions(SCALE_TABLES['sol-mayor'].notes, 0, 5) };
  }
  const opciones = shuffle(
    entry.opciones.map((texto) => ({ texto, correcta: texto === kind })),
    rng,
  );
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosTheory['9.1.2'](), opciones, diagrama }];
}
