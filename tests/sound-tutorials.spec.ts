import { test, expect, type Locator, type Page } from '@playwright/test';

// Página "El sonido en la música": orden de los diagramas del primer carrusel y el tutorial de
// cada diagrama (soundTours.ts).
const URL = '/lecciones/temario/el-sonido-en-la-musica';

async function runTour(page: Page, carousel: Locator, titles: string[]) {
  await carousel.getByRole('button', { name: 'Tutorial' }).click();
  const bubble = page.getByRole('dialog', { name: /^Tutorial:/ });
  const box = (await carousel.boundingBox())!;
  for (let i = 0; i < titles.length; i++) {
    await expect(bubble.getByRole('heading', { name: titles[i], exact: true })).toBeVisible();
    // El resaltado cae dentro del carrusel.
    const hl = (await page.locator('.tour-highlight').boundingBox())!;
    expect(hl.x + hl.width / 2).toBeGreaterThan(box.x);
    expect(hl.x + hl.width / 2).toBeLessThan(box.x + box.width);
    expect(hl.y + hl.height / 2).toBeGreaterThan(box.y);
    expect(hl.y + hl.height / 2).toBeLessThan(box.y + box.height);
    await bubble.getByRole('button', { name: i === titles.length - 1 ? '¡Listo!' : 'Siguiente' }).click();
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('primer carrusel: orden onda cuadrada, timbre, cancelación, ruido, y un tutorial en cada uno', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  const carousel = page.locator('.ac');
  await carousel.scrollIntoViewIfNeeded();
  const screens: Array<[string, string[]]> = [
    ['Construcción de onda cuadrada', ['Flechas', 'El dibujo', 'Armónicos', 'Colores']],
    ['Timbre: suma de armónicos', ['Flechas', 'El dibujo', 'Casillas H1 a H10', 'Instrumentos']],
    ['Cancelación de ondas', ['Flechas', 'El dibujo', 'Onda (+)', 'Onda al revés (−)']],
    ['Formación de ruido', ['Flechas', 'El dibujo', 'Número de ondas', 'Regenerar', 'Colores']],
  ];
  for (const [i, [title, steps]] of screens.entries()) {
    await expect(carousel.locator('.ac-title')).toHaveText(title);
    await expect(carousel.locator('.ac-pager')).toHaveText(`${i + 1} / 4`);
    await runTour(page, carousel, steps);
    await carousel.getByRole('button', { name: 'Pantalla siguiente' }).click();
  }
});

test('carrusel de armónicos: un tutorial en cada pantalla', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  const carousel = page.locator('.hmc');
  await carousel.scrollIntoViewIfNeeded();
  await runTour(page, carousel, ['Flechas', 'Formas de vibrar']);
  await carousel.getByRole('button', { name: 'Sección siguiente' }).click();
  await runTour(page, carousel, ['Flechas', 'El mástil', 'Los trastes']);
});

test('sin desbordamiento horizontal en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(URL);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  // La web recorta el desbordamiento (overflow-x: clip) en vez de mostrar scroll: hay que mirar
  // que los botones de cada carrusel caigan DENTRO de la pantalla (antes se cortaban).
  for (const [carousel, next] of [['.ac', 'Pantalla siguiente'], ['.hmc', 'Sección siguiente']]) {
    for (const button of [page.locator(carousel).getByRole('button', { name: 'Tutorial' }), page.locator(carousel).getByRole('button', { name: next })]) {
      await button.scrollIntoViewIfNeeded();
      const box = (await button.boundingBox())!;
      expect(box.x + box.width, `${carousel} ${next}`).toBeLessThanOrEqual(360);
    }
  }
});
