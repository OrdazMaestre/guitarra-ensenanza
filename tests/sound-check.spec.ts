import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { defaultMixSettings, exportMix, getMixSettings, importMix, resetMix, setMixEq, setMixVolume } from '../app/lib/soundCheck';

// MESA DE PRUEBA DE SONIDO (usuario, 2026-11-19): valores por instrumento en sus 3 volúmenes (normal, fondo,
// fallo), con EQ y fader, Solo, memoria del dispositivo y exportar/importar. Se abre desde Pistas sin partida.
test.use({ hasTouch: false });

test('mesa: valores por defecto, topes, exportar e importar', () => {
  resetMix(['guitar', 'bass', 'kick']);
  expect(getMixSettings().bass).toEqual(defaultMixSettings().bass);
  setMixVolume('bass', 'fondo', 5);
  expect(getMixSettings().bass.fondo.volume).toBe(2);
  setMixEq('bass', 'fallo', 'low', -99);
  expect(getMixSettings().bass.fallo.eq.low).toBe(-40);
  setMixVolume('bass', 'normal', 0.7);
  const file = exportMix(['bass']);
  resetMix(['bass']);
  expect(getMixSettings().bass.normal.volume).toBe(1);
  expect(importMix(file)).toEqual(['bass']);
  expect(getMixSettings().bass.normal.volume).toBe(0.7);
  expect(getMixSettings().bass.fondo.volume).toBe(2);
  // Archivos malos: nada cambia.
  expect(importMix('no es json')).toEqual([]);
  expect(importMix(JSON.stringify({ version: 9, targets: {} }))).toEqual([]);
  expect(importMix(JSON.stringify({ version: 1, targets: { bass: { normal: { volume: 'x' } } } }))).toEqual([]);
  resetMix(['bass']);
});

const URL = '/lecciones/temario/sala-de-pruebas';

async function openGame(page: Page) {
  const neck = page.locator('.test-room-fretboard');
  await neck.scrollIntoViewIfNeeded();
  const jugar = neck.locator('.riff-open-toggle');
  await expect(async () => {
    if ((await jugar.getAttribute('aria-pressed')) !== 'true') await jugar.click();
    await expect(neck.locator('.riff-panel')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30000 });
  await expect(neck.locator('.riff-dd-toggle', { hasText: 'Pistas' })).toBeVisible({ timeout: 20000 });
}

async function openDesk(page: Page, name: RegExp) {
  const neck = page.locator('.test-room-fretboard');
  await neck.locator('.riff-dd-toggle', { hasText: 'Pistas' }).click();
  await neck.locator('.riff-dd-menu').getByRole('button', { name }).first().click();
  await expect(neck.locator('.sound-check-desk')).toBeVisible();
}

const level = (page: Page, target: string, context: string) =>
  page.evaluate(([t, c]) => (window as unknown as { __riffMix?: { level: (t: string, c: string) => number | null } }).__riffMix?.level(t, c) ?? null, [target, context]);

test('mesa en Riff-Hero: suena sin partida, Solo en Normal, faders recordados, exportar/importar y batería por piezas', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const neck = page.locator('.test-room-fretboard');
  await openDesk(page, /^Mesa de sonido: Guitarra/);
  const desk = neck.locator('.sound-check-desk');
  // Suena la canción, pero no hay partida.
  await expect(desk).toHaveAttribute('data-status', /countin|playing/, { timeout: 20000 });
  await expect(neck.locator('.riff-stage')).toHaveAttribute('data-status', 'idle');
  // Solo en Normal al abrir: fondo y fallo callados.
  await expect(desk.getByRole('button', { name: 'Solo Guitarra Normal' })).toHaveAttribute('aria-pressed', 'true');
  // (Black Gilmur empieza con bajo y batería: el bus de la guitarra aparece cuando entra la guitarra.)
  await expect.poll(() => level(page, 'guitar', 'fondo'), { timeout: 30000 }).toBe(0);
  expect(await level(page, 'guitar', 'normal')).toBe(1);
  await desk.getByRole('button', { name: 'Solo Guitarra Fondo' }).click();
  await expect.poll(() => level(page, 'guitar', 'fondo')).toBe(1);
  expect(await level(page, 'guitar', 'normal')).toBe(0);
  // Fader de Fondo al 150 %: el bus sube.
  await desk.getByRole('slider', { name: 'Volumen de Guitarra Fondo' }).fill('1.5');
  await expect.poll(() => level(page, 'guitar', 'fondo')).toBe(1.5);
  // Exportar descarga un JSON con ese valor.
  const download = page.waitForEvent('download');
  await desk.getByRole('button', { name: 'Exportar' }).click();
  const path = await (await download).path();
  const exported = JSON.parse(readFileSync(path!, 'utf8'));
  expect(exported.targets.guitar.fondo.volume).toBe(1.5);
  // Restablecer y volver a importarlo.
  await desk.getByRole('button', { name: 'Restablecer' }).click();
  await expect(desk.getByRole('slider', { name: 'Volumen de Guitarra Fondo' })).toHaveValue('1');
  await page.getByTestId('sound-check-import').setInputFiles({ name: 'mesa.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(desk.getByRole('slider', { name: 'Volumen de Guitarra Fondo' })).toHaveValue('1.5');
  await expect(desk.locator('.sound-check-notice')).toContainText('Guitarra');
  // Cerrar: vuelve el panel.
  await desk.getByRole('button', { name: 'Cerrar la mesa' }).click();
  await expect(desk).toHaveCount(0);
  await expect(neck.locator('.riff-panel')).toBeVisible();
  // Al recargar, se recuerda; y la batería va por piezas (empieza en el bombo).
  await page.reload();
  await openGame(page);
  await openDesk(page, /^Mesa de sonido: Guitarra/);
  await expect(neck.getByRole('slider', { name: 'Volumen de Guitarra Fondo' })).toHaveValue('1.5');
  await neck.getByRole('button', { name: 'Restablecer' }).click();
  await neck.getByRole('button', { name: 'Cerrar la mesa' }).click();
  await openDesk(page, /^Mesa de sonido: Batería/);
  const pieces = neck.getByRole('group', { name: 'Pieza de la batería' });
  await expect(pieces.getByRole('button')).toHaveText(['Bombo', 'Caja', 'Toms', 'Plato', 'Plato fuerte']);
  await expect(pieces.getByRole('button', { name: 'Bombo' })).toHaveAttribute('aria-pressed', 'true');
  await pieces.getByRole('button', { name: 'Caja' }).click();
  await expect(neck.getByRole('button', { name: 'Solo Caja Normal' })).toHaveAttribute('aria-pressed', 'true');
});

test('mesa: sin desbordamiento en el móvil', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(URL);
  await openGame(page);
  await openDesk(page, /^Mesa de sonido: Guitarra/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('mesa por defecto: el bus (EQ a 0 dB, 100 %) no cambia el sonido', async ({ page }) => {
  await page.goto('about:blank');
  const diff = await page.evaluate(async () => {
    const rate = 48000;
    const render = async (withBus: boolean) => {
      const ctx = new OfflineAudioContext(1, rate, rate);
      const buffer = ctx.createBuffer(1, rate, rate);
      const data = buffer.getChannelData(0);
      let seed = 7;
      for (let i = 0; i < data.length; i += 1) {
        seed = (seed * 16807) % 2147483647;
        data[i] = (seed / 2147483647 - 0.5) * 0.8;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      if (withBus) {
        // La misma cadena que getMixBus en guitarAudioEngine.ts.
        const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200; low.gain.value = 0;
        const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.8; mid.gain.value = 0;
        const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 5000; high.gain.value = 0;
        const gain = ctx.createGain(); gain.gain.value = 1;
        src.connect(low); low.connect(mid); mid.connect(high); high.connect(gain); gain.connect(ctx.destination);
      } else src.connect(ctx.destination);
      src.start();
      return (await ctx.startRendering()).getChannelData(0);
    };
    const a = await render(false);
    const b = await render(true);
    let max = 0;
    for (let i = 0; i < a.length; i += 1) max = Math.max(max, Math.abs(a[i] - b[i]));
    return max;
  });
  expect(diff).toBeLessThan(1e-5);
});
