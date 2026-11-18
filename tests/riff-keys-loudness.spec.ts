import { test, expect } from '@playwright/test';
import { KEYS_GAIN } from '../app/lib/riff/useRiffGame';

// TECLADO en Riff-Hero (usuario, 2026-11-18): suena con la voz del MiniKeyboard (scheduleKeyNote en
// guitarAudioEngine.ts: triángulo, paso alto 140 Hz, paso bajo 6,5 kHz, pico 0,19 × volumen). Esa voz SOSTIENE
// y la guitarra DECAE, así que a igual pico el teclado suena más fuerte. KEYS_GAIN (useRiffGame.ts) lo iguala:
// una nota de teclado de juego (0,5 s, el registro Do4-Fa5 de los niveles) frente a una nota de guitarra de
// fondo (sample real + cadena clean, réplica exacta de tests/helpers/guitarTone.js), en LUFS (BS.1770).
test('teclado del juego ≈ guitarra de fondo en sonoridad (LUFS)', async ({ page }) => {
  await page.addInitScript({ path: 'tests/helpers/guitarTone.js' });
  await page.goto('/lecciones/temario/notacion-musical');
  const result = await page.evaluate(async (keysGain) => {
    const tone = window.__guitarTone;
    const SR = tone.SR;
    const NOTE = 0.5;
    const WINDOW = 0.8;
    async function renderKey(midi: number) {
      const ctx = new OfflineAudioContext(1, Math.round(SR * WINDOW), SR);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140; hp.Q.value = 0.6;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500; lp.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, 0);
      gain.gain.linearRampToValueAtTime(0.19 * keysGain, 0.005);
      gain.gain.setTargetAtTime(0.0001, NOTE, 0.02);
      osc.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
      osc.start(0);
      return (await ctx.startRendering()).getChannelData(0);
    }
    const keys = [60, 62, 64, 65, 67, 69, 71, 72, 74, 77];
    const guitar = [52, 55, 59, 64, 67, 71];
    const keyRuns = await Promise.all(keys.map(renderKey));
    const guitarRuns = await Promise.all(guitar.map((midi) => tone.renderNotes([midi], 'clean', { duration: WINDOW })));
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const loud = (runs: Float32Array[], model?: 'laptop' | 'phone') => mean(runs.map((data) => tone.lufs(data, SR, { model, from: 0, to: WINDOW })));
    return {
      headphones: loud(keyRuns) - loud(guitarRuns),
      laptop: loud(keyRuns, 'laptop') - loud(guitarRuns, 'laptop'),
      phone: loud(keyRuns, 'phone') - loud(guitarRuns, 'phone'),
      peak: Math.max(...keyRuns.map((data) => tone.peak(data))),
    };
  }, KEYS_GAIN);
  console.log('teclado − guitarra (LU)', JSON.stringify(result));
  expect(Math.abs(result.headphones)).toBeLessThan(2);
  expect(result.peak).toBeLessThan(0.84);
});
