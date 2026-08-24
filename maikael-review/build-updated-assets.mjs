import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sourceDir = path.resolve('maikael-review/source-assets');
const outDir = path.resolve('maikael-review/updated-assets');

const cyan = '#9ee7f3';
const screen = '#202422';
const line = '#121212';
const joint = '#303333';
const jointHi = '#696f6f';
const gold = '#ee9721';
const cream = '#ffefca';

async function resetOutDir() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  const entries = await fs.readdir(sourceDir);
  await Promise.all(entries.map((entry) => fs.copyFile(path.join(sourceDir, entry), path.join(outDir, entry))));
}

function svgBuffer(body) {
  return Buffer.from(`<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
}

async function composeHead(filename, faceSvg) {
  await sharp(path.join(sourceDir, '01_cabeza.png'))
    .composite([{ input: svgBuffer(faceSvg), top: 0, left: 0 }])
    .png()
    .toFile(path.join(outDir, filename));
}

async function composeTorso() {
  const overlay = `
    <g stroke="${line}" stroke-linecap="round" stroke-linejoin="round">
      <rect x="104" y="38" width="48" height="19" rx="7" fill="${line}" stroke-width="0"/>
      <ellipse cx="128" cy="39" rx="23" ry="9" fill="${gold}" stroke="${line}" stroke-width="3"/>
      <ellipse cx="128" cy="39" rx="15" ry="5" fill="#33241a" stroke="${line}" stroke-width="2"/>

      <rect x="87" y="184" width="82" height="32" rx="9" fill="${gold}" stroke="${line}" stroke-width="3"/>
      <rect x="99" y="190" width="58" height="14" rx="5" fill="${cream}" stroke="${line}" stroke-width="2"/>

      <circle cx="105" cy="219" r="15" fill="${line}" stroke="none"/>
      <circle cx="105" cy="219" r="11" fill="${joint}" stroke="none"/>
      <circle cx="105" cy="219" r="5" fill="${jointHi}" stroke="none"/>

      <circle cx="151" cy="219" r="15" fill="${line}" stroke="none"/>
      <circle cx="151" cy="219" r="11" fill="${joint}" stroke="none"/>
      <circle cx="151" cy="219" r="5" fill="${jointHi}" stroke="none"/>
    </g>`;

  await sharp(path.join(sourceDir, '02_cuerpo.png'))
    .composite([{ input: svgBuffer(overlay), top: 0, left: 0 }])
    .png()
    .toFile(path.join(outDir, '02_cuerpo.png'));
}

// 12_analizando.png .. 15_tema_sensible.png come from a different head
// template than 01_cabeza.png: same overall design but drawn bigger (less
// margin, so the head reads as "cropped" next to 10/11) and, for 14/15, with
// a transparent screen instead of the dark glass 01_cabeza.png/10/11 use.
// To make every expression share one consistent head shell and one screen
// palette, this crops just the screen's icon out of that other template and
// recomposites it onto 01_cabeza.png at the right scale, exactly like
// composeHead() does for 10/11.
const OLD_SCREEN_FULL = { left: 78, top: 119, width: 129, height: 94 };
const NEW_SCREEN = { x0: 89, y0: 92, x1: 192, y1: 182 }; // on 01_cabeza.png
// OLD_SCREEN_FULL's rectangle slightly overshoots the screen's *rounded*
// corners, so a plain rectangular extract pulls in a sliver of the gold/cream
// bezel there — most visible as an exaggerated "glare" in the two top
// corners once pasted onto 01_cabeza.png's own screen. INSET shrinks the
// extract box off the true edge, and CORNER_RADIUS then masks the box itself
// to a rounded rect so no bezel corner survives either.
const INSET = 6;
const CORNER_RADIUS = 14;

async function rehostIcon(srcFile, isDarkBg, outFilename) {
  const OLD_SCREEN = {
    left: OLD_SCREEN_FULL.left + INSET,
    top: OLD_SCREEN_FULL.top + INSET,
    width: OLD_SCREEN_FULL.width - INSET * 2,
    height: OLD_SCREEN_FULL.height - INSET * 2,
  };
  const { data, info } = await sharp(srcFile)
    .extract(OLD_SCREEN)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // 12/13's old screen is an opaque dark glass; drop that fill so only the
  // icon ink survives and the new dark glass (already baked into
  // 01_cabeza.png) shows through instead. 14/15's old screen is already
  // transparent, so isDarkBg is false for those and this is a no-op.
  if (isDarkBg) {
    for (let i = 0; i < width * height; i++) {
      const idx = i * channels;
      if (data[idx] < 55 && data[idx + 1] < 55 && data[idx + 2] < 55) data[idx + 3] = 0;
    }
  }
  let iconBuffer = await sharp(data, { raw: { width, height, channels } }).png().toBuffer();

  const maskSvg = Buffer.from(
    `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="#fff"/></svg>`
  );
  iconBuffer = await sharp(iconBuffer).composite([{ input: maskSvg, blend: 'dest-in' }]).png().toBuffer();

  const targetW = NEW_SCREEN.x1 - NEW_SCREEN.x0;
  const targetH = NEW_SCREEN.y1 - NEW_SCREEN.y0;
  const scale = Math.min(targetW / OLD_SCREEN_FULL.width, targetH / OLD_SCREEN_FULL.height);
  const rw = Math.round(width * scale);
  const rh = Math.round(height * scale);
  const resized = await sharp(iconBuffer).resize(rw, rh, { fit: 'fill' }).toBuffer();
  const fullRw = Math.round(OLD_SCREEN_FULL.width * scale);
  const fullRh = Math.round(OLD_SCREEN_FULL.height * scale);
  const left = NEW_SCREEN.x0 + Math.round((targetW - fullRw) / 2) + Math.round(INSET * scale);
  const top = NEW_SCREEN.y0 + Math.round((targetH - fullRh) / 2) + Math.round(INSET * scale);

  await sharp(path.join(sourceDir, '01_cabeza.png'))
    .composite([{ input: resized, left, top }])
    .png()
    .toFile(path.join(outDir, outFilename));
}

async function writeReadme() {
  const text = `MAIkael - piezas del widget
--------------------------------
Formato: PNG RGBA con fondo transparente.
Lienzo: 256x256 px en TODOS los archivos.
Preparado para escalar aproximadamente a 30-75 px.

CAMBIOS DE ESTA VERSION
- 02_cuerpo.png conserva la base original y ahora incluye cuello, cadera y dos pivotes de rotacion para piernas.
- 10_neutra.png a 15_tema_sensible.png son cabezas completas, sin cuello ni cuerpo.
- Las 6 expresiones comparten ahora la misma cabeza (01_cabeza.png) y la misma pantalla oscura: 12-15 ya no se ven mas recortadas ni con fondo de pantalla distinto que 10-11.
- 10_neutra.png y 11_tocando.png quedan centradas en la pantalla.
- 10_neutra.png reusa la forma de ojo de 14_fuera_de_tema.png sin cejas, con sonrisa pequena y centrada.
- 15_tema_sensible.png usa el trazo grueso del modelo de referencia (en vez del contorno fino original).
- 12_analizando.png usa el diseno de metronomo (trazo uniforme, aguja en forma de bandera) del ultimo modelo de referencia.
- 12, 13 y 14 ya no arrastran un reflejo/brillo dorado en las esquinas superiores de la pantalla (fuga del bisel de su plantilla original).
- El paquete completo mantiene nombres, lienzo, escala, centro y transparencia.

PIEZAS
01 cabeza base
02 cuerpo / torso
03 mano
04 antebrazo
05 biceps
06 pie
07 cana / pantorrilla
08 muslo
09 guitarra acustica

EXPRESIONES DE CABEZA
10 neutra
11 tocando - corchea
12 analizando - metronomo
13 dibujando - lapiz
14 fuera de tema - ceja arqueada
15 tema sensible - simbolo musical de referencia
`;
  await fs.writeFile(path.join(outDir, 'README.txt'), text, 'utf8');
}

await resetOutDir();

await composeTorso();

// source-assets/10_neutra.png and 11_tocando.png are full-body poses, but the
// updated package needs head-only versions (no neck/body) like 12-15, so
// those two still get composed from the bare head + a hand-drawn face.
// The note shape below is shifted from its originally-authored coordinates
// (-4/+11.5) to sit centered on the screen — the original placement drifted
// toward one side. The face reuses 14_fuera_de_tema's eye shape (the same
// oval, mapped through OLD_SCREEN -> NEW_SCREEN below and mirrored for
// symmetry) but drops its eyebrows and swaps its flat mouth for a small
// smile, all centered on the screen.
await composeHead('10_neutra.png', `
  <g fill="${cyan}">
    <ellipse cx="117.7" cy="147" rx="7" ry="12.5"/>
    <ellipse cx="163.3" cy="147" rx="7" ry="12.5"/>
    <path d="M124 165 Q140.5 178 157 165" fill="none" stroke="${cyan}" stroke-width="6.5" stroke-linecap="round"/>
  </g>`);

await composeHead('11_tocando.png', `
  <g fill="${cyan}">
    <rect x="129" y="106.5" width="10" height="53" rx="2"/>
    <rect x="129" y="106.5" width="40" height="11" rx="2"/>
    <rect x="159" y="111.5" width="10" height="35" rx="2"/>
    <ellipse cx="126" cy="157.5" rx="14" ry="11"/>
    <ellipse cx="156" cy="146.5" rx="14" ry="11"/>
  </g>`);

await rehostIcon(path.join(sourceDir, '13_dibujando.png'), true, '13_dibujando.png');
await rehostIcon(path.join(sourceDir, '14_fuera_de_tema.png'), false, '14_fuera_de_tema.png');

// 12_analizando_overlay.png and 15_tema_sensible_overlay.png are pre-made,
// already-positioned icons (traced off reference images the user supplied
// and cached here as plain PNGs) that composite directly onto 01_cabeza.png
// — no OLD_SCREEN/rehostIcon transform needed.
await sharp(path.join(sourceDir, '01_cabeza.png'))
  .composite([{ input: path.join(sourceDir, '12_analizando_overlay.png') }])
  .png()
  .toFile(path.join(outDir, '12_analizando.png'));

await sharp(path.join(sourceDir, '01_cabeza.png'))
  .composite([{ input: path.join(sourceDir, '15_tema_sensible_overlay.png') }])
  .png()
  .toFile(path.join(outDir, '15_tema_sensible.png'));

await writeReadme();
console.log(outDir);
