import { normalizeEs } from './maikaelExpression';
import { MAIKAEL_PAGE_INDEX } from './maikaelPageIndex';

// Páginas que salen en el buscador global (SiteSearch). Se calcula en el SERVIDOR (layout.tsx y la
// portada la pasan como prop) para que el índice de MAIkael, que arrastra el de vídeos, no entre en
// el bundle de cada página. Las lecciones y sus ampliaciones vienen de MAIKAEL_PAGE_INDEX (título +
// palabras clave ya normalizadas, sincronizado con temarioData.ts); a mano solo las tres páginas
// que no son lección. Fuera a propósito (decisión del usuario): la página oculta del "|" de Let It
// Be (/lecciones/prueba), el quiz, /sala/* y dev-preview-*.
export interface SiteSearchEntry {
  title: string;
  href: string;
  terms: string[]; // normalizados (minúsculas, sin acentos)
}

const EXTRA_PAGES: { title: string; href: string; keywords: string[] }[] = [
  { title: 'Portada', href: '/lecciones/temario', keywords: ['inicio', 'portada', 'principio'] },
  { title: 'Temario', href: '/lecciones/temario/pasos', keywords: ['temario', 'arbol', 'todo', 'indice', 'pasos'] },
  {
    title: 'Sala de pruebas',
    href: '/lecciones/temario/sala-de-pruebas',
    keywords: ['pruebas', 'mastil', 'teclado', 'afinar', 'juego', 'jugar'],
  },
];

export const SITE_SEARCH_ENTRIES: SiteSearchEntry[] = [
  ...MAIKAEL_PAGE_INDEX.map((page) => ({
    title: page.title,
    href: `/lecciones/temario/${page.slug}`,
    terms: [normalizeEs(page.title), ...page.keywords],
  })),
  ...EXTRA_PAGES.map((page) => ({
    title: page.title,
    href: page.href,
    terms: [normalizeEs(page.title), ...page.keywords.map(normalizeEs)],
  })),
].sort((a, b) => a.title.localeCompare(b.title, 'es'));
