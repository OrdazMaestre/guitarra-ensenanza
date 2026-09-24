import { test, expect } from '@playwright/test';

// Locks in the "every 10 bars" drum-notation-only notice added to the
// percussion preview (AlphaTabPlayer.tsx's applyPercussionPreviewNotice /
// restorePercussionPreviewNotice). See "Aviso de compás cada 10 en la
// partitura de batería" in AlphaTabPlayer.NOTES.md for the full design,
// including why MasterBar.section is shared across every track and how the
// save/restore pattern avoids leaking the notice into the guitar/bass tab.
const NOTICE = 'DE MOMENTO todos los platos suenan igual y los tombs se sustituyen por más caja+bombo';

test('drum notation notice: appears only in the drum preview, never in guitar/bass tab, and restores exactly', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('/lecciones/temario/sala-de-pruebas');
  await page.waitForTimeout(2000);

  // Before entering the preview (guitar/bass tab visible): the notice text
  // must not appear anywhere, and the file's own real section markers
  // ("Solo II", "Verse III", "Pre-chorus", "Chorus III") are untouched.
  const beforeText = await page.evaluate(() => document.querySelector('.alphatab-surface')?.textContent || '');
  expect(beforeText).not.toContain(NOTICE);
  expect(beforeText).toContain('Solo II');

  await page.getByRole('button', { name: 'Pistas' }).click();
  await page.waitForTimeout(200);

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

  // During the preview: the notice appears (bar 10, 0-based masterBars index
  // 9, is the first of 10 occurrences for this 103-bar file — see the
  // PERCUSSION_PREVIEW_NOTICE_START_BAR_INDEX comment in AlphaTabPlayer.tsx),
  // and none of the file's own real section markers were overwritten (they
  // sit at different bar indexes than every 10th-from-9 slot, so no
  // collision happens for this file).
  const duringText = await page.evaluate(() => document.querySelector('.alphatab-surface')?.textContent || '');
  expect(duringText).toContain(NOTICE);
  expect(duringText).toContain('Solo II');
  expect(duringText).toContain('Verse III');
  expect(duringText).toContain('Pre-chorus');
  expect(duringText).toContain('Chorus III');

  // Exit by picking the original primary track back from the "Pistas"
  // dropdown (same mechanism tests/drum-notation-preview.spec.ts already
  // exercises for restoring stave visibility/profile).
  await page.getByRole('button', { name: `Mostrar partitura de ${originalTrackName}` }).click();
  await page.waitForTimeout(1000);

  const afterText = await page.evaluate(() => document.querySelector('.alphatab-surface')?.textContent || '');
  expect(afterText).not.toContain(NOTICE);
  expect(afterText).toContain('Solo II');

  expect(consoleErrors).toEqual([]);
});

test('drum notation notice: no regression on non-multiTrack lesson pages', async ({ page }) => {
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
