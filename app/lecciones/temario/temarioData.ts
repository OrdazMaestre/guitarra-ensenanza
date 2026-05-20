export const lessonBlocks = [
  { number: 1, title: 'Conceptos basicos', slug: 'conceptos-basicos' },
  { number: 2, title: 'Notacion musical', slug: 'notacion-musical' },
  { number: 3, title: 'Tablaturas', slug: 'tablaturas' },
  { number: 4, title: 'Acordes', slug: 'acordes' },
  { number: 5, title: 'Arpegios', slug: 'arpegios' },
  { number: 6, title: 'Pentatonica', slug: 'pentatonica' },
  { number: 7, title: 'Escalas', slug: 'escalas' },
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
