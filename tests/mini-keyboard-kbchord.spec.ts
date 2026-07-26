import { test, expect } from '@playwright/test';

// Physical-keyboard chords (KEYBOARD/kbMode) rely on the browser actually
// receiving every keydown. When a real (non-gaming) keyboard can't report 3+
// simultaneous keys, the 3rd keydown never reaches the page at all — no app
// code can detect or fix that. These tests use Playwright's keyboard API,
// which dispatches real keydown/keyup events the app receives in full, so
// they verify the *software* side: chords work end-to-end when the browser
// does deliver the events, and the ghosting warning banner appears/disappears
// at the right times.

test.describe('MiniKeyboard physical-keyboard chords', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      throw new Error(`Uncaught page error: ${err.message}`);
    });
    await page.goto('/lecciones/temario/notacion-musical');
  });

  test('Z+X+C chord plays and sustains all three notes', async ({ page }) => {
    const svg = page.locator('svg[aria-label="Las doce notas en forma de teclado. Pulsa las teclas para escuchar."]');
    await svg.scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'KEYBOARD' }).first().click();

    const whiteKeys = svg.locator('g').nth(0).locator('rect');
    const cKey = whiteKeys.nth(0); // C = KeyZ
    const dKey = whiteKeys.nth(1); // D = KeyX
    const eKey = whiteKeys.nth(2); // E = KeyC

    await page.keyboard.down('z');
    await expect(cKey).toHaveAttribute('fill', '#b8e8c4');

    await page.keyboard.down('x');
    await expect(dKey).toHaveAttribute('fill', '#b8e8c4');
    await expect(cKey).toHaveAttribute('fill', '#b8e8c4'); // Z must still be sounding

    await page.keyboard.down('c');
    await expect(eKey).toHaveAttribute('fill', '#b8e8c4');
    await expect(cKey).toHaveAttribute('fill', '#b8e8c4');
    await expect(dKey).toHaveAttribute('fill', '#b8e8c4');

    await page.keyboard.up('x'); // release the middle note only
    await expect(dKey).toHaveAttribute('fill', '#f7f8fb');
    await expect(cKey).toHaveAttribute('fill', '#b8e8c4');
    await expect(eKey).toHaveAttribute('fill', '#b8e8c4');

    await page.keyboard.up('z');
    await page.keyboard.up('c');
    await expect(cKey).toHaveAttribute('fill', '#f7f8fb');
    await expect(eKey).toHaveAttribute('fill', '#f7f8fb');
  });

  test('ghosting warning appears at 2+ held keys and clears on release', async ({ page }) => {
    await page.getByRole('button', { name: 'KEYBOARD' }).first().click();
    const warning = page.getByText('⚠ Necesitas teclado gaming para tocar ciertos acordes');

    await page.keyboard.down('z');
    await expect(warning).toBeHidden();

    await page.keyboard.down('x');
    await expect(warning).toBeVisible();

    await page.keyboard.up('z');
    await page.keyboard.up('x');
    await expect(warning).toBeHidden();
  });
});
