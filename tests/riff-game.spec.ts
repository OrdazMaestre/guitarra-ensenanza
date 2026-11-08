import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import { buildChart, listPlayableTracks } from '../app/lib/riff/chart';
import { RIFF_LEVELS } from '../app/lib/riff/levels';
import { reduceChart } from '../app/lib/riff/reduce';
import { laneRows } from '../app/lib/riff/lanes';

// Juego tipo Rocksmith dentro del mástil MIDI de /lecciones/temario/sala-de-pruebas: botón "JUGAR"
// en la barra del mástil -> panel con ajustes + "Empezar"/"Continuar"; PAUSA junto a JUGAR durante la
// partida (app/components/guitar/riff/).
test.use({ hasTouch: false });

const URL = '/lecciones/temario/sala-de-pruebas';
const SVG = '.test-room-fretboard svg.reduced-fretboard';

function jamesChart(level: 'experto' | 'practica' | 'facil' | 'medio' | 'avanzado' | 'medio-cuerdas' | 'avanzado-cuerdas' | 'dificil' = 'experto') {
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

// Abre JUGAR y elige la "Canción de prueba" (Master of Puppets): la sala arranca con Black Gilmur,
// pero casi todos estos tests están pensados para los compases y las dos guitarras de esa.
async function openGame(page: Page, song = 'Canción de prueba') {
  await page.locator('.test-room-fretboard').scrollIntoViewIfNeeded();
  // Un clic antes de que React haya hidratado la página se pierde (era el origen de los fallos
  // intermitentes en pantalla estrecha/baja): se repite hasta que JUGAR queda activado.
  const jugar = page.locator('.test-room-fretboard .riff-open-toggle');
  await expect(async () => {
    if ((await jugar.getAttribute('aria-pressed')) !== 'true') await jugar.click();
    await expect(page.locator('.riff-panel')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await choose(page, 'Canción', song);
  // La de prueba tiene dos guitarras: su desplegable de pista confirma que ya cargó.
  if (song === 'Canción de prueba') await expect(page.locator('.riff-dd-toggle', { hasText: 'Pistas' })).toBeVisible({ timeout: 10000 });
}

// Abre el desplegable `menu` ("Pista", "Ritmo"...) del panel y elige `option`.
// En "Nivel", los dos modos tienen un "Medio" y un "Avanzado": por defecto, el del modo trastes
// (Difícil y Experto solo están en el de cuerdas); "Medio cuerdas" elige el del modo cuerdas.
async function choose(page: Page, menu: string, option: string) {
  await page.locator('.riff-dd-toggle', { hasText: menu }).click();
  let scope = page.locator('.riff-dd-menu');
  let name = option;
  if (menu === 'Nivel') {
    const cuerdas = option.endsWith(' cuerdas') || option === 'Experto' || option === 'Difícil';
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
  // Abierto, el mismo botón es SALIR.
  await expect(pill.locator('button').first()).toHaveText('SALIR');
  // Orden del panel (decisión del usuario, 2026-11-03): Nivel, Velocidad, Canción, Pistas, Metrónomo, Ritmo, Compases.
  await expect(page.locator('.riff-dd-toggle')).toHaveText([/Nivel/, /Velocidad/, /Canción/, /Pistas/, /Metrónomo/, /Ritmo/, /Compases/, /Concierto/], { timeout: 10000 });
  // Configuración inicial (decisión del usuario): Kirk, Principiante, 100 %, Con ritmo, sin bucle; con
  // batería en la canción, el metrónomo apagado.
  await expect(page.locator('.riff-dd-toggle')).toHaveText([/Principiante/, /100%/, /Canción de prueba/, /Guitarra solista/, /MetrónomoNada/, /Con ritmo/, /^Compases1–\d+▾$/, /Concierto.*no/]);
  // El aviso de notas recolocadas (más allá del traste 12) ya no se enseña.
  await expect(page.locator('.riff-panel')).not.toContainText('pasaban del traste');
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await expect(page.getByTestId('riff-highway')).toHaveCount(1);

  // El panel está DELANTE del juego y ENCIMA del mástil (centrado sobre sus cuerdas), compacto.
  const overlay = page.locator('.test-room-fretboard .riff-overlay');
  // A la vista: elementFromPoint (abajo) no ve nada fuera de la pantalla.
  await overlay.scrollIntoViewIfNeeded();
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

  // Metrónomo: desplegable Nada / Metrónomo / Batería automática.
  const riffMetronome = page.locator('.riff-dd-toggle', { hasText: 'Metrónomo' });
  await choose(page, 'Metrónomo', 'Metrónomo');
  await expect(riffMetronome).toHaveAttribute('aria-label', 'Metrónomo: Metrónomo');
  await riffMetronome.click();
  await expect(page.locator('.riff-dd-menu').getByRole('button', { name: 'Batería automática', exact: true })).toBeEnabled();
  await page.locator('.riff-dd-menu').getByRole('button', { name: 'Nada', exact: true }).click();
  await expect(riffMetronome).toHaveAttribute('aria-label', 'Metrónomo: Nada');
  await choose(page, 'Velocidad', '75%');
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Velocidad' })).toContainText('75%');

  // Solo un desplegable abierto, y se cierra al pulsar fuera.
  await page.locator('.riff-dd-toggle', { hasText: 'Pistas' }).click();
  await page.locator('.riff-dd-toggle', { hasText: 'Velocidad' }).click();
  await expect(page.locator('.riff-dd-menu')).toHaveCount(1);
  await expect(page.locator('.riff-dd-menu')).toContainText('50%');
  await page.locator('.riff-dd-toggle', { hasText: 'Velocidad' }).click();
  await page.locator('.riff-dd-toggle', { hasText: 'Compases' }).click();
  await expect(page.getByLabel('Desde el compás')).toBeVisible();
  // Tocar fuera o hacer scroll NO lo cierra (en el móvil, deslizar el dedo lo cerraba); su botón, sí.
  await page.mouse.click(5, 5);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(200);
  await expect(page.locator('.riff-dd-menu')).toHaveCount(1);
  await page.locator('.riff-dd-toggle', { hasText: 'Compases' }).click();
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

  // Continuar: retoma (dos compases antes, con cuenta de entrada) y pliega el panel.
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

  // Cambiar un ajuste en pausa (velocidad, pista...) NO anula la partida: Continuar sigue con él
  // (petición del usuario, 2026-10-28).
  await hold(page, pause);
  await choose(page, 'Velocidad', '50%');
  await choose(page, 'Pistas', 'Guitarra rítmica');
  await expect(stage).toHaveAttribute('data-status', 'paused');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(stage).toHaveAttribute('data-status', /countin|playing/);
  await expect(overlay).toHaveCount(0);

  // Cambiar la DIFICULTAD sí la anula: ya solo se puede volver a empezar.
  await hold(page, pause);
  await choose(page, 'Nivel', 'Fácil');
  await expect(stage).toHaveAttribute('data-status', 'idle');
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await expect(pause).toHaveCount(0);
  await expect(tuning).toBeVisible();

  // SALIR (JUGAR con el juego abierto) quita el panel y la autopista y para la partida.
  await page.getByRole('button', { name: 'Volver a empezar' }).click();
  await hold(page, page.getByRole('button', { name: 'SALIR', exact: true }));
  await expect(page.locator('.riff-panel')).toHaveCount(0);
  await expect(page.getByTestId('riff-highway')).toHaveCount(0);
  await expect(pause).toHaveCount(0);
});

test('móvil en vertical: con 6 trastes el mástil mide el doble de alto y se puede tocar', async ({ page }) => {
  const board = page.locator('.test-room-fretboard .reduced-board-bg');
  const height = async () => (await board.boundingBox())!.height;
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(URL);
  await page.locator('.test-room-fretboard').scrollIntoViewIfNeeded();
  const plain = await height();
  await openGame(page);
  expect(await height()).toBeGreaterThanOrEqual(plain * 1.98);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);

  // Una nota en su traste cuenta en el mástil alto.
  const [first] = jamesChart('practica').notes;
  await choose(page, 'Pistas', 'Guitarra rítmica');
  await choose(page, 'Ritmo', 'Paso a paso');
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  const stage = page.locator('.test-room-fretboard .riff-stage');
  await expect(stage).toHaveAttribute('data-status', 'playing', { timeout: 5000 });
  await tap(page, 6, first.fret, 3.5);
  await expect(stage).toHaveAttribute('data-hits', '1');
  await expect(page.locator(SVG)).toBeInViewport({ ratio: 0.9 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
});

test('el mástil no crece fuera del móvil en vertical: móvil en horizontal y ordenador', async ({ page }) => {
  const board = page.locator('.test-room-fretboard .reduced-board-bg');
  const ratio = async () => {
    const box = (await board.boundingBox())!;
    return box.height / box.width;
  };
  await page.setViewportSize({ width: 760, height: 420 });
  await page.goto(URL);
  await page.locator('.test-room-fretboard').scrollIntoViewIfNeeded();
  const plain = await ratio();
  await openGame(page);
  expect(await ratio()).toBeLessThan(plain * 1.2);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(ratio).toBeLessThan(plain * 1.2);
});

// Bloqueo del giro (app/lib/orientationLock.ts). El navegador de los tests no gira: se simula el del
// móvil, que solo deja bloquear en pantalla completa.
function fakeOrientation() {
  const w = window as unknown as { __screen: string[]; __fullscreen: Element | null };
  w.__screen = [];
  w.__fullscreen = null;
  const proto = ScreenOrientation.prototype as unknown as Record<string, unknown>;
  proto.lock = async (direction: string) => {
    if (!w.__fullscreen) {
      w.__screen.push('rechazado');
      throw new DOMException('Hace falta pantalla completa', 'SecurityError');
    }
    w.__screen.push(`bloqueo:${direction}`);
  };
  proto.unlock = () => {
    w.__screen.push('suelta');
  };
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => w.__fullscreen });
  Element.prototype.requestFullscreen = async function requestFullscreen(this: Element) {
    w.__fullscreen = this;
    w.__screen.push('pantalla completa');
  };
  document.exitFullscreen = async () => {
    w.__fullscreen = null;
    w.__screen.push('sale de pantalla completa');
  };
}
const screenCalls = (page: Page) => page.evaluate(() => (window as unknown as { __screen: string[] }).__screen);

test.describe('giro bloqueado en móvil', () => {
  test.use({ hasTouch: true, isMobile: true });

  async function startGame(page: Page) {
    await page.addInitScript(fakeOrientation);
    await page.goto(URL);
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-actions').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Empezar' }).click();
    await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', /countin|playing/, { timeout: 10000 });
  }

  test('en vertical: bloquea al empezar, suelta al pausar, vuelve al continuar y salir lo deja todo', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await startGame(page);
    const stage = page.locator('.test-room-fretboard .riff-stage');
    await expect.poll(() => screenCalls(page)).toEqual(['rechazado', 'pantalla completa', 'bloqueo:portrait']);

    await hold(page, page.getByRole('button', { name: 'PAUSA' }));
    await expect(stage).toHaveAttribute('data-status', 'paused');
    await expect.poll(() => screenCalls(page)).toEqual(['rechazado', 'pantalla completa', 'bloqueo:portrait', 'suelta']);

    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(stage).toHaveAttribute('data-status', /countin|playing/);
    await expect.poll(() => (screenCalls(page))).toEqual(['rechazado', 'pantalla completa', 'bloqueo:portrait', 'suelta', 'bloqueo:portrait']);

    await hold(page, page.getByRole('button', { name: 'SALIR', exact: true }));
    await expect.poll(() => screenCalls(page)).toEqual(['rechazado', 'pantalla completa', 'bloqueo:portrait', 'suelta', 'bloqueo:portrait', 'suelta', 'sale de pantalla completa']);
  });

  test('en horizontal: bloquea en horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 400 });
    await startGame(page);
    await expect.poll(() => screenCalls(page)).toContain('bloqueo:landscape');
  });

  test('sin bloqueo en el navegador (iPhone): la partida sigue igual', async ({ page }) => {
    await page.addInitScript(() => {
      delete (ScreenOrientation.prototype as unknown as Record<string, unknown>).lock;
    });
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto(URL);
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-actions').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Empezar' }).click();
    await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', /countin|playing/, { timeout: 10000 });
  });
});

test('en ordenador no se bloquea el giro ni entra en pantalla completa', async ({ page }) => {
  await page.addInitScript(fakeOrientation);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page, 'Black Gilmur');
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', /countin|playing/, { timeout: 10000 });
  expect(await screenCalls(page)).toEqual([]);
});

test('nivel Híbrido: debajo de las dos columnas, cuenta la cuerda, se recuerda y usa 0-5', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const nivel = page.locator('.riff-dd-toggle', { hasText: 'Nivel' });
  await nivel.click();
  const chip = page.locator('.riff-level-hybrid').getByRole('button', { name: 'Híbrido', exact: true });
  await expect(chip.locator('svg.riff-level-face')).toHaveCount(1);
  const columns = (await page.locator('.riff-level-groups').boundingBox())!;
  const box = (await chip.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(columns.y + columns.height);
  await chip.click();
  await expect(nivel).toContainText('Híbrido');
  // Trastes 0-5.
  await expect(page.locator('.test-room-fretboard .reduced-fret-number')).toHaveCount(6);
  await page.reload();
  await openGame(page);
  await expect(nivel).toContainText('Híbrido');

  // Cuenta la cuerda: el traste bueno en otra cuerda no vale.
  await choose(page, 'Pistas', 'Guitarra rítmica');
  await choose(page, 'Ritmo', 'Paso a paso');
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  const stage = page.locator('.test-room-fretboard .riff-stage');
  await expect(stage).toHaveAttribute('data-status', 'playing', { timeout: 5000 });
  const first = reduceChart(buildChart(at, at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync('public/tabs/prueba-master-of-puppets.gp')), new at.Settings()), 1, 24, { fold: true }), RIFF_LEVELS.hibrido, { range: [40, 86] }).notes[0];
  const rows = laneRows(RIFF_LEVELS.hibrido.strings);
  const other = first.string === 6 ? 5 : 6;
  await tap(page, other, first.fret, rows.get(other)!);
  await expect(stage).toHaveAttribute('data-hits', '0');
  await tap(page, first.string, first.fret, rows.get(first.string)!);
  await expect(stage).toHaveAttribute('data-hits', '1');
});

test('nivel Híbrido en móvil vertical: mástil doble de alto y sin desbordar', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(URL);
  await page.locator('.test-room-fretboard').scrollIntoViewIfNeeded();
  const board = page.locator('.test-room-fretboard .reduced-board-bg');
  const plain = (await board.boundingBox())!.height;
  await openGame(page);
  await page.locator('.riff-dd-toggle', { hasText: 'Nivel' }).click();
  await page.locator('.riff-level-hybrid').getByRole('button', { name: 'Híbrido', exact: true }).click();
  await expect.poll(async () => (await board.boundingBox())!.height).toBeGreaterThanOrEqual(plain * 1.98);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  // Se puede jugar en vertical, sin pedir girar el móvil.
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeEnabled({ timeout: 15000 });
});

test('recuerda la última dificultad elegida; el Tutorial no la cambia', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const nivel = page.locator('.riff-dd-toggle', { hasText: 'Nivel' });
  await expect(nivel).toContainText('Principiante');
  await choose(page, 'Nivel', 'Fácil');
  await page.reload();
  await openGame(page);
  await expect(nivel).toContainText('Fácil');
  // El Tutorial vuelve a la base en pantalla, pero no toca lo guardado.
  await page.locator('.riff-panel .tour-launch').click();
  await page.keyboard.press('Escape');
  await expect(nivel).toContainText('Principiante');
  await page.reload();
  await openGame(page);
  await expect(nivel).toContainText('Fácil');
  // Un valor que ya no existe se ignora.
  await page.evaluate(() => window.localStorage.setItem('riff-ultimo-nivel', 'nivel-antiguo'));
  await page.reload();
  await openGame(page);
  await expect(nivel).toContainText('Principiante');
});

for (const [level, label] of [['experto', 'Experto'], ['practica', 'Principiante'], ['facil', 'Fácil'], ['medio', 'Medio'], ['avanzado', 'Avanzado'], ['medio-cuerdas', 'Medio cuerdas'], ['avanzado-cuerdas', 'Avanzado cuerdas'], ['dificil', 'Difícil']] as const) {
  test(`paso a paso (${label}): la canción espera en cada nota y cuenta los aciertos`, async ({ page }) => {
    const chart = jamesChart(level);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await openGame(page);
    const panel = page.locator('.test-room-fretboard .riff-stage');
    await choose(page, 'Nivel', label);
    await choose(page, 'Pistas', 'Guitarra rítmica');
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
    const cuerdas = level === 'medio-cuerdas' || level === 'avanzado-cuerdas' || level === 'dificil';
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
  const kirk = reduceChart(buildChart(at, score, 2, 24), profile, { follow: james });
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

// Al empezar (petición del usuario): abajo del todo, los números de traste; encima, todo lo posible
// de la autopista. La barra MIDI solo entra si cabe todo (pantalla alta).
for (const [name, width, height, pillVisible] of [['pantalla baja (móvil apaisado)', 760, 420, false], ['pantalla alta', 1366, 1400, true]] as const) {
  test(`al empezar, ${name}: máxima autopista arriba`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(URL);
    await openGame(page);
    await page.locator('.riff-actions').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Empezar' }).click();
    await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', /countin|playing/, { timeout: 5000 });
    await page.waitForTimeout(300);
    const svg = (await page.locator(SVG).boundingBox())!;
    const pill = (await page.locator('.test-room-fretboard .midi-float-pill').boundingBox())!;
    if (pillVisible) {
      // Si todo el juego ya cabe con la página arriba del todo, no se puede subir más (scrollY = 0): la
      // barra queda dentro de la pantalla, por encima del borde.
      const scrollY = await page.evaluate(() => window.scrollY);
      if (scrollY === 0) expect(pill.y + pill.height).toBeLessThanOrEqual(height);
      else expect(Math.abs(pill.y + pill.height - height)).toBeLessThanOrEqual(3);
    } else {
      // No cabe todo: el borde inferior de la MADERA del mástil va al borde de la pantalla; los
      // números de traste quedan debajo, fuera de la vista (petición del usuario, 2026-11-03).
      const wood = (await page.locator('.test-room-fretboard .reduced-board-bg').boundingBox())!;
      expect(Math.abs(wood.y + wood.height - height)).toBeLessThanOrEqual(2);
      expect(svg.y + svg.height).toBeGreaterThan(height + 5);
      expect(pill.y).toBeGreaterThanOrEqual(height - 1);
    }
  });
}

test('MAIkael no se abre mientras se juega (sí en pausa)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', /countin|playing/, { timeout: 5000 });
  const maikael = page.getByRole('button', { name: 'Abrir a MAIkael' });
  await expect(maikael).toHaveAttribute('aria-disabled', 'true');
  await maikael.click({ force: true });
  await page.waitForTimeout(500);
  await expect(page.getByRole('button', { name: 'Cerrar a MAIkael' })).toHaveCount(0);
  await hold(page, page.getByRole('button', { name: 'PAUSA' }));
  await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', 'paused');
  await expect(maikael).not.toHaveAttribute('aria-disabled', 'true');
});

// Bucle = "modo práctica" (petición del usuario): no puntúa y deja cambiar la DIFICULTAD en pausa
// y continuar. Sin bucle, cambiar la dificultad sí anula la partida.
test('con bucle (Práctica) no se puntúa y se puede cambiar la dificultad en pausa y continuar', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const stage = page.locator('.test-room-fretboard .riff-stage');
  await page.locator('.riff-dd-toggle', { hasText: 'Compases' }).click();
  await page.getByLabel('Desde el compás').fill('9');
  await page.getByLabel('Hasta el compás').fill('12');
  await page.getByRole('button', { name: /Repetir en bucle/ }).click();
  await page.keyboard.press('Escape');
  await expect(stage).toHaveAttribute('data-game-mode', 'practica');
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(stage).toHaveAttribute('data-status', /countin|playing/, { timeout: 5000 });
  await expect(page.getByTestId('riff-score')).toHaveText('');
  const pause = page.getByRole('button', { name: 'PAUSA' });
  await hold(page, pause);
  await expect(stage).toHaveAttribute('data-status', 'paused');
  await choose(page, 'Nivel', 'Medio cuerdas');
  await page.waitForTimeout(500);
  await expect(stage).toHaveAttribute('data-status', 'paused');
  // El tramo del bucle (9-12) se conserva al cambiar de dificultad (bug real: volvía a 1-103).
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Compases' })).toContainText('9–12');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(stage).toHaveAttribute('data-status', /countin|playing/);
  // Quitar el bucle con otra dificultad que la de la partida en pausa sí la anula.
  await hold(page, pause);
  await choose(page, 'Nivel', 'Avanzado cuerdas');
  await page.locator('.riff-dd-toggle', { hasText: 'Compases' }).click();
  await page.getByRole('button', { name: /Repetir en bucle/ }).click();
  await page.keyboard.press('Escape');
  await expect(stage).toHaveAttribute('data-status', 'idle');
});

test('modo Concierto: canción entera al 100 %, ajustes bloqueados y sin continuar al pausar', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const stage = page.locator('.test-room-fretboard .riff-stage');
  const toggle = (name: string) => page.locator('.riff-dd-toggle', { hasText: name });
  await choose(page, 'Velocidad', '50%');
  await choose(page, 'Ritmo', 'Paso a paso');
  await toggle('Compases').click();
  await page.getByLabel('Desde el compás').fill('9');
  await page.getByLabel('Hasta el compás').fill('12');
  await page.getByRole('button', { name: /Repetir en bucle/ }).click();
  await page.keyboard.press('Escape');

  // Entrar en Concierto con una partida en pausa la anula.
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(stage).toHaveAttribute('data-status', /countin|playing/, { timeout: 5000 });
  const pause = page.getByRole('button', { name: 'PAUSA' });
  await hold(page, pause);
  await expect(stage).toHaveAttribute('data-status', 'paused');
  const concert = toggle('Concierto');
  await concert.click();
  await expect(stage).toHaveAttribute('data-status', 'idle');
  await expect(stage).toHaveAttribute('data-game-mode', 'concierto');
  await expect(concert).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.riff-dd-menu')).toHaveText('Aquí irán tus rankings');
  await expect(page.locator('.riff-panel').getByRole('button', { name: 'Tutorial' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continuar' })).toHaveCount(0);

  await expect(toggle('Velocidad')).toContainText('100%');
  await expect(toggle('Ritmo')).toContainText('Con ritmo');
  await expect(toggle('Compases')).toHaveText(/^Compases1–\d+▾$/);
  for (const name of ['Velocidad', 'Ritmo', 'Compases']) {
    await expect(toggle(name)).toBeDisabled();
    await expect(toggle(name)).toHaveAttribute('title', 'En Concierto no se cambia');
  }

  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /empezar/i }).click();
  await expect(stage).toHaveAttribute('data-status', /countin|playing/, { timeout: 5000 });
  await hold(page, pause);
  await expect(stage).toHaveAttribute('data-status', 'paused');
  await expect(page.locator('.riff-panel')).toContainText('Esta partida no cuenta.');
  await expect(page.getByRole('button', { name: 'Continuar' })).toHaveCount(0);
  await expect(pause).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Volver a empezar' })).toBeEnabled();

  // Salir de Concierto anula esa partida y devuelve los ajustes de antes, bucle incluido.
  await concert.click();
  await expect(stage).toHaveAttribute('data-status', 'idle');
  await expect(stage).toHaveAttribute('data-game-mode', 'practica');
  await expect(page.locator('.riff-dd-menu')).toHaveCount(0);
  await expect(page.locator('.riff-panel').getByRole('button', { name: 'Tutorial' })).toBeVisible();
  await expect(toggle('Velocidad')).toContainText('50%');
  await expect(toggle('Ritmo')).toContainText('Paso a paso');
  await expect(toggle('Compases')).toContainText('9–12');
});

test('el mástil ocupa lo mismo en todos los niveles; los de menos trastes lo estiran en X (sin agrandarlo)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  const fretNumbers = page.locator('.test-room-fretboard .reduced-fret-number');
  const svg = page.locator(SVG);
  await expect(fretNumbers).toHaveCount(13);
  const before = (await svg.boundingBox())!;
  await openGame(page);
  // Solo se dibujan los trastes del nivel, más anchos: 0-5 en trastes Principiante/Fácil/Medio, 0-10
  // en trastes Avanzado y 0-11 en Medio cuerdas.
  for (const [label, frets] of [['Principiante', 6], ['Fácil', 6], ['Medio', 6], ['Avanzado', 11], ['Medio cuerdas', 12], ['Avanzado cuerdas', 13], ['Difícil', 13], ['Experto', 13]] as const) {
    await choose(page, 'Nivel', label);
    await expect(fretNumbers).toHaveCount(frets);
    const now = (await svg.boundingBox())!;
    expect(Math.round(now.width)).toBe(Math.round(before.width));
    expect(Math.round(now.height)).toBe(Math.round(before.height));
  }
});

test('aviso de pantalla estrecha: "Pantalla pequeña"; los niveles de trastes 0-5 caben', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);
  await openGame(page);
  await choose(page, 'Nivel', 'Experto');
  const warning = page.locator('.riff-narrow-warning');
  await expect(warning).toHaveCount(0);

  // Estrecha: Experto no cabe (aviso corto, sin autopista, sin Empezar)...
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(warning).toHaveText('Pantalla pequeña');
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeDisabled();
  await expect(page.getByTestId('riff-highway')).toHaveCount(0);
  // ...y en el menú los niveles que no caben llevan un icono ámbar (ensanchar la pantalla), pero se
  // pueden elegir; los de trastes 0-5 caben.
  await page.locator('.riff-dd-toggle', { hasText: 'Nivel' }).click();
  const menu = page.locator('.riff-dd-menu');
  const trastes = menu.getByRole('group', { name: 'Modo trastes' });
  for (const name of ['Principiante', 'Fácil', 'Medio']) {
    await expect(trastes.getByRole('button', { name, exact: true })).toHaveAttribute('data-fits', 'true');
    await expect(trastes.getByRole('button', { name, exact: true }).locator('.riff-fit-icon')).toHaveCount(0);
  }
  const avanzado = trastes.getByRole('button', { name: 'Avanzado', exact: true });
  await expect(avanzado).toBeEnabled();
  await expect(avanzado).toHaveAttribute('title', 'Ensancha la pantalla para jugar este nivel');
  await expect(avanzado.locator('.riff-fit-icon')).toHaveCount(1);
  await expect(menu.getByRole('button', { name: 'Experto', exact: true }).locator('.riff-fit-icon')).toHaveCount(1);
  await menu.getByRole('button', { name: 'Principiante', exact: true }).click();
  await expect(warning).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeEnabled({ timeout: 10000 });
  await expect(page.getByTestId('riff-highway')).toHaveCount(1);
});

test.describe('aviso en un móvil', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('estrecho y táctil: "Gira el móvil"', async ({ page }) => {
    // Tan estrecho que ni el mástil 0-5 de Principiante cabe.
    await page.setViewportSize({ width: 300, height: 700 });
    await page.goto(URL);
    await openGame(page);
    await expect(page.locator('.riff-narrow-warning')).toHaveText('Gira el móvil');
    // En el menú Nivel, el icono del móvil girando a la derecha de los que no caben.
    await page.locator('.riff-dd-toggle', { hasText: 'Nivel' }).click();
    await expect(page.locator('.riff-dd-menu').getByRole('button', { name: 'Experto', exact: true })).toHaveAttribute('title', 'Gira el móvil para jugar este nivel');
  });
});

test('Pistas: la otra guitarra, el bajo y la batería se pueden silenciar; el metrónomo, aparte', async ({ page }) => {
  await page.addInitScript(() => {
    const m = { saws: 0 };
    (window as unknown as { __bass: typeof m }).__bass = m;
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const osc = createOscillator.call(this);
      const start = osc.start.bind(osc);
      osc.start = (when = 0) => {
        if (osc.type === 'sawtooth') m.saws++;
        return start(when);
      };
      return osc;
    };
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  // Canción con batería: metrónomo apagado.
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Metrónomo' })).toHaveAttribute('aria-label', 'Metrónomo: Nada');
  await page.locator('.riff-dd-toggle', { hasText: 'Pistas' }).click();
  const menu = page.locator('.riff-dd-menu');
  await expect(menu.locator('.riff-band-track')).toHaveText([/Bajo/, /Guitarra rítmica/, /Batería/]);
  const bass = menu.getByRole('button', { name: /^Bajo:/ });
  await expect(bass).toHaveAttribute('aria-pressed', 'true');
  await bass.click();
  // Silenciar no cierra el menú.
  await expect(bass).toHaveAttribute('aria-pressed', 'false');
  await expect(bass).toHaveAttribute('aria-label', 'Bajo: silenciada');
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', 'playing', { timeout: 15000 });
  await page.waitForTimeout(3000);
  // Con el bajo silenciado no se programa ni una nota de bajo (osciladores de sierra).
  expect(await page.evaluate(() => (window as unknown as { __bass: { saws: number } }).__bass.saws)).toBe(0);
});

test('canción sin batería: empieza con la batería automática', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page, 'Black Gilmur');
  await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
  await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
  await page.getByTestId('local-song-files').setInputFiles([
    { name: 'cumple.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync('public/tabs/cumpleanos-feliz.gp') },
  ]);
  await page.locator('.riff-dd-menu').getByRole('button', { name: 'cumple', exact: true }).click();
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Canción' })).toHaveAttribute('aria-label', 'Canción: cumple', { timeout: 20000 });
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Metrónomo' })).toHaveAttribute('aria-label', 'Metrónomo: Batería automática', { timeout: 10000 });
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
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.waitForTimeout(200);
  const p = await page.evaluate((selector) => {
    const svg = document.querySelector(selector) as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = 22;
    pt.y = 44 + 5 * (158 / 5);
    const r = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: r.x, y: r.y };
  }, SVG);
  // 212 bpm al 50 %: el compás dura 2,26 s reales. Se pulsa cuando la canción EMPIEZA de verdad (fin
  // de la cuenta de entrada, `data-status` = playing, vigilado en cada frame): medir desde que
  // vuelve el clic de "Empezar" llegaba ~0,5 s tarde (la página se recoloca al empezar) y se perdía
  // la última nota.
  const bar = (4 * 60) / 212 / 0.5;
  await page.mouse.move(p.x, p.y);
  await page.waitForFunction(() => document.querySelector('.test-room-fretboard .riff-stage')?.getAttribute('data-status') === 'playing', null, { polling: 'raf', timeout: 10000 });
  await page.mouse.down();
  await page.waitForTimeout(bar * 1000 + 200);
  await page.mouse.up();
  await expect(stage).toHaveAttribute('data-hits', '9');
  // Al 50 %: la primera según su tiempo (2-4 puntos), 7 corcheas (+3) y una semicorchea (+4).
  const score = Number(await stage.getAttribute('data-score'));
  expect(score).toBeGreaterThanOrEqual(27);
  expect(score).toBeLessThanOrEqual(29);
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

for (const width of [1280, 760]) {
  test(`con JUGAR, KEYBOARD resplandece y una flecha en la fila de trastes lo señala (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL);
    const kb = page.locator('.test-room-fretboard .midi-kb-toggle');
    await expect(kb).not.toHaveClass(/riff-kb-glow/);
    await openGame(page);
    await expect(kb).toHaveClass(/riff-kb-glow/);
    const arrow = page.locator('.test-room-fretboard [data-testid="riff-kb-arrow"]');
    await expect(arrow).toBeVisible();
    const a = (await arrow.boundingBox())!;
    const k = (await kb.boundingBox())!;
    expect(Math.abs(a.x + a.width / 2 - (k.x + k.width / 2))).toBeLessThan(3);
    expect(a.y + a.height).toBeLessThan(k.y);
    const number = (await page.locator('.test-room-fretboard .reduced-fret-number').first().boundingBox())!;
    // Con sitio entre los números de traste y la barra (petición del usuario, 2026-11-03): "Usa teclado"
    // encima de la flecha, los dos por DEBAJO de los números (sin invadir el mástil ni taparlos). Sin
    // sitio, la flecha sola a la altura de los números, como antes.
    const hint = page.locator('.test-room-fretboard [data-testid="riff-kb-hint"]');
    if (width === 1280) await expect(hint).toBeVisible();
    if (await hint.count()) {
      await expect(hint).toContainText('Usa teclado');
      const text = (await hint.locator('.riff-kb-hint-text').boundingBox())!;
      expect(text.y).toBeGreaterThanOrEqual(number.y + number.height);
      expect(text.y + text.height).toBeLessThanOrEqual(a.y + 1);
      expect(Math.abs(text.x + text.width / 2 - (k.x + k.width / 2))).toBeLessThan(3);
    } else {
      expect(Math.abs(a.y + a.height / 2 - (number.y + number.height / 2))).toBeLessThan(10);
    }
    // Activado el teclado, la flecha (y su mensaje) se van (el brillo sigue mientras JUGAR esté abierto).
    await kb.click();
    await expect(arrow).toHaveCount(0);
    await expect(hint).toHaveCount(0);
    await expect(kb).toHaveClass(/riff-kb-glow/);
  });
}

test.describe('pantalla táctil', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 1366, height: 900 } });
  test('jugando, un toque corto con el dedo en PAUSA no hace nada; mantenerlo 1 s, sí', async ({ page }) => {
    await page.goto(URL);
    await page.locator('.test-room-fretboard').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'JUGAR', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Empezar' })).toBeEnabled({ timeout: 10000 });
    // Sin teclado físico no hay botón KEYBOARD, ni flecha hacia él.
    await expect(page.locator('.test-room-fretboard [data-testid="riff-kb-arrow"]')).toBeHidden();
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
  await hold(page, page.getByRole('button', { name: 'SALIR', exact: true }));
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

test('cambiar de canción con el disco: en el juego y en la tablatura de debajo (empiezan en Black Gilmur)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await page.locator('.test-room-fretboard').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'JUGAR', exact: true }).click();
  const disc = page.locator('.riff-dd-toggle', { hasText: 'Canción' });
  await expect(disc).toHaveAttribute('aria-label', 'Canción: Black Gilmur');
  // Una sola guitarra, pero con bajo y batería: "Pistas" está para silenciarlas. 44 compases.
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Pistas' })).toBeVisible();
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Compases' })).toHaveText(/^Compases1–44▾$/, { timeout: 10000 });
  await choose(page, 'Canción', 'Iron Rain');
  await expect(disc).toHaveAttribute('aria-label', 'Canción: Iron Rain');
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Compases' })).toHaveText(/^Compases1–101▾$/, { timeout: 10000 });
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Pistas' })).toBeVisible();
  // Se puede jugar: Empezar arranca la partida.
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', /countin|playing/);

  // Tablatura de debajo: su propio disco, a la izquierda del todo de su barra.
  const tabDisc = page.locator('.test-room-tab').getByRole('button', { name: /^Canción:/ });
  await tabDisc.scrollIntoViewIfNeeded();
  await expect(tabDisc).toHaveAttribute('aria-label', 'Canción: Black Gilmur');
  await tabDisc.click();
  await page.getByRole('menuitemradio', { name: 'Electric Warlock' }).click();
  await expect(tabDisc).toHaveAttribute('aria-label', 'Canción: Electric Warlock');
  await expect(page.locator('.test-room-tab .at-surface svg').first()).toBeVisible({ timeout: 15000 });
});

test('el mástil del juego toma la afinación original de cada canción (Do#, Mi♭, E)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  // Black Gilmur (por defecto) está en Do#: el botón de afinar (nota de la 6ª al aire) dice C#.
  await openGame(page, 'Black Gilmur');
  const tuning = page.locator('.test-room-fretboard').getByRole('button', { name: 'Afinar el mástil' });
  await expect(tuning).toHaveText('C#', { timeout: 10000 });
  await choose(page, 'Canción', 'Iron Rain');
  await expect(tuning).toHaveText('D#', { timeout: 10000 });
  await choose(page, 'Canción', 'Canción de prueba');
  await expect(tuning).toHaveText('E', { timeout: 10000 });
});

test.describe('canciones del dispositivo', () => {
  // Cuenta las URLs blob: borradas (la canción anterior del dispositivo se borra al cambiar).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __revoked: string[] };
      w.__revoked = [];
      // globalThis.URL: en este archivo `URL` es la ruta de la página.
      const original = globalThis.URL.revokeObjectURL.bind(globalThis.URL);
      globalThis.URL.revokeObjectURL = (url: string) => {
        w.__revoked.push(url);
        original(url);
      };
    });
  });

  test('elegir archivos: solo los válidos, se juega, uno roto avisa, y al cambiar se borra', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    await expect(page.locator('.local-song-card')).toContainText('Elige la carpeta de tus canciones.');
    await page.getByTestId('local-song-files').setInputFiles([
      { name: 'mi-cancion.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync('public/tabs/electric-warlock.gp') },
      { name: 'roto.gp', mimeType: 'application/octet-stream', buffer: Buffer.from('esto no es una tablatura') },
      { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') },
    ]);
    await expect(page.locator('.local-song-card')).toContainText('He encontrado 2 canciones nuevas.');
    const menu = page.locator('.riff-dd-menu');
    await expect(menu.getByRole('button', { name: 'notas', exact: true })).toHaveCount(0);

    // Uno roto: aviso y la canción no cambia.
    await menu.getByRole('button', { name: 'roto', exact: true }).click();
    await expect(page.locator('.riff-panel')).toContainText('«roto» no tiene guitarra para jugar.');
    const disc = page.locator('.riff-dd-toggle', { hasText: 'Canción' });
    await expect(disc).toHaveAttribute('aria-label', 'Canción: Black Gilmur');

    // El bueno: se juega (Electric Warlock tiene 128 compases).
    await choose(page, 'Canción', 'mi-cancion');
    await expect(disc).toHaveAttribute('aria-label', 'Canción: mi-cancion');
    await expect(page.locator('.riff-dd-toggle', { hasText: 'Compases' })).toHaveText(/^Compases1–128▾$/, { timeout: 10000 });
    await page.getByRole('button', { name: 'Empezar' }).click();
    await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', /countin|playing/);
    await hold(page, page.getByRole('button', { name: 'PAUSA' }));

    // Volver a una de la web BORRA la del dispositivo de la memoria.
    const before = await page.evaluate(() => (window as unknown as { __revoked: string[] }).__revoked.length);
    await choose(page, 'Canción', 'Iron Rain');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __revoked: string[] }).__revoked.length)).toBeGreaterThan(before);
  });

  // Petición del usuario (2026-10-31): cada canción lleva la carita de su dificultad (😛 fácil, 😁 normal,
  // 😈 difícil) y las del dispositivo se ordenan de más fácil a más difícil; las de la web, en su orden.
  test('dificultad: carita en cada canción y las del dispositivo ordenadas de fácil a difícil', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    // Nombres en orden alfabético contrario al de dificultad.
    await page.getByTestId('local-song-files').setInputFiles([
      { name: 'alfa.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync('public/tabs/iron-rain.gp') },
      { name: 'medio.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync('public/tabs/electric-warlock.gp') },
      { name: 'zeta.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync('public/tabs/feliz-navidad.gp') },
    ]);
    const rows = page.locator('.riff-song-list .riff-chip');
    await expect(rows.locator('xpath=self::*[not(@data-difficulty)]')).toHaveCount(0, { timeout: 30000 });
    await expect(rows.locator('.riff-song-title')).toHaveText(['Black Gilmur', 'Electric Warlock', 'Iron Rain', 'Canción de prueba', 'zeta', 'medio', 'alfa']);
    expect(await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-difficulty')))).toEqual(['facil', 'normal', 'dificil', 'dificil', 'facil', 'normal', 'dificil']);
    // La carita es la del nivel: Principiante (😛) para fácil, Medio (😈, con cuernos) para difícil.
    await expect(rows.nth(4).locator('svg.riff-level-face')).toHaveCount(1);
    await expect(page.getByTestId('song-difficulty-legend').first()).toContainText('fácil');
    await expect(rows.nth(6)).toHaveAttribute('title', 'alfa (canción difícil)');
  });

  // Petición del usuario (2026-11-01): las canciones del dispositivo sin batería llevan el tambor
  // tachado, y las que no tienen guitarra, el clavijero tachado (se ve antes de elegirlas).
  test('canciones del dispositivo sin batería o sin guitarra: iconos tachados', async ({ page }) => {
    test.setTimeout(90000);
    const piano = '<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'
      + '<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
      + '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>';
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    await page.getByTestId('local-song-files').setInputFiles([
      { name: 'con-todo.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync('public/tabs/black-gilmur.gp') },
      { name: 'sin-bateria.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync('public/tabs/feliz-navidad.gp') },
      { name: 'piano.musicxml', mimeType: 'application/xml', buffer: Buffer.from(piano) },
    ]);
    const row = (name: string) => page.locator('.riff-song-list .riff-chip', { has: page.locator('.riff-song-title', { hasText: new RegExp(`^${name}$`) }) });
    await expect(row('sin-bateria').getByTestId('song-lacks')).toHaveAttribute('data-lacks', 'sin batería', { timeout: 30000 });
    await expect(row('piano').getByTestId('song-lacks')).toHaveAttribute('data-lacks', 'sin guitarra, sin batería');
    await expect(row('piano').locator('.song-lacks-guitar')).toHaveCount(1);
    await expect(row('sin-bateria').locator('.song-lacks-drums')).toHaveCount(1);
    await expect(row('con-todo')).toHaveAttribute('data-difficulty', 'facil');
    await expect(row('con-todo').getByTestId('song-lacks')).toHaveCount(0);
    // Las de la web nunca llevan iconos tachados, y el nombre del botón sigue siendo solo el título.
    await expect(row('Black Gilmur').getByTestId('song-lacks')).toHaveCount(0);
    await expect(page.locator('.riff-dd-menu').getByRole('button', { name: 'sin-bateria', exact: true })).toBeVisible();
    await expect(row('sin-bateria')).toHaveAttribute('title', 'sin-bateria (canción fácil) (sin batería)');
  });

  test('carpeta recordada: tras recargar vuelven las guardadas; si el navegador las borró, "Buscar en «carpeta»" a la vista', async ({ page }) => {
    // Carpeta REAL del navegador (OPFS) con un .gp.
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('Covers', { create: true });
      const handle = await dir.getFileHandle('Mi tema.gp', { create: true });
      const writable = await handle.createWritable();
      await writable.write(await (await fetch('/tabs/iron-rain.gp')).arrayBuffer());
      await writable.close();
      (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => dir;
    });
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    await page.getByRole('button', { name: 'Elegir carpeta', exact: true }).click();
    await expect(page.locator('.riff-dd-menu').getByRole('button', { name: 'Mi tema', exact: true })).toBeVisible();
    // La lista se ve antes de terminar de guardar la copia; el aviso sale cuando ya está guardada.
    await expect(page.locator('.local-song-card')).toContainText('He encontrado 1 canción nueva.');

    // Recargar: Chrome vuelve a preguntar ("prompt") hasta que el usuario pulse.
    await page.addInitScript(() => {
      const proto = (window as unknown as { FileSystemHandle: { prototype: Record<string, unknown> } }).FileSystemHandle.prototype;
      proto.queryPermission = async () => 'prompt';
      proto.requestPermission = async () => 'granted';
    });
    await page.reload();
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    const menu = page.locator('.riff-dd-menu');
    const again = menu.getByRole('button', { name: 'Buscar en «Covers»', exact: true });
    await expect(menu.getByRole('button', { name: 'Mi tema', exact: true })).toBeVisible();
    await expect(again).toHaveCount(0);

    // El navegador borra las copias (falta de espacio): la carpeta sigue, a un clic.
    await page.evaluate(() => new Promise<void>((resolve) => {
      const open = indexedDB.open('guitarra-canciones-locales');
      open.onsuccess = () => {
        const tx = open.result.transaction('canciones', 'readwrite');
        tx.objectStore('canciones').clear();
        tx.oncomplete = () => { open.result.close(); resolve(); };
      };
    }));
    await page.reload();
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    await expect(again).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Mi tema', exact: true })).toHaveCount(0);
    await again.click();
    await expect(menu.getByRole('button', { name: 'Mi tema', exact: true })).toBeVisible();
    await expect(again).toHaveCount(0);
  });

  test('canciones guardadas: vuelven solas al recargar, se pueden jugar y se pueden borrar', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await openGame(page, 'Black Gilmur');
    const disc = page.locator('.riff-dd-toggle', { hasText: 'Canción' });
    await disc.click();
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    await page.getByTestId('local-song-files').setInputFiles([
      { name: 'mi-cancion.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync('public/tabs/electric-warlock.gp') },
    ]);
    await expect(page.locator('.local-song-card')).toContainText('He encontrado 1 canción nueva.');

    // Otra visita: está en la lista sin elegir nada, y se lee entera desde la copia.
    await page.reload();
    await openGame(page, 'Black Gilmur');
    await disc.click();
    const menu = page.locator('.riff-dd-menu');
    const song = menu.getByRole('button', { name: 'mi-cancion', exact: true });
    await song.click();
    await expect(disc).toContainText('mi-cancion');
    await expect(page.locator('.riff-action-start')).toBeEnabled({ timeout: 15000 });

    // Borrar pide un segundo toque.
    await disc.click();
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    await page.getByRole('button', { name: 'Borrar canciones guardadas', exact: true }).click();
    await expect(song).toBeVisible();
    await page.getByRole('button', { name: 'Sí, borrarlas', exact: true }).click();
    await expect(song).toHaveCount(0);
    await page.reload();
    await openGame(page, 'Black Gilmur');
    await disc.click();
    await expect(page.getByRole('button', { name: 'Buscar mis canciones', exact: true })).toBeVisible();
    await expect(song).toHaveCount(0);
  });

  test('canciones guardadas: recuerdan su carita y la batería tachada sin volver a medirlas', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    await page.getByTestId('local-song-files').setInputFiles([
      { name: 'sin-bateria.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync('public/tabs/feliz-navidad.gp') },
    ]);
    const row = page.locator('.riff-song-list .riff-chip', { has: page.locator('.riff-song-title', { hasText: /^sin-bateria$/ }) });
    await expect(row).toHaveAttribute('data-difficulty', 'facil', { timeout: 30000 });
    await expect(row.getByTestId('song-lacks')).toHaveAttribute('data-lacks', 'sin batería');

    // Se cambia lo recordado: si al volver sale ese valor, es que no se ha medido otra vez.
    await page.evaluate(() => {
      const key = 'riff-rasgos-canciones-v1';
      const traits = JSON.parse(window.localStorage.getItem(key)!);
      for (const id of Object.keys(traits)) traits[id].difficulty = 'dificil';
      window.localStorage.setItem(key, JSON.stringify(traits));
    });
    await page.reload();
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    await expect(row).toHaveAttribute('data-difficulty', 'dificil');
    await expect(row.getByTestId('song-lacks')).toHaveAttribute('data-lacks', 'sin batería');

    // Borrar las canciones olvida también lo medido.
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    await page.getByRole('button', { name: 'Borrar canciones guardadas', exact: true }).click();
    await page.getByRole('button', { name: 'Sí, borrarlas', exact: true }).click();
    await expect(row).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem('riff-rasgos-canciones-v1'))).toBeNull();
  });

  test('sin espacio para guardar: avisa, y la canción sirve en esta visita', async ({ page }) => {
    await page.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function patched(this: IDBObjectStore, ...args: Parameters<typeof put>) {
        if (this.name === 'canciones') throw new DOMException('Sin espacio', 'QuotaExceededError');
        return put.apply(this, args);
      };
    });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    await page.getByTestId('local-song-files').setInputFiles([
      { name: 'mi-cancion.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync('public/tabs/electric-warlock.gp') },
    ]);
    await expect(page.locator('.local-song-card')).toContainText('No caben más.');
    await expect(page.locator('.riff-dd-menu').getByRole('button', { name: 'mi-cancion', exact: true })).toBeVisible();
  });

  test('Chrome/Edge: elegir carpeta busca dentro (subcarpetas incluidas)', async ({ page }) => {
    await page.addInitScript(() => {
      // Carpeta simulada: Canciones/{uno.gp, foto.jpg, rock/{dos.gp}}.
      const fileHandle = (name: string, url: string) => ({
        kind: 'file', name,
        getFile: async () => new File([await (await fetch(url)).arrayBuffer()], name, { lastModified: name.length }),
      });
      const dir = (name: string, entries: unknown[]) => ({ kind: 'directory', name, async *values() { yield* entries; } });
      (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => dir('Canciones', [
        fileHandle('uno.gp', '/tabs/iron-rain.gp'),
        fileHandle('foto.jpg', '/tabs/iron-rain.gp'),
        dir('rock', [fileHandle('dos.gp', '/tabs/black-gilmur.gp')]),
      ]);
    });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    await page.getByRole('button', { name: 'Elegir carpeta', exact: true }).click();
    await expect(page.locator('.local-song-card')).toContainText('He encontrado 2 canciones nuevas.');
    await expect(page.locator('.local-song-card')).toContainText('Buscar otra vez en «Canciones»');
    const menu = page.locator('.riff-dd-menu');
    await expect(menu.getByRole('button', { name: 'uno', exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'dos', exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'foto', exact: true })).toHaveCount(0);
  });
});

// Cortes de audio en canciones muy densas (petición del usuario, 2026-10-31): con 4 instrumentos y
// notas muy cortas y rápidas se amontonaban decenas de notas de fondo y cada golpe de batería creaba
// buffers nuevos. Canción de estrés (2 guitarras + bajo + batería en semicorcheas a 220 bpm, generada
// para el test) cargada como "tus canciones": nunca más de MAX_GUIDE_VOICES (24) notas de fondo
// sonando a la vez, y la batería reutiliza sus ráfagas de ruido en vez de crear una por golpe.
test('canción muy densa: notas de fondo con tope y batería sin buffers nuevos por golpe', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const m = { buffers: 0, sounding: 0, maxSounding: 0 };
    (window as unknown as { __audio: typeof m }).__audio = m;
    const proto = AudioContext.prototype;
    const createBuffer = proto.createBuffer;
    proto.createBuffer = function (...args: Parameters<typeof createBuffer>) {
      m.buffers++;
      return createBuffer.apply(this, args);
    };
    const createBufferSource = proto.createBufferSource;
    proto.createBufferSource = function () {
      const node = createBufferSource.call(this);
      const start = node.start.bind(node);
      node.start = (when = 0, ...rest: number[]) => {
        // Solo las notas de guitarra (samples en bucle): cuentan desde que EMPIEZAN a sonar.
        if (node.loop) {
          const delay = Math.max(0, when - this.currentTime) * 1000;
          let ended = false;
          node.addEventListener('ended', () => { if (!ended) { ended = true; m.sounding--; } });
          setTimeout(() => {
            if (ended) return;
            m.sounding++;
            m.maxSounding = Math.max(m.maxSounding, m.sounding);
          }, delay);
        }
        return start(when, ...rest);
      };
      return node;
    };
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page, 'Black Gilmur');
  await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
  await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
  await page.getByTestId('local-song-files').setInputFiles([
    { name: 'estres.musicxml', mimeType: 'application/xml', buffer: fs.readFileSync('tests/fixtures/stress-4-instrumentos.musicxml') },
  ]);
  await page.locator('.riff-dd-menu').getByRole('button', { name: 'estres', exact: true }).click();
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Compases' })).toHaveText(/^Compases1–110▾$/, { timeout: 20000 });
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Metrónomo' })).toHaveAttribute('aria-label', 'Metrónomo: Nada');
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', 'playing', { timeout: 20000 });
  const buffersAtStart = await page.evaluate(() => (window as unknown as { __audio: { buffers: number } }).__audio.buffers);
  await page.waitForTimeout(15000);
  const m = await page.evaluate(() => (window as unknown as { __audio: { buffers: number; maxSounding: number } }).__audio);
  // ~15 golpes de batería por segundo: antes, 2-3 buffers nuevos por golpe (cientos en 15 s).
  expect(m.buffers - buffersAtStart).toBeLessThan(30);
  expect(m.maxSounding).toBeGreaterThan(3);
  expect(m.maxSounding).toBeLessThanOrEqual(24);
});

test('canción muy densa: el bajo es monofónico y el temporizador no se retrasa', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const m = { bass: [] as Array<{ start: number; stop: number }>, maxTickGap: 0 };
    (window as unknown as { __bass: typeof m }).__bass = m;
    // Cada nota de bajo = un oscilador de sierra: su inicio y su ÚLTIMO stop (el corte de la siguiente).
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const osc = createOscillator.call(this);
      const start = osc.start.bind(osc);
      const stop = osc.stop.bind(osc);
      let entry: { start: number; stop: number } | null = null;
      osc.start = (when = 0) => {
        if (osc.type === 'sawtooth') m.bass.push((entry = { start: when, stop: Infinity }));
        return start(when);
      };
      osc.stop = (when = 0) => {
        if (entry) entry.stop = Math.min(entry.stop, when);
        return stop(when);
      };
      return osc;
    };
    // El temporizador de 25 ms del juego: cuánto llega a tardar entre dos vueltas.
    const setIntervalOrig = window.setInterval;
    window.setInterval = ((fn: () => void, ms?: number) => {
      if (ms !== 25) return setIntervalOrig(fn, ms);
      let last = performance.now();
      return setIntervalOrig(() => {
        const now = performance.now();
        m.maxTickGap = Math.max(m.maxTickGap, now - last);
        last = now;
        fn();
      }, ms);
    }) as typeof window.setInterval;
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page, 'Black Gilmur');
  await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
  await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
  await page.getByTestId('local-song-files').setInputFiles([
    { name: 'estres.musicxml', mimeType: 'application/xml', buffer: fs.readFileSync('tests/fixtures/stress-4-instrumentos.musicxml') },
  ]);
  await page.locator('.riff-dd-menu').getByRole('button', { name: 'estres', exact: true }).click();
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Compases' })).toHaveText(/^Compases1–110▾$/, { timeout: 20000 });
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', 'playing', { timeout: 20000 });
  await page.evaluate(() => { (window as unknown as { __bass: { maxTickGap: number } }).__bass.maxTickGap = 0; });
  await page.waitForTimeout(15000);
  const m = await page.evaluate(() => (window as unknown as { __bass: { bass: Array<{ start: number; stop: number }>; maxTickGap: number } }).__bass);
  const notes = m.bass.filter((note) => note.stop > note.start).sort((a, b) => a.start - b.start);
  expect(notes.length).toBeGreaterThan(20);
  // Cada nota se apaga (con su fundido de ~30 ms) cuando empieza la siguiente: nunca dos a la vez.
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].start - notes[i - 1].start < 1e-4) continue; // doble cuerda
    expect(notes[i - 1].stop - notes[i].start).toBeLessThan(0.04);
  }
  expect(m.maxTickGap).toBeLessThan(250);
});

test('batería automática: en una canción sin batería se pone sola y suena con bombos', async ({ page }) => {
  await page.addInitScript(() => {
    const m = { kicks: 0 };
    (window as unknown as { __drums: typeof m }).__drums = m;
    // El bombo de playMetronomeClick es un oscilador senoidal (el metrónomo solo usa cajas de ruido, y
    // Cumpleaños feliz no tiene bajo, cuyo sub también lo es).
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const osc = createOscillator.call(this);
      const start = osc.start.bind(osc);
      osc.start = (when = 0) => {
        if (osc.type === 'sine') m.kicks++;
        return start(when);
      };
      return osc;
    };
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page, 'Black Gilmur');
  // Con batería en la canción no se pone sola, pero se puede elegir (para cambiar la real por esta).
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Metrónomo' })).toHaveAttribute('aria-label', 'Metrónomo: Nada');
  await choose(page, 'Metrónomo', 'Batería automática');
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Metrónomo' })).toHaveAttribute('aria-label', 'Metrónomo: Batería automática');
  await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
  await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
  await page.getByTestId('local-song-files').setInputFiles([
    { name: 'cumple.gp', mimeType: 'application/octet-stream', buffer: fs.readFileSync('public/tabs/cumpleanos-feliz.gp') },
  ]);
  await page.locator('.riff-dd-menu').getByRole('button', { name: 'cumple', exact: true }).click();
  const toggle = page.locator('.riff-dd-toggle', { hasText: 'Metrónomo' });
  // Se pone sola al elegir una canción sin batería.
  await expect(toggle).toHaveAttribute('aria-label', 'Metrónomo: Batería automática', { timeout: 20000 });
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', 'playing', { timeout: 15000 });
  await page.waitForTimeout(4000);
  expect(await page.evaluate(() => (window as unknown as { __drums: { kicks: number } }).__drums.kicks)).toBeGreaterThan(2);
});

for (const width of [360, 480]) {
  test(`desplegables centrados a ${width}px, también el de canciones (juego y tablatura)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(URL);
    await openGame(page);
    const centered = async (selector: string) => {
      const box = (await page.locator(selector).first().boundingBox())!;
      expect(box.x, selector).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, selector).toBeLessThanOrEqual(width);
      expect(Math.abs(box.x + box.width / 2 - width / 2), selector).toBeLessThanOrEqual(3);
    };
    for (const menu of ['Nivel', 'Velocidad', 'Canción', 'Pistas', 'Metrónomo', 'Ritmo', 'Compases']) {
      await page.locator('.riff-dd-toggle', { hasText: menu }).click();
      await centered('.riff-dd-menu');
      await page.locator('.riff-dd-toggle', { hasText: menu }).click();
    }
    const tabDisc = page.locator('.test-room-tab').getByRole('button', { name: /^Canción:/ });
    await tabDisc.scrollIntoViewIfNeeded();
    await tabDisc.click();
    await centered('.test-room-tab [aria-label="Selector de canción"]');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  });
}

test('canción sin batería pero con bajo: el bajo suena de fondo junto a la batería automática', async ({ page }) => {
  await page.addInitScript(() => {
    const m = { saws: 0 };
    (window as unknown as { __band: typeof m }).__band = m;
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const osc = createOscillator.call(this);
      const start = osc.start.bind(osc);
      osc.start = (when = 0) => {
        if (osc.type === 'sawtooth') m.saws++;
        return start(when);
      };
      return osc;
    };
  });
  // La partitura de estrés sin su parte de batería: 2 guitarras + bajo.
  const xml = fs.readFileSync('tests/fixtures/stress-4-instrumentos.musicxml', 'utf8')
    .replace(/<score-part id="P4">[\s\S]*?<\/score-part>/, '')
    .replace(/<part id="P4">[\s\S]*?<\/part>/, '');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page, 'Black Gilmur');
  await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
  await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
  await page.getByTestId('local-song-files').setInputFiles([{ name: 'sinbateria.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) }]);
  await page.locator('.riff-dd-menu').getByRole('button', { name: 'sinbateria', exact: true }).click();
  await expect(page.locator('.riff-dd-toggle', { hasText: 'Metrónomo' })).toHaveAttribute('aria-label', 'Metrónomo: Batería automática', { timeout: 20000 });
  await page.locator('.riff-dd-toggle', { hasText: 'Pistas' }).click();
  await expect(page.locator('.riff-dd-menu').getByRole('button', { name: /^Bajo:/ })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.riff-dd-toggle', { hasText: 'Pistas' }).click();
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.test-room-fretboard .riff-stage')).toHaveAttribute('data-status', 'playing', { timeout: 15000 });
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => (window as unknown as { __band: { saws: number } }).__band.saws)).toBeGreaterThan(5);
});

// Bajo jugable (petición del usuario, 2026-11-04).
test('bajo jugable: se elige en Pistas, suena con su sintetizador y la guitarra pasa al fondo', async ({ page }) => {
  await page.addInitScript(() => {
    const m = { saws: 0 };
    (window as unknown as { __bass: typeof m }).__bass = m;
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const osc = createOscillator.call(this);
      const start = osc.start.bind(osc);
      osc.start = (when = 0) => {
        if (osc.type === 'sawtooth') m.saws++;
        return start(when);
      };
      return osc;
    };
  });
  const score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync('public/tabs/prueba-master-of-puppets.gp')), new at.Settings());
  const bassTrack = listPlayableTracks(score).find((track) => track.kind === 'bass')!;
  const chart = reduceChart(buildChart(at, score, bassTrack.index, 24, { fold: true }), RIFF_LEVELS.dificil);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(URL);
  await openGame(page);
  const panel = page.locator('.test-room-fretboard .riff-stage');
  await choose(page, 'Nivel', 'Difícil');
  await choose(page, 'Pistas', 'Bajo');
  const pistas = page.locator('.riff-dd-toggle', { hasText: 'Pistas' });
  await expect(pistas).toHaveAttribute('aria-label', 'Pistas: Bajo');
  // El mástil no toma la octava del bajo como afinación.
  await pistas.click();
  await expect(page.getByRole('button', { name: 'Guitarra rítmica: suena' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bajo: suena' })).toHaveCount(0);
  await pistas.click();
  await choose(page, 'Ritmo', 'Paso a paso');
  await page.locator('.riff-actions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(panel).toHaveAttribute('data-status', 'playing', { timeout: 5000 });
  await page.mouse.move(0, 0);
  const rows = laneRows(RIFF_LEVELS.dificil.strings);
  const before = await page.evaluate(() => (window as unknown as { __bass: { saws: number } }).__bass.saws);
  const [first, second] = chart.notes;
  await tap(page, first.string, first.fret, rows.get(first.string)!);
  await expect(panel).toHaveAttribute('data-hits', '1');
  await tap(page, second.string, second.fret, rows.get(second.string)!);
  await expect(panel).toHaveAttribute('data-hits', '2');
  // Un acierto en 'paso' hace sonar sus notas con el sintetizador de bajo.
  expect(await page.evaluate(() => (window as unknown as { __bass: { saws: number } }).__bass.saws)).toBeGreaterThan(before);
});

// Partitura de una nota por pulso en `strings` (MusicXML: cuerda 1 = la más aguda).
function tabXml(tuning: Array<[string, number]>, notes: Array<[number, number]>) {
  const staffTuning = tuning.map(([step, octave], k) => `<staff-tuning line="${k + 1}"><tuning-step>${step}</tuning-step><tuning-octave>${octave}</tuning-octave></staff-tuning>`).join('');
  const measures = Array.from({ length: Math.ceil(notes.length / 4) }, (_, m) => {
    const attrs = m === 0 ? `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>TAB</sign><line>5</line></clef><staff-details><staff-lines>${tuning.length}</staff-lines>${staffTuning}</staff-details></attributes><sound tempo="120"/>` : '';
    const bar = notes.slice(m * 4, m * 4 + 4).map(([string, fret]) => `<note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><type>quarter</type><notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations></note>`).join('');
    return `<measure number="${m + 1}">${attrs}${bar}</measure>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Instrumento</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

const SEVEN = [['B', 1], ['E', 2], ['A', 2], ['D', 3], ['G', 3], ['B', 3], ['E', 4]] as Array<[string, number]>;
const BASS_FIVE = [['B', 0], ['E', 1], ['A', 1], ['D', 2], ['G', 2]] as Array<[string, number]>;

for (const [label, tuning, count] of [['guitarra de 7', SEVEN, 7], ['bajo de 5', BASS_FIVE, 5]] as const) {
  test(`Experto con ${label}: todas sus cuerdas en el mástil, y la más grave se toca`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(URL);
    await openGame(page, 'Black Gilmur');
    await page.locator('.riff-dd-toggle', { hasText: 'Canción' }).click();
    await page.getByRole('button', { name: 'Buscar mis canciones', exact: true }).click();
    const xml = tabXml([...tuning], [[count, 1], [count, 2], [1, 3], [count - 1, 0]]);
    await page.getByTestId('local-song-files').setInputFiles([{ name: 'muchas.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) }]);
    await page.locator('.riff-dd-menu').getByRole('button', { name: 'muchas', exact: true }).click();
    await expect(page.locator('.riff-dd-toggle', { hasText: 'Metrónomo' })).toHaveAttribute('aria-label', 'Metrónomo: Batería automática', { timeout: 20000 });
    await choose(page, 'Nivel', 'Experto');
    await choose(page, 'Ritmo', 'Paso a paso');
    await page.locator('.riff-actions').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Empezar' }).click();
    const panel = page.locator('.test-room-fretboard .riff-stage');
    await expect(panel).toHaveAttribute('data-status', 'playing', { timeout: 5000 });
    await page.mouse.move(0, 0);
    // La más grave va en la fila de abajo; la vecina, justo encima (no vale).
    const gap = 5 / (count - 1);
    await tap(page, 6, 1, 6 - gap);
    await page.waitForTimeout(200);
    await expect(panel).toHaveAttribute('data-hits', '0');
    await tap(page, 6, 1, 6);
    await expect(panel).toHaveAttribute('data-hits', '1');
    await tap(page, 6, 2, 6);
    await expect(panel).toHaveAttribute('data-hits', '2');
    await page.screenshot({ path: `test-results/experto-${count}-cuerdas.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  });
}
