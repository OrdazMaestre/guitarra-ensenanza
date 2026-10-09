import { test, expect, type Page } from '@playwright/test';

// Estos tests pulsan KEYBOARD, que se oculta en pantallas táctiles (`.midi-kb-toggle` en
// globals.css). playwright.config.ts activa `hasTouch` para todos; aquí simulamos un ordenador.
test.use({ hasTouch: false });

async function docHeight(page: Page) {
  return page.evaluate(() => document.documentElement.scrollHeight);
}
async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

test('MiniKeyboard: floating chrome does not shift layout, no h-overflow, controls order KB/volume/metronome', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/lecciones/temario/notacion-musical');
  const kbButtons = page.getByRole('button', { name: 'KEYBOARD' });
  const kbButton = kbButtons.nth(0); // MiniKeyboard's KEYBOARD button (first one on page)

  const h0 = await docHeight(page);
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await kbButton.click();
  await page.keyboard.down('z');
  await page.keyboard.down('x'); // trigger ghosting warning
  const h1 = await docHeight(page);
  expect(h1).toBe(h0);
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await page.keyboard.up('z');
  await page.keyboard.up('x');

  // open metronome dropdown
  const metroBtn = page.getByRole('button', { name: 'Activar metrónomo' }).nth(0);
  await metroBtn.click();
  const h2 = await docHeight(page);
  expect(h2).toBe(h0);
  expect(await hasHorizontalOverflow(page)).toBe(false);

  // wide viewport: volume slider sits between the KB button and the metronome toggle
  const volumeInput = page.getByLabel('Volumen del teclado').first();
  const volBox = await volumeInput.boundingBox();
  const kbBox = await kbButton.boundingBox();
  const metroBox = await metroBtn.boundingBox();
  expect(volBox).not.toBeNull();
  expect(kbBox).not.toBeNull();
  expect(metroBox).not.toBeNull();
  if (volBox && kbBox && metroBox) {
    expect(kbBox.x).toBeLessThan(volBox.x);
    expect(volBox.x).toBeLessThan(metroBox.x);
  }

  // narrow viewport: the single control pill wraps instead of overflowing
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(150);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test('ReducedFretboardDiagram: floating chrome does not shift layout, no h-overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/lecciones/temario/conceptos-basicos');
  const kbButton = page.getByRole('button', { name: 'KEYBOARD' }).first();
  await kbButton.scrollIntoViewIfNeeded();

  const h0 = await docHeight(page);
  await kbButton.click(); // opens Graves/Agudas dropdown
  const h1 = await docHeight(page);
  expect(h1).toBe(h0);
  expect(await hasHorizontalOverflow(page)).toBe(false);

  const gravesBtn = page.getByRole('button', { name: 'Graves' });
  await expect(gravesBtn).toBeVisible();

  await page.keyboard.down('z');
  await page.keyboard.down('x');
  const h2 = await docHeight(page);
  expect(h2).toBe(h0);
  await page.keyboard.up('z');
  await page.keyboard.up('x');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(150);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test('FullFretboardDiagram (NotacionMusicalPage mastil): no layout shift, no h-overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/lecciones/temario/notacion-musical');
  const kbButtons = page.getByRole('button', { name: 'KEYBOARD' });
  const fretKbButton = kbButtons.nth(1); // second KEYBOARD button = FullFretboardDiagram
  await fretKbButton.scrollIntoViewIfNeeded();

  const h0 = await docHeight(page);
  await fretKbButton.click();
  const h1 = await docHeight(page);
  expect(h1).toBe(h0);
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(150);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

// Regression test: `.midi-instrument-host` sitting as a direct grid/flex item
// (e.g. inside `.map-section { display: grid }`) picks up the browser's
// default `min-width: auto`, which resolves to the min-content size of its
// descendants — including a horizontally-scrolling fretboard SVG with a large
// `min-width` (e.g. `.blues-map { min-width: 760px }`). Without an explicit
// `min-width: 0` on `.midi-instrument-host`, the host (and therefore the
// floating controls anchored to it) get forced to that width, pushing the
// KEYBOARD button off-screen on narrow viewports even though the page itself
// reports no scrollWidth overflow (the site-wide `overflow-x: clip` silently
// hides it instead of scrolling to it).
test('PentatonicaBluesPage: floating controls stay reachable at narrow widths despite the fretboard\'s own horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/lecciones/temario/pentatonica-blues');
  const kbButton = page.getByRole('button', { name: 'KEYBOARD' }).first();
  await kbButton.scrollIntoViewIfNeeded();
  await expect(kbButton).toBeInViewport();
  await kbButton.click();
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

// Ningún punto de la píldora puede caer encima de contenido ajeno al propio instrumento.
async function pillsCoveringContent(page: Page) {
  return page.evaluate(() => {
    const covering: string[] = [];
    for (const c of Array.from(document.querySelectorAll('.midi-float-controls'))) {
      const pill = c.querySelector('.midi-float-pill')!.getBoundingClientRect();
      if (!pill.height) continue;
      for (const [fx, fy] of [[0.1, 0.5], [0.5, 0.5], [0.9, 0.5], [0.5, 0.1], [0.5, 0.9]]) {
        for (const el of document.elementsFromPoint(pill.left + pill.width * fx, pill.top + pill.height * fy)) {
          if (c.contains(el) || el.contains(c)) continue;
          if (['HTML', 'BODY', 'MAIN', 'ARTICLE', 'SECTION'].includes(el.tagName)) continue;
          if (getComputedStyle(el).position === 'fixed') continue;
          covering.push(el.tagName);
        }
      }
    }
    return covering;
  });
}

test('wide screen: every MIDI control bar keeps floating (no layout push)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const slug of ['sala-de-pruebas', 'notacion-musical', 'afinacion']) {
    await page.goto(`/lecciones/temario/${slug}`);
    await page.waitForTimeout(300);
    expect(await page.locator('.midi-float-controls.is-in-flow').count()).toBe(0);
  }
});

test('narrow screen: MIDI control bars never cover other content', async ({ page }) => {
  for (const width of [360, 600, 850]) {
    await page.setViewportSize({ width, height: 800 });
    for (const slug of ['sala-de-pruebas', 'notacion-musical', 'afinacion', 'pentatonica']) {
      await page.goto(`/lecciones/temario/${slug}`);
      await page.waitForTimeout(300);
      expect(await pillsCoveringContent(page), `${slug} @ ${width}px`).toEqual([]);
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
  }
});

test.describe('touch devices', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 800 } });
  test('KEYBOARD toggle is hidden on touch-only screens', async ({ page }) => {
    await page.goto('/lecciones/temario/sala-de-pruebas');
    expect(await page.locator('.midi-kb-toggle').count()).toBeGreaterThan(0);
    expect(await page.locator('.midi-kb-toggle:visible').count()).toBe(0);
  });
});
