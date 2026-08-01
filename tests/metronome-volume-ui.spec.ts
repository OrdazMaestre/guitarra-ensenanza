import { test, expect } from '@playwright/test';

test('metronome has its own volume slider below the bpm slider, defaulting to 50%', async ({ page }) => {
  await page.goto('/lecciones/temario/notacion-musical');
  await page.getByRole('button', { name: 'Activar metrónomo' }).first().click();

  const bpmSlider = page.getByLabel('Tempo del metrónomo');
  const volSlider = page.getByLabel('Volumen del metrónomo');
  await expect(bpmSlider).toBeVisible();
  await expect(volSlider).toBeVisible();
  await expect(volSlider).toHaveValue('0.5');

  // Volume row must be below (greater y than) the bpm row.
  const bpmBox = await bpmSlider.boundingBox();
  const volBox = await volSlider.boundingBox();
  expect(bpmBox).not.toBeNull();
  expect(volBox).not.toBeNull();
  if (bpmBox && volBox) expect(volBox.y).toBeGreaterThan(bpmBox.y);

  await volSlider.fill('1');
  await expect(volSlider).toHaveValue('1');
  await expect(page.getByText('Vol 100').first()).toBeVisible();
});
