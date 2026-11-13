import { test, expect } from '@playwright/test';

// Detector de mandos de la Sala de pruebas (investigación, 2026-11-13): con un mando simulado de mapeo
// estándar, enseña sus botones pulsados y el mapeo propuesto para la guitarra (verde = traste 1, púa = cruceta).
test('detector de mandos: enseña botones, ejes y el mapeo propuesto', async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, (_, k) => ({ pressed: k === 0 || k === 12, touched: false, value: k === 0 || k === 12 ? 1 : 0 }));
    const pad = { id: 'Guitarra de prueba (XInput)', index: 0, mapping: 'standard', connected: true, buttons, axes: [0, 0, 0.5, -1], timestamp: 1 };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
  });
  await page.goto('/lecciones/temario/sala-de-pruebas');
  await page.locator('.test-room-gamepad summary').click();
  const detector = page.getByTestId('gamepad-detector');
  await expect(detector).toContainText('Guitarra de prueba (XInput)');
  await expect(detector).toContainText('Botones pulsados: 0, 12');
  await expect(detector.locator('li[data-on="true"]')).toHaveText([/Traste 1 \(verde\)/, /Púa/]);
});
