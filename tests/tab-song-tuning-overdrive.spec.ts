import { test, expect, type Page } from '@playwright/test';
import { pickTestRoomTabSong } from './sala-song';

// Tablatura de la Sala de pruebas (SongTabPlayer): se queda en E con las cuerdas de siempre
// (decisión del usuario, aunque el .gp esté en Do# o Mi♭: el reproductor suena en estándar) y el
// botón CLEAN/OVERDRIVE pasa las guitarras por la cadena de ampli del mástil (createOverdriveChain).

const URL = '/lecciones/temario/sala-de-pruebas';

// Las etiquetas de cuerda: los <div aria-hidden> con texto de .alphatab-surface (el otro sin texto
// es un marcador del reproductor).
async function stringLabels(page: Page) {
  const texts = await page.locator('.test-room-tab .alphatab-surface > div[aria-hidden="true"]').allTextContents();
  return texts.filter((text) => text.trim().length > 0);
}

test('la tablatura se queda en E: cuerdas E B G D A E en todas las canciones', async ({ page }) => {
  await page.goto(URL);
  await page.locator('.test-room-tab').scrollIntoViewIfNeeded();
  await page.waitForSelector('.test-room-tab .at-surface-svg', { timeout: 60000 });
  const standard = ['E', 'B', 'G', 'D', 'A', 'E'];
  await expect.poll(() => stringLabels(page), { timeout: 30000 }).toEqual(standard);
  await pickTestRoomTabSong(page, 'Iron Rain');
  await expect.poll(() => stringLabels(page), { timeout: 30000 }).toEqual(standard);
});

test('OVERDRIVE en la tablatura: las guitarras pasan por la cadena de ampli', async ({ page }) => {
  // Cuenta los nodos de la cadena (la sala corta es un ConvolverNode: solo existe en el overdrive).
  await page.addInitScript(() => {
    const w = window as unknown as { __convolvers: number };
    w.__convolvers = 0;
    const original = BaseAudioContext.prototype.createConvolver;
    BaseAudioContext.prototype.createConvolver = function (this: BaseAudioContext) {
      w.__convolvers++;
      return original.call(this);
    };
  });
  await page.goto(URL);
  await page.locator('.test-room-tab').scrollIntoViewIfNeeded();
  await page.waitForSelector('.test-room-tab .at-surface-svg', { timeout: 60000 });
  const button = page.locator('.test-room-tab').getByRole('button', { name: 'Cambiar sonido clean u overdrive' });
  await expect(button).toHaveText('CLEAN');
  const width = (await button.boundingBox())!.width;
  await button.click();
  await expect(button).toHaveText('OVERDRIVE');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  // Cambiar el texto no mueve la barra.
  expect(Math.abs((await button.boundingBox())!.width - width)).toBeLessThan(1);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.locator('.test-room-tab button[aria-label="Reproducir"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __convolvers: number }).__convolvers), { timeout: 15000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});
