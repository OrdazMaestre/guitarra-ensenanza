import { extensionPages } from './temarioData';

// Datos del árbol del temario que pinta /lecciones/temario/pasos.
// Antes vivían dentro de pasos/page.tsx.

export type BranchItem = {
  title: string;
  href: string;
  secondaryTarget?: 'harmony' | 'sevenths';
};

// secondaryTarget es puramente visual (flechas del mapa) para las 2 ramas que
// lo necesitan — no vive en extensionPages porque no aporta nada fuera del mapa.
const SECONDARY_TARGETS: Partial<Record<string, BranchItem['secondaryTarget']>> = {
  'acordes-escala-sol-mayor': 'harmony',
  'acordes-con-septima': 'sevenths',
};

// Derivado de extensionPages (temarioData.ts), la fuente única de las páginas rama.
//
// El quiz (/lecciones/temario/quiz) se deja fuera A PROPÓSITO de este árbol: no es una rama de
// una lección concreta (no tiene un parentSlug real), es una utilidad transversal accesible desde
// el botón QUIZ de CUALQUIER lección vía quizHref. Incluirlo aquí rompería la lectura del árbol
// como "de qué lección cuelga qué".
export const branchMap: Record<string, BranchItem[]> = extensionPages.reduce(
  (acc, page) => {
    (acc[page.parentSlug] ??= []).push({
      title: page.title,
      href: `/lecciones/temario/${page.slug}`,
      secondaryTarget: SECONDARY_TARGETS[page.slug],
    });
    return acc;
  },
  {} as Record<string, BranchItem[]>
);

// Origen y destino principal de las flechas "secundarias" (acordes → figuras de acordes).
export const SECONDARY_SOURCE_SLUG = 'acordes';
export const SECONDARY_MAIN_TARGET_SLUG = 'figuras-de-acordes';

export const lessonToneClasses = [
  'tone-emerald',
  'tone-red',
  'tone-zinc',
  'tone-amber',
  'tone-emerald',
  'tone-red',
  'tone-zinc',
  'tone-amber',
  'tone-emerald',
  'tone-red',
];
