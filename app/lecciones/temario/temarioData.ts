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

export interface ExtensionPage {
  slug: string;
  title: string;
  parentSlug: string; // debe existir en lessonBlocks
}

// Antes solo vivían, sin exportar, dentro de branchMap en pasos/page.tsx.
// El href siempre es /lecciones/temario/<slug>, no hace falta guardarlo aparte.
export const extensionPages: ExtensionPage[] = [
  { slug: 'el-sonido-en-la-musica', title: 'El sonido en la música', parentSlug: 'conceptos-basicos' },
  { slug: 'afinacion', title: 'Afinación', parentSlug: 'notacion-musical' },
  { slug: 'tablaturas-dos-cuerdas', title: 'Tablaturas con dos cuerdas', parentSlug: 'tablaturas' },
  { slug: 'mas-punteos-cortos', title: 'Más punteos cortos', parentSlug: 'tablaturas' },
  { slug: 'ampliacion-arpegios', title: 'Ampliación de arpegios', parentSlug: 'arpegios' },
  { slug: 'ejercicios-pentatonica', title: 'Ejercicios de pentatónica', parentSlug: 'pentatonica' },
  { slug: 'ejercicios-pentatonica-avanzados', title: 'Ejercicios avanzados de pentatónica', parentSlug: 'pentatonica' },
  { slug: 'pentatonica-blues', title: 'Pentatónica de blues', parentSlug: 'pentatonica' },
  { slug: 'ejercicios-pentatonica-blues', title: 'Ejercicios de pentatónica de blues', parentSlug: 'pentatonica' },
  { slug: 'escala-completa-sol-mayor', title: 'Escala completa de Sol Mayor', parentSlug: 'escalas' },
  { slug: 'ejercicios-escalas', title: 'Ejercicios de escalas', parentSlug: 'escalas' },
  { slug: 'ejercicios-escalas-avanzados', title: 'Ejercicios avanzados de escalas', parentSlug: 'escalas' },
  { slug: 'acordes-escala-sol-mayor', title: 'Acordes de la escala de Sol Mayor', parentSlug: 'escalas' },
  { slug: 'acordes-con-septima', title: 'Acordes con séptima', parentSlug: 'escalas' },
  { slug: 'modos-griegos', title: 'Modos', parentSlug: 'escalas' },
];

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
