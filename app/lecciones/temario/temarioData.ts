export const lessonBlocks = [
  { number: 1, title: 'Conceptos basicos', slug: 'conceptos-basicos' },
  { number: 2, title: 'Notacion musical', slug: 'notacion-musical' },
  { number: 3, title: 'Afinacion', slug: 'afinacion' },
  { number: 4, title: 'Tablaturas', slug: 'tablaturas' },
  { number: 5, title: 'Acordes', slug: 'acordes' },
  { number: 6, title: 'Let It Be con acordes', slug: 'let-it-be-con-acordes' },
  { number: 7, title: 'Arpegios', slug: 'arpegios' },
  { number: 8, title: 'Figuras de acordes', slug: 'figuras-de-acordes' },
  { number: 9, title: 'Pentatonica', slug: 'pentatonica' },
  { number: 10, title: 'Escalas', slug: 'escalas' },
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
