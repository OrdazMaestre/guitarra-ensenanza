import { test, expect, type Page } from '@playwright/test';

// Tutoriales de botones (app/components/guitar/ButtonTour.tsx) de la sala de pruebas: encima del
// mástil, encima del teclado y en el panel de partida del juego.
test.use({ hasTouch: false });

const URL = '/lecciones/temario/sala-de-pruebas';

async function walk(page: Page, expectedTitles: string[], lastButton = '¡Listo!') {
  const bubble = page.getByRole('dialog', { name: /^Tutorial:/ });
  for (const [i, title] of expectedTitles.entries()) {
    await expect(bubble).toHaveAttribute('aria-label', `Tutorial: ${title}`);
    // Sin número de paso (petición del usuario).
    expect(await bubble.textContent()).not.toMatch(/\d+ \/ \d+/);
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
  await walk(page, ['JUGAR', 'Diestro o zurdo', 'Afinar', 'CLEAN / OVERDRIVE', 'Colores', 'KEYBOARD', 'Metrónomo']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('tutorial del teclado: KEYBOARD y metrónomo (sin volumen); Escape lo cierra', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await page.locator('.test-room-keyboard').getByRole('button', { name: 'Tutorial' }).click();
  await walk(page, ['KEYBOARD', 'Metrónomo']);
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
  // La sala arranca con Black Gilmur (una sola guitarra): la de prueba tiene las dos pistas.
  await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
  await page.locator('.riff-dd-menu').getByRole('button', { name: 'Canción de prueba', exact: true }).click();
  await expect(toggles.nth(3)).toContainText('Guitarra solista', { timeout: 10000 });
  // Cambiar ajustes...
  await page.locator('.riff-dd-toggle', { hasText: 'Nivel' }).click();
  await page.locator('.riff-dd-menu').getByRole('button', { name: 'Experto', exact: true }).click();
  await page.locator('.riff-dd-toggle', { hasText: 'Velocidad' }).click();
  await page.locator('.riff-dd-menu').getByRole('button', { name: '100%', exact: true }).click();
  // ...y el tutorial los devuelve a la configuración de base.
  await page.locator('.riff-panel').getByRole('button', { name: 'Tutorial' }).click();
  await expect(toggles).toHaveText([/Principiante/, /100%/, /Canción de prueba/, /Guitarra solista/, /MetrónomoNada/, /Con ritmo/, /^Compases1–\d+▾$/, /Concierto.*no/]);
  // El último paso ofrece la partida de prueba ("¡A jugar!"); aquí se rechaza con "Ahora no".
  await walk(page, ['Nivel', 'Velocidad', 'Canción', 'Pistas', 'Metrónomo', 'Ritmo', 'Compases y bucle', 'Concierto', 'Activa el teclado', 'Partida de prueba'], 'Ahora no');
  await expect(page.locator('.riff-tutorial-card')).toHaveCount(0);
});

test.describe('pantalla táctil', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 400, height: 800 } });
  test('el tutorial del mástil se salta KEYBOARD (no se ve sin teclado físico)', async ({ page }) => {
    await page.goto(URL);
    // Hasta que la página está hidratada, el toque no hace nada: se repite hasta que abre.
    await expect(async () => {
      await page.locator('.test-room-fretboard').getByRole('button', { name: 'Tutorial' }).tap();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await walk(page, ['JUGAR', 'Diestro o zurdo', 'Afinar', 'CLEAN / OVERDRIVE', 'Colores', 'Metrónomo']);
  });
});

test('Colores: el globo dice para qué sirve, en una frase', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await page.locator('.test-room-fretboard').getByRole('button', { name: 'Tutorial' }).click();
  const bubble = page.getByRole('dialog', { name: /^Tutorial:/ });
  while ((await bubble.getAttribute('aria-label')) !== 'Tutorial: Colores') await bubble.getByRole('button', { name: 'Siguiente' }).click();
  await expect(bubble).toContainText('Pinta notas para ver dónde se repiten.');
});

// Los instrumentos MIDI de los temas 1 a 6 (y sus ramas) llevan su botón "Tutorial": dentro de su
// `.midi-instrument-host` (diagramas propios de cada lección) o justo encima (mástil y teclado
// compartidos). Cada uno enseña solo los botones que tiene ese instrumento. Del tema 7 en adelante
// no lo llevan (decisión del usuario, 2026-11-01).
const MIDI_PAGES = [
  '/lecciones/temario/conceptos-basicos',
  '/lecciones/temario/tablaturas',
  '/lecciones/temario/notacion-musical',
  '/lecciones/temario/afinacion',
  '/lecciones/temario/figuras-de-acordes',
];

const NO_TUTORIAL_PAGES = [
  '/lecciones/temario/ampliacion-arpegios',
  '/lecciones/temario/pentatonica',
  '/lecciones/temario/ejercicios-pentatonica',
  '/lecciones/temario/ejercicios-pentatonica-avanzados',
  '/lecciones/temario/pentatonica-blues',
  '/lecciones/temario/ejercicios-pentatonica-blues',
  '/lecciones/temario/escalas',
  '/lecciones/temario/escala-completa-sol-mayor',
  '/lecciones/temario/ejercicios-escalas',
  '/lecciones/temario/ejercicios-escalas-avanzados',
  '/lecciones/temario/acordes-escala-sol-mayor',
  '/lecciones/temario/acordes-con-septima',
];

for (const path of NO_TUTORIAL_PAGES) {
  test(`${path} (del tema 7 en adelante) no lleva tutorial en sus instrumentos`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(path);
    await expect(page.locator('.midi-instrument-host').first()).toBeAttached({ timeout: 15000 });
    await expect(page.locator('.tour-launch')).toHaveCount(0);
  });
}

for (const path of MIDI_PAGES) {
  test(`cada instrumento MIDI de ${path} tiene su tutorial`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(path);
    const hosts = page.locator('.midi-instrument-host');
    await expect(hosts.first()).toBeAttached({ timeout: 15000 });
    const missing = await hosts.evaluateAll((els) => els.filter((host) => {
      const inside = host.querySelector(':scope > .instrument-tutorial-row .tour-launch');
      const before = host.previousElementSibling?.querySelector('.tour-launch');
      return !inside && !before;
    }).length);
    expect(missing).toBe(0);
    // El primero abre su recorrido, sobre un botón de SU barra.
    const launch = page.locator('.tour-launch').first();
    await launch.scrollIntoViewIfNeeded();
    await launch.click();
    const bubble = page.getByRole('dialog', { name: /^Tutorial:/ });
    await expect(bubble).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(bubble).toHaveCount(0);
  });
}

test('portada: la guitarra y el teclado del menú Instrumentos llevan su tutorial', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/lecciones/temario');
  for (const name of ['Guitarra', 'Teclado']) {
    if ((await page.locator('#portada2-instrumentos').count()) === 0) await page.getByRole('button', { name: 'Instrumentos' }).click();
    await page.locator('#portada2-instrumentos').getByRole('button', { name }).click();
    const section = page.locator('.portada2-instrument');
    const launch = section.getByRole('button', { name: 'Tutorial' });
    await launch.scrollIntoViewIfNeeded();
    await launch.click();
    const bubble = page.getByRole('dialog', { name: /^Tutorial:/ });
    await expect(bubble).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(bubble).toHaveCount(0);
  }
});
