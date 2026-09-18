import { majorChords, minorChords, powerChords, spanishChordLabel, verticalTabLines, type OpenChord, type PowerChord } from '../chordBank';
import { enunciadosChordBank } from '../enunciados';
import { pick, pickOne, shuffle, type Rng } from '../shuffle';
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

type OpenBankChord = OpenChord & { quality: 'mayor' | 'menor' };
type BankChord = OpenBankChord | (PowerChord & { quality: 'power' });

/** "DO Mayor" / "DO menor" para acordes abiertos; un power chord se nombra SOLO con la letra
 * ("MI"), sin "Mayor"/"menor" detrás — así el alumno tiene que fijarse en el dibujo (3 notas T-5-8)
 * para no confundirlo con el acorde mayor completo del mismo nombre (nota_generacion de 4.1). */
function chordLabel(chord: BankChord): string {
  return chord.quality === 'power' ? chord.rootLabel.toUpperCase() : spanishChordLabel(chord);
}

/** Tónica sin el sufijo de calidad ('DOm'->'DO', 'MI5'->'MI'), para poder evitar que los
 * distractores confundan mayor/menor de la misma tónica salvo que sea justo lo que se evalúa. */
function chordTonic(chord: BankChord): string {
  return chord.spanish.replace(/m$/, '').replace(/5$/, '');
}

function diagramFor(chord: BankChord, hideNoteLabels?: boolean): QuizDiagram {
  return { type: 'chord-diagram', chordEnglish: chord.english, quality: chord.quality, hideNoteLabels };
}

function pickDistractors<T extends BankChord>(pool: T[], correct: T, count: number, rng: Rng): T[] {
  const sameLabel = chordLabel(correct);
  const strict = pool.filter((c) => chordLabel(c) !== sameLabel && chordTonic(c) !== chordTonic(correct));
  const chosen = pick(strict, count, rng);
  if (chosen.length >= count) return chosen;
  // Pool demasiado pequeño para evitar tónicas repetidas (no debería pasar con el banco actual,
  // pero por seguridad se rellena permitiendo mismo tónica antes que lanzar o repetir la correcta).
  const relaxed = pool.filter((c) => chordLabel(c) !== sameLabel && !chosen.includes(c));
  return [...chosen, ...pick(relaxed, count - chosen.length, rng)];
}

/** 4.1 — identificar el acorde del dibujo. Facil: solo mayores básicos. Dificil: mayores + menores
 * + power chords (nota_generacion de la pregunta en questionBank.json). */
export function generateIdentifyChord(entry: QuestionBankEntry, mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const pool: BankChord[] =
    mode === 'facil'
      ? majorChords.map((c) => ({ ...c, quality: 'mayor' as const }))
      : [
          ...majorChords.map((c) => ({ ...c, quality: 'mayor' as const })),
          ...minorChords.map((c) => ({ ...c, quality: 'menor' as const })),
          ...powerChords.map((c) => ({ ...c, quality: 'power' as const })),
        ];
  const correct = pickOne(pool, rng);
  const distractors = pickDistractors(pool, correct, 3, rng);
  const opciones = shuffle(
    [
      { texto: chordLabel(correct), correcta: true },
      ...distractors.map((c) => ({ texto: chordLabel(c), correcta: false })),
      { texto: 'El acorde secreto de Hogwarts', correcta: false },
    ],
    rng,
  );
  // entry.dificultad es 'facil_y_dificil' (única en todo el banco): a diferencia del resto de
  // generadores, aquí la dificultad real depende del modo con el que se generó, no del valor fijo
  // del JSON (baseQuestion() lo mapearía siempre a 'dificil').
  // hideNoteLabels: SOLO aqui -- 4.1 pregunta literalmente "identificar el acorde", asi que el
  // nombre del acorde (via aria-label del diagrama) chivaria la respuesta. 6.4 y 9.2.1 usan el
  // mismo diagramFor() pero sin este flag a proposito (piden otra cosa, no el nombre del acorde).
  return [{ ...baseQuestion(entry, 0), dificultad: mode === 'facil' ? 'facil' : 'dificil', enunciado: enunciadosChordBank['4.1'](), opciones, diagrama: diagramFor(correct, true) }];
}

/** 6.4 — qué tablatura corresponde al diagrama de acorde mostrado. Restringido a acordes abiertos
 * (mayores/menores del banco): verticalTabLines() solo sabe derivar tablatura de ese shape
 * (markers/open/muted/barre), no de power chords. El diagrama y la tablatura correcta se derivan
 * SIEMPRE del mismo objeto `chord`, nunca por separado, para que nunca puedan desincronizarse
 * (advertencia explícita en questionBank.json).
 *
 * Las opciones se pintan como columna vertical (una linea por cuerda, cuerda 1 arriba -> cuerda 6
 * abajo) en vez del formato compacto "(0.1 0.2 ...)". Entre los distractores SIEMPRE hay uno con
 * los mismos numeros de la respuesta correcta pero en orden invertido (arriba<->abajo) -- un
 * "trampa" fijo para comprobar que el alumno lee la orientacion real de la tablatura y no solo
 * reconoce el conjunto de numeros. Excepcion: si el acorde correcto es un palindromo vertical (ej.
 * LA Mayor = 0,2,2,2,0, igual leido en los dos sentidos), la version invertida sería idéntica a la
 * correcta -- en ese caso se omite y se rellena el hueco con un distractor real de más. */
export function generateChordTablatureMatch(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const pool: OpenBankChord[] = [...majorChords.map((c) => ({ ...c, quality: 'mayor' as const })), ...minorChords.map((c) => ({ ...c, quality: 'menor' as const }))];
  const correct = pickOne(pool, rng);
  const correctLines = verticalTabLines(correct);
  const correctTexto = correctLines.join('\n');
  const invertidaTexto = [...correctLines].reverse().join('\n');
  const useInvertida = invertidaTexto !== correctTexto;
  const distractors = pickDistractors(pool, correct, useInvertida ? 2 : 3, rng);
  const opciones = shuffle(
    [
      { texto: correctTexto, correcta: true },
      ...(useInvertida ? [{ texto: invertidaTexto, correcta: false }] : []),
      ...distractors.map((c) => ({ texto: verticalTabLines(c).join('\n'), correcta: false })),
      { texto: 'La tablatura del silencio (todo mudo)', correcta: false },
    ],
    rng,
  );
  return [{ ...baseQuestion(entry, 0), enunciado: enunciadosChordBank['6.4'](), opciones, diagrama: diagramFor(correct) }];
}

/** 9.2.1 — EXCEPCIÓN explícita del JSON: 4 variantes SIMULTÁNEAS por aparición (no 1, y no el
 * "puede aparecer 2 veces" del resto de preguntas de >=2 variables en dificil/mini-torneo —
 * tryTake() en engine.ts ya sabe dejar este id fuera de esa regla general, siempre vale sus 4
 * huecos enteros o nada). "Acordes de escala-Sol-Mayor y
 * acordes-basicos": el solapamiento es real, los 6 grados no disminuidos de Sol Mayor (G, Am, Bm,
 * C, D, Em) ya son exactamente 6 de los 7 acordes básicos del banco — F# disminuido queda fuera
 * porque ningún acorde disminuido tiene todavía una digitación definida en el sitio (ni siquiera
 * en AcordesEscalaSolMayorPage.tsx, que solo lo nombra en el mapa de notas, sin diagrama propio).
 * Por eso el pool es, en la práctica, el mismo majorChords+minorChords que usa 6.4. */
export function generateNameFourChords(entry: QuestionBankEntry, _mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  const pool: OpenBankChord[] = [...majorChords.map((c) => ({ ...c, quality: 'mayor' as const })), ...minorChords.map((c) => ({ ...c, quality: 'menor' as const }))];
  const fourChords = pick(pool, 4, rng);
  return fourChords.map((correct, index) => {
    const distractors = pickDistractors(pool, correct, 3, rng);
    const opciones = shuffle(
      [
        { texto: chordLabel(correct), correcta: true },
        ...distractors.map((c) => ({ texto: chordLabel(c), correcta: false })),
        { texto: 'El acorde que se llama a si mismo', correcta: false },
      ],
      rng,
    );
    return { ...baseQuestion(entry, index), enunciado: enunciadosChordBank['9.2.1'](), opciones, diagrama: diagramFor(correct) };
  });
}
