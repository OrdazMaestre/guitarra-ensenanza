import { test, expect, type Page } from '@playwright/test';

// MiniKeyboard's physical-keyboard input can reach several octaves of the
// same note name, but the SVG only draws one (or, for C, two) instance(s) of
// each. Instead of a plain full-key fill, keyboard-driven presses light a
// slice of the relevant key — bottom/top half for the "main" octaves, a
// thin bright bottom/top edge for the most extreme octaves — so a child can
// see at a glance whether they played a low or high version of a note.
// Mouse/touch input must keep the old simple full-key highlight for every
// note EXCEPT C, whose sympathetic sibling-key highlight is intentionally
// shared between both input methods (see tests/mini-keyboard-c-sibling.spec.ts).

const HALF_FILL = '#b8e8c4';
const EDGE_FILL = '#fbbf24';

function zoneRect(page: Page, x: number, fill: string) {
  return page.locator(`[data-testid="kb-zones"] rect[x="${x}"][fill="${fill}"]`);
}

// Playwright's keyboard.down() takes a "key" name resolved via a US layout;
// `IntlBackslash` (the extra ISO key with no US equivalent) has none, so it
// must be dispatched by explicit `code` via CDP instead.
async function pressByCode(page: Page, code: string, type: 'keyDown' | 'keyUp') {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchKeyEvent', { type, code, key: code });
}

test.describe('MiniKeyboard keyboard-input octave zones', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      throw new Error(`Uncaught page error: ${err.message}`);
    });
    await page.goto('/lecciones/temario/notacion-musical');
    await page.getByRole('button', { name: 'KEYBOARD' }).nth(0).click();
  });

  test('note B (x=550): "<" = bottom edge, "m" = bottom half, "u" = top half', async ({ page }) => {
    const edge = zoneRect(page, 550, EDGE_FILL);
    const half = zoneRect(page, 550, HALF_FILL);

    await pressByCode(page, 'IntlBackslash', 'keyDown');
    await expect(edge).toHaveCount(1);
    await expect(edge).toHaveAttribute('y', /^13\d(\.\d+)?$/); // bottom-edge: near KEY_Y+h-edgeH ≈ 130
    await pressByCode(page, 'IntlBackslash', 'keyUp');
    await expect(edge).toHaveCount(0);

    await page.keyboard.down('KeyM');
    await expect(half).toHaveCount(1);
    await expect(half).toHaveAttribute('y', '80'); // bottom-half: KEY_Y(10) + h(140) - halfH(70) = 80
    await page.keyboard.up('KeyM');
    await expect(half).toHaveCount(0);

    await page.keyboard.down('KeyU');
    await expect(half).toHaveCount(1);
    await expect(half).toHaveAttribute('y', '10'); // top-half: KEY_Y = 10
    await page.keyboard.up('KeyU');
    await expect(half).toHaveCount(0);
  });

  test('note C: "z" = bottom half (left C, x=25), ","/"q" = top half (right C, x=625), "i" = top edge (right C)', async ({ page }) => {
    const leftHalf = zoneRect(page, 25, HALF_FILL);
    const rightHalf = zoneRect(page, 625, HALF_FILL);
    const rightEdge = zoneRect(page, 625, EDGE_FILL);

    await page.keyboard.down('KeyZ');
    await expect(leftHalf).toHaveCount(1);
    await expect(leftHalf).toHaveAttribute('y', '80');
    await page.keyboard.up('KeyZ');
    await expect(leftHalf).toHaveCount(0);

    await page.keyboard.down('Comma');
    await expect(rightHalf).toHaveCount(1);
    await expect(rightHalf).toHaveAttribute('y', '10');
    await page.keyboard.up('Comma');
    await expect(rightHalf).toHaveCount(0);

    await page.keyboard.down('KeyQ');
    await expect(rightHalf).toHaveCount(1);
    await page.keyboard.up('KeyQ');
    await expect(rightHalf).toHaveCount(0);

    await page.keyboard.down('KeyI');
    await expect(rightEdge).toHaveCount(1);
    await page.keyboard.up('KeyI');
    await expect(rightEdge).toHaveCount(0);
  });

  test('mouse/touch input never shows octave-zone overlays, only the plain full-key highlight', async ({ page }) => {
    // Turn kbMode back off — this is a mouse-only interaction check.
    await page.getByRole('button', { name: 'KEYBOARD' }).nth(0).click();
    const svg = page.locator('svg[aria-label="Las doce notas en forma de teclado. Pulsa las teclas para escuchar."]');
    const box = await svg.boundingBox();
    if (!box) throw new Error('svg not found');
    // Center of D (x=100..200 of a 700-wide viewBox) — not C, which
    // deliberately DOES get a zone overlay on its sibling key even via
    // mouse/touch (see tests/mini-keyboard-c-sibling.spec.ts).
    const x = box.x + (150 / 700) * box.width;
    const y = box.y + (80 / 160) * box.height;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(page.locator('[data-testid="kb-zones"] rect')).toHaveCount(0);
    const dKey = svg.locator('g').nth(0).locator('rect').nth(1);
    await expect(dKey).toHaveAttribute('fill', '#b8e8c4'); // full-key highlight, unchanged behavior
    await page.mouse.up();
  });
});
