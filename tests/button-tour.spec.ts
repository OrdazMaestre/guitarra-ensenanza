import { test, expect, type Page } from '@playwright/test';

// Tutoriales de botones (app/components/guitar/ButtonTour.tsx) de la sala de pruebas: encima del
// mástil, encima del teclado y en el panel de partida del juego.
test.use({ hasTouch: false });

const URL = '/lecciones/temario/sala-de-pruebas';

async function walk(page: Page, expectedTitles: string[], lastButton = '¡Listo!') {
  const bubble = page.getByRole('dialog', { name: /^Tutorial:/ });
  for (const [i, title] of expectedTitles.entries()) {
    await expect(bubble).toHaveAttribute('aria-label', `Tutorial: ${title}`);
    await expect(bubble).toContainText(`${i + 1} / ${expectedTitles.length}`);
    // El botón resaltado se ve en pantalla.
    const highlight = (await page.locator('.tour-highlight').boundingBox())!;
    expect(highlight.y).toBeGreaterThanOrEqual(0);
    expect(highlight.y + highlight.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await bubble.getByRole('button', { name: i === expectedTitles.length - 1 ? lastButton : 'Siguiente' }).click();
  }
  await expect(bubble).toHaveCount(0);
}

test('tutorial del mástil: recorre los botones de su barra', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  const button = page.locator('.test-room-fretboard').getByRole('button', { name: 'Tutorial' });
  await button.click();
  await walk(page, ['JUGAR', 'Diestro o zurdo', 'Afinar', 'CLEAN / OVERDRIVE', 'Colores', 'KEYBOARD', 'Volumen', 'Metrónomo']);
});

test('tutorial del teclado: KEYBOARD, volumen y metrónomo; Escape lo cierra', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await page.locator('.test-room-keyboard').getByRole('button', { name: 'Tutorial' }).click();
  await walk(page, ['KEYBOARD', 'Volumen', 'Metrónomo']);
  await page.locator('.test-room-keyboard').getByRole('button', { name: 'Tutorial' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('tutorial del panel de partida: pone la configuración de base y enseña sus botones', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await page.locator('.test-room-fretboard').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'JUGAR', exact: true }).click();
  const toggles = page.locator('.riff-dd-toggle');
  await expect(toggles.first()).toContainText('Guitarra solista', { timeout: 10000 });
  // Cambiar ajustes...
  await page.locator('.riff-dd-toggle', { hasText: 'Nivel' }).click();
  await page.locator('.riff-dd-menu').getByRole('button', { name: 'Experto', exact: true }).click();
  await page.locator('.riff-dd-toggle', { hasText: 'Velocidad' }).click();
  await page.locator('.riff-dd-menu').getByRole('button', { name: '100%', exact: true }).click();
  // ...y el tutorial los devuelve a la configuración de base.
  await page.locator('.riff-panel').getByRole('button', { name: 'Tutorial' }).click();
  await expect(toggles).toHaveText([/Guitarra solista/, /Práctica/, /Batería/, /75%/, /Con ritmo/, /^Compases1–\d+▾$/]);
  // El último paso ofrece la partida de prueba ("¡A jugar!"); aquí se rechaza con "Ahora no".
  await walk(page, ['Pista', 'Nivel', 'Acompañamiento', 'Velocidad', 'Ritmo', 'Compases y bucle', 'Partida de prueba'], 'Ahora no');
  await expect(page.locator('.riff-tutorial-card')).toHaveCount(0);
});

test.describe('pantalla táctil', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 400, height: 800 } });
  test('el tutorial del mástil se salta KEYBOARD (no se ve sin teclado físico)', async ({ page }) => {
    await page.goto(URL);
    await page.locator('.test-room-fretboard').getByRole('button', { name: 'Tutorial' }).tap();
    await walk(page, ['JUGAR', 'Diestro o zurdo', 'Afinar', 'CLEAN / OVERDRIVE', 'Colores', 'Volumen', 'Metrónomo']);
  });
});
