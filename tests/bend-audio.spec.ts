import { test, expect } from '@playwright/test';
import { bendAutomation, buildBendCurve } from '../app/lib/bendCurve';

// Bends en audio (ver "Bends y ligaduras" en AlphaTabPlayer.NOTES.md): se renderiza offline una
// nota con la MISMA mecánica que usan playPluckedNote / scheduleGuideNote (AudioBufferSourceNode en
// bucle + curva en `detune` con setValueAtTime/linearRampToValueAtTime, igual que applyBend) y se
// comprueba: sin curva la señal es idéntica; un "full" acaba exactamente +200 cents más agudo; y doblar
// no sube el pico (sin saturación).

const SAMPLE_RATE = 44100;

test('bend en detune: sin curva idéntico, full = +200 cents, sin subir el pico', async ({ page }) => {
  // Full bend gradual en una nota de 1 s: sube en 0,18 s (tope) y se mantiene.
  const curve = buildBendCurve({ bendType: 2, bendStyle: 1, bendPoints: [{ offset: 0, value: 0 }, { offset: 60, value: 4 }] }, () => 1);
  const automation = bendAutomation(curve, 1);
  expect(automation.length).toBeGreaterThan(1);

  const result = await page.evaluate(async ({ automation, sampleRate }) => {
    const render = async (withBend: boolean | 'empty') => {
      const ctx = new OfflineAudioContext(1, sampleRate, sampleRate);
      // "Muestra" de 1 ciclo de 220 Hz en bucle (como el loop de las muestras de guitarra).
      const period = Math.round(sampleRate / 220);
      const buffer = ctx.createBuffer(1, period, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < period; i++) data[i] = 0.5 * Math.sin((2 * Math.PI * i) / period);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.setValueAtTime(1, 0);
      if (withBend === true) {
        // Igual que applyBend(param, startTime = 0, automation, offset = 0).
        source.detune.setValueAtTime(automation[0].cents, 0);
        for (const point of automation) if (point.t > 0) source.detune.linearRampToValueAtTime(point.cents, point.t);
      }
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 2600;
      source.connect(lowpass).connect(ctx.destination);
      source.start(0);
      const out = (await ctx.startRendering()).getChannelData(0);
      return Array.from(out);
    };
    const plain = await render(false);
    const plainAgain = await render('empty');
    const bent = await render(true);
    // Frecuencia por cruces por cero ascendentes en una ventana.
    const freq = (signal: number[], from: number, to: number) => {
      let crossings = 0;
      for (let i = Math.floor(from * sampleRate) + 1; i < Math.floor(to * sampleRate); i++) {
        if (signal[i - 1] < 0 && signal[i] >= 0) crossings++;
      }
      return crossings / (to - from);
    };
    const peak = (signal: number[]) => signal.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    return {
      identical: plain.every((v, i) => v === plainAgain[i]),
      plainFreq: freq(plain, 0.5, 0.95),
      bentStartFreq: freq(bent, 0.0, 0.03),
      bentEndFreq: freq(bent, 0.5, 0.95),
      plainPeak: peak(plain),
      bentPeak: peak(bent),
    };
  }, { automation, sampleRate: SAMPLE_RATE });

  expect(result.identical).toBe(true);
  expect(result.plainFreq).toBeGreaterThan(215);
  expect(result.plainFreq).toBeLessThan(225);
  // +200 cents = ×2^(2/12) ≈ 1,1225 → ~247 Hz al final; al principio aún sin doblar.
  expect(result.bentEndFreq / result.plainFreq).toBeGreaterThan(1.11);
  expect(result.bentEndFreq / result.plainFreq).toBeLessThan(1.135);
  expect(result.bentStartFreq).toBeLessThan(235);
  // Doblar no añade ganancia: el pico no sube (margen para el filtro).
  expect(result.bentPeak).toBeLessThanOrEqual(result.plainPeak * 1.02);
  expect(result.bentPeak).toBeLessThan(1);
});
