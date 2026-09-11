import { extensionPages, lessonBlocks } from '../lecciones/temario/temarioData';
import { normalizeEs, pluralOf } from './maikaelExpression';
import { MAIKAEL_VIDEOS, type VideoEntry } from './maikaelVideoIndex';

interface PageCuration {
  keywords: string[]; // en singular normal; el plural regular se genera solo
  summary: string; // 1-2 frases
}

// Curación a mano, igual que antes lo era el árbol de texto plano en
// maikaelPrompt.ts — una entrada por cada slug real de temarioData.ts
// (lessonBlocks + extensionPages). buildPageIndex() revienta si falta o
// sobra una entrada aquí, para no desincronizarse en silencio.
const PAGE_CURATION: Record<string, PageCuration> = {
  'conceptos-basicos': { keywords: ['tono', 'semitono', 'agudo', 'grave', 'basico'], summary: 'Explica tono/semitono y agudo/grave: la base para entender todo lo demás.' },
  'el-sonido-en-la-musica': { keywords: ['sonido', 'onda', 'armonico', 'acustica'], summary: 'Cómo es una onda de sonido y por qué cada instrumento suena distinto.' },
  'notacion-musical': { keywords: ['nota', 'solfeo', 'do re mi'], summary: 'Los nombres de las notas musicales (do, re, mi...) y cómo se escriben.' },
  afinacion: { keywords: ['afinar', 'afino', 'afinas', 'afinacion', 'afinador'], summary: 'Cómo afinar la guitarra en estándar, cuerda a cuerda.' },
  tablaturas: { keywords: ['tablatura', 'tab', 'cumpleanos'], summary: 'Cómo leer una tablatura, con Cumpleaños Feliz de ejemplo.' },
  'tablaturas-dos-cuerdas': { keywords: ['dos cuerdas', 'feliz navidad', 'halloween'], summary: 'Tablaturas con dos cuerdas a la vez: Feliz Navidad y un vídeo de Halloween.' },
  'mas-punteos-cortos': { keywords: ['punteo', 'acdc', 'red hot', 'mana', 'thunderstruck'], summary: 'Punteos cortos de canciones conocidas: AC/DC, Red Hot Chili Peppers, Maná y más.' },
  acordes: { keywords: ['acorde', 'power chord'], summary: 'Acordes mayores y menores básicos, y power chords.' },
  'let-it-be-con-acordes': { keywords: ['let it be', 'beatles'], summary: 'Let It Be en 3 partes (versos, estribillo, final) con tablatura y acordes; enlaza la canción completa y un tutorial.' },
  'figuras-de-acordes': { keywords: ['figura'], summary: 'Figuras de los acordes mayores, para memorizar la forma de la mano.' },
  arpegios: { keywords: ['arpegio'], summary: 'Arpegios simples, nota a nota en vez de rasgueo.' },
  'ampliacion-arpegios': { keywords: ['triada', 'cuatriada'], summary: 'Arpegios más avanzados: en tríada y en cuatríada.' },
  pentatonica: { keywords: ['pentatonica'], summary: 'La escala pentatónica mayor y menor, base para improvisar.' },
  'ejercicios-pentatonica': { keywords: ['ejercicio pentatonica', 'figuras pentatonica'], summary: '5 figuras de la pentatónica para practicar.' },
  'ejercicios-pentatonica-avanzados': { keywords: ['patron pentatonica', 'avanzado pentatonica'], summary: 'Patrones más avanzados sobre la pentatónica.' },
  'pentatonica-blues': {
    // Cada músico nombrado en el resumen tiene que estar también aquí — si
    // no, preguntar por su nombre a secas ("¿dónde se habla de Hendrix?")
    // nunca encuentra la página, aunque el resumen sí lo mencione (fallo
    // real detectado por Ordaz: el resumen tenía el dato, pero nada
    // disparaba la recuperación de esta página para esa pregunta).
    keywords: [
      'blues',
      'bach',
      'handy',
      'johnson',
      'armstrong',
      'ellington',
      'berry',
      'elvis',
      'beatles',
      'hendrix',
      'gesualdo',
      'scarlatti',
      'debussy',
      'stravinsky',
    ],
    summary:
      'Línea del tiempo con vídeos: música clásica (Bach), blues (W. C. Handy, Robert Johnson), jazz (Louis Armstrong, Duke Ellington), rock (Chuck Berry, Elvis Presley, Los Beatles, Jimi Hendrix); también precursores como Gesualdo, Scarlatti, Debussy y Stravinsky. Al final, banda de blues/rock con guitarra, bajo y batería.',
  },
  'ejercicios-pentatonica-blues': { keywords: ['lick', 'blues'], summary: 'Figuras y un lick de blues para practicar sobre la pentatónica de blues.' },
  escalas: { keywords: ['escala'], summary: 'Tonos y semitonos aplicados a las escalas mayor y menor.' },
  'escala-completa-sol-mayor': { keywords: ['sol mayor', 'escala completa'], summary: 'La escala de Sol Mayor completa, con todos sus patrones.' },
  'ejercicios-escalas': { keywords: ['ejercicio escala', 'figuras escala'], summary: '5 figuras de escalas para practicar.' },
  'ejercicios-escalas-avanzados': { keywords: ['patron escala', 'avanzado escalas'], summary: 'Patrones de escalas más avanzados.' },
  'acordes-escala-sol-mayor': { keywords: ['acordes de la escala', 'armonizacion'], summary: 'Los 7 acordes que salen de armonizar la escala de Sol Mayor.' },
  'acordes-con-septima': { keywords: ['septima'], summary: 'Acordes con séptima (cuatríadas) sobre la escala de Sol Mayor.' },
  'modos-griegos': { keywords: ['modo', 'dorico', 'frigio', 'lidio', 'mixolidio'], summary: 'Introducción a los modos griegos, con vídeos para empezar.' },
  'funciones-tonales': { keywords: ['funcion tonal', 'tonica', 'dominante', 'subdominante'], summary: 'Funciones tonales (tónica, dominante...); tema todavía en desarrollo.' },
};

export interface MaikaelPageEntry {
  slug: string;
  title: string;
  parentSlug: string | null;
  number: number | null;
  keywords: string[]; // ya normalizadas + plural expandido
  summary: string;
}

function expandKeyword(raw: string): string[] {
  const normalized = normalizeEs(raw);
  if (normalized.includes(' ')) return [normalized]; // las frases no se pluralizan
  return [normalized, normalizeEs(pluralOf(raw))];
}

function curationFor(slug: string): Pick<MaikaelPageEntry, 'keywords' | 'summary'> {
  const curation = PAGE_CURATION[slug];
  if (!curation) {
    // Guarda de sincronización: si se añade un slug a temarioData.ts y nadie
    // lo cura aquí, esto revienta fuerte en vez de servir un índice incompleto.
    throw new Error(`maikaelPageIndex: falta curación para el slug "${slug}"`);
  }
  return { keywords: curation.keywords.flatMap(expandKeyword), summary: curation.summary };
}

function buildPageIndex(): MaikaelPageEntry[] {
  const primary = lessonBlocks.map((l) => ({
    slug: l.slug,
    title: l.title,
    parentSlug: null as string | null,
    number: l.number as number | null,
    ...curationFor(l.slug),
  }));
  const secondary = extensionPages.map((p) => ({
    slug: p.slug,
    title: p.title,
    parentSlug: p.parentSlug as string | null,
    number: null as number | null,
    ...curationFor(p.slug),
  }));
  const index = [...primary, ...secondary];

  // Guarda inversa: si sobra una entrada en PAGE_CURATION que ya no existe
  // en temarioData.ts (página borrada/renombrada), también revienta.
  const realSlugs = new Set(index.map((p) => p.slug));
  for (const slug of Object.keys(PAGE_CURATION)) {
    if (!realSlugs.has(slug)) throw new Error(`maikaelPageIndex: "${slug}" en PAGE_CURATION ya no existe en temarioData.ts`);
  }
  return index;
}

export const MAIKAEL_PAGE_INDEX: MaikaelPageEntry[] = buildPageIndex();

// --- Matching barato, determinista, sin LLM ---

export interface MaikaelPageMatch {
  slug: string;
  title: string;
  summary: string;
  score: number;
}

const MAX_MATCHES = 2;
const MIN_SCORE = 1;

export function matchPagesForMessage(text: string, max = MAX_MATCHES): MaikaelPageMatch[] {
  const normalized = normalizeEs(text);
  const tokens = new Set(normalized.split(/[^a-z]+/).filter(Boolean));

  return MAIKAEL_PAGE_INDEX.map((page) => {
    let score = 0;
    for (const keyword of page.keywords) {
      if (keyword.includes(' ')) {
        if (normalized.includes(keyword)) score += 2; // frase completa: más peso
      } else if (tokens.has(keyword)) {
        score += 1;
      }
    }
    return { slug: page.slug, title: page.title, summary: page.summary, score };
  })
    .filter((p) => p.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

// --- Secretos reales del sitio (easter eggs) ---
// A propósito, NUNCA se mezclan con el matching normal de páginas de arriba:
// solo se revelan si el propio mensaje del alumno ya contiene una palabra de
// "pregunta directa" (secreto/escondido/oculto...). La comprobación de "solo
// si preguntan directamente" la hace este código, no el criterio del
// modelo — probado en real que gpt-oss-20b con reasoning_effort:'low' NO es
// fiable respetando esa condición cuando el dato ya está en su contexto por
// otra vía: con el secreto metido en el resumen normal de la página (con
// instrucción "cuéntaselo solo si preguntan directamente" incluida en el
// propio texto), lo mencionó igualmente ante un simple "cuéntame sobre Let
// It Be". Al mover el secreto a esta lista aparte, el gatillo es el propio
// mensaje del alumno, así que si no está la palabra, el texto ni siquiera
// llega al modelo — no hay nada que "olvidar" de callar.
interface SecretEntry {
  triggerWords: string[]; // normalizadas (normalizeEs), buscadas como substring
  text: string;
}

const SECRETS: SecretEntry[] = [
  {
    triggerWords: ['secreto', 'secretos', 'escondid', 'ocult', 'sorpresa', 'easter egg'],
    text: 'Hay un enlace secreto real en la web: en la lección "Let It Be con acordes" (/lecciones/temario/let-it-be-con-acordes), en la sección de Versos, una de las rayas "|" entre acordes esconde un enlace a una canción de prueba secreta (/lecciones/prueba).',
  },
];

export function matchSecrets(text: string): string[] {
  const normalized = normalizeEs(text);
  return SECRETS.filter((s) => s.triggerWords.some((w) => normalized.includes(w))).map((s) => s.text);
}

// --- Vídeos reales del temario (generado, ver maikaelVideoIndex.ts) ---
// app/lib/maikaelVideoIndex.ts lo regenera scripts/generate-video-index.mjs
// consultando el oEmbed público de YouTube (título + canal reales) — así no
// hace falta transcribir a mano de qué canal es cada vídeo, ni arriesgarse a
// que se escape uno (pasó con los vídeos de Jaime Altozano en 3 lecciones
// que el resumen curado a mano no cubría).
const MAX_VIDEO_MATCHES = 4; // Jaime Altozano aparece en 4 lecciones distintas — es el caso real más numeroso hoy
// Palabras demasiado comunes para contar como coincidencia real de título.
const TITLE_STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'un', 'una', 'con', 'the', 'and', 'of', 'to',
]);

function significantWords(text: string): Set<string> {
  const normalized = normalizeEs(text);
  const words = normalized.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !TITLE_STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Encuentra vídeos por canal (p. ej. "vídeos de Jaime Altozano") o por
 * coincidencia de al menos 2 palabras significativas del título real (p. ej.
 * "la canción Johnny B. Goode").
 */
export function matchVideos(text: string, max = MAX_VIDEO_MATCHES): VideoEntry[] {
  const normalized = normalizeEs(text);
  const messageWords = significantWords(text);

  return MAIKAEL_VIDEOS.filter((v) => {
    if (normalized.includes(normalizeEs(v.channel))) return true;
    const titleWords = significantWords(v.title);
    let overlap = 0;
    for (const w of titleWords) if (messageWords.has(w)) overlap++;
    return overlap >= 2;
  }).slice(0, max);
}

const TEMARIO_PATH_RE = /^\/lecciones\/temario\/([a-z0-9-]+)\/?$/;

/**
 * Resuelve la ruta actual del navegador (mandada por MaikaelChat en cada
 * mensaje, ver route.ts) a su entrada real del índice — así MAIkael sabe en
 * todo momento en qué lección está el alumno, sin necesidad de que lo diga
 * él mismo ni de adivinarlo por palabras clave. `null` si la ruta no es una
 * página de lección conocida (portada, /pasos, etc.) — en ese caso no se
 * añade nada, no tiene sentido fingir una página actual.
 */
export function resolveCurrentPage(pathname: string | undefined | null): MaikaelPageEntry | null {
  if (!pathname) return null;
  const match = pathname.match(TEMARIO_PATH_RE);
  if (!match) return null;
  return MAIKAEL_PAGE_INDEX.find((p) => p.slug === match[1]) ?? null;
}

export function buildPageContextMessage(
  matches: MaikaelPageMatch[],
  secrets: string[] = [],
  videos: VideoEntry[] = [],
  currentPage: MaikaelPageEntry | null = null
): string | null {
  const lines: string[] = [];
  if (currentPage) {
    lines.push(`PÁGINA ACTUAL: "${currentPage.title}" (/lecciones/temario/${currentPage.slug})`);
  }
  // Si la página que ibas a recomendar es justo la actual, se lo decimos
  // aquí mismo en vez de confiar en que el modelo conecte las dos líneas por
  // su cuenta — probado que no lo hace de forma fiable (reasoning_effort
  // bajo): con ambos datos en su contexto, repitió el enlace igualmente en
  // vez de avisar que el alumno ya estaba ahí.
  lines.push(
    ...matches.map((m) =>
      m.slug === currentPage?.slug
        ? `${m.title} (/lecciones/temario/${m.slug}): ${m.summary} — EL ALUMNO YA ESTÁ EN ESTA PÁGINA, dile eso en vez de recomendársela.`
        : `${m.title} (/lecciones/temario/${m.slug}): ${m.summary}`
    )
  );
  if (videos.length > 0) {
    lines.push(
      ...videos.map(
        (v) => `VÍDEO real en /lecciones/temario/${v.slug}: "${v.title}" — canal ${v.channel} (${v.url})`
      )
    );
  }
  if (secrets.length > 0) {
    lines.push(...secrets.map((s) => `SECRETO (el alumno ya preguntó directamente por algo oculto, así que puedes contarlo): ${s}`));
  }
  if (lines.length === 0) return null;
  return `CONTEXTO EXTRA:\n${lines.join('\n')}`;
}

// Índice mínimo (solo slugs, sin resumen) para que el prompt base siga
// pudiendo nombrar cualquier lección aunque no haya match de palabras clave.
export function buildMinimalIndexBlock(): string {
  const lines: string[] = [];
  for (const page of MAIKAEL_PAGE_INDEX) {
    if (page.parentSlug) continue;
    lines.push(`${page.number} ${page.slug}`);
    for (const child of MAIKAEL_PAGE_INDEX) {
      if (child.parentSlug === page.slug) lines.push(`  ↳ ${child.slug}`);
    }
  }
  return lines.join('\n');
}
