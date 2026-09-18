import { staticEnunciado } from './enunciados';
import { GENERATORS } from './generators';
import questionBankRaw from './questionBank.json';
import { shuffle, type Rng } from './shuffle';
import type { QuestionBank, QuestionBankEntry } from './questionBank.types';
import type { QuizMode, RuntimeQuestion } from './types';
import type { QuizTopic } from '../../lecciones/temario/quizTemarioMap';

const questionBank = questionBankRaw as unknown as QuestionBank;

export const ALL_QUESTIONS: QuestionBankEntry[] = questionBank.preguntas;

interface SlotPick {
  entry: QuestionBankEntry;
  /** Cuántas veces se llama a resolveQuestion() para esta entrada (variables distintas cada vez).
   * 9.2.1 es 1 aunque "valga" 4 huecos: su generador ya devuelve sus 4 variantes simultáneas en
   * esa única llamada. */
  occurrences: number;
}

function entriesForTopic(topic: QuizTopic): QuestionBankEntry[] {
  return ALL_QUESTIONS.filter((entry) => entry.tema === topic);
}

/** facil solo admite preguntas etiquetadas 'facil' (o 'facil_y_dificil', que se adapta según el
 * modo dentro de su propio generador — ver 4.1). El resto de modos admite cualquier dificultad. */
function allowedForMode(entry: QuestionBankEntry, mode: QuizMode): boolean {
  if (mode === 'facil') return entry.dificultad === 'facil' || entry.dificultad === 'facil_y_dificil';
  return true;
}

/**
 * Intenta tomar `entry` gastando el máximo de huecos que quepa en `remaining` sin pasarse:
 * - 9.2.1 siempre entero (4 huecos) o nada — no tiene versión reducida, sus 4 variantes son
 *   simultáneas por definición (excepción explícita del JSON).
 * - El resto de preguntas con >=2 variables INTENTA aparecer 2 veces (regla "variantes" del JSON,
 *   solo si `allowDouble`) pero si no caben los 2 huecos cae a 1 en vez de descartarse — así
 *   "pueden salir 2 variantes... sin sobrepasar el limite" en vez de forzarlo siempre ni tener que
 *   renunciar del todo a la pregunta cuando el presupuesto ya está ajustado.
 * - Todo lo demás vale 1 hueco fijo.
 * Devuelve null si ni siquiera cabe 1 hueco.
 */
function tryTake(entry: QuestionBankEntry, remaining: { value: number }, allowDouble: boolean): SlotPick | null {
  if (entry.id === '9.2.1') {
    if (remaining.value < 4) return null;
    remaining.value -= 4;
    return { entry, occurrences: 1 };
  }
  if (allowDouble && entry.variables.length >= 2 && remaining.value >= 2) {
    remaining.value -= 2;
    return { entry, occurrences: 2 };
  }
  if (remaining.value >= 1) {
    remaining.value -= 1;
    return { entry, occurrences: 1 };
  }
  return null;
}

function fillSlots(candidates: QuestionBankEntry[], chosen: SlotPick[], seen: Set<string>, remaining: { value: number }, allowDouble: boolean): void {
  for (const entry of candidates) {
    if (remaining.value <= 0) break;
    const pick = tryTake(entry, remaining, allowDouble);
    if (!pick) continue;
    chosen.push(pick);
    seen.add(entry.id);
  }
}

/** Selecciona qué entradas del banco entran en un test de facil/dificil (recuento fijo de
 * preguntas RENDERIZADAS: 4 o 6, sin variar de un intento a otro — nunca se pasa del objetivo,
 * aunque alguna pregunta salga duplicada): prioriza el tema de entrada (en dificil, primero sus
 * preguntas exclusivas de dificil) y solo recurre a temas anteriores si ese tema no tiene
 * preguntas suficientes — nunca a temas posteriores (regla de
 * meta.reglas_generales.numero_preguntas). */
function pickFixedCount(topics: QuizTopic[], targetSlots: number, mode: QuizMode, rng: Rng): SlotPick[] {
  const chosen: SlotPick[] = [];
  const seen = new Set<string>();
  const remaining = { value: targetSlots };
  const allowDouble = mode !== 'facil';

  const currentTopic = topics[topics.length - 1];
  const currentCandidates = entriesForTopic(currentTopic).filter((e) => allowedForMode(e, mode));
  const hardFirst = mode === 'dificil' ? shuffle(currentCandidates.filter((e) => e.dificultad !== 'facil'), rng) : [];
  const hardFirstIds = new Set(hardFirst.map((e) => e.id));
  const rest = shuffle(currentCandidates.filter((e) => !hardFirstIds.has(e.id)), rng);
  fillSlots([...hardFirst, ...rest], chosen, seen, remaining, allowDouble);

  for (let i = topics.length - 2; i >= 0 && remaining.value > 0; i -= 1) {
    const candidates = shuffle(entriesForTopic(topics[i]).filter((e) => allowedForMode(e, mode) && !seen.has(e.id)), rng);
    fillSlots(candidates, chosen, seen, remaining, allowDouble);
  }

  return chosen;
}

/** Mini-torneo: mismo recuento fijo (10) que facil/dificil, pero sobre el pool completo de todos
 * los temas vistos en vez de priorizar el tema actual. */
function pickSlotBudget(pool: QuestionBankEntry[], targetSlots: number, rng: Rng): SlotPick[] {
  const chosen: SlotPick[] = [];
  fillSlots(shuffle(pool, rng), chosen, new Set(), { value: targetSlots }, true);
  return chosen;
}

/** Campeonato no tiene presupuesto que cuadrar ("todas las preguntas" es abierto por definición),
 * así que aquí el duplicado es SIEMPRE, no "puede pasar" como en dificil/mini-torneo — coincide
 * con el texto original del JSON: "las preguntas CON VARIABLES se calculan... DOS veces... por
 * test dificil, mini-torneo y campeonato" (meta.reglas_generales.variantes). El umbral es
 * `variables.length >= 1` (CUALQUIER variable), no >=2 — ese >=2 es un criterio DISTINTO del JSON
 * (leyenda.dificultad: "dificil = explicito en el borrador o >=2 variables", para clasificar la
 * DIFICULTAD de una pregunta, no si dobla en campeonato). Se confundieron ambos umbrales en la
 * implementación original: dejaba 9 preguntas de 1 variable (3.2, 4.1, 6.4, 8.1.5, 9.2, 9.3, 9.11,
 * 9.11.1, 9.1.2) sin duplicar en campeonato cuando sí deberían — bug real reportado por el usuario. */
function allEntriesWithOccurrences(topics: QuizTopic[]): SlotPick[] {
  return topics.flatMap((topic) => entriesForTopic(topic)).map((entry) => ({
    entry,
    occurrences: entry.id === '9.2.1' ? 1 : entry.variables.length >= 1 ? 2 : 1,
  }));
}

export function resolveQuestion(entry: QuestionBankEntry, mode: QuizMode, rng: Rng): RuntimeQuestion[] {
  if (entry.correcta !== null) {
    const correctSet = new Set(entry.correcta);
    const opciones = shuffle(
      entry.opciones.map((texto) => ({ texto, correcta: correctSet.has(texto) })),
      rng,
    );
    return [{
      id: `${entry.id}#0`,
      origenId: entry.id,
      tema: entry.tema,
      dificultad: entry.dificultad === 'facil' ? 'facil' : 'dificil',
      enunciado: staticEnunciado(entry.id),
      opciones,
    }];
  }

  const generator = GENERATORS[entry.id];
  if (!generator) {
    throw new Error(`No hay generador todavia para la pregunta "${entry.id}" (pendiente de implementar)`);
  }
  return generator(entry, mode, rng);
}

/**
 * Selecciona y genera todas las preguntas de un test, aplicando meta.reglas_generales de
 * questionBank.json: recuento fijo por modo (4 facil / 6 dificil / 10 mini-torneo — SIEMPRE
 * exacto — / todas en campeonato), relleno con temas anteriores cuando el tema de entrada no
 * tiene suficientes, y duplicado con variables distintas para preguntas de >=2 variables en
 * dificil/mini-torneo (puede pasar, sin sobrepasar nunca el recuento fijo del modo) y siempre en
 * campeonato (sin presupuesto que respetar ahí).
 */
export function selectQuestions(mode: QuizMode, topics: QuizTopic[], rng: Rng): RuntimeQuestion[] {
  let picks: SlotPick[];

  if (mode === 'facil' || mode === 'dificil') {
    picks = pickFixedCount(topics, mode === 'facil' ? 4 : 6, mode, rng);
  } else if (mode === 'mini-torneo') {
    const pool = topics.flatMap((topic) => entriesForTopic(topic)).filter((e) => allowedForMode(e, mode));
    picks = pickSlotBudget(pool, 10, rng);
  } else {
    picks = allEntriesWithOccurrences(topics);
  }

  const questions: RuntimeQuestion[] = [];
  const originCounts = new Map<string, number>();
  for (const { entry, occurrences } of picks) {
    for (let i = 0; i < occurrences; i += 1) {
      for (const question of resolveQuestion(entry, mode, rng)) {
        const count = originCounts.get(question.origenId) ?? 0;
        originCounts.set(question.origenId, count + 1);
        questions.push({ ...question, id: `${question.origenId}#${count}` });
      }
    }
  }
  // El orden de `picks` sigue la agrupación por tema (campeonato ni siquiera lo baraja: ver
  // allEntriesWithOccurrences). Se reordena aquí, una sola vez y para todos los modos por igual,
  // para que NINGUNA modalidad tenga un orden predecible de preguntas (bug reportado: en
  // campeonato la primera pregunta era siempre "¿donde estan los trastes?").
  return shuffle(questions, rng);
}
