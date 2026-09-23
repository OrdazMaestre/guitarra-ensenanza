import { test, expect } from '@playwright/test';

// Locks in the percussion notation preview added to AlphaTabPlayer.tsx
// (opt-in via multiTrack, only exercised today by sala-de-pruebas). See
// "Previsualización de partitura de batería" in AlphaTabPlayer.NOTES.md for
// the full design and the empirical findings this test guards against
// regressing silently.
test('drum notation preview: toggles render, restores settings exactly, no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('/lecciones/temario/sala-de-pruebas');
  await page.waitForTimeout(2000);

  const svgCountBefore = await page.evaluate(() => document.querySelectorAll('.at-surface-svg').length);

  await page.getByRole('button', { name: 'Pistas' }).click();
  await page.waitForTimeout(200);

  // Remember which track was primary before entering the preview, so we can
  // switch back to that exact same track afterwards (not just any
  // guitar/bass track) and compare svg counts apples-to-apples.
  const originalTrackName = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button[aria-label^="Mostrar partitura de "]'));
    const disabledButton = buttons.find((button) => (button as HTMLButtonElement).disabled);
    return disabledButton?.getAttribute('aria-label')?.replace('Mostrar partitura de ', '') ?? '';
  });
  expect(originalTrackName).not.toBe('');

  const drumButton = page.getByRole('button', { name: 'Mostrar partitura de Drums' });
  await expect(drumButton).toBeVisible();
  await drumButton.click();
  await page.waitForTimeout(1200);

  // Drum notation actually rendered (more systems/svgs than the guitar tab,
  // per the verified StaveProfile.Score + showTablature=false combo). This
  // (plus the "Mostrar partitura de Drums" button becoming disabled/marked
  // as the currently-shown track below) is now the only visible signal that
  // preview is active — the old purple "Viendo: Drums (solo lectura)" pill
  // was removed in favor of the drum-element volume button occupying that
  // slot (see "Volumen por pista y por elemento de batería" in
  // AlphaTabPlayer.NOTES.md).
  const svgCountDuring = await page.evaluate(() => document.querySelectorAll('.at-surface-svg').length);
  expect(svgCountDuring).toBeGreaterThan(svgCountBefore);
  await expect(drumButton).toBeDisabled();

  // String labels (E B G D A E) hidden while previewing, since their bounds
  // belong to the primary track.
  const stringLabelCountDuring = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('.alphatab-surface > div')).filter((el) =>
        ['E', 'B', 'G', 'D', 'A'].includes((el.textContent || '').trim())
      ).length
  );
  expect(stringLabelCountDuring).toBe(0);

  // Own horizontal scrollbar still works while previewing (no second/native
  // scrollbar took over — see the AGENTS.md horizontal-scrollbar rule).
  const scrollbar = page.locator('[aria-label="Desplazamiento horizontal de la tablatura"]');
  const metrics = await scrollbar.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  await scrollbar.evaluate((el) => {
    el.scrollLeft = 400;
    el.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(200);
  const scrollLeftAfterDrag = await scrollbar.evaluate((el) => el.scrollLeft);
  expect(scrollLeftAfterDrag).toBeGreaterThan(300);

  // Exit by picking the original primary track from the still-open "Pistas"
  // dropdown (the only remaining way back to normal tab/notation now that
  // the dedicated "Volver a tablatura" pill button is gone) restores that
  // track's own tab/notation and brings the string labels back.
  await page.getByRole('button', { name: `Mostrar partitura de ${originalTrackName}` }).click();
  await page.waitForTimeout(1000);

  await expect(drumButton).toBeEnabled();
  const svgCountAfterExit = await page.evaluate(() => document.querySelectorAll('.at-surface-svg').length);
  expect(svgCountAfterExit).toBe(svgCountBefore);
  const stringLabelCountAfterExit = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('.alphatab-surface > div')).filter((el) =>
        ['E', 'B', 'G', 'D', 'A'].includes((el.textContent || '').trim())
      ).length
  );
  expect(stringLabelCountAfterExit).toBeGreaterThan(0);

  expect(consoleErrors).toEqual([]);
});

test('drum notation preview: selecting a different guitar/bass track also exits it cleanly', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('/lecciones/temario/sala-de-pruebas');
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Pistas' }).click();
  await page.waitForTimeout(200);
  const drumButton = page.getByRole('button', { name: 'Mostrar partitura de Drums' });
  await drumButton.click();
  await page.waitForTimeout(1200);
  await expect(drumButton).toBeDisabled();

  await page.getByRole('button', { name: /Mostrar partitura de Bass/ }).click();
  await page.waitForTimeout(1200);

  await expect(drumButton).toBeEnabled();
  expect(consoleErrors).toEqual([]);
});

test('drum notation preview: no regression on non-multiTrack lesson pages', async ({ page }) => {
  for (const url of ['/lecciones/prueba', '/lecciones/temario/ampliacion-arpegios']) {
    await page.goto(url);
    await page.waitForTimeout(1500);
    const playButton = page.getByRole('button', { name: 'Reproducir' }).first();
    if ((await playButton.count()) === 0) continue;
    await playButton.click();
    const before = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(4000);
    const after = await page.evaluate(() => window.scrollY);
    expect(after - before).toBeGreaterThan(0);
  }
});
