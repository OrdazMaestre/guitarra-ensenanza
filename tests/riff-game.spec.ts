import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart } from '../app/lib/riff/chart';
import { RIFF_LEVELS } from '../app/lib/riff/levels';
import { reduceChart } from '../app/lib/riff/reduce';

// Juego tipo Rocksmith dentro del mástil MIDI de /lecciones/temario/sala-de-pruebas: botón "JUGAR"
// en la barra del mástil -> panel con ajustes + "Empezar"/"Continuar"; PAUSA junto a JUGAR durante la
// partida (app/components/guitar/riff/).
test.use({ hasTouch: false });

const URL = '/lecciones/temario/sala-de-pruebas';
const SVG = '.test-room-fretboard svg.reduced-fretboard';

function jamesChart(level: 'experto' | 'principiante' | 'facil' = 'experto') {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync('public/tabs/prueba-master-of-puppets.gp')), new at.Settings());
  return level === 'experto' ? buildChart(at, score, 1, 12) : reduceChart(buildChart(at, score, 1, 24), RIFF_LEVELS[level]);
}

// Centro en pantalla de (cuerda, traste) del mástil. Misma geometría que ReducedFretboardDiagram
// con `fretLabels` (romanos arriba -> boardY = 44).
async function tap(page: Page, string: number, fret: number) {
  const p = await page.evaluate(({ selector, string, fret }) => {
    const svg = document.querySelector(selector) as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = fret === 0 ? 22 : 42 + (fret - 0.5) * 58;
    pt.y = 44 + (string - 1) * (158 / 5);
    const r = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: r.x, y: r.y };
  }, { selector: SVG, string, fret });
  await page.mouse.click(p.x, p.y);
}

async function openGame(page: Page) {
  await page.locator('.test-room-fretboard').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'JUGAR', exact: true }).click();
  await expect(page.locator('.riff-panel')).toBeVisible();
}

// Abre el desplegable `menu` ("Pista", "Ritmo"...) del panel y elige `option`.
async function choose(page: Page, menu: string, option: string) {
  await page.locator('.riff-dd-toggle', { hasText: menu }).click();
  await page.locator('.riff-dd-menu').getByRole('button', { name: option, exact: true }).click();
  await expect(page.locator('.riff-dd-menu')).toHaveCount(0);
}

test('JUGAR vive en la barra del mástil: ajustes delante del juego, PAUSA, Continuar y Volver a empezar', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await expect(page.getByTestId('riff-highway')).toHaveCount(0);
  await expect(page.locator('.riff-panel')).toHaveCount(0);

  // Primer botón de la barra de controles del mástil.
  const pill = page.locator('.test-room-fretboard .midi-float-pill');
  await expect(pill.locator('button').first()).toHaveText('JUGAR');

  await openGame(page);
  await expect(page.locator('.riff-dd-toggle')).toHaveText([/Nivel/, /Pista/, /Velocidad/, /Ritmo/, /Compases/, /Modo/], { timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await expect(page.getByTestId('riff-highway')).toHaveCount(1);

  // El panel está DELANTE del juego: encima de la autopista y por delante de ella.
  const overlay = page.locator('.test-room-fretboard .riff-overlay');
  const box = (await overlay.boundingBox())!;
  const highway = (await page.getByTestId('riff-highway').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(highway.y - 1);
  expect(box.y + box.height).toBeLessThan(highway.y + highway.height);
  const inFront = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.riff-overlay'), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(inFront).toBe(true);

  await choose(page, 'Modo', 'Batería');
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Modo' })).toContainText('Batería');
  await choose(page, 'Velocidad', '75%');
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Velocidad' })).toContainText('75%');

  // Solo un desplegable abierto, y se cierra al pulsar fuera.
  await page.locator('.riff-dd-toggle', { hasText: 'Pista' }).click();
  await page.locator('.riff-dd-toggle', { hasText: 'Velocidad' }).click();
  await expect(page.locator('.riff-dd-menu')).toHaveCount(1);
  await expect(page.locator('.riff-dd-menu')).toContainText('50%');
  await page.locator('.riff-dd-toggle', { hasText: 'Velocidad' }).click();
  await page.locator('.riff-dd-toggle', { hasText: 'Compases' }).click();
  await expect(page.getByLabel('Desde el compás')).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.locator('.riff-dd-menu')).toHaveCount(0);

  // Fuera de partida, la barra tiene afinación, colores y metrónomo, y no hay PAUSA.
  const tuning = pill.getByRole('button', { name: 'Afinar el mástil' });
  const palette = pill.getByRole('button', { name: /marcador de notas/ });
  const metronome = pill.getByRole('button', { name: /metrónomo/i });
  const pause = pill.getByRole('button', { name: 'PAUSA' });
  await expect(tuning).toBeVisible();
  await expect(palette).toBeVisible();
  await expect(metronome.first()).toBeVisible();
  await expect(pause).toHaveCount(0);

  // Empezar: el panel se pliega; PAUSA aparece justo después de JUGAR, y afinación, colores y
  // metrónomo se esconden. CLEAN/OVERDRIVE se queda.
  await page.getByRole('button', { name: 'Empezar' }).click();
  const stage = page.locator('.test-room-fretboard .riff-stage');
  await expect(stage).not.toHaveAttribute('data-status', 'idle');
  await expect(overlay).toHaveCount(0);
  await expect(pill.locator('button').nth(1)).toHaveText('PAUSA');
  await expect(tuning).toHaveCount(0);
  await expect(palette).toHaveCount(0);
  await expect(metronome).toHaveCount(0);
  await expect(pill.getByRole('button', { name: /clean u overdrive/ })).toBeVisible();

  // PAUSA para la partida y despliega los ajustes delante del juego.
  await pause.click();
  await expect(stage).toHaveAttribute('data-status', 'paused');
  await expect(overlay).toBeVisible();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  // En pausa siguen escondidos (la partida no ha terminado).
  await expect(tuning).toHaveCount(0);
  // "Empezar" ya se llama "Volver a empezar"; "Continuar" está activo.
  await expect(page.getByRole('button', { name: 'Empezar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Volver a empezar' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeEnabled();

  // Continuar: retoma (un compás antes, con cuenta de entrada) y pliega el panel.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(stage).toHaveAttribute('data-status', /countin|playing/);
  await expect(overlay).toHaveCount(0);
  await expect(pause).toHaveAttribute('aria-pressed', 'false');

  // PAUSA otra vez y "Volver a empezar": partida nueva desde el principio.
  await pause.click();
  await expect(stage).toHaveAttribute('data-status', 'paused');
  await page.getByRole('button', { name: 'Volver a empezar' }).click();
  await expect(stage).toHaveAttribute('data-status', /countin|playing/);
  await expect(overlay).toHaveCount(0);

  // Cambiar un ajuste en pausa invalida esa partida: ya solo se puede volver a empezar.
  await pause.click();
  await choose(page, 'Velocidad', '50%');
  await expect(stage).toHaveAttribute('data-status', 'idle');
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await expect(pause).toHaveCount(0);
  await expect(tuning).toBeVisible();

  // Cerrar JUGAR quita el panel y la autopista (y para la partida si la hubiera).
  await page.getByRole('button', { name: 'Volver a empezar' }).click();
  await page.getByRole('button', { name: 'JUGAR', exact: true }).click();
  await expect(page.locator('.riff-panel')).toHaveCount(0);
  await expect(page.getByTestId('riff-highway')).toHaveCount(0);
  await expect(pause).toHaveCount(0);
});

for (const [level, label] of [['experto', 'Experto'], ['principiante', 'Principiante'], ['facil', 'Fácil']] as const) {
  test(`paso a paso (${label}): la canción espera en cada nota y cuenta los aciertos`, async ({ page }) => {
    const chart = jamesChart(level);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await openGame(page);
    const panel = page.locator('.test-room-fretboard .riff-stage');
    await choose(page, 'Nivel', label);
    await choose(page, 'Pista', 'Rhythm Guitar (James)');
    await choose(page, 'Ritmo', 'Paso a paso');
    // Como una persona: bajar hasta el botón y pulsarlo (así "Empezar" puede recolocar la página).
    await page.locator('.riff-actions').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Empezar' }).click();
    await expect(panel).toHaveAttribute('data-status', 'playing', { timeout: 5000 });
    // "Empezar" centra el mástil en pantalla: debe quedar visible para poder tocarlo.
    await expect(page.locator(SVG)).toBeInViewport({ ratio: 0.9 });

    // Nota equivocada: no cuenta.
    const [first, second, third] = chart.notes;
    await tap(page, first.string, first.fret === 0 ? 1 : first.fret - 1);
    await page.waitForTimeout(200);
    await expect(panel).toHaveAttribute('data-hits', '0');

    await page.mouse.move(0, 0);
    for (const [i, note] of [first, second, third].entries()) {
      if (level !== 'experto') expect(note.string).toBe(6);
      await tap(page, note.string, note.fret);
      await expect(panel).toHaveAttribute('data-hits', String(i + 1));
    }

    await page.getByRole('button', { name: 'PAUSA' }).click();
    await expect(panel).toHaveAttribute('data-status', 'paused');
  });
}

test('todos los niveles usan el mástil completo (sin zoom), del mismo tamaño', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  const fretNumbers = page.locator('.test-room-fretboard .reduced-fret-number');
  const svg = page.locator(SVG);
  await expect(fretNumbers).toHaveCount(13);
  const before = (await svg.boundingBox())!;
  await openGame(page);
  for (const label of ['Principiante', 'Fácil', 'Experto']) {
    await choose(page, 'Nivel', label);
    await expect(fretNumbers).toHaveCount(13);
    const now = (await svg.boundingBox())!;
    expect(Math.round(now.width)).toBe(Math.round(before.width));
    expect(Math.round(now.height)).toBe(Math.round(before.height));
  }
});

test('aviso de pantalla estrecha: aparece y desaparece solo según el ancho', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const warning = page.getByText('Esta pantalla es muy estrecha para jugar.');
  await expect(warning).toBeVisible();
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeDisabled();
  await expect(page.getByTestId('riff-highway')).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(warning).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeEnabled({ timeout: 10000 });
  await expect(page.getByTestId('riff-highway')).toHaveCount(1);
});

for (const width of [360, 1280]) {
  test(`sin scroll horizontal a ${width}px, con el juego abierto`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL);
    await openGame(page);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  });
}
