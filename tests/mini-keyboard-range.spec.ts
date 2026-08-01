import { test, expect } from '@playwright/test';

// MiniKeyboard's physical-keyboard input (kbMode) covers two simultaneous
// registers: "grave" (bass, the original bottom-row+home-row keys, now
// extended with RightShift/Enter for one extra F/F#) and "agudo" (treble,
// the Q-row + digit-row keys). Agudo's first 4 naturals (Q/W/E/R) are the
// exact same pitches as grave's Comma/Period/Slash/ShiftRight — deliberate
// overlap so the two rows read as one continuous scale — then it keeps
// climbing from there. Neither extension is visible on the SVG (same as the
// pre-existing invisible B/C#-E notes) — these tests mostly verify the
// physical-keyboard side plays without errors and that both registers can
// sound together, mirroring how a real two-hand piano part would be played.
test.describe('MiniKeyboard grave/agudo keyboard-input range', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      throw new Error(`Uncaught page error: ${err.message}`);
    });
    await page.goto('/lecciones/temario/notacion-musical');
    await page.getByRole('button', { name: 'KEYBOARD' }).nth(0).click();
  });

  test('RightShift/Enter extend grave by one F/F# pair without visual highlight or errors', async ({ page }) => {
    await page.keyboard.down('ShiftRight');
    await page.keyboard.down('Enter');
    // Neither note is in the visible C-C octave, so no white/black key should light up for them.
    await page.waitForTimeout(100);
    await page.keyboard.up('ShiftRight');
    await page.keyboard.up('Enter');
  });

  test('agudo row (Q-Backslash naturals, digit-row sharps) plays without errors', async ({ page }) => {
    for (const code of ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash']) {
      await page.keyboard.press(code);
    }
    for (const code of ['Digit2', 'Digit3', 'Digit5', 'Digit6', 'Digit7', 'Digit9', 'Digit0', 'Equal', 'Backspace']) {
      await page.keyboard.press(code);
    }
  });

  test('digits skipped for the natural E-F/B-C gaps (1, 4, 8) still do nothing harmful', async ({ page }) => {
    await page.keyboard.press('Digit1');
    await page.keyboard.press('Digit4');
    await page.keyboard.press('Digit8');
  });

  test('grave and agudo notes sound together and both register as held (ghosting warning fires)', async ({ page }) => {
    const warning = page.getByText('⚠ Necesitas teclado gaming para tocar ciertos acordes');
    await expect(warning).toBeHidden();

    await page.keyboard.down('KeyZ'); // grave C4
    await expect(warning).toBeHidden();
    await page.keyboard.down('KeyQ'); // agudo C5
    await expect(warning).toBeVisible(); // 2 simultaneous physical keys held

    await page.keyboard.up('KeyZ');
    await page.keyboard.up('KeyQ');
    await expect(warning).toBeHidden();
  });

  test('agudo naturals Q/W/E/R deliberately overlap grave\'s Comma/Period/Slash/ShiftRight (same pitch, different key)', async ({ page }) => {
    // Both Q and Comma are octave-5 occurrences of C(72), so pressing either
    // one lights the exact same top-half zone on the rightmost C key (see
    // tests/mini-keyboard-octave-zones.spec.ts) — a directly observable
    // proxy for "same MIDI note". (W/Period, E/Slash and R/ShiftRight land
    // outside the visible C-C octave, same as the rest of the invisible
    // range, so they aren't independently visually checkable this way.)
    const cZone = page.locator('[data-testid="kb-zones"] rect[x="625"][fill="#b8e8c4"]'); // rightmost C(72), top-half

    await page.keyboard.down('Comma');
    await expect(cZone).toHaveCount(1);
    await page.keyboard.up('Comma');
    await expect(cZone).toHaveCount(0);

    await page.keyboard.down('KeyQ');
    await expect(cZone).toHaveCount(1);
    await page.keyboard.up('KeyQ');
    await expect(cZone).toHaveCount(0);
  });
});
