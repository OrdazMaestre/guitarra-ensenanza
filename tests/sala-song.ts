import { expect, type Page } from '@playwright/test';

// La tablatura de la Sala de pruebas arranca con Black Gilmur (botón del disco, SongTabPlayer).
// Los tests escritos para Master of Puppets (pistas "Rhythm Guitar (Kirk)", "Drums", 212 bpm...)
// eligen antes la "Canción de prueba" con este paso. El reproductor se monta de nuevo al cambiar.
export async function pickTestRoomTabSong(page: Page, title = 'Canción de prueba') {
  const disc = page.locator('.test-room-tab').getByRole('button', { name: /^Canción:/ });
  await disc.click();
  await page.getByRole('menuitemradio', { name: title, exact: true }).click();
  await expect(disc).toHaveAttribute('aria-label', `Canción: ${title}`);
  await page.waitForSelector('.test-room-tab .at-surface-svg', { timeout: 60000 });
}
