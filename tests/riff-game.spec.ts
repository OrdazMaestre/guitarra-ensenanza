import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart } from '../app/lib/riff/chart';
import { RIFF_LEVELS } from '../app/lib/riff/levels';
import { reduceChart } from '../app/lib/riff/reduce';
import { laneRows } from '../app/lib/riff/lanes';

// Juego tipo Rocksmith dentro del mástil MIDI de /lecciones/temario/sala-de-pruebas: botón "JUGAR"
// en la barra del mástil -> panel con ajustes + "Empezar"/"Continuar"; PAUSA junto a JUGAR durante la
// partida (app/components/guitar/riff/).
test.use({ hasTouch: false });

const URL = '/lecciones/temario/sala-de-pruebas';
const SVG = '.test-room-fretboard svg.reduced-fretboard';

function jamesChart(level: 'experto' | 'practica' | 'facil' | 'medio' | 'avanzado' | 'medio-cuerdas' | 'avanzado-cuerdas' = 'experto') {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync('public/tabs/prueba-master-of-puppets.gp')), new at.Settings());
  return level === 'experto' ? buildChart(at, score, 1, 12) : reduceChart(buildChart(at, score, 1, 24), RIFF_LEVELS[level]);
}

// Centro en pantalla de (cuerda, traste) del mástil. Misma geometría que ReducedFretboardDiagram
// con `fretLabels` (romanos arriba -> boardY = 44).
// `row`: fila (1 = arriba ... 6 = abajo) donde pulsar si no es la de la cuerda real (en los niveles
// no Experto las cuerdas van repartidas por el centro, ver lanes.ts).
async function tap(page: Page, string: number, fret: number, row = string) {
  const p = await page.evaluate(({ selector, row, fret }) => {
    const svg = document.querySelector(selector) as SVGSVGElement;
    const pt = svg.createSVGPoint();
    // Centro del traste entre sus dos líneas (en los niveles de 6 trastes el mástil se estira y
    // cada traste es más ancho); el 0, a la izquierda de la cejuela.
    const lines = [...svg.querySelectorAll('line.reduced-nut, line.reduced-fret')].map((l) => Number(l.getAttribute('x1')));
    pt.x = fret === 0 ? lines[0] - 20 : (lines[fret - 1] + lines[fret]) / 2;
    pt.y = 44 + (row - 1) * (158 / 5);
    const r = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: r.x, y: r.y };
  }, { selector: SVG, row, fret });
  await page.mouse.click(p.x, p.y);
}

// Durante la partida, los controles de la barra piden mantenerlos pulsados 1 s (HoldGuard).
async function hold(page: Page, locator: Locator, ms = 1200) {
  const box = (await locator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function openGame(page: Page) {
  await page.locator('.test-room-fretboard').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'JUGAR', exact: true }).click();
  await expect(page.locator('.riff-panel')).toBeVisible();
}

// Abre el desplegable `menu` ("Pista", "Ritmo"...) del panel y elige `option`.
// En "Nivel", los dos modos tienen un "Medio" y un "Avanzado": por defecto, el del modo trastes
// (Experto solo está en el de cuerdas); "Medio cuerdas" elige el del modo cuerdas.
async function choose(page: Page, menu: string, option: string) {
  await page.locator('.riff-dd-toggle', { hasText: menu }).click();
  let scope = page.locator('.riff-dd-menu');
  let name = option;
  if (menu === 'Nivel') {
    const cuerdas = option.endsWith(' cuerdas') || option === 'Experto';
    name = option.replace(/ cuerdas$/, '');
    scope = scope.getByRole('group', { name: cuerdas ? 'Modo cuerdas' : 'Modo trastes' });
  }
  await scope.getByRole('button', { name, exact: true }).click();
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
  await expect(page.locator('.riff-dd-toggle')).toHaveText([/Pista/, /Nivel/, /Modo/, /Velocidad/, /Ritmo/, /Compases/], { timeout: 10000 });
  // Configuración inicial (decisión del usuario): Kirk, Práctica, 75 %, Con ritmo, sin bucle, batería.
  await expect(page.locator('.riff-dd-toggle')).toHaveText([/Guitarra solista/, /Práctica/, /Batería/, /75%/, /Con ritmo/, /^Compases1–\d+▾$/]);
  // El aviso de notas recolocadas (más allá del traste 12) ya no se enseña.
  await expect(page.locator('.riff-panel')).not.toContainText('pasaban del traste');
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await expect(page.getByTestId('riff-highway')).toHaveCount(1);

  // El panel está DELANTE del juego y ENCIMA del mástil (centrado sobre sus cuerdas), compacto.
  const overlay = page.locator('.test-room-fretboard .riff-overlay');
  const box = (await overlay.boundingBox())!;
  const neck = (await page.locator(SVG).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(neck.y - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(neck.y + neck.height + 1);
  expect(Math.abs(box.y + box.height / 2 - (neck.y + neck.height / 2))).toBeLessThan(4);
  // Una sola fila de desplegables en escritorio.
  const toggles = await page.locator('.riff-dd-toggle').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(toggles).size).toBe(1);
  const inFront = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.riff-overlay'), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(inFront).toBe(true);

  await choose(page, 'Modo', 'Batería');
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Modo' })).toContainText('Batería');
  await choose(page, 'Velocidad', '100%');
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Velocidad' })).toContainText('100%');

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

  // Jugando, un toque corto en PAUSA (o en otro control de la barra) no hace nada...
  await pause.click();
  await page.waitForTimeout(300);
  await expect(stage).not.toHaveAttribute('data-status', 'paused');
  // ...hay que mantenerla 1 s: entonces para la partida y despliega los ajustes delante del juego.
  await hold(page, pause);
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
  await hold(page, pause);
  await expect(stage).toHaveAttribute('data-status', 'paused');
  await page.getByRole('button', { name: 'Volver a empezar' }).click();
  await expect(stage).toHaveAttribute('data-status', /countin|playing/);
  await expect(overlay).toHaveCount(0);

  // Cambiar un ajuste en pausa invalida esa partida: ya solo se puede volver a empezar.
  await hold(page, pause);
  await choose(page, 'Velocidad', '50%');
  await expect(stage).toHaveAttribute('data-status', 'idle');
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await expect(pause).toHaveCount(0);
  await expect(tuning).toBeVisible();

  // Cerrar JUGAR quita el panel y la autopista (y para la partida si la hubiera).
  await page.getByRole('button', { name: 'Volver a empezar' }).click();
  await hold(page, page.getByRole('button', { name: 'JUGAR', exact: true }));
  await expect(page.locator('.riff-panel')).toHaveCount(0);
  await expect(page.getByTestId('riff-highway')).toHaveCount(0);
  await expect(pause).toHaveCount(0);
});

for (const [level, label] of [['experto', 'Experto'], ['practica', 'Práctica'], ['facil', 'Fácil'], ['medio', 'Medio'], ['avanzado', 'Avanzado'], ['medio-cuerdas', 'Medio cuerdas'], ['avanzado-cuerdas', 'Avanzado cuerdas']] as const) {
  test(`paso a paso (${label}): la canción espera en cada nota y cuenta los aciertos`, async ({ page }) => {
    const chart = jamesChart(level);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await openGame(page);
    const panel = page.locator('.test-room-fretboard .riff-stage');
    await choose(page, 'Nivel', label);
    await choose(page, 'Pista', 'Guitarra rítmica');
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
    // Modo cuerdas: el traste correcto en OTRA cuerda tampoco cuenta.
    // (En Medio cuerdas, pulsando en la franja de la otra cuerda del nivel.)
    const cuerdas = level === 'medio-cuerdas' || level === 'avanzado-cuerdas';
    const laneRow = (string: number) => (cuerdas ? laneRows(RIFF_LEVELS[level].strings).get(string)! : string);
    if (cuerdas || level === 'experto') await tap(page, first.string === 6 ? 5 : 6, first.fret, laneRow(first.string === 6 ? 5 : 6));
    await page.waitForTimeout(200);
    await expect(panel).toHaveAttribute('data-hits', '0');

    await page.mouse.move(0, 0);
    for (const [i, note] of [first, second, third].entries()) {
      const exactString = level === 'experto' || cuerdas;
      if (!exactString) expect(note.string).toBe(6);
      else if (cuerdas) expect(RIFF_LEVELS[level].strings).toContain(note.string);
      // Niveles de cuerdas libres: el traste correcto vale en cualquier cuerda.
      await tap(page, exactString ? note.string : [1, 3, 5][i], note.fret, exactString ? laneRow(note.string) : [1, 3, 5][i]);
      await expect(panel).toHaveAttribute('data-hits', String(i + 1));
    }

    // Paso a paso no puntúa (decisión del usuario).
    await expect(panel).toHaveAttribute('data-score', '0');

    await hold(page, page.getByRole('button', { name: 'PAUSA' }));
    await expect(panel).toHaveAttribute('data-status', 'paused');
  });
}

// Riffs compartidos: con Kirk, la primera nota (riff compartido) es la que tiene James en ese nivel.
test('Kirk sigue a James en los riffs compartidos (Avanzado cuerdas, paso a paso)', async ({ page }) => {
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync('public/tabs/prueba-master-of-puppets.gp')), new at.Settings());
  const profile = RIFF_LEVELS['avanzado-cuerdas'];
  const james = reduceChart(buildChart(at, score, 1, 24), profile);
  const kirk = reduceChart(buildChart(at, score, 2, 24), profile, james);
  const first = kirk.notes[0];
  expect(james.notes.find((n) => Math.abs(n.t - first.t) < 0.005)).toMatchObject({ string: first.string, fret: first.fret });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const panel = page.locator('.test-room-fretboard .riff-stage');
  await choose(page, 'Nivel', 'Avanzado cuerdas');
  await choose(page, 'Ritmo', 'Paso a paso');
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(panel).toHaveAttribute('data-status', 'playing', { timeout: 5000 });
  await page.mouse.move(0, 0);
  await tap(page, first.string, first.fret, laneRows(profile.strings).get(first.string)!);
  await expect(panel).toHaveAttribute('data-hits', '1');
});

test('el mástil ocupa lo mismo en todos los niveles; los de 6 trastes lo estiran en X (sin agrandarlo)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  const fretNumbers = page.locator('.test-room-fretboard .reduced-fret-number');
  const svg = page.locator(SVG);
  await expect(fretNumbers).toHaveCount(13);
  const before = (await svg.boundingBox())!;
  await openGame(page);
  // Modo trastes Práctica, Fácil y Medio usan los trastes 0-5: solo se dibujan esos 6, más anchos.
  for (const [label, frets] of [['Práctica', 6], ['Fácil', 6], ['Medio', 6], ['Avanzado', 13], ['Medio cuerdas', 13], ['Avanzado cuerdas', 13], ['Experto', 13]] as const) {
    await choose(page, 'Nivel', label);
    await expect(fretNumbers).toHaveCount(frets);
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

test('mantener pulsado: el compás 42 entero con el traste 0 (ratón) cuenta las 9 notas', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const stage = page.locator('.test-room-fretboard .riff-stage');
  await choose(page, 'Nivel', 'Medio');
  await choose(page, 'Velocidad', '50%');
  await page.locator('.riff-dd-toggle', { hasText: 'Compases' }).click();
  await page.getByLabel('Hasta el compás').fill('42');
  await page.getByLabel('Desde el compás').fill('42');
  await page.mouse.click(5, 5);
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  const t0 = Date.now();
  await page.waitForTimeout(200);
  const p = await page.evaluate((selector) => {
    const svg = document.querySelector(selector) as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = 22;
    pt.y = 44 + 5 * (158 / 5);
    const r = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: r.x, y: r.y };
  }, SVG);
  // 212 bpm al 50 %: 4 negras de cuenta = 2,26 s reales; el compás dura 2,26 s más.
  const countIn = (4 * 60) / 212 / 0.5;
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(countIn * 1000 - (Date.now() - t0));
  await page.mouse.down();
  await page.waitForTimeout(countIn * 1000 + 200);
  await page.mouse.up();
  await expect(stage).toHaveAttribute('data-hits', '9');
  // La primera según su tiempo (2-4 puntos) y las 8 siguientes según su hueco: 7 corcheas (+2) y
  // una semicorchea (+1) = 15.
  const score = Number(await stage.getAttribute('data-score'));
  expect(score).toBeGreaterThanOrEqual(17);
  expect(score).toBeLessThanOrEqual(19);
});

test('jugando, el volumen solo se mueve tras mantenerlo 1 s; en pausa y fuera de partida, al instante', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const slider = page.getByLabel('Volumen de la guitarra');
  const stage = page.locator('.test-room-fretboard .riff-stage');
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(stage).toHaveAttribute('data-status', /countin|playing/);
  const box = (await slider.boundingBox())!;
  const y = box.y + box.height / 2;
  // Toque corto: nada.
  await page.mouse.click(box.x + 4, y);
  await expect(slider).toHaveValue('1');
  // Mantener 1 s y arrastrar sin soltar: se mueve.
  await page.mouse.move(box.x + box.width - 3, y);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 6 });
  await page.mouse.up();
  expect(Number(await slider.inputValue())).toBeCloseTo(0.3, 1);
  // En pausa vuelve a responder al instante (también DIESTRO, por ejemplo).
  await hold(page, page.getByRole('button', { name: 'PAUSA' }));
  await expect(stage).toHaveAttribute('data-status', 'paused');
  await slider.fill('0.8');
  await expect(slider).toHaveValue('0.8');
});

test.describe('pantalla táctil', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 1366, height: 900 } });
  test('jugando, un toque corto con el dedo en PAUSA no hace nada; mantenerlo 1 s, sí', async ({ page }) => {
    await page.goto(URL);
    await page.locator('.test-room-fretboard').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'JUGAR', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Empezar' })).toBeEnabled({ timeout: 10000 });
    await page.locator('.riff-actions').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Empezar' }).tap();
    const stage = page.locator('.test-room-fretboard .riff-stage');
    await expect(stage).toHaveAttribute('data-status', /countin|playing/);
    const pause = page.getByRole('button', { name: 'PAUSA' });
    const box = (await pause.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const client = await page.context().newCDPSession(page);
    const touch = async (ms: number) => {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await page.waitForTimeout(ms);
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await touch(150);
    await page.waitForTimeout(300);
    await expect(stage).not.toHaveAttribute('data-status', 'paused');
    // Medio segundo tampoco basta.
    await touch(600);
    await page.waitForTimeout(300);
    await expect(stage).not.toHaveAttribute('data-status', 'paused');
    await touch(1300);
    await expect(stage).toHaveAttribute('data-status', 'paused');
    // Y no se reanuda sola al levantar el dedo.
    await page.waitForTimeout(400);
    await expect(stage).toHaveAttribute('data-status', 'paused');
  });
});

// Partida tutorial de mecánicas (riffTutorial.ts): una canción remix de principio a fin, que se para
// sola antes de cada parte para enseñar su mensaje. Se lanza desde el último paso del tutorial del panel.
async function launchTutorial(page: Page) {
  await page.locator('.riff-panel .tour-launch').click();
  const main = page.locator('.tour-bubble .tour-btn-main');
  while ((await main.textContent()) === 'Siguiente') await main.click();
  await expect(page.locator('.tour-bubble')).toContainText('Partida de prueba');
  await main.click();
}

test('partida de prueba: una sola canción con sus 3 partes, mensajes y animaciones', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const stage = page.locator('.test-room-fretboard .riff-stage');
  const card = page.locator('.riff-tutorial-card');
  await launchTutorial(page);

  // Parte 1: mantener pulsado. La canción entera es una sola partida.
  await expect(stage).toHaveAttribute('data-tutorial', 'section-0');
  await expect(card).toContainText('MANTÉN PULSADO');
  await card.getByRole('button', { name: '¡A tocar!' }).click();
  await expect(stage).toHaveAttribute('data-tutorial', 'playing');
  await expect(stage).toHaveAttribute('data-repetition', '1/1');

  // Parada automática antes de la parte 2: tapping (dos punteros, nunca dos cursores).
  await expect(stage).toHaveAttribute('data-tutorial', 'section-1', { timeout: 60_000 });
  await expect(stage).toHaveAttribute('data-status', 'paused');
  await expect(card).toContainText('TAPEA');
  await expect(card.locator('svg[data-animation="tapping"]')).toBeVisible();
  for (let i = 0; i < 6; i++) {
    expect(await card.locator('svg[data-animation="tapping"] path[fill="#ffffff"]').count()).toBeLessThanOrEqual(1);
    await page.waitForTimeout(400);
  }
  await card.getByRole('button', { name: '¡A tocar!' }).click();
  await expect(stage).toHaveAttribute('data-status', 'countin');
  // Las 2 vueltas de 9-12 tardan bastante más que un instante (no se salta la parte).
  await page.waitForTimeout(5000);
  await expect(stage).toHaveAttribute('data-tutorial', 'playing');

  // Parada antes de la parte 3: deslizar.
  await expect(stage).toHaveAttribute('data-tutorial', 'section-2', { timeout: 60_000 });
  await expect(card.locator('svg[data-animation="slide"]')).toBeVisible();
  await card.getByRole('button', { name: '¡A tocar!' }).click();

  // Final: vuelve el panel de ajustes.
  await expect(stage).toHaveAttribute('data-tutorial', 'end', { timeout: 60_000 });
  await expect(card).toContainText('¡Lo has conseguido!');
  await card.getByRole('button', { name: 'Terminar' }).click();
  await expect(page.locator('.riff-panel')).toBeVisible();
  await expect(stage).not.toHaveAttribute('data-tutorial');
});

test('partida de prueba: cerrar JUGAR la abandona', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  await launchTutorial(page);
  await page.locator('.riff-tutorial-card').getByRole('button', { name: '¡A tocar!' }).click();
  const stage = page.locator('.test-room-fretboard .riff-stage');
  await expect(stage).toHaveAttribute('data-status', /countin|playing/);
  await hold(page, page.getByRole('button', { name: 'JUGAR', exact: true }));
  await page.getByRole('button', { name: 'JUGAR', exact: true }).click();
  await expect(page.locator('.riff-tutorial-card')).toHaveCount(0);
  await expect(page.locator('.riff-panel')).toBeVisible();
});

test('cuerdas libres: sin cuerdas, cada traste teñido; los puntos, entre el mástil y la barra MIDI', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const score = page.getByTestId('riff-score');
  await expect(score).toBeVisible();
  await expect(score).toHaveText('');
  await choose(page, 'Velocidad', '50%');
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(score).toHaveText('0 puntos', { timeout: 5000 });
  // Entre el mástil y la barra de controles.
  const svgBox = (await page.locator(SVG).boundingBox())!;
  const scoreBox = (await score.boundingBox())!;
  const pillBox = (await page.locator('.test-room-fretboard .midi-float-pill').boundingBox())!;
  expect(scoreBox.y).toBeGreaterThanOrEqual(svgBox.y + svgBox.height - 1);
  expect(pillBox.y).toBeGreaterThanOrEqual(scoreBox.y + scoreBox.height - 1);
  // Rojo intenso con brillo amarillo.
  const style = await score.evaluate((el) => getComputedStyle(el));
  expect(style.color).toBe('rgb(220, 38, 38)');
  expect(style.textShadow).toContain('rgb(250, 204, 21)');
  // Sobre el mástil no se pintan cuerdas: la fila de la cuerda 2, en el centro de un traste, tiene
  // el tono tenue del traste (las notas caen en el centro, filas 3-4, lejos de ahí).
  const pixel = await page.evaluate((selector) => {
    const svg = document.querySelector(selector) as SVGSVGElement;
    const lines = [...svg.querySelectorAll('line.reduced-nut, line.reduced-fret')].map((l) => Number(l.getAttribute('x1')));
    const pt = svg.createSVGPoint();
    pt.x = (lines[2] + lines[3]) / 2;
    pt.y = 44 + 1 * (158 / 5);
    const r = pt.matrixTransform(svg.getScreenCTM()!);
    const canvas = document.querySelector('canvas[data-testid="riff-highway"]') as HTMLCanvasElement;
    const box = canvas.getBoundingClientRect();
    const scale = canvas.width / box.width;
    return canvas.getContext('2d')!.getImageData(Math.round((r.x - box.left) * scale), Math.round((r.y - box.top) * scale), 1, 1).data[3];
  }, SVG);
  // Una cuerda dibujada sería opaca (alfa 255): ahí solo hay el tinte tenue del traste (alfa ~0,1),
  // como mucho más su columna iluminada cuando llega una nota.
  expect(pixel).toBeGreaterThan(0);
  expect(pixel).toBeLessThan(140);
});
