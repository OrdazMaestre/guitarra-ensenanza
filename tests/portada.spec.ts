import { test, expect, type Page } from '@playwright/test';

// Portada de la web (app/lecciones/temario/page.tsx + PortadaShell.tsx).

const HOME = '/lecciones/temario';

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

test('the Portada button leads to the cover from every page, and hides on the cover itself', async ({ page }) => {
  for (const path of ['/lecciones/temario/sala-de-pruebas', '/lecciones/temario/tablaturas']) {
    await page.goto(path);
    await expect(page.locator('.site-home-link')).toHaveAttribute('href', HOME);
  }

  await page.goto(HOME);
  expect(await page.locator('.site-home-link').count()).toBe(0);
});

test('LECCIONES lists the 10 main lessons and PASOS links to the tree', async ({ page }) => {
  await page.goto(HOME);
  await expect(page.getByRole('link', { name: 'PASOS' })).toHaveAttribute('href', '/lecciones/temario/pasos');

  await page.getByRole('button', { name: 'Lecciones' }).click();
  const links = page.locator('#portada2-lessons a');
  await expect(links).toHaveCount(10);
  await expect(links.first()).toHaveAttribute('href', '/lecciones/temario/conceptos-basicos');
  await expect(links.last()).toHaveAttribute('href', '/lecciones/temario/funciones-tonales');

  await page.keyboard.press('Escape');
  await expect(links).toHaveCount(0);
});

test('MIDIS shows one instrument at a time and closing MIDIS removes it', async ({ page }) => {
  await page.goto(HOME);
  const midis = page.getByRole('button', { name: 'Midis' });
  const hosts = page.locator('.portada2-instrument .midi-instrument-host');

  await midis.click();
  await page.getByRole('button', { name: 'Guitarra', exact: true }).click();
  await expect(page.locator('.portada2-instrument h2')).toHaveText('Guitarra');
  await expect(hosts).toHaveCount(1);

  await page.getByRole('button', { name: 'Teclado', exact: true }).click();
  await expect(page.locator('.portada2-instrument h2')).toHaveText('Teclado');
  await expect(hosts).toHaveCount(1);

  // Tocar el instrumento no debe cerrarlo (MIDIS no se cierra al pulsar fuera).
  await page.locator('.portada2-instrument svg').first().click();
  await expect(hosts).toHaveCount(1);

  await midis.click();
  await expect(page.locator('.portada2-instrument')).toHaveCount(0);
});

test('MÚSICA opens the mixing console', async ({ page }) => {
  await page.goto(HOME);
  await page.getByRole('button', { name: 'Música' }).click();
  await expect(page.getByRole('region', { name: 'Mesa de mezclas' })).toBeVisible();
});

test('no horizontal overflow, with and without an instrument open', async ({ page }) => {
  for (const width of [360, 600, 850, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(HOME);
    expect(await hasHorizontalOverflow(page), `${width}px`).toBe(false);

    await page.getByRole('button', { name: 'Midis' }).click();
    for (const name of ['Guitarra', 'Teclado']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(200);
      expect(await hasHorizontalOverflow(page), `${name} @ ${width}px`).toBe(false);
    }
  }
});
