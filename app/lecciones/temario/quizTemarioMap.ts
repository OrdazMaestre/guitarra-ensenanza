import type { QuizMode } from '../../lib/quiz/types';
import { extensionPages, legacyLessonSlugs, lessonBlocks } from './temarioData';

// Traduce slugs reales del temario a los ids de "tema" tal como aparecen, literalmente, en el
// campo `tema` de app/lib/quiz/questionBank.json (ej. "9.2 ACORDES SOL"). No existía ningún mapeo
// slug<->tema en el repo — se resolvió a mano contra temarioData.ts y el JSON de preguntas.
// QUIZ_TOPIC_ORDER es la progresión pedagógica real, TEMAS PRINCIPALES y APARTADOS intercalados
// (cada apartado justo después de su tema principal) — universo completo de temas válidos y
// también la fuente del tipo QuizTopic.
export const QUIZ_TOPIC_ORDER = [
  '1 CONCEPTOS BASICOS',
  '1.1 EL SONIDO EN LA MUSICA',
  '2 NOTACION',
  '2.2 AFINACION',
  '3 TABLATURAS',
  '4 ACORDES',
  '5 LET IT BE',
  '6 FIGURAS',
  '7 ARPEGIOS',
  '8 PENTATONICA',
  '8.1 BLUES',
  '9 ESCALAS',
  '9.1 ESCALASOL',
  '9.2 ACORDES SOL',
  '9.3 ACORDES SEPTIMA',
] as const;

export type QuizTopic = (typeof QUIZ_TOPIC_ORDER)[number];

// TEMAS PRINCIPALES: la secuencia principal del temario, en orden. Todo QuizTopic que no esté
// aquí es un APARTADO (rama lateral) de alguno de estos — ver PARENT_MAIN_TOPIC.
const MAIN_TOPICS = [
  '1 CONCEPTOS BASICOS',
  '2 NOTACION',
  '3 TABLATURAS',
  '4 ACORDES',
  '5 LET IT BE',
  '6 FIGURAS',
  '7 ARPEGIOS',
  '8 PENTATONICA',
  '9 ESCALAS',
] as const satisfies readonly QuizTopic[];

// Tema principal "padre" de cada apartado (todo QuizTopic que no sea un tema principal).
const PARENT_MAIN_TOPIC: Partial<Record<QuizTopic, QuizTopic>> = {
  '1.1 EL SONIDO EN LA MUSICA': '1 CONCEPTOS BASICOS',
  '2.2 AFINACION': '2 NOTACION',
  '8.1 BLUES': '8 PENTATONICA',
  '9.1 ESCALASOL': '9 ESCALAS',
  '9.2 ACORDES SOL': '9 ESCALAS',
  '9.3 ACORDES SEPTIMA': '9 ESCALAS',
};

function isMainTopic(topic: QuizTopic): boolean {
  return (MAIN_TOPICS as readonly QuizTopic[]).includes(topic);
}

function mainTopicOf(topic: QuizTopic): QuizTopic {
  return isMainTopic(topic) ? topic : (PARENT_MAIN_TOPIC[topic] as QuizTopic);
}

/** Todos los apartados (nunca temas principales) cuyo padre está en `mains`. Usado solo para
 * APARTADOSanteriores (regla 3: mini-torneo/campeonato), nunca para facil/dificil. */
function apartadosOf(mains: readonly QuizTopic[]): QuizTopic[] {
  const mainSet = new Set<QuizTopic>(mains);
  return QUIZ_TOPIC_ORDER.filter((t) => !isMainTopic(t) && mainSet.has(mainTopicOf(t)));
}

// Solo los slugs que tienen tema propio en el JSON. El resto de extensionPages (ejercicios,
// modos griegos...) no tiene preguntas propias todavía — usan el tema de su parentSlug (ver
// resolveQuizTopicForSlug).
export const SLUG_TO_QUIZ_TOPIC: Record<string, QuizTopic> = {
  'conceptos-basicos': '1 CONCEPTOS BASICOS',
  'el-sonido-en-la-musica': '1.1 EL SONIDO EN LA MUSICA',
  'notacion-musical': '2 NOTACION',
  afinacion: '2.2 AFINACION',
  tablaturas: '3 TABLATURAS',
  acordes: '4 ACORDES',
  'let-it-be-con-acordes': '5 LET IT BE',
  'figuras-de-acordes': '6 FIGURAS',
  arpegios: '7 ARPEGIOS',
  pentatonica: '8 PENTATONICA',
  'pentatonica-blues': '8.1 BLUES',
  escalas: '9 ESCALAS',
  'escala-completa-sol-mayor': '9.1 ESCALASOL',
  'acordes-escala-sol-mayor': '9.2 ACORDES SOL',
  'acordes-con-septima': '9.3 ACORDES SEPTIMA',
};

/** Tema efectivo de un slug: el suyo propio si tiene, si no el de su lección padre (extensionPages). */
export function resolveQuizTopicForSlug(slug: string): QuizTopic | undefined {
  const own = SLUG_TO_QUIZ_TOPIC[slug];
  if (own) return own;

  const parentSlug = extensionPages.find((page) => page.slug === slug)?.parentSlug;
  return parentSlug ? SLUG_TO_QUIZ_TOPIC[parentSlug] : undefined;
}

/**
 * Temas en juego al entrar al quiz desde `slug`, según la modalidad — nunca temas posteriores.
 * Distingue TEMAS PRINCIPALES de APARTADOS (ramas laterales del temario):
 *
 * 1. Entrando desde un TEMA PRINCIPAL: en facil/dificil solo cuentan temas principales (el actual
 *    y los anteriores) — ningún apartado, aunque sea cronológicamente anterior.
 * 2. Entrando desde un APARTADO: en facil/dificil solo cuenta ESE apartado + los temas
 *    principales correspondientes (el suyo y los anteriores) — no otros apartados.
 * 3. APARTADOSanteriores (solo mini-torneo/campeonato): TODOS los apartados de los temas
 *    principales actual y anteriores, no solo el que se usó para entrar.
 * 4. Por modalidad: facil/dificil aplican 1 o 2 según el punto de entrada; mini-torneo y
 *    campeonato siempre usan temas principales (actual y anteriores) + APARTADOSanteriores,
 *    sea cual sea el punto de entrada.
 *
 * Si el slug no tiene ningún tema resuelto (ej. 'funciones-tonales', el último bloque principal,
 * todavía sin preguntas propias) o no se reconoce, se devuelven TODOS los temas — el motor de
 * selección ya sabe rellenar con temas anteriores cuando el tema de entrada no tiene preguntas
 * suficientes.
 */
export function topicsUpToSlug(slug: string, mode: QuizMode): QuizTopic[] {
  const topic = resolveQuizTopicForSlug(slug);
  if (!topic) return [...QUIZ_TOPIC_ORDER];

  const mainTopic = mainTopicOf(topic);
  const mainIndex = MAIN_TOPICS.indexOf(mainTopic as (typeof MAIN_TOPICS)[number]);
  const mainsUpToCurrent = MAIN_TOPICS.slice(0, mainIndex + 1) as QuizTopic[];

  let scope: Set<QuizTopic>;
  if (mode === 'mini-torneo' || mode === 'campeonato') {
    scope = new Set([...mainsUpToCurrent, ...apartadosOf(mainsUpToCurrent)]);
  } else if (isMainTopic(topic)) {
    scope = new Set(mainsUpToCurrent);
  } else {
    scope = new Set([...mainsUpToCurrent, topic]);
  }

  return QUIZ_TOPIC_ORDER.filter((t) => scope.has(t));
}

/** true si `slug` es una ruta real del temario (para saber si el botón "Volver a la lección" del
 * quiz tiene a dónde volver). */
export function isKnownLessonSlug(slug: string): boolean {
  return (
    lessonBlocks.some((lesson) => lesson.slug === slug) ||
    extensionPages.some((page) => page.slug === slug) ||
    (legacyLessonSlugs as readonly string[]).includes(slug)
  );
}
