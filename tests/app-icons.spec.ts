import { test, expect } from '@playwright/test';

// App instalada (PWA): nombre "Riffcademy" e iconos centrados dentro de la zona segura de los
// iconos maskable (scripts/generate-app-icons.mjs).

test('the manifest names the app Riffcademy and offers maskable icons', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Riffcademy');
  expect(manifest.short_name).toBe('Riffcademy');
  for (const size of ['192x192', '512x512']) {
    for (const purpose of ['any', 'maskable']) {
      expect(manifest.icons.some((icon: { sizes: string; purpose: string }) => icon.sizes === size && icon.purpose === purpose), `${size} ${purpose}`).toBe(true);
    }
  }
});

test('the site title and the iOS app name are Riffcademy', async ({ page }) => {
  await page.goto('/lecciones/temario');
  await expect(page).toHaveTitle('Riffcademy');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Riffcademy');
});

test('the app icons are centered, inside the safe zone, with opaque black corners', async ({ page }) => {
  await page.goto('/lecciones/temario');
  for (const src of ['/android-chrome-192x192.png', '/android-chrome-512x512.png', '/apple-touch-icon.png', '/apple-icon.png']) {
    const r = await page.evaluate(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const n = img.naturalWidth;
      const canvas = document.createElement('canvas');
      canvas.width = n;
      canvas.height = n;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, n, n).data;
      let x0 = n, x1 = -1, y0 = n, y1 = -1;
      const white: [number, number][] = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (d[(y * n + x) * 4] > 128) {
          white.push([x, y]);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
      const maxR = Math.max(...white.map(([x, y]) => Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2)));
      const corners = [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]].map(([x, y]) => [...d.slice((y * n + x) * 4, (y * n + x) * 4 + 4)]);
      return { n, offX: (x0 + x1 + 1) / 2 - n / 2, offY: (y0 + y1 + 1) / 2 - n / 2, maxR, corners };
    }, src);
    expect(Math.abs(r.offX), src).toBeLessThanOrEqual(r.n * 0.01);
    expect(Math.abs(r.offY), src).toBeLessThanOrEqual(r.n * 0.01);
    expect(r.maxR, src).toBeLessThanOrEqual(r.n * 0.4);
    for (const corner of r.corners) expect(corner, src).toEqual([0, 0, 0, 255]);
  }
});
