import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Sala de pruebas (usuario, 2026-11-17): selector Guitarra / Bajo en el mástil (bajo de 4 cuerdas con el
// sonido del bajo, afinado en Mi), el bajo que suena en el mástil fuera de la partida en curso, y la batería
// MIDI suelta debajo del teclado (la del modo batería, con su JUGAR). El bajo es un OSCILADOR (sierra +
// seno grave) y la guitarra, una muestra: se cuentan los osciladores y se apuntan sus frecuencias.
test.use({ hasTouch: false });

const URL = '/lecciones/temario/sala-de-pruebas';

async function spyAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __saw: number[]; __oscs: number };
    w.__saw = [];
    w.__oscs = 0;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      const osc = create.call(this);
      w.__oscs++;
      const set = osc.frequency.setValueAtTime.bind(osc.frequency);
      osc.frequency.setValueAtTime = (value: number, time: number) => {
        if (osc.type === 'sawtooth') w.__saw.push(value);
        return set(value, time);
      };
      return osc;
    };
  });
}

const sawFreqs = (page: Page) => page.evaluate(() => (window as unknown as { __saw: number[] }).__saw);
const resetSaw = (page: Page) => page.evaluate(() => { (window as unknown as { __saw: number[] }).__saw = []; });

async function chooseNeck(page: Page, label: 'Guitarra' | 'Bajo') {
  const neck = page.locator('.test-room-fretboard');
  const option = neck.locator('[role="menuitemradio"]', { hasText: label });
  // Hasta que React haya montado la página, el clic no abre el menú: se repite.
  await expect(async () => {
    if (!(await option.isVisible())) await neck.locator('.neck-instrument-toggle').click();
    await expect(option).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30000 });
  await option.click();
}

test('bajo en la sala: 4 cuerdas, sonido de bajo afinado en Mi, se recuerda', async ({ page }) => {
  await spyAudio(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  const neck = page.locator('.test-room-fretboard');
  await expect(neck.locator('.neck-instrument-toggle')).toHaveAttribute('aria-label', 'Instrumento: Guitarra', { timeout: 30000 });
  await expect(neck.locator('.reduced-string')).toHaveCount(6);
  await chooseNeck(page, 'Bajo');
  await expect(neck.locator('.neck-instrument-toggle')).toHaveAttribute('aria-label', 'Instrumento: Bajo');
  await expect(neck.locator('.reduced-string')).toHaveCount(4);
  // Centradas como las 4 cuerdas de Difícil (usuario, 2026-11-18): el mismo hueco entre cuerdas y el mismo margen
  // arriba y abajo; más gruesas que las de la guitarra y, en el tema claro, grises (sin colores).
  const strings = await neck.locator('svg.reduced-fretboard .reduced-string').evaluateAll((els) => els.map((el) => ({
    string: Number(el.getAttribute('data-string')),
    y: Number(el.getAttribute('y1')),
    color: getComputedStyle(el).stroke,
    width: getComputedStyle(el).strokeWidth,
  })));
  expect(new Set(strings.map((s) => s.color))).toEqual(new Set(['rgb(156, 163, 175)']));
  expect(new Set(strings.map((s) => s.width))).toEqual(new Set(['5px']));
  // En el tema oscuro, los colores de Difícil: de aguda a grave amarillo, azul, verde y rojo.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(await neck.locator('svg.reduced-fretboard .reduced-string').evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke)))
    .toEqual(['rgb(250, 204, 21)', 'rgb(59, 130, 246)', 'rgb(34, 197, 94)', 'rgb(239, 68, 68)']);
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  const board = await neck.locator('svg.reduced-fretboard .reduced-board-bg').evaluate((el) => ({ top: Number(el.getAttribute('y')), height: Number(el.getAttribute('height')) }));
  const ys = strings.map((s) => s.y);
  expect(Math.abs((ys[0] - board.top) - (board.top + board.height - ys[3]))).toBeLessThan(0.5);
  expect(Math.abs((ys[1] - ys[0]) - (ys[3] - ys[2]))).toBeLessThan(0.5);
  // Sin afinación ni CLEAN/OVERDRIVE en el bajo.
  await expect(neck.getByRole('button', { name: 'Afinar el mástil' })).toHaveCount(0);
  await expect(neck.getByRole('button', { name: 'Cambiar sonido clean u overdrive' })).toHaveCount(0);

  // Teclado: Z = Mi grave (E1, 41,2 Hz), A = La (A1, 55 Hz), Q = Re (D2), 1 = Sol (G2).
  await neck.locator('.midi-kb-toggle').click();
  await resetSaw(page);
  for (const key of ['KeyZ', 'KeyA', 'KeyQ', 'Digit1']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(80);
    await page.keyboard.up(key);
  }
  await expect.poll(async () => (await sawFreqs(page)).length).toBeGreaterThanOrEqual(4);
  const freqs = (await sawFreqs(page)).slice(0, 4).map((f) => Math.round(f * 10) / 10);
  expect(freqs).toEqual([41.2, 55, 73.4, 98]);

  // Se recuerda al volver a la página; y se vuelve a la guitarra.
  await page.reload();
  await expect(neck.locator('.neck-instrument-toggle')).toHaveAttribute('aria-label', 'Instrumento: Bajo', { timeout: 30000 });
  await chooseNeck(page, 'Guitarra');
  await expect(neck.locator('.reduced-string')).toHaveCount(6);
});

test('bajo + JUGAR: la partida abre con el bajo y, sin estar tocando, el mástil suena a bajo', async ({ page }) => {
  await spyAudio(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  const neck = page.locator('.test-room-fretboard');
  await expect(neck.locator('.neck-instrument-toggle')).toBeVisible({ timeout: 30000 });
  await chooseNeck(page, 'Bajo');
  await neck.locator('.riff-open-toggle').click();
  await expect(neck.locator('.riff-dd-toggle', { hasText: 'Pistas' })).toHaveAttribute('aria-label', /Bajo/, { timeout: 30000 });
  // Antes de empezar (y en pausa, el mismo camino): el mástil toca notas de bajo.
  await neck.locator('.midi-kb-toggle').click();
  await resetSaw(page);
  await page.keyboard.down('KeyZ');
  await page.waitForTimeout(100);
  await page.keyboard.up('KeyZ');
  await expect.poll(async () => (await sawFreqs(page)).length).toBeGreaterThan(0);
  // Mi grave de la canción (bajada hasta Do#): por debajo de 45 Hz, nunca una guitarra (82 Hz).
  expect((await sawFreqs(page))[0]).toBeLessThan(45);
  // Elegir la guitarra en Tocas pone el selector en Guitarra.
  await neck.locator('.riff-dd-toggle', { hasText: 'Pistas' }).click();
  await neck.locator('.riff-dd-menu').getByRole('button', { name: /^Guitarra/ }).first().click();
  await neck.locator('.riff-open-toggle').click();
  await expect(neck.locator('.neck-instrument-toggle')).toHaveAttribute('aria-label', 'Instrumento: Guitarra');
  await expect(neck.locator('.reduced-string')).toHaveCount(6);
});

test('bajo + JUGAR con una canción sin bajo: se toca la guitarra y el selector sigue en Bajo', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  const neck = page.locator('.test-room-fretboard');
  await expect(neck.locator('.neck-instrument-toggle')).toBeVisible({ timeout: 30000 });
  await chooseNeck(page, 'Bajo');
  await neck.locator('.riff-open-toggle').click();
  await expect(neck.locator('.riff-dd-toggle', { hasText: 'Pistas' })).toHaveAttribute('aria-label', /Bajo/, { timeout: 30000 });
  // Cumpleaños feliz (solo guitarra), como canción del dispositivo.
  await neck.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
  await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
  await page.getByTestId('local-song-files').setInputFiles([{ name: 'cumpleanos-feliz.gp', mimeType: 'application/octet-stream', buffer: readFileSync('public/tabs/cumpleanos-feliz.gp') }]);
  await neck.locator('.riff-dd-menu').getByRole('button', { name: 'cumpleanos-feliz', exact: true }).click();
  await expect(neck.locator('.riff-dd-toggle[aria-label^="Canción"]')).toHaveAttribute('aria-label', /cumpleanos-feliz/, { timeout: 30000 });
  await expect(neck.locator('.riff-dd-toggle', { hasText: 'Pistas' })).toHaveAttribute('aria-label', /Guitarra/, { timeout: 30000 });
  await expect(neck.locator('svg.reduced-fretboard .reduced-string')).toHaveCount(6);
  // Al salir, el mástil vuelve a ser el bajo elegido.
  await neck.locator('.riff-open-toggle').click();
  await expect(neck.locator('.neck-instrument-toggle')).toHaveAttribute('aria-label', 'Instrumento: Bajo');
  await expect(neck.locator('svg.reduced-fretboard .reduced-string')).toHaveCount(4);
});

test('batería suelta: suena fuera de la partida, zurdo, su JUGAR en modo batería y una sola partida abierta', async ({ page }) => {
  await spyAudio(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  const drums = page.locator('.test-room-drums');
  await expect(drums.locator('svg.riff-drum-neck')).toBeVisible({ timeout: 30000 });
  await expect(drums.locator('.riff-drum-piece')).toHaveCount(6);
  // Controles: JUGAR, diestro/zurdo, KEYBOARD, volumen y metrónomo; sin paleta ni afinación.
  await expect(drums.locator('.riff-open-toggle')).toHaveText('JUGAR');
  await expect(drums.getByRole('slider', { name: 'Volumen de la batería' })).toBeVisible();
  await expect(drums.locator('.neck-instrument-toggle')).toHaveCount(0);
  await expect(drums.getByRole('button', { name: 'Afinar el mástil' })).toHaveCount(0);

  // Teclado: Z = bombo (y suena: el bombo lleva oscilador); zurdo: Z = la columna del otro lado.
  await drums.locator('.midi-kb-toggle').click();
  const before = await page.evaluate(() => (window as unknown as { __oscs: number }).__oscs);
  await page.keyboard.down('KeyZ');
  await expect(drums.locator('.riff-drum-hit')).toHaveAttribute('data-pad', 'Bombo');
  await page.keyboard.up('KeyZ');
  expect(await page.evaluate(() => (window as unknown as { __oscs: number }).__oscs)).toBeGreaterThan(before);
  await drums.getByRole('button', { name: /zurdo|diestro/i }).first().click();
  await page.keyboard.down('KeyZ');
  await expect(drums.locator('.riff-drum-hit')).toHaveAttribute('data-pad', 'Plato fuerte');
  await page.keyboard.up('KeyZ');

  // Su JUGAR abre la partida con la batería; abrir JUGAR en el mástil la cierra.
  await drums.locator('.riff-open-toggle').click();
  await expect(drums.locator('.riff-dd-toggle', { hasText: 'Pistas' })).toHaveAttribute('aria-label', /Batería/, { timeout: 30000 });
  await page.locator('.test-room-fretboard .riff-open-toggle').click();
  await expect(drums.locator('.riff-open-toggle')).toHaveText('JUGAR');
  await expect(page.locator('.test-room-fretboard .riff-open-toggle')).toHaveText('SALIR');
});

test('sala con bajo y batería: sin desbordamiento horizontal', async ({ page }) => {
  for (const width of [360, 600, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL);
    await expect(page.locator('.test-room-drums svg.riff-drum-neck')).toBeVisible({ timeout: 30000 });
    await chooseNeck(page, 'Bajo');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
  }
});

// Solo en el tema oscuro, el mástil de la sala (guitarra y bajo) tiene el aspecto de la partida de Riff-Hero
// (usuario, 2026-11-18): trastes amarillos y cuerdas en sus colores del juego. En claro, como siempre.
test('tema oscuro: el mástil de la sala con el aspecto de la partida', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  const svg = page.locator('.test-room-fretboard svg.reduced-fretboard');
  await expect(svg).toHaveClass(/dark-game-look/, { timeout: 30000 });
  const look = () => svg.evaluate((el) => ({
    fret: getComputedStyle(el.querySelector('.reduced-fret')!).stroke,
    low: getComputedStyle(el.querySelector('.reduced-string[data-string="6"]')!).stroke,
    high: getComputedStyle(el.querySelector('.reduced-string[data-string="1"]')!).stroke,
  }));
  const light = await look();
  expect(light.fret).not.toBe('rgb(250, 204, 21)');
  expect(light.low).not.toBe('rgb(239, 68, 68)');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(await look()).toEqual({ fret: 'rgb(250, 204, 21)', low: 'rgb(239, 68, 68)', high: 'rgb(249, 115, 22)' });
  // La batería suelta y el resto de mástiles de la web no lo llevan.
  await expect(page.locator('.test-room-drums svg.dark-game-look')).toHaveCount(0);
});

// Batería suelta (usuario, 2026-11-18): logo en los dos bombos, platos por encima de los tambores, la capa de
// los bombos recortada para quedar detrás, y en el tema claro la tabla blanca con las columnas pálidas.
test('batería suelta: logo en los bombos, platos altos y fondo pálido en claro', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  const neck = page.locator('.test-room-drums svg.riff-drum-neck');
  await expect(neck).toHaveClass(/riff-drum-standalone/, { timeout: 30000 });
  await expect(neck.locator('image.riff-drum-logo')).toHaveCount(2);
  const top = (pad: string) => neck.locator(`.riff-drum-piece[data-pad="${pad}"]`).evaluate((el) => (el as SVGGraphicsElement).getBBox().y);
  // El plato empieza por encima del parche de la caja (con su pie más largo).
  expect(await top('Plato')).toBeLessThan((await top('Caja')) - 20);
  await expect(neck.locator('.riff-drum-glow[data-pad="Bombo"] g[clip-path*="riff-drum-kick-clip"]').first()).toBeAttached();
  const look = () => neck.evaluate((el) => ({
    board: getComputedStyle(el.querySelector('.riff-drum-board')!).fill,
    col: getComputedStyle(el.querySelector('.riff-drum-col')!).opacity,
  }));
  expect(await look()).toEqual({ board: 'rgb(255, 255, 255)', col: '0.3' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(await look()).toEqual({ board: 'rgb(11, 18, 32)', col: '0.1' });
});

// Con el bajo (cuerdas centradas), la autopista sigue saliendo del BORDE de arriba del mástil (bug 2026-11-18:
// tomaba los bordes de las cuerdas del bajo y empezaba a media altura del mástil, tapándolo).
test('bajo + JUGAR: la autopista empieza en el borde de arriba del mástil', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  const neck = page.locator('.test-room-fretboard');
  await expect(neck.locator('.neck-instrument-toggle')).toBeVisible({ timeout: 30000 });
  await chooseNeck(page, 'Bajo');
  await neck.locator('.riff-open-toggle').click();
  await expect(neck.locator('canvas.riff-highway')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1000);
  const alpha = await neck.evaluate((root) => {
    const canvas = root.querySelector('canvas.riff-highway') as HTMLCanvasElement;
    const board = root.querySelector('svg.reduced-fretboard .reduced-board-bg')!.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d')!;
    const at = (x: number, y: number) => ctx.getImageData(Math.round(((x - box.left) * canvas.width) / box.width), Math.round(((y - box.top) * canvas.height) / box.height), 1, 1).data[3];
    const x = board.left + board.width / 2;
    return { above: at(x, board.top - 6), inside: at(x, board.top + board.height * 0.3) };
  });
  expect(alpha.above).toBeGreaterThan(0);
  expect(alpha.inside).toBe(0);
});
