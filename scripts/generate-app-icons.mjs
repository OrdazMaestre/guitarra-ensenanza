// Genera todos los iconos de la web y de la app instalada (PWA "Riffcademy") desde
// scripts/assets/logo-source.png, el logo original. Ese PNG venía mal recortado: el cuadrado negro
// cortado por arriba a la izquierda, el dibujo ~2 % desplazado a la izquierda y las baquetas tocando
// los bordes, así que Android (que recorta con su propia máscara) lo enseñaba descentrado.
//
// Aquí se extrae solo el dibujo blanco (por luminancia) y se compone centrado sobre un cuadrado
// negro a sangre:
// - Android e iOS: el punto blanco más lejano del centro a ≤ 40 % del lado (zona segura de los
//   iconos "maskable": ninguna máscara, círculo o squircle, corta las baquetas).
// - Favicons: el dibujo ocupa ~92 % del cuadrado (la pestaña no recorta y a 16 px cada píxel cuenta).
// - app/favicon.ico: ICO con los PNG de 16/32/48 dentro (sharp no exporta ICO).
//
// Uso: node scripts/generate-app-icons.mjs
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SOURCE = 'scripts/assets/logo-source.png';
// 39 % y no 40 %: margen para el redondeo de píxeles y el suavizado de bordes en los tamaños pequeños.
const SAFE_RADIUS = 0.39;
const FAVICON_FILL = 0.92;

const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

// Máscara del dibujo blanco (0–255): luminancia × alfa, quitando el gris muy oscuro del cuadrado
// original (no era negro puro y dejaba su contorno marcado sobre el negro nuevo).
const DARK_CUTOFF = 48;
const mask = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  const [r, g, b, a] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
  const lum = ((0.2126 * r + 0.7152 * g + 0.0722 * b) * a) / 255;
  mask[i] = Math.round(Math.max(0, Math.min(255, ((lum - DARK_CUTOFF) * 255) / (255 - DARK_CUTOFF))));
}

let x0 = W, x1 = -1, y0 = H, y1 = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (mask[y * W + x] > 64) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
}
const cx = (x0 + x1 + 1) / 2;
const cy = (y0 + y1 + 1) / 2;
let maxR = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (mask[y * W + x] > 64) maxR = Math.max(maxR, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
}
const halfBox = Math.max(x1 + 1 - x0, y1 + 1 - y0) / 2;
console.log(`dibujo: caja ${x0}-${x1} × ${y0}-${y1}, centro (${cx}, ${cy}), radio máx ${maxR.toFixed(1)}`);

// Cuadrado de la máscara centrado en el dibujo, rellenado con 0 fuera de la imagen.
const half = Math.ceil(maxR) + 2;
const side = half * 2;
const square = Buffer.alloc(side * side);
for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
  const sx = Math.round(cx - half + x);
  const sy = Math.round(cy - half + y);
  if (sx >= 0 && sx < W && sy >= 0 && sy < H) square[y * side + x] = mask[sy * W + sx];
}

async function icon(size, scale) {
  // Lado del dibujo escalado, con la misma paridad que el icono para que quede centrado al píxel.
  let art = Math.round(side * scale);
  if ((size - art) % 2) art += 1;
  const alpha = await sharp(square, { raw: { width: side, height: side, channels: 1 } })
    .resize(art, art, { kernel: 'lanczos3' })
    .extractChannel(0)
    .raw()
    .toBuffer();
  const rgba = Buffer.alloc(art * art * 4, 255);
  for (let i = 0; i < art * art; i++) rgba[i * 4 + 3] = alpha[i];
  const offset = (size - art) / 2;
  const crop = offset < 0 ? -offset : 0;
  const layer = crop
    ? await sharp(rgba, { raw: { width: art, height: art, channels: 4 } }).extract({ left: crop, top: crop, width: size, height: size }).raw().toBuffer()
    : rgba;
  return sharp({ create: { width: size, height: size, channels: 4, background: '#000000' } })
    .composite([{ input: layer, raw: { width: crop ? size : art, height: crop ? size : art, channels: 4 }, left: Math.max(0, offset), top: Math.max(0, offset) }])
    .flatten({ background: '#000000' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const safe = (size) => icon(size, (SAFE_RADIUS * size) / maxR);
const favicon = (size) => icon(size, (FAVICON_FILL * size) / 2 / halfBox);

const outputs = {
  'public/android-chrome-192x192.png': await safe(192),
  'public/android-chrome-512x512.png': await safe(512),
  'public/apple-touch-icon.png': await safe(180),
  'app/apple-icon.png': await safe(180),
  'public/favicon-16x16.png': await favicon(16),
  'public/favicon-32x32.png': await favicon(32),
  'public/favicon-48x48.png': await favicon(48),
};
for (const [path, png] of Object.entries(outputs)) writeFileSync(path, png);

// ICO con PNG dentro: cabecera (6 bytes) + una entrada de 16 bytes por imagen + los PNG.
const icoImages = [16, 32, 48].map((s) => [s, outputs[`public/favicon-${s}x${s}.png`]]);
const header = Buffer.alloc(6 + 16 * icoImages.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoImages.length, 4);
let offset = header.length;
icoImages.forEach(([s, png], i) => {
  const at = 6 + i * 16;
  header.writeUInt8(s, at);
  header.writeUInt8(s, at + 1);
  header.writeUInt8(0, at + 2);
  header.writeUInt8(0, at + 3);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(png.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += png.length;
});
writeFileSync('app/favicon.ico', Buffer.concat([header, ...icoImages.map(([, png]) => png)]));
console.log('iconos generados');
