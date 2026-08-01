import { test, expect, type Page } from '@playwright/test';

// The visible keyboard draws "C" twice (once at each end of the octave).
// Pressing either one — via kbMode OR via mouse/touch — must also light the
// OTHER C at its own fixed height (bottom-half for the left/lower C, top-half
// for the right/higher C), as a sympathetic reminder that both represent the
// same note name. This must not affect any other (non-C) note's plain
// full-key touch/click highlight.

const HALF_FILL = '#b8e8c4';

function zoneRect(page: Page, x: number, fill = HALF_FILL) {
  return page.locator(`[data-testid="kb-zones"] rect[x="${x}"][fill="${fill}"]`);
}

test.describe('MiniKeyboard: C-sibling sympathetic highlight', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      throw new Error(`Uncaught page error: ${err.message}`);
    });
    await page.goto('/lecciones/temario/notacion-musical');
  });

  test('kbMode: pressing left-C (KeyZ) lights right-C top-half; pressing right-C (Comma) lights left-C bottom-half', async ({ page }) => {
    await page.getByRole('button', { name: 'KEYBOARD' }).nth(0).click();
    const rightZone = zoneRect(page, 625); // sympathetic top-half on the right C
    const leftZone = zoneRect(page, 25); // sympathetic bottom-half on the left C

    await page.keyboard.down('z');
    await expect(rightZone).toHaveCount(1);
    await page.keyboard.up('z');
    await expect(rightZone).toHaveCount(0);

    await page.keyboard.down('Comma');
    await expect(leftZone).toHaveCount(1);
    await page.keyboard.up('Comma');
    await expect(leftZone).toHaveCount(0);
  });

  test('touch/click: pressing left-C lights right-C top-half (sympathetic), left-C itself keeps full fill', async ({ page }) => {
    const svg = page.locator('svg[aria-label="Las doce notas en forma de teclado. Pulsa las teclas para escuchar."]');
    await svg.scrollIntoViewIfNeeded();
    const box = await svg.boundingBox();
    if (!box) throw new Error('svg not found');

    const leftCX = box.x + (62.5 / 700) * box.width; // center of left C (x=25..100)
    const y = box.y + (80 / 160) * box.height;

    await page.mouse.move(leftCX, y);
    await page.mouse.down();

    const leftC = svg.locator('g').nth(0).locator('rect').nth(0);
    await expect(leftC).toHaveAttribute('fill', HALF_FILL); // full-key fill, unchanged behavior
    await expect(zoneRect(page, 625)).toHaveCount(1); // right C sympathetic top-half

    await page.mouse.up();
    await expect(zoneRect(page, 625)).toHaveCount(0);
  });

  test('touch/click: pressing right-C lights left-C bottom-half (sympathetic)', async ({ page }) => {
    const svg = page.locator('svg[aria-label="Las doce notas en forma de teclado. Pulsa las teclas para escuchar."]');
    await svg.scrollIntoViewIfNeeded();
    const box = await svg.boundingBox();
    if (!box) throw new Error('svg not found');

    const rightCX = box.x + (650 / 700) * box.width; // center of right C (x=625..675)
    const y = box.y + (80 / 160) * box.height;

    await page.mouse.move(rightCX, y);
    await page.mouse.down();

    const rightC = svg.locator('g').nth(0).locator('rect').nth(7);
    await expect(rightC).toHaveAttribute('fill', HALF_FILL);
    await expect(zoneRect(page, 25)).toHaveCount(1); // left C sympathetic bottom-half

    await page.mouse.up();
    await expect(zoneRect(page, 25)).toHaveCount(0);
  });

  test('touch/click on a non-C note (D) shows no zone overlays at all', async ({ page }) => {
    const svg = page.locator('svg[aria-label="Las doce notas en forma de teclado. Pulsa las teclas para escuchar."]');
    await svg.scrollIntoViewIfNeeded();
    const box = await svg.boundingBox();
    if (!box) throw new Error('svg not found');

    const dX = box.x + (150 / 700) * box.width; // center of D (x=100..200)
    const y = box.y + (80 / 160) * box.height;

    await page.mouse.move(dX, y);
    await page.mouse.down();
    await expect(page.locator('[data-testid="kb-zones"] rect')).toHaveCount(0);
    await page.mouse.up();
  });
});
