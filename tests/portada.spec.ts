import { test, expect, type Page } from '@playwright/test';

// Portada de la web (app/lecciones/temario/page.tsx + PortadaShell.tsx).

const HOME = '/lecciones/temario';

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

test('the cover header carries the tree button and the search; the global bar is not duplicated', async ({ page }) => {
  await page.goto(HOME);
  await expect(page.locator('.portada2-tools .site-tree-button')).toHaveAttribute('href', '/lecciones/temario/pasos');
  await expect(page.locator('.portada2-tools .site-search-input')).toBeVisible();
  expect(await page.locator('.site-top-bar').count()).toBe(0);
  await expect(page.locator('.portada2-eyebrow')).toHaveText('Tu guitarra, tu ritmo, desde cero');
});

test('wide screen: MÚSICA left, search centered, INSTRUMENTOS right; lessons in ONE row, no LECCIONES menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(HOME);
  const music = await page.getByRole('button', { name: 'Música' }).boundingBox();
  const search = await page.locator('.portada2-tools').boundingBox();
  const instruments = await page.getByRole('button', { name: 'Instrumentos' }).boundingBox();
  expect(music!.x + music!.width).toBeLessThan(search!.x);
  expect(search!.x + search!.width).toBeLessThan(instruments!.x);
  // Las herramientas quedan centradas en la página (±2px).
  expect(Math.abs(search!.x + search!.width / 2 - 1440 / 2)).toBeLessThanOrEqual(2);

  const links = page.locator('.portada2-lessons-row a');
  await expect(links).toHaveCount(10);
  await expect(links.first()).toHaveAttribute('href', '/lecciones/temario/conceptos-basicos');
  await expect(links.last()).toHaveAttribute('href', '/lecciones/temario/funciones-tonales');
  const rows = await links.evaluateAll((items) => new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size);
  expect(rows).toBe(1);
  // Solo en la portada, "Notación musical" se llama "Notas musicales".
  await expect(links.nth(1)).toContainText('Notas musicales');
  await expect(page.locator('.portada2-lessons-row')).not.toContainText('Notación musical');
  await expect(page.getByRole('button', { name: 'Lecciones', exact: true })).toBeHidden();
});

test('the lessons row scrolls with arrows that only show when needed, and no scrollbar', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(HOME);
  const scroller = page.locator('.portada2-lessons-scroll');
  const left = page.getByRole('button', { name: 'Ver lecciones anteriores' });
  const right = page.getByRole('button', { name: 'Ver más lecciones' });
  // A 1100px no caben las 10: al principio solo hay flecha a la derecha.
  await expect(right).toBeVisible();
  await expect(left).toBeHidden();
  expect(await scroller.evaluate((el) => el.offsetHeight - el.clientHeight)).toBe(0);

  await right.click();
  await expect(left).toBeVisible();
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

  // Hasta el final: la flecha derecha desaparece.
  for (let i = 0; i < 5 && (await right.isVisible()); i++) {
    await right.click();
    await page.waitForTimeout(500);
  }
  await expect(right).toBeHidden();

  // Con sitio de sobra no hay flechas.
  await page.setViewportSize({ width: 2400, height: 900 });
  await expect(left).toBeHidden();
  await expect(right).toBeHidden();
});

test('narrow screen: LECCIONES · MÚSICA · INSTRUMENTOS under the search, and PASOS links to the tree', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(HOME);
  await expect(page.getByRole('link', { name: 'PASOS' })).toHaveAttribute('href', '/lecciones/temario/pasos');
  await expect(page.locator('.portada2-lessons')).toBeHidden();

  const search = await page.locator('.portada2-tools').boundingBox();
  // Orden de lectura (fila a fila, de izquierda a derecha): puede partirse en dos líneas a 360px.
  const boxes = [];
  for (const name of ['Lecciones', 'Música', 'Instrumentos']) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.y).toBeGreaterThan(search!.y + search!.height - 1);
    boxes.push(box);
  }
  const reading = (b: { x: number; y: number }) => Math.round(b.y / 10) * 100000 + b.x;
  expect(boxes.map(reading)).toEqual(boxes.map(reading).sort((a, b) => a - b));

  await page.getByRole('button', { name: 'Lecciones', exact: true }).click();
  const links = page.locator('#portada2-lessons a');
  await expect(links).toHaveCount(10);
  await expect(links.first()).toHaveAttribute('href', '/lecciones/temario/conceptos-basicos');
  await expect(links.last()).toHaveAttribute('href', '/lecciones/temario/funciones-tonales');
  await expect(links.nth(1)).toContainText('Notas musicales');

  await page.keyboard.press('Escape');
  await expect(links).toHaveCount(0);
});

// Las lecciones solo se agrupan cuando la fila de arriba (MÚSICA | logo + buscador | INSTRUMENTOS)
// deja de caber en una línea (el buscador se descentra para aprovechar el hueco): 650px todavía
// cabe; 649px ya es el modo estrecho (page.tsx).
test('the lessons are grouped only when the top row stops fitting on one line', async ({ page }) => {
  await page.setViewportSize({ width: 650, height: 800 });
  await page.goto(HOME);
  const music = (await page.getByRole('button', { name: 'Música' }).boundingBox())!;
  const tools = (await page.locator('.portada2-tools').boundingBox())!;
  const instruments = (await page.getByRole('button', { name: 'Instrumentos' }).boundingBox())!;
  expect(Math.abs(music.y + music.height / 2 - (tools.y + tools.height / 2))).toBeLessThanOrEqual(3);
  expect(Math.abs(instruments.y + instruments.height / 2 - (tools.y + tools.height / 2))).toBeLessThanOrEqual(3);
  expect(tools.x - (music.x + music.width)).toBeGreaterThanOrEqual(12);
  expect(instruments.x - (tools.x + tools.width)).toBeGreaterThanOrEqual(12);
  // El texto del buscador se lee entero.
  const room = await page.locator('.portada2-tools .site-search-input').evaluate((input: HTMLInputElement) => {
    const cs = getComputedStyle(input);
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - ctx.measureText(input.placeholder).width;
  });
  expect(room).toBeGreaterThan(0);
  // La flechita de INSTRUMENTOS no se encoge (antes la columna aplastaba el botón).
  expect((await page.locator('.portada2-menu-instruments button svg').boundingBox())!.width).toBeGreaterThanOrEqual(11);
  await expect(page.locator('.portada2-lessons')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lecciones', exact: true })).toBeHidden();
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await page.setViewportSize({ width: 649, height: 800 });
  await expect(page.locator('.portada2-lessons')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Lecciones', exact: true })).toBeVisible();
});

test('INSTRUMENTOS shows one instrument at a time and closing it removes the instrument', async ({ page }) => {
  await page.goto(HOME);
  const instruments = page.getByRole('button', { name: 'Instrumentos' });
  const hosts = page.locator('.portada2-instrument .midi-instrument-host');

  await instruments.click();
  await page.getByRole('button', { name: 'Guitarra', exact: true }).click();
  await expect(page.locator('.portada2-instrument h2')).toHaveText('Guitarra');
  await expect(hosts).toHaveCount(1);

  await page.getByRole('button', { name: 'Teclado', exact: true }).click();
  await expect(page.locator('.portada2-instrument h2')).toHaveText('Teclado');
  await expect(hosts).toHaveCount(1);

  // Tocar el instrumento no debe cerrarlo (INSTRUMENTOS no se cierra al pulsar fuera).
  await page.locator('.portada2-instrument svg').first().click();
  await expect(hosts).toHaveCount(1);

  await instruments.click();
  await expect(page.locator('.portada2-instrument')).toHaveCount(0);
});

test('MÚSICA opens the mixing console', async ({ page }) => {
  await page.goto(HOME);
  // La mesa escucha el evento desde un efecto: esperar a que esté montada (su botón es un portal
  // que solo aparece tras montar) antes de pulsar MÚSICA.
  await expect(page.locator('.mixing-console-toggle-button')).toBeVisible();
  await page.getByRole('button', { name: 'Música' }).click();
  await expect(page.getByRole('region', { name: 'Mesa de mezclas' })).toBeVisible();
});

test('no horizontal overflow, with and without an instrument open', async ({ page }) => {
  for (const width of [360, 600, 700, 800, 1100]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(HOME);
    expect(await hasHorizontalOverflow(page), `${width}px`).toBe(false);

    await page.getByRole('button', { name: 'Instrumentos' }).click();
    for (const name of ['Guitarra', 'Teclado']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(200);
      expect(await hasHorizontalOverflow(page), `${name} @ ${width}px`).toBe(false);
    }
  }
});
