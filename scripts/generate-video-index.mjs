// Extrae todos los enlaces de YouTube del temario y consulta su título y
// canal reales vía el endpoint público oEmbed de YouTube (sin API key).
// Genera app/lib/maikaelVideoIndex.ts — así MAIkael conoce el canal/título
// real de cada vídeo sin que haya que transcribirlo a mano (y sin arriesgarse
// a que se escape uno, como pasó con los vídeos de Jaime Altozano).
//
// Uso: node scripts/generate-video-index.mjs
// Volver a ejecutar cada vez que se añada/quite un enlace de YouTube en el
// temario.

import { readFileSync, writeFileSync } from 'node:fs';

const YOUTUBE_URL_RE = /href="(https:\/\/(?:www\.)?youtube\.com\/(?:watch\?v=|shorts\/)[^"]+|https:\/\/youtu\.be\/[^"]+)"/g;
const SLUG_MARKER_RE = /if\s*\(\s*slug\s*===\s*'([a-z0-9-]+)'\s*\)/;

// Archivos con su propio slug fijo (una lección = un archivo).
const FIXED_SLUG_FILES = {
  'app/lecciones/temario/el-sonido-en-la-musica/page.tsx': 'el-sonido-en-la-musica',
  'app/lecciones/temario/mas-punteos-cortos/page.tsx': 'mas-punteos-cortos',
  'app/lecciones/temario/_lesson-pages/EscalasPage.tsx': 'escalas',
  'app/lecciones/temario/_lesson-pages/LetItBeConAcordesPage.tsx': 'let-it-be-con-acordes',
  'app/lecciones/temario/_lesson-pages/PentatonicaBluesPage.tsx': 'pentatonica-blues',
  'app/lecciones/temario/_lesson-pages/TablaturasDosCuerdasPage.tsx': 'tablaturas-dos-cuerdas',
  'app/lecciones/temario/_lesson-pages/TablaturasPage.tsx': 'tablaturas',
};

// [slug]/page.tsx es un router con varios `if (slug === '...')`: cada enlace
// pertenece al bloque más cercano por encima.
function extractFromRouter(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  let currentSlug = null;
  const found = [];
  for (const line of lines) {
    const slugMatch = line.match(SLUG_MARKER_RE);
    if (slugMatch) currentSlug = slugMatch[1];
    for (const m of line.matchAll(YOUTUBE_URL_RE)) {
      if (currentSlug) found.push({ slug: currentSlug, url: m[1] });
    }
  }
  return found;
}

function extractFixed(path, slug) {
  const content = readFileSync(path, 'utf8');
  return [...content.matchAll(YOUTUBE_URL_RE)].map((m) => ({ slug, url: m[1] }));
}

async function main() {
  let entries = [];
  for (const [path, slug] of Object.entries(FIXED_SLUG_FILES)) {
    entries.push(...extractFixed(path, slug));
  }
  entries.push(...extractFromRouter('app/lecciones/temario/[slug]/page.tsx'));

  // Dedup por (slug, url) — la misma lección no repite el mismo vídeo dos veces.
  const seen = new Set();
  entries = entries.filter((e) => {
    const key = `${e.slug}::${e.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Encontrados ${entries.length} enlaces de YouTube en ${Object.keys(FIXED_SLUG_FILES).length + 1} archivos.`);

  const results = [];
  for (const { slug, url } of entries) {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (!res.ok) {
        console.warn(`  ! oEmbed ${res.status} para ${url} (slug ${slug}) — se omite`);
        continue;
      }
      const data = await res.json();
      results.push({ slug, url, title: data.title, channel: data.author_name });
      console.log(`  ok  [${slug}] ${data.author_name} — ${data.title}`);
    } catch (err) {
      console.warn(`  ! error de red para ${url} (slug ${slug}): ${err.message} — se omite`);
    }
  }

  const body = results
    .map(
      (r) =>
        `  { slug: ${JSON.stringify(r.slug)}, url: ${JSON.stringify(r.url)}, title: ${JSON.stringify(r.title)}, channel: ${JSON.stringify(r.channel)} },`
    )
    .join('\n');

  const output = `// GENERADO por scripts/generate-video-index.mjs — no editar a mano.
// Vuelve a ejecutar el script si se añade o quita un enlace de YouTube en el
// temario, para que este archivo no se desincronice.

export interface VideoEntry {
  slug: string;
  url: string;
  title: string;
  channel: string;
}

export const MAIKAEL_VIDEOS: VideoEntry[] = [
${body}
];
`;

  writeFileSync('app/lib/maikaelVideoIndex.ts', output, 'utf8');
  console.log(`\nEscrito app/lib/maikaelVideoIndex.ts con ${results.length} vídeos.`);
}

main();
