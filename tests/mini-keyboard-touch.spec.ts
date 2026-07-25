import { test, expect, type Page, type CDPSession } from '@playwright/test';

// Real multi-touch simulation via Chrome DevTools Protocol. Unlike synthetic
// `dispatchEvent(new PointerEvent(...))`, CDP touch injection goes through the
// full input pipeline (trusted events, real per-touch pointerId assignment,
// working setPointerCapture) — the closest thing to real hardware fingers
// that a headless browser can give us. jsdom cannot do this at all.
class MultiTouch {
  private touches: { x: number; y: number; id: number }[] = [];
  private nextId = 1;

  constructor(private client: CDPSession) {}

  // Adds one or more new contacts in a single touchStart (simultaneous press).
  async start(points: { x: number; y: number }[]): Promise<number[]> {
    const ids: number[] = [];
    for (const p of points) {
      const id = this.nextId++;
      this.touches.push({ x: Math.round(p.x), y: Math.round(p.y), id });
      ids.push(id);
    }
    await this.client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: this.touches.map(({ x, y, id }) => ({ x, y, id })),
    });
    return ids;
  }

  async move(id: number, x: number, y: number) {
    const t = this.touches.find((t) => t.id === id);
    if (!t) throw new Error(`touch id ${id} not active`);
    t.x = Math.round(x);
    t.y = Math.round(y);
    await this.client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: this.touches.map(({ x, y, id }) => ({ x, y, id })),
    });
  }

  // Lifts one contact; the rest stay down. Empirically (verified against this
  // Chromium build via a raw pointerdown/pointerup listener), CDP's touchEnd
  // touchPoints list is the set of touches ENDING in this event (like
  // TouchEvent.changedTouches), not the set that remains — so we must list
  // only the one being lifted, not the survivors.
  async end(id: number) {
    const t = this.touches.find((t) => t.id === id);
    if (!t) throw new Error(`touch id ${id} not active`);
    await this.client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [{ x: t.x, y: t.y, id: t.id }],
    });
    this.touches = this.touches.filter((x) => x.id !== id);
  }
}

async function svgBox(page: Page) {
  const svg = page.locator('svg[aria-label="Las doce notas en forma de teclado. Pulsa las teclas para escuchar."]');
  await svg.scrollIntoViewIfNeeded();
  const box = await svg.boundingBox();
  if (!box) throw new Error('svg not found');
  return { svg, box };
}

// Key centers in viewBox units (viewBox="0 0 700 160"), from WHITE_KEYS in MiniKeyboard.tsx.
const KEY_VB = {
  C: { x: 62.5, y: 80 },
  D: { x: 150, y: 80 },
  E: { x: 237.5, y: 80 },
  F: { x: 312.5, y: 80 },
};

function toClient(box: { x: number; y: number; width: number; height: number }, vb: { x: number; y: number }) {
  return { x: box.x + (vb.x / 700) * box.width, y: box.y + (vb.y / 160) * box.height };
}

const PRESSED_WHITE = '#b8e8c4';
const UNPRESSED_WHITE = '#f7f8fb';

test.describe('MiniKeyboard multi-touch', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      throw new Error(`Uncaught page error: ${err.message}`);
    });
    await page.goto('/lecciones/temario/notacion-musical');
  });

  test('two simultaneous fingers release independently', async ({ page }) => {
    const client = await page.context().newCDPSession(page);
    const mt = new MultiTouch(client);
    const { svg, box } = await svgBox(page);
    const whiteKeys = svg.locator('g').nth(0).locator('rect');
    const cKey = whiteKeys.nth(0); // C
    const dKey = whiteKeys.nth(1); // D

    const c = toClient(box, KEY_VB.C);
    const d = toClient(box, KEY_VB.D);

    const [pidC, pidD] = await mt.start([c, d]); // press both "at once"
    await expect(cKey).toHaveAttribute('fill', PRESSED_WHITE);
    await expect(dKey).toHaveAttribute('fill', PRESSED_WHITE);

    await mt.end(pidC); // release the first-detected finger only
    await expect(cKey).toHaveAttribute('fill', UNPRESSED_WHITE);
    await expect(dKey).toHaveAttribute('fill', PRESSED_WHITE); // must NOT be stuck off

    await mt.end(pidD);
    await expect(dKey).toHaveAttribute('fill', UNPRESSED_WHITE);
  });

  test('three fingers respect the polyphony cap and release independently', async ({ page }) => {
    const client = await page.context().newCDPSession(page);
    const mt = new MultiTouch(client);
    const { svg, box } = await svgBox(page);
    const whiteKeys = svg.locator('g').nth(0).locator('rect');
    const [cKey, dKey, eKey, fKey] = [0, 1, 2, 3].map((i) => whiteKeys.nth(i));

    const c = toClient(box, KEY_VB.C);
    const d = toClient(box, KEY_VB.D);
    const e = toClient(box, KEY_VB.E);
    const f = toClient(box, KEY_VB.F);

    const [pidC, pidD, pidE] = await mt.start([c, d, e]);
    await expect(cKey).toHaveAttribute('fill', PRESSED_WHITE);
    await expect(dKey).toHaveAttribute('fill', PRESSED_WHITE);
    await expect(eKey).toHaveAttribute('fill', PRESSED_WHITE);

    const [pidF] = await mt.start([f]); // 4th finger while 3 are held
    await expect(fKey).toHaveAttribute('fill', UNPRESSED_WHITE); // cap respected

    await mt.end(pidD); // lift the middle finger first
    await expect(dKey).toHaveAttribute('fill', UNPRESSED_WHITE);
    await expect(cKey).toHaveAttribute('fill', PRESSED_WHITE); // neighbors unaffected
    await expect(eKey).toHaveAttribute('fill', PRESSED_WHITE);

    await mt.end(pidC);
    await mt.end(pidE);
    await mt.end(pidF); // lifting the ignored 4th touch must not throw
    await expect(cKey).toHaveAttribute('fill', UNPRESSED_WHITE);
    await expect(eKey).toHaveAttribute('fill', UNPRESSED_WHITE);
  });

  test('single-finger drag across keys still switches note (no regression)', async ({ page }) => {
    const client = await page.context().newCDPSession(page);
    const mt = new MultiTouch(client);
    const { svg, box } = await svgBox(page);
    const whiteKeys = svg.locator('g').nth(0).locator('rect');
    const cKey = whiteKeys.nth(0);
    const dKey = whiteKeys.nth(1);

    const c = toClient(box, KEY_VB.C);
    const d = toClient(box, KEY_VB.D);

    const [pid] = await mt.start([c]);
    await expect(cKey).toHaveAttribute('fill', PRESSED_WHITE);

    await mt.move(pid, d.x, d.y);
    await expect(dKey).toHaveAttribute('fill', PRESSED_WHITE);
    await expect(cKey).toHaveAttribute('fill', UNPRESSED_WHITE);

    await mt.end(pid);
    await expect(dKey).toHaveAttribute('fill', UNPRESSED_WHITE);
  });
});
