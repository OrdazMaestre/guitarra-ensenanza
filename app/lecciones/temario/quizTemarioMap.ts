import { extensionPages, legacyLessonSlugs, lessonBlocks } from './temarioData';

// Traduce slugs reales del temario a los ids de "tema" tal como aparecen, literalmente, en el
// campo `tema` de app/lib/quiz/questionBank.json (ej. "9.2 ACORDES SOL"). No existía ningún mapeo
// slug<->tema en el repo — se resolvió a mano contra temarioData.ts y el JSON de preguntas.
// QUIZ_TOPIC_ORDER es la progresión pedagógica real: el orden que usa topicsUpToSlug() para
// "solo este tema y los anteriores, nunca los posteriores" (regla de meta.reglas_generales).
export const QUIZ_TOPIC_ORDER = [
  '1 CONCEPTOS BASICOS',
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

// Solo los slugs que tienen tema propio en el JSON. El resto de extensionPages (ejercicios,
// modos griegos, el-sonido-en-la-musica...) no tiene preguntas propias todavía — usan el tema
// de su parentSlug (ver resolveQuizTopicForSlug).
export const SLUG_TO_QUIZ_TOPIC: Record<string, QuizTopic> = {
  'conceptos-basicos': '1 CONCEPTOS BASICOS',
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
 * Temas progresivos disponibles al entrar al quiz desde `slug`: el suyo y todos los anteriores en
 * QUIZ_TOPIC_ORDER, nunca los posteriores. Si el slug no tiene ningún tema resuelto (ej.
 * 'funciones-tonales', el último bloque principal, todavía sin preguntas propias) o no se
 * reconoce, se devuelven TODOS los temas — el motor de selección ya sabe rellenar con temas
 * anteriores cuando el tema de entrada no tiene preguntas suficientes.
 */
export function topicsUpToSlug(slug: string): QuizTopic[] {
  const topic = resolveQuizTopicForSlug(slug);
  if (!topic) return [...QUIZ_TOPIC_ORDER];

  const index = QUIZ_TOPIC_ORDER.indexOf(topic);
  return QUIZ_TOPIC_ORDER.slice(0, index + 1);
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
