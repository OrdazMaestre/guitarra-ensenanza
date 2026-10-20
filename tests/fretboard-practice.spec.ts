import { test, expect, type Page } from '@playwright/test';

// Modo "Practicar ejercicio" (useFretboardPractice.ts + FretboardPractice.tsx) en
// /lecciones/temario/tablaturas. Sin táctil para poder usar también KEYBOARD (ver AGENTS.md).
test.use({ hasTouch: false });

const EX1 = [2, 4, 5, 2, 4, 5, 4, 5, 7, 4, 5, 7, 0, 2, 4, 0, 2, 4];

// Centro en pantalla de (cuerda, traste) del primer mástil reducido de la página, usando la misma
// geometría que ReducedFretboardDiagram (boardX=42, fretWidth=58, boardY=44 con fretLabelsAbove).
async function fretPoint(page: Page, string: number, fret: number) {
  return page.evaluate(({ string, fret }) => {
    const svg = document.querySelector('svg.reduced-fretboard') as SVGSVGElement;
    const x = fret === 0 ? 22 : 42 + (fret - 0.5) * 58;
    const y = 44 + (string - 1) * (158 / 5);
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    const r = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: r.x, y: r.y };
  }, { string, fret });
}

async function tap(page: Page, string: number, fret: number) {
  const p = await fretPoint(page, string, fret);
  await page.mouse.click(p.x, p.y);
}

async function expectTarget(page: Page, string: number, fret: number) {
  const target = page.getByTestId('practice-target');
  await expect(target).toHaveAttribute('data-string', String(string));
  await expect(target).toHaveAttribute('data-fret', String(fret));
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/lecciones/temario/tablaturas');
  await page.locator('svg.reduced-fretboard').scrollIntoViewIfNeeded();
});

test('completar el ejercicio 1 con el ratón muestra ENHORABUENA 2 s', async ({ page }) => {
  await expect(page.getByTestId('practice-target')).toHaveCount(0);
  await page.getByRole('button', { name: 'Practicar ejercicio 1' }).click();
  for (const fret of EX1) {
    await expectTarget(page, 1, fret);
    await tap(page, 1, fret);
  }
  const feedback = page.getByTestId('practice-feedback');
  await expect(feedback).toHaveText('¡ENHORABUENA!');
  await expect(page.getByTestId('practice-target')).toHaveCount(0);
  await expect(feedback).toHaveCount(0, { timeout: 3000 });
});

test('fallar muestra OTRA VEZ 3 s y vuelve a la primera nota', async ({ page }) => {
  await page.getByRole('button', { name: 'Practicar ejercicio 1' }).click();
  await tap(page, 1, 2);
  await expectTarget(page, 1, 4);
  await tap(page, 1, 9);
  const feedback = page.getByTestId('practice-feedback');
  await expect(feedback).toHaveText('OTRA VEZ');
  await expect(page.getByTestId('practice-target')).toHaveCount(0);
  // Durante el mensaje las notas se ignoran.
  await tap(page, 1, 2);
  await expect(feedback).toHaveCount(0, { timeout: 4000 });
  await expectTarget(page, 1, 2);
});

test('slide: 4→5 cuenta, 2→4 (pasa por el 3) falla', async ({ page }) => {
  await page.getByRole('button', { name: 'Practicar ejercicio 1' }).click();
  await tap(page, 1, 2);
  // Arrastrar 4→5: cuenta el 4 al pulsar y el 5 al llegar deslizando.
  const p4 = await fretPoint(page, 1, 4);
  const p5 = await fretPoint(page, 1, 5);
  await page.mouse.move(p4.x, p4.y);
  await page.mouse.down();
  await page.mouse.move(p5.x, p5.y, { steps: 8 });
  await page.mouse.up();
  await expectTarget(page, 1, 2);
  // Arrastrar 2→4 pasa por el 3 (nota pegada equivocada) -> fallo.
  const p2 = await fretPoint(page, 1, 2);
  await page.mouse.move(p2.x, p2.y);
  await page.mouse.down();
  await page.mouse.move(p4.x, p4.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('practice-feedback')).toHaveText('OTRA VEZ');
});

test('slide en diagonal o con salto de 2 trastes se ignora (ni acierto ni fallo)', async ({ page }) => {
  await page.getByRole('button', { name: 'Practicar ejercicio 1' }).click();
  await tap(page, 1, 2);
  // Pulsar el 4 (cuenta) y saltar de golpe en diagonal a cuerda 2 traste 5: se ignora.
  const p4 = await fretPoint(page, 1, 4);
  const diag = await fretPoint(page, 2, 5);
  await page.mouse.move(p4.x, p4.y);
  await page.mouse.down();
  await page.mouse.move(diag.x, diag.y, { steps: 1 });
  await page.mouse.up();
  await expectTarget(page, 1, 5);
  // Pulsar el 5 (cuenta) y saltar de golpe al 7 (2 trastes): se ignora.
  const p5 = await fretPoint(page, 1, 5);
  const p7 = await fretPoint(page, 1, 7);
  await page.mouse.move(p5.x, p5.y);
  await page.mouse.down();
  await page.mouse.move(p7.x, p7.y, { steps: 1 });
  await page.mouse.up();
  await expectTarget(page, 1, 2);
  await expect(page.getByTestId('practice-feedback')).toHaveCount(0);
});

test('teclado: tapping (hammer-on) y pull-off cuentan', async ({ page }) => {
  await page.getByRole('button', { name: 'KEYBOARD' }).click();
  await page.keyboard.press('ArrowUp'); // Agudas: fila de dígitos = cuerda 1
  await page.getByRole('button', { name: 'Practicar ejercicio 1' }).click();
  // 2 (Digit3) mantenido, hammer-on a 4 (Digit5) y a 5 (Digit6).
  await page.keyboard.down('Digit3');
  await page.keyboard.down('Digit5');
  await page.keyboard.down('Digit6');
  await expectTarget(page, 1, 2);
  // Soltando 5 y luego 4 suenan 4 y 2 (pull-offs), pero el ejercicio pide 2 → fallo.
  await page.keyboard.up('Digit6');
  await expect(page.getByTestId('practice-feedback')).toHaveText('OTRA VEZ');
  await page.keyboard.up('Digit5');
  await page.keyboard.up('Digit3');
});

test('tablaturas-dos-cuerdas: completar Feliz Navidad (cuerdas 1 y 2)', async ({ page }) => {
  const song: Array<[number, number]> = [
    [2, 3], [1, 3], [1, 2], [1, 3], [1, 0],
    [2, 3], [1, 5], [1, 3], [1, 2], [2, 3],
    [2, 3], [1, 3], [1, 2], [1, 3], [1, 0],
    [2, 1], [2, 3], [2, 5], [2, 3], [2, 3], [2, 1],
    [2, 1], [2, 0],
  ];
  await page.goto('/lecciones/temario/tablaturas-dos-cuerdas');
  await page.locator('svg.reduced-fretboard').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Practicar Feliz Navidad' }).click();
  for (const [string, fret] of song) {
    await expectTarget(page, string, fret);
    await tap(page, string, fret);
  }
  await expect(page.getByTestId('practice-feedback')).toHaveText('¡ENHORABUENA!');
});
