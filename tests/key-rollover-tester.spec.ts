import { test, expect } from '@playwright/test';
import { rolloverAlternatives, rolloverCombos } from '../app/lib/keyRollover';

// Probador de teclas de la batería (Sala de pruebas, 2026-11-16): con eventos sintéticos, una combinación
// que llega entera pasa sola; «No llegan todas» la marca como fallo y prueba la misma combinación en otras filas.
test.use({ hasTouch: false });

test('combinaciones y alternativas', () => {
  const combos = rolloverCombos();
  expect(combos.length).toBe(15 + 20 + 3);
  const alts = rolloverAlternatives([0, 1, 2]);
  expect(alts[0]).toEqual(['KeyZ', 'KeyX', 'KeyD']);
  expect(alts.length).toBe(4);
  for (const codes of alts) expect(codes[0]).toBe('KeyZ');
});

test('probador de teclas: OK, fallo, alternativa e informe', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/lecciones/temario/sala-de-pruebas');
  // Esperar a que React monte el probador (cerrado = no escucha) antes de abrirlo.
  const tester = page.getByTestId('rollover-tester');
  await expect(tester).toHaveAttribute('data-listening', 'false', { timeout: 30000 });
  await page.locator('.test-room-rollover summary').click();
  await expect(tester).toHaveAttribute('data-listening', 'true');
  const step = page.getByTestId('rollover-step');
  await expect(step).toHaveAttribute('data-target', 'KeyZ,KeyX');

  // Z + X llegan: pasa solo a la siguiente (Z + C) tras soltar.
  await page.keyboard.down('z');
  await page.keyboard.down('x');
  await expect(step.locator('.rollover-status')).toHaveAttribute('data-state', 'ok');
  await page.keyboard.up('z');
  await page.keyboard.up('x');
  await expect(step).toHaveAttribute('data-target', 'KeyZ,KeyC');

  // Z + C "no llega": solo llega Z, se marca con el ratón y se prueba en otra fila.
  await page.keyboard.down('z');
  await page.getByRole('button', { name: 'No llegan todas' }).click();
  await page.keyboard.up('z');
  await expect(step).toHaveAttribute('data-target', 'KeyZ,KeyD');
  await page.keyboard.down('z');
  await page.keyboard.down('d');
  await expect(step.locator('.rollover-status')).toHaveAttribute('data-state', 'ok');
  await page.keyboard.up('z');
  await page.keyboard.up('d');
  await expect(step).toHaveAttribute('data-target', 'KeyZ,KeyV');

  const report = page.getByTestId('rollover-report');
  await expect(report).toContainText('Funcionan (1): Z + X');
  await expect(report).toContainText('Z + C (llegan Z) → sirve Z + D');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
