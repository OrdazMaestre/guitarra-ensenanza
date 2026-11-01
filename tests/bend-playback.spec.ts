import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart } from '../app/lib/riff/chart';
import { pickTestRoomTabSong } from './sala-song';

// Reproductor de tablaturas en la página real (Sala de pruebas, Canción de prueba = Master of Puppets,
// pista de Kirk sola, bucle en el compás 15). Ver "Bends y ligaduras" en AlphaTabPlayer.NOTES.md.
//   - Ligaduras: el compás 15 tiene 9 notas, 2 de ellas continuaciones ligadas dentro del propio
//     compás -> 7 ataques por vuelta (antes se repulsaban: 9).
//   - Bends: ese compás tiene un bend & release ligado -> curvas en `detune`, máx. +200 cents.

test('tablatura: las notas ligadas no se repulsan y los bends programan detune', async ({ page }) => {
  test.setTimeout(120000);
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync('public/tabs/prueba-master-of-puppets.gp')), new at.Settings());
  const kirk = score.tracks.findIndex((track) => /Kirk/.test(track.name));
  const bar15 = buildChart(at, score, kirk).bars.find((bar) => bar.number === 15)!;
  const loopSeconds = bar15.end - bar15.t;

  await page.addInitScript(() => {
    const w = window as unknown as { __plucks: number[]; __detune: number[] };
    w.__plucks = [];
    w.__detune = [];
    const detuneParams = new WeakSet<AudioParam>();
    const create = BaseAudioContext.prototype.createBufferSource;
    BaseAudioContext.prototype.createBufferSource = function () {
      const source = create.call(this);
      detuneParams.add(source.detune);
      const start = source.start.bind(source);
      source.start = (when = 0, ...rest: number[]) => {
        // Solo muestras de guitarra (las ráfagas de batería son buffers cortos).
        if ((source.buffer?.duration ?? 0) > 0.3) w.__plucks.push(when);
        return start(when, ...rest);
      };
      return source;
    };
    for (const method of ['setValueAtTime', 'linearRampToValueAtTime'] as const) {
      const original = AudioParam.prototype[method];
      AudioParam.prototype[method] = function (value: number, time: number) {
        if (detuneParams.has(this)) w.__detune.push(value);
        return original.call(this, value, time);
      };
    }
  });

  await page.goto('/lecciones/temario/sala-de-pruebas');
  await pickTestRoomTabSong(page);
  await page.waitForTimeout(1500);
  const tab = page.locator('.test-room-tab');
  await tab.scrollIntoViewIfNeeded();

  // Solo Kirk (la otra guitarra sumaría sus propios ataques).
  await tab.getByRole('button', { name: 'Pistas' }).click();
  await page.getByRole('button', { name: 'Solo Rhythm Guitar (Kirk)' }).click();
  await tab.getByRole('button', { name: 'Pistas' }).click();

  // Llevar el compás 15 a la vista y hacer doble clic en su primera nota -> bucle de ese compás.
  const target = await page.evaluate(() => {
    const surface = document.querySelector('.test-room-tab .at-surface')!;
    const texts = [...surface.querySelectorAll('.at-surface-svg text')];
    const number = texts.find((t) => t.textContent?.trim() === '15' && (t.getAttribute('fill') ?? '').toLowerCase() === '#047857')!;
    return number.getBoundingClientRect().left - surface.getBoundingClientRect().left;
  });
  await page.evaluate((x) => {
    const bar = document.querySelector('.test-room-tab [aria-label="Desplazamiento horizontal de la tablatura"]') as HTMLElement;
    bar.scrollLeft = x - 200;
    bar.dispatchEvent(new Event('scroll'));
  }, target);
  await page.waitForTimeout(500);
  const point = await page.evaluate(() => {
    const surface = document.querySelector('.test-room-tab .at-surface')!;
    const texts = [...surface.querySelectorAll('.at-surface-svg text')];
    const number = texts.find((t) => t.textContent?.trim() === '15' && (t.getAttribute('fill') ?? '').toLowerCase() === '#047857')!;
    const left = number.getBoundingClientRect().left;
    const first = texts
      .map((t) => ({ t, r: t.getBoundingClientRect() }))
      .filter(({ t, r }) => /^\d+$/.test(t.textContent?.trim() ?? '') && (t.getAttribute('fill') ?? '').toLowerCase() !== '#047857' && r.left > left)
      .sort((a, b) => a.r.left - b.r.left)[0];
    return { x: first.r.left + first.r.width / 2, y: first.r.top + first.r.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(120);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(500);
  await expect(tab.locator('button[aria-label^="Mover"]')).toHaveCount(2);

  await tab.getByRole('button', { name: 'Reproducir' }).click();
  await page.waitForTimeout((loopSeconds * 3.6 + 1) * 1000);
  await tab.getByRole('button', { name: 'Parar' }).click();

  const { plucks, detune } = await page.evaluate(() => {
    const w = window as unknown as { __plucks: number[]; __detune: number[] };
    return { plucks: [...w.__plucks].sort((a, b) => a - b), detune: w.__detune };
  });
  // Segunda vuelta completa: [t0 + L, t0 + 2L).
  const t0 = plucks[0];
  const secondPass = plucks.filter((when) => when >= t0 + loopSeconds - 0.02 && when < t0 + 2 * loopSeconds - 0.02);
  expect(secondPass.length).toBe(7);
  // Bends: hay curva, llega a full (+200) y nunca pasa de 2 tonos.
  expect(detune.length).toBeGreaterThan(0);
  expect(Math.max(...detune)).toBeGreaterThanOrEqual(199);
  expect(Math.max(...detune.map(Math.abs))).toBeLessThanOrEqual(400);
});
