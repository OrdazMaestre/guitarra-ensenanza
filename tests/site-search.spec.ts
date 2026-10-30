import { test, expect, type Page } from '@playwright/test';

// Barra superior de todas las páginas: botón del árbol (logo) + buscador global
// (app/components/siteNav, índice en app/lib/siteSearchIndex.ts).

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

async function optionTitles(page: Page) {
  return page.locator('.site-search-list [role="option"]').allInnerTexts();
}

test('the bar is on every kind of page, hidden ones included', async ({ page }) => {
  for (const path of [
    '/lecciones/temario/acordes',
    '/lecciones/temario/sala-de-pruebas',
    '/lecciones/temario/quiz',
    '/lecciones/prueba',
  ]) {
    await page.goto(path);
    await expect(page.locator('.site-top-bar .site-tree-button'), path).toHaveAttribute('href', '/lecciones/temario/pasos');
    await expect(page.locator('.site-top-bar .site-search-input'), path).toBeVisible();
  }
});

test.describe('mouse', () => {
  test.use({ hasTouch: false });

  test('hovering the tree button shows VER TODO without moving the search', async ({ page }) => {
    await page.goto('/lecciones/temario/acordes');
    const search = page.locator('.site-top-bar .site-search-input');
    const before = await search.boundingBox();
    await page.locator('.site-top-bar .site-tree-button').hover();
    await expect(page.locator('.site-top-bar .site-tree-label')).toHaveCSS('opacity', '1');
    expect(await search.boundingBox()).toEqual(before);
  });

  test('on the tree page the button goes to the cover and shows a house', async ({ page }) => {
    await page.goto('/lecciones/temario/pasos');
    const button = page.locator('.site-top-bar .site-tree-button');
    await expect(button).toHaveAttribute('href', '/lecciones/temario');
    await expect(button).toHaveAttribute('aria-label', 'Ir a la portada');
    await expect(page.locator('.site-top-bar .site-tree-label')).not.toContainText(/ver/i);
    await button.hover();
    await expect(page.locator('.site-top-bar .site-tree-home')).toHaveCSS('opacity', '1');
    await button.click();
    await expect(page).toHaveURL(/\/lecciones\/temario$/);
  });
});

test('focusing the empty search lists every page alphabetically, without the hidden ones', async ({ page }) => {
  await page.goto('/lecciones/temario/acordes');
  await page.locator('.site-top-bar .site-search-input').focus();
  await expect(page.locator('.site-search-list')).toBeVisible();
  const titles = await optionTitles(page);
  expect(titles.length).toBeGreaterThan(25);
  expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'es')));
  expect(titles).toContain('Portada');
  expect(titles).toContain('Temario');
  expect(titles).toContain('Sala de pruebas');
  const hrefs = await page.locator('.site-search-list a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs).not.toContain('/lecciones/prueba');
  expect(hrefs).not.toContain('/lecciones/temario/quiz');
});

test('typing filters by title and keywords, every word must match, accents ignored', async ({ page }) => {
  await page.goto('/lecciones/temario/acordes');
  const input = page.locator('.site-top-bar .site-search-input');
  await input.fill('escala');
  const escalas = await optionTitles(page);
  expect(escalas).toContain('Escalas');
  expect(escalas.every((title) => /escala/i.test(title) || title === 'Acordes de la escala de Sol Mayor')).toBe(true);

  await input.fill('hendrix');
  expect(await optionTitles(page)).toEqual(['Pentatónica de blues']);

  await input.fill('pentatonica ejercicios avanzados');
  expect(await optionTitles(page)).toEqual(['Ejercicios avanzados de pentatónica']);

  await input.fill('zzzz');
  await expect(page.locator('.site-search-empty')).toBeVisible();
});

test('arrow keys + Enter open the chosen page', async ({ page }) => {
  await page.goto('/lecciones/temario/acordes');
  const input = page.locator('.site-top-bar .site-search-input');
  await input.fill('afinacion');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/lecciones\/temario\/afinacion$/);
  await expect(page.locator('.site-search-list')).toHaveCount(0);
});

test('no horizontal overflow with the list open', async ({ page }) => {
  for (const width of [360, 600, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/lecciones/temario/acordes');
    await page.locator('.site-top-bar .site-search-input').focus();
    await expect(page.locator('.site-search-list')).toBeVisible();
    expect(await hasHorizontalOverflow(page), `${width}px`).toBe(false);
  }
});
