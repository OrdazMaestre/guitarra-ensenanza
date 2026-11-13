import { test, expect, type Page } from '@playwright/test';

// Aviso para instalar la web como app (app/components/InstallAppPrompt.tsx; usuario, 2026-11-13): sale una
// sola vez por dispositivo, en la portada, con "Instalar" directo cuando el navegador lo ofrece
// (beforeinstallprompt, aquí simulado) y con dos pasos en iPhone/iPad.

const HOME = '/lecciones/temario';

async function offerInstall(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __prompted: number };
    w.__prompted = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void> };
    event.prompt = async () => { w.__prompted++; };
    window.dispatchEvent(event);
  });
}

test('Chrome/Edge: "Instalar" directo, una sola vez', async ({ page }) => {
  await page.goto(HOME);
  await page.waitForLoadState('networkidle');
  await offerInstall(page);
  const card = page.getByRole('dialog', { name: 'Instalar Riffcademy' });
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card).toHaveAttribute('data-mode', 'install');
  await card.getByRole('button', { name: 'Instalar' }).click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
  // Otra visita: ya no sale.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await offerInstall(page);
  await page.waitForTimeout(5000);
  await expect(card).toHaveCount(0);
});

test('fuera de la portada no sale (no tapa el juego)', async ({ page }) => {
  await page.goto('/lecciones/temario/sala-de-pruebas');
  await page.waitForLoadState('networkidle');
  await offerInstall(page);
  await page.waitForTimeout(5000);
  await expect(page.getByRole('dialog', { name: 'Instalar Riffcademy' })).toHaveCount(0);
});

test.describe('iPhone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  test('iPhone: dos pasos para añadirla a la pantalla de inicio', async ({ page }) => {
    await page.goto(HOME);
    const card = page.getByRole('dialog', { name: 'Instalar Riffcademy' });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toHaveAttribute('data-mode', 'ios');
    await expect(card).toContainText('Añadir a pantalla de inicio');
    await card.getByRole('button', { name: 'Entendido' }).click();
    await expect(card).toHaveCount(0);
  });
});
