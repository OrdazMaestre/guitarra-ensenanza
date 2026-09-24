import { test, expect, type Page } from '@playwright/test';

// Mesa de mezclas, disponible en toda la web (montada una sola vez en app/layout.tsx), sin
// relación con AlphaTabPlayer.tsx ni guitarAudioEngine.ts. Ver app/lib/mixingConsole/NOTES.md
// para el diseño completo. La mayoría de estos tests navegan a sala-de-pruebas por costumbre (es
// donde nació, y una página tan buena como cualquier otra), pero el propio test "disponible en
// cualquier página" comprueba explícitamente que también funciona en otras rutas.
//
// `window.__mixingConsoleEngine` (expuesto solo fuera de producción, ver MixingConsole.tsx) da
// acceso a MixingConsoleEngine.getDebugSnapshot(), que lee los valores REALES de los AudioParam
// del grafo de Web Audio -- necesario porque los elementos <audio> del motor nunca se insertan en
// el DOM (new Audio()), así que document.querySelector no los encuentra.

async function openPanel(page: Page) {
  await page.goto('/lecciones/temario/sala-de-pruebas');
  await page.getByRole('button', { name: 'Abrir mesa de mezclas' }).click();
  await expect(page.getByRole('region', { name: 'Mesa de mezclas' })).toBeVisible();
}

// Regresión de dos bugs reales encontrados con el enfoque anterior (mantener el botón/panel
// DENTRO de .site-shell, confiando en su filtro `invert(1) hue-rotate(180deg)` para el color):
// (1) el color quedaba invertido dos veces si se le daba una paleta oscura propia, y (2) al ser
// .site-shell el containing block de position:fixed en modo oscuro (efecto secundario de `filter`
// en la spec de CSS) Y un bloque normal que se desplaza con el scroll, el botón/panel se
// desalineaban y "flotaban" con retraso detrás del scroll real. La solución final es portar el
// botón/panel a document.body (createPortal, fuera de .site-shell) -- exactamente como ya hace
// .theme-toggle-button en globals.css -- así vuelven a ser position:fixed nativo de verdad, sin
// JS de por medio y sin depender del filtro del sitio. Como consecuencia, ahora SÍ declaran su
// propia paleta oscura (igual que .theme-toggle-button). Ver "Modo claro/oscuro" en
// app/lib/mixingConsole/NOTES.md.
test('theme: the button/panel render outside .site-shell (portal) and use their own dark-mode palette', async ({
  page,
}) => {
  await openPanel(page);

  const parentage = await page.evaluate(() => {
    const toggle = document.querySelector('.mixing-console-toggle-button');
    const panel = document.querySelector('.mixing-console-panel');
    const shell = document.querySelector('.site-shell');
    return {
      toggleParentIsBody: toggle?.parentElement === document.body,
      panelParentIsBody: panel?.parentElement === document.body,
      toggleInsideShell: !!shell && shell.contains(toggle),
      panelInsideShell: !!shell && shell.contains(panel),
    };
  });
  expect(parentage).toEqual({
    toggleParentIsBody: true,
    panelParentIsBody: true,
    toggleInsideShell: false,
    panelInsideShell: false,
  });

  const panelBgLight = await page.locator('.mixing-console-panel').evaluate(el => getComputedStyle(el).backgroundColor);

  await page.getByRole('button', { name: 'Cambiar entre modo claro y modo oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(200); // let the background-color 160ms transition finish before reading the final color

  const panelBgDark = await page.locator('.mixing-console-panel').evaluate(el => getComputedStyle(el).backgroundColor);
  expect(panelBgDark).not.toBe(panelBgLight); // must actually differ now -- no filter to invert it automatically anymore
});

// Regresión de la desalineación/retraso de scroll: al vivir fuera de .site-shell, el botón/panel
// vuelven a ser position:fixed relativo al viewport de verdad, así que deben quedar en el mismo
// sitio en claro/oscuro y seguir el scroll SIN NINGÚN retraso (nada de JS reaplicando un offset
// frame a frame, a diferencia del enfoque anterior).
test('theme: the toggle button and panel land at the exact same screen position in light and dark mode, and follow scroll with zero lag', async ({
  page,
}) => {
  await openPanel(page);
  await page.mouse.move(400, 400); // away from the toggle button, so :hover's transform:scale(1.06) doesn't skew the measurement
  await page.waitForTimeout(200); // let the hover-out transition (transform 160ms) finish before measuring

  const toggleLight = await page.locator('.mixing-console-toggle-button').boundingBox();
  const panelLight = await page.locator('.mixing-console-panel').boundingBox();

  await page.getByRole('button', { name: 'Cambiar entre modo claro y modo oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.mouse.move(400, 401); // away from both toggle buttons for the same reason
  await page.waitForTimeout(200); // let the hover-out transition settle

  const toggleDark = await page.locator('.mixing-console-toggle-button').boundingBox();
  const panelDark = await page.locator('.mixing-console-panel').boundingBox();

  expect(toggleDark?.x).toBeCloseTo(toggleLight?.x ?? -1, 0);
  expect(toggleDark?.y).toBeCloseTo(toggleLight?.y ?? -1, 0);
  expect(panelDark?.x).toBeCloseTo(panelLight?.x ?? -1, 0);
  expect(panelDark?.y).toBeCloseTo(panelLight?.y ?? -1, 0);

  // Now scroll and measure IMMEDIATELY (no waitForTimeout) -- a JS-driven compensation would still
  // be mid-flight here; native position:fixed is instantaneous. window.scrollTo (not a simulated
  // mouse wheel) so the test doesn't depend on what happens to be under the cursor -- the sala-de-
  // pruebas tablature below the panel captures wheel/pointer events for its own note-input/scroll
  // handling (touch-action: none), which made a simulated wheel unreliable here.
  const before = await page.locator('.mixing-console-toggle-button').boundingBox();
  await page.evaluate(() => window.scrollTo(0, 1500));
  const after = await page.locator('.mixing-console-toggle-button').boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);

  expect(scrollY).toBeGreaterThan(100); // sanity check the page actually scrolled
  expect(after?.x).toBeCloseTo(before?.x ?? -1, 0);
  expect(after?.y).toBeCloseTo(before?.y ?? -1, 0);
});

test('the toggle button is available on the homepage too, not just sala-de-pruebas', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Abrir mesa de mezclas' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('region', { name: 'Mesa de mezclas' })).toBeVisible();
});

test('the panel stays open and playback keeps going after a client-side navigation to another page', async ({
  page,
}) => {
  await openPanel(page);
  const mixerPanel = page.getByRole('region', { name: 'Mesa de mezclas' });
  await expect(mixerPanel.getByRole('button', { name: 'Pausar' })).toBeVisible(); // autoplayed on open

  // force: true -- .test-room-back isn't in globals.css's link-tilt-animation exclusion list, so
  // it never sits still long enough for Playwright's actionability ("element is stable") check.
  await page.getByRole('link', { name: 'Volver a Pasos' }).click({ force: true });
  await expect(page).toHaveURL(/\/lecciones\/temario\/pasos$/);

  // MixingConsole lives in the root layout, which Next.js does not remount on a client-side
  // navigation -- the panel should still be open, still playing, on the new page.
  await expect(mixerPanel).toBeVisible();
  await expect(mixerPanel.getByRole('button', { name: 'Pausar' })).toBeVisible();
  const snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  for (const id of Object.keys(snapshot)) expect(snapshot[id].paused).toBe(false);
});

test('panel opens above content without pushing layout, and closes again', async ({ page }) => {
  await page.goto('/lecciones/temario/sala-de-pruebas');
  const header = page.locator('.test-room-header');
  const headerBoxBefore = await header.boundingBox();

  const toggle = page.getByRole('button', { name: 'Abrir mesa de mezclas' });
  await toggle.click();
  const panel = page.getByRole('region', { name: 'Mesa de mezclas' });
  await expect(panel).toBeVisible();

  const headerBoxAfter = await header.boundingBox();
  expect(headerBoxAfter?.y).toBeCloseTo(headerBoxBefore?.y ?? 0, 0);

  const panelBox = await panel.boundingBox();
  const panelZ = await panel.evaluate(el => getComputedStyle(el).position);
  expect(panelZ).toBe('fixed');
  expect(panelBox).not.toBeNull();

  await page.getByRole('button', { name: 'Cerrar mesa de mezclas' }).click();
  await expect(panel).not.toBeVisible();
});

test('song selector (arrows + list) updates instrument boxes: 3 for MAIkael/Black Gilmur, 4 for Electric Warlock/Iron Rain', async ({
  page,
}) => {
  await openPanel(page);

  // Song names shown are the fictional band names (see SONG_LABELS in audioEngine.ts), not the
  // facil/dificil/mini-torneo/campeonato ids used elsewhere on the site (e.g. quiz mode labels).
  // Each song's scale (from SONG_SCALES, taken from the source WAV folder names) shows between the
  // "next song" arrow and the play/pause button.
  await expect(page.getByText('MAIkael', { exact: true })).toBeVisible();
  await expect(page.locator('.mc-song-scale')).toHaveText('G major');
  let strips = page.locator('.mc-channels > div');
  await expect(strips).toHaveCount(3);
  await expect(strips.nth(0)).toContainText('Bajo');
  await expect(strips.nth(1)).toContainText('Batería');
  await expect(strips.nth(2)).toContainText('Guitarras');

  // Next arrow -> Black Gilmur (still 3, same instrument names).
  await page.getByRole('button', { name: 'Canción siguiente' }).click();
  await expect(page.getByText('Black Gilmur', { exact: true })).toBeVisible();
  await expect(page.locator('.mc-song-scale')).toHaveText('C# minor');
  strips = page.locator('.mc-channels > div');
  await expect(strips).toHaveCount(3);

  // Next arrow -> Electric Warlock (4 boxes, lead/rhythm instead of guitars).
  await page.getByRole('button', { name: 'Canción siguiente' }).click();
  await expect(page.getByText('Electric Warlock', { exact: true })).toBeVisible();
  await expect(page.locator('.mc-song-scale')).toHaveText('F# minor');
  strips = page.locator('.mc-channels > div');
  await expect(strips).toHaveCount(4);
  await expect(strips.nth(2)).toContainText('Guitarra líder');
  await expect(strips.nth(3)).toContainText('Guitarra rítmica');

  // Click the song NAME (not the arrows) to open the dropdown list and jump straight to Iron Rain.
  await page.getByRole('button', { name: 'Electric Warlock', exact: true }).click();
  await expect(page.getByRole('listbox', { name: 'Elegir canción' })).toBeVisible();
  await page.getByRole('option', { name: 'Iron Rain' }).click();
  await expect(page.getByText('Iron Rain', { exact: true })).toBeVisible();
  await expect(page.locator('.mc-song-scale')).toHaveText('Eb minor');
  strips = page.locator('.mc-channels > div');
  await expect(strips).toHaveCount(4);

  // Previous arrow wraps from MAIkael back around to Iron Rain.
  await page.getByRole('button', { name: 'Canción siguiente' }).click(); // Iron Rain -> MAIkael (wrap forward)
  await expect(page.getByText('MAIkael', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Canción anterior' }).click(); // MAIkael -> Iron Rain (wrap backward)
  await expect(page.getByText('Iron Rain', { exact: true })).toBeVisible();
});

test('opening the panel for the first time autoplays; collapsing does not stop playback; pause/resume still work manually', async ({
  page,
}) => {
  await openPanel(page);

  // Autoplay on first open: no click on "Reproducir" needed, it should already read "Pausar".
  const mixerPanel = page.getByRole('region', { name: 'Mesa de mezclas' });
  await expect(mixerPanel.getByRole('button', { name: 'Pausar' })).toBeVisible();

  await page.waitForTimeout(500);
  let snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  const ids = Object.keys(snapshot);
  expect(ids.length).toBe(3); // MAIkael = bass/drums/guitars
  for (const id of ids) expect(snapshot[id].paused).toBe(false);

  // Collapse the panel while it's playing.
  await page.getByRole('button', { name: 'Cerrar mesa de mezclas' }).click();
  await expect(page.getByRole('region', { name: 'Mesa de mezclas' })).not.toBeVisible();

  await page.waitForTimeout(1500);
  snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  for (const id of Object.keys(snapshot)) expect(snapshot[id].paused).toBe(false);

  // Re-open: does NOT autoplay again (it's already playing, and the "first open" autoplay only
  // fires once ever) -- pause manually, then resume manually, both still work as normal controls.
  await page.getByRole('button', { name: 'Abrir mesa de mezclas' }).click();
  await page.getByRole('button', { name: 'Pausar' }).click();
  snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  for (const id of Object.keys(snapshot)) expect(snapshot[id].paused).toBe(true);

  await mixerPanel.getByRole('button', { name: 'Reproducir' }).click();
  snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  for (const id of Object.keys(snapshot)) expect(snapshot[id].paused).toBe(false);
});

test('selecting a song (arrow or list) autoplays it too', async ({ page }) => {
  await openPanel(page);
  const mixerPanel = page.getByRole('region', { name: 'Mesa de mezclas' });
  await expect(mixerPanel.getByRole('button', { name: 'Pausar' })).toBeVisible(); // autoplayed on open

  // Pause, then change song via the next arrow -> should start playing again on its own.
  await mixerPanel.getByRole('button', { name: 'Pausar' }).click();
  await expect(mixerPanel.getByRole('button', { name: 'Reproducir' })).toBeVisible();
  await page.getByRole('button', { name: 'Canción siguiente' }).click();
  await expect(page.getByText('Black Gilmur', { exact: true })).toBeVisible();
  await expect(mixerPanel.getByRole('button', { name: 'Pausar' })).toBeVisible();
  let snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  for (const id of Object.keys(snapshot)) expect(snapshot[id].paused).toBe(false);

  // Pause again, then pick a song from the dropdown list -> also autoplays.
  await mixerPanel.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Black Gilmur', exact: true }).click();
  await page.getByRole('option', { name: 'Iron Rain' }).click();
  await expect(page.getByText('Iron Rain', { exact: true })).toBeVisible();
  await expect(mixerPanel.getByRole('button', { name: 'Pausar' })).toBeVisible();
  snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  for (const id of Object.keys(snapshot)) expect(snapshot[id].paused).toBe(false);
});

test('moving a fader/knob produces a real, measurable change in the audio graph', async ({ page }) => {
  await openPanel(page);

  const bajoStrip = page.locator('.mc-channels > div').first();
  await expect(bajoStrip).toContainText('Bajo');

  // Volume slider (vertical) -> real GainNode value.
  const volumeSlider = bajoStrip.getByRole('slider', { name: 'Volumen de Bajo' });
  await volumeSlider.fill('0.2');
  let snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  expect(snapshot.bass.gain).toBeCloseTo(0.2, 2);

  // Master volume -> real master GainNode value (indirectly, verified via channel gain staying
  // the same while master changes; master itself isn't in the per-channel snapshot, so we assert
  // the UI reflects it and no console error was thrown by moving it).
  const masterSlider = page.getByRole('slider', { name: 'Volumen máster' });
  await masterSlider.fill('0.5');
  await expect(page.locator('.mc-master-volume-value')).toHaveText('50');

  // Pan knob (drag) -> real StereoPannerNode.pan value.
  const panKnob = bajoStrip.getByRole('slider', { name: 'Panorama de Bajo' });
  const panBox = await panKnob.boundingBox();
  if (!panBox) throw new Error('pan knob not found');
  const centerX = panBox.x + panBox.width / 2;
  const centerY = panBox.y + panBox.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX, centerY + 80, { steps: 8 }); // drag DOWN -> should decrease value (toward left)
  await page.mouse.up();
  snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  expect(snapshot.bass.pan).toBeLessThan(0);

  // EQ high knob (drag up) -> real BiquadFilterNode(high).gain value.
  const highKnob = bajoStrip.getByRole('slider', { name: 'Agudos de Bajo' });
  const highBox = await highKnob.boundingBox();
  if (!highBox) throw new Error('high EQ knob not found');
  const hx = highBox.x + highBox.width / 2;
  const hy = highBox.y + highBox.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx, hy - 80, { steps: 8 }); // drag UP -> should increase value
  await page.mouse.up();
  snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  expect(snapshot.bass.high).toBeGreaterThan(0);
});

test('mute/solo are correctly exclusive per song', async ({ page }) => {
  await openPanel(page);

  const strips = page.locator('.mc-channels > div');
  const bajo = strips.nth(0);
  const bateria = strips.nth(1);
  const guitarras = strips.nth(2);

  // Solo on Bajo -> Bajo audible, others silenced (gain forced to 0) though not individually muted.
  await bajo.getByRole('button', { name: 'Solo Bajo' }).click();
  let snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  expect(snapshot.bass.gain).toBeGreaterThan(0);
  expect(snapshot.drums.gain).toBe(0);
  expect(snapshot.guitars.gain).toBe(0);

  // Solo on Batería instead -> exclusive, Bajo goes back to silent (never both soloed).
  await bateria.getByRole('button', { name: 'Solo Batería' }).click();
  snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  expect(snapshot.drums.gain).toBeGreaterThan(0);
  expect(snapshot.bass.gain).toBe(0);
  expect(snapshot.guitars.gain).toBe(0);

  // Turn solo off -> everyone audible again.
  await bateria.getByRole('button', { name: 'Solo Batería' }).click();
  snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  expect(snapshot.bass.gain).toBeGreaterThan(0);
  expect(snapshot.drums.gain).toBeGreaterThan(0);
  expect(snapshot.guitars.gain).toBeGreaterThan(0);

  // Mute is independent: muting Guitarras alone silences only that channel.
  await guitarras.getByRole('button', { name: 'Silenciar Guitarras' }).click();
  snapshot = await page.evaluate(() => window.__mixingConsoleEngine?.getDebugSnapshot() ?? {});
  expect(snapshot.guitars.gain).toBe(0);
  expect(snapshot.bass.gain).toBeGreaterThan(0);
  expect(snapshot.drums.gain).toBeGreaterThan(0);
});

test('no horizontal overflow at desktop (1280px) and mobile (390px) widths', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openPanel(page);
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('no console errors while opening, switching songs, playing and adjusting controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(String(err)));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await openPanel(page);
  await page.getByRole('button', { name: 'Canción siguiente' }).click(); // autoplays on its own now
  await page.waitForTimeout(300);
  const bajoStrip = page.locator('.mc-channels > div').first();
  await bajoStrip.getByRole('slider', { name: 'Volumen de Bajo' }).fill('0.4');
  await page.getByRole('button', { name: 'Cerrar mesa de mezclas' }).click();
  await page.waitForTimeout(200);

  expect(errors).toEqual([]);
});
