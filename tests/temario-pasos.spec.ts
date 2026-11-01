import { test, expect } from '@playwright/test';

// Árbol del temario (app/lecciones/temario/pasos/page.tsx): cajas de guía y ejemplo en miniatura
// del mapa (tema principal, apartado y relacionado) dentro de la caja de Niveles.

const PASOS = '/lecciones/temario/pasos';

test('the Niveles box shows a small map example and the old legend is gone', async ({ page }) => {
  await page.goto(PASOS);
  const levels = page.locator('.cn-guide-card', { has: page.getByRole('heading', { name: 'Niveles' }) });
  const example = levels.getByRole('img', { name: /Ejemplo: un tema principal/ });
  await expect(example).toBeVisible();
  for (const text of ['Tema principal', 'Apartado', 'Relacionado']) {
    await expect(example.locator('text', { hasText: text })).toHaveCount(1);
  }
  await expect(page.locator('[aria-label="Leyenda del mapa"]')).toHaveCount(0);
});

test('on wide screens the example fills the gap under level 3 without making the row taller', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(PASOS);
  const cards = page.locator('.cn-guide-card');
  const method = (await cards.nth(0).boundingBox())!;
  const levels = (await cards.nth(1).boundingBox())!;
  expect(levels.height).toBeLessThanOrEqual(method.height + 1);

  // Sin el ejemplo, la caja de Método Ordaz manda en la altura de la fila.
  const level3 = (await cards.nth(1).locator('.cn-levels li').nth(2).boundingBox())!;
  const example = (await cards.nth(1).locator('.cn-example svg').boundingBox())!;
  expect(example.y).toBeGreaterThan(level3.y + level3.height);
  expect(example.y + example.height).toBeLessThanOrEqual(levels.y + levels.height);
});

test('level 3 text flows as one paragraph, not as two columns', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(PASOS);
  const text = page.locator('.cn-levels li').nth(2).locator('span').nth(1);
  await expect(text).toContainText('Completar TODOS los apartados (listo para clases avanzadas)');
  const lefts = await text.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].map((r) => Math.round(r.left));
  });
  // Cada línea empieza en el mismo borde izquierdo.
  expect(Math.min(...lefts)).toBe(Math.round((await text.boundingBox())!.x));
});

test('no horizontal overflow', async ({ page }) => {
  for (const width of [360, 600, 900, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(PASOS);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), `${width}px`).toBe(false);
  }
});
