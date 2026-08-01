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

    // Z/X/C are all octave-4 naturals, so keyboard input highlights their
    // bottom-half zone (see tests/mini-keyboard-octave-zones.spec.ts) rather
    // than the plain full-key fill mouse/touch uses.
    const cZone = page.locator('[data-testid="kb-zones"] rect[x="25"][fill="#b8e8c4"]'); // C = KeyZ
    const dZone = page.locator('[data-testid="kb-zones"] rect[x="100"][fill="#b8e8c4"]'); // D = KeyX
    const eZone = page.locator('[data-testid="kb-zones"] rect[x="200"][fill="#b8e8c4"]'); // E = KeyC

    await page.keyboard.down('z');
    await expect(cZone).toHaveCount(1);

    await page.keyboard.down('x');
    await expect(dZone).toHaveCount(1);
    await expect(cZone).toHaveCount(1); // Z must still be sounding

    await page.keyboard.down('c');
    await expect(eZone).toHaveCount(1);
    await expect(cZone).toHaveCount(1);
    await expect(dZone).toHaveCount(1);

    await page.keyboard.up('x'); // release the middle note only
    await expect(dZone).toHaveCount(0);
    await expect(cZone).toHaveCount(1);
    await expect(eZone).toHaveCount(1);

    await page.keyboard.up('z');
    await page.keyboard.up('c');
    await expect(cZone).toHaveCount(0);
    await expect(eZone).toHaveCount(0);
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
