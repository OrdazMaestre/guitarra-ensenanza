export const lessonBlocks = [
  { number: 1, title: 'Conceptos básicos', slug: 'conceptos-basicos' },
  { number: 2, title: 'Notación musical', slug: 'notacion-musical' },
  { number: 3, title: 'Tablaturas', slug: 'tablaturas' },
  { number: 4, title: 'Acordes', slug: 'acordes' },
  { number: 5, title: 'Let It Be con acordes', slug: 'let-it-be-con-acordes' },
  { number: 6, title: 'Figuras de acordes', slug: 'figuras-de-acordes' },
  { number: 7, title: 'Arpegios', slug: 'arpegios' },
  { number: 8, title: 'Pentatónica', slug: 'pentatonica' },
  { number: 9, title: 'Escalas', slug: 'escalas' },
  { number: 10, title: 'Funciones tonales', slug: 'funciones-tonales' },
] as const;

export const extensionLessonSlugs = [
  'ampliacion-arpegios',
  'afinacion',
  'modos-griegos',
  'escala-completa-sol-mayor',
  'ejercicios-escalas',
  'acordes-escala-sol-mayor',
  'acordes-con-septima',
  'ejercicios-escalas-avanzados',
  'ejercicios-pentatonica',
  'ejercicios-pentatonica-avanzados',
  'pentatonica-blues',
  'ejercicios-pentatonica-blues',
  'tablaturas-dos-cuerdas',
] as const;

export const legacyLessonSlugs = [
  'patrones-griegos',
] as const;

export const lessonRouteSlugs = [
  ...lessonBlocks.map((lesson) => lesson.slug),
  ...extensionLessonSlugs,
  ...legacyLessonSlugs,
] as const;

export function getLessonBySlug(slug: string) {
  return lessonBlocks.find((lesson) => lesson.slug === slug);
}

export function getLessonNeighbors(slug: string) {
  const index = lessonBlocks.findIndex((lesson) => lesson.slug === slug);

  if (index < 0) {
    return { previous: undefined, next: undefined };
  }

  return {
    previous: index === 0 ? undefined : lessonBlocks[index - 1],
    next: lessonBlocks[index + 1],
  };
}
