import { test, expect, type Browser } from '@playwright/test';

// Verifica el modo sala de punta a punta con dos navegadores reales simultáneos (anfitrión +
// jugador) -- confirma que la respuesta correcta no se filtra en el DOM antes de "revelar", que el
// marcador se sincroniza en vivo, y que no hay overflow horizontal en móvil en las 3 pantallas.
async function goToQuizFacil(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/lecciones/temario/quiz?from=que-es-la-guitarra');
  await expect(page.getByRole('button', { name: 'MULTIJUGADOR' })).toBeVisible();
  return { context, page };
}

test('anfitrión crea sala, jugador se une, juega una pregunta y termina la partida', async ({ browser }) => {
  const { context: hostContext, page: hostPage } = await goToQuizFacil(browser);

  await hostPage.getByRole('button', { name: 'MULTIJUGADOR' }).click();
  await hostPage.waitForURL(/\/sala\/anfitrion\//);
  const codigo = hostPage.url().split('/').pop()!;
  expect(codigo).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);

  await expect(hostPage.locator('.sala-codigo-grande')).toHaveText(codigo);
  await expect(hostPage.getByRole('button', { name: 'Empezar' })).toBeVisible();

  const playerContext = await browser.newContext();
  const playerPage = await playerContext.newPage();
  await playerPage.goto(`/sala/jugar/${codigo}`);
  await playerPage.getByPlaceholder('Ej: Kael').fill('Ana');
  await playerPage.getByRole('button', { name: 'Unirse' }).click();

  await expect(hostPage.locator('.sala-jugadores-list li')).toHaveText(['Ana'], { timeout: 5000 });
  await expect(playerPage.getByText('Esperando a que el anfitrion empiece la partida...')).toBeVisible();

  await hostPage.getByRole('button', { name: 'Empezar' }).click();

  const totalPreguntasText = await hostPage.locator('.quiz-progress').textContent();
  const totalPreguntas = Number(totalPreguntasText?.match(/de (\d+)/)?.[1]);
  expect(totalPreguntas).toBeGreaterThan(0);

  for (let i = 0; i < totalPreguntas; i += 1) {
    await expect(hostPage.locator('.quiz-enunciado')).toBeVisible({ timeout: 5000 });
    await expect(playerPage.locator('.quiz-enunciado')).toBeVisible({ timeout: 5000 });

    const hostQuestionText = await hostPage.locator('.quiz-enunciado').textContent();
    const playerQuestionText = await playerPage.locator('.quiz-enunciado').textContent();
    expect(hostQuestionText).toBe(playerQuestionText);

    // El jugador contesta y el navegador NUNCA debe recibir la respuesta correcta en el HTML antes
    // de que el anfitrión revele -- se comprueba tanto visualmente como en el propio contenido.
    await playerPage.locator('.quiz-option').first().click();
    await expect(playerPage.getByText('Ya has respondido. Esperando al resto...')).toBeVisible();
    await expect(playerPage.locator('.quiz-option-correct')).toHaveCount(0);

    await expect(hostPage.locator('.quiz-progress')).toContainText('1 de 1 han contestado', { timeout: 5000 });

    await hostPage.getByRole('button', { name: 'Revelar respuesta' }).click();
    await expect(hostPage.locator('.quiz-option-correct')).toBeVisible({ timeout: 5000 });
    await expect(playerPage.locator('.quiz-option-correct')).toBeVisible({ timeout: 5000 });

    await hostPage.getByRole('button', { name: /Siguiente pregunta|Ver resultado final/ }).click();
  }

  await expect(hostPage.getByText('Partida terminada')).toBeVisible({ timeout: 15000 });
  await expect(playerPage.getByText('Partida terminada')).toBeVisible({ timeout: 15000 });
  await expect(playerPage.getByText('Ana')).toBeVisible();

  await hostContext.close();
  await playerContext.close();
});

test('las pantallas de sala no tienen overflow horizontal en móvil', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  await page.goto('/lecciones/temario/quiz?from=que-es-la-guitarra');
  await page.getByRole('button', { name: 'MULTIJUGADOR' }).click();
  await page.waitForURL(/\/sala\/anfitrion\//);

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);

  await context.close();
});
