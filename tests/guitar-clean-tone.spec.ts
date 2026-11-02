import { test, expect } from '@playwright/test';

// Guards the CLEAN guitar tone (createCleanToneChain + guitarSampleTrim in
// app/lib/guitarAudioEngine.ts), measured in LUFS (BS.1770 K-weighting,
// tests/helpers/guitarTone.js) through three playback models: headphones (flat),
// laptop (speaker gone below ~180 Hz) and phone (below ~400 Hz). The clean
// chain must stay LINEAR: a first version added a low-register exciter (tanh)
// so the near-sine low strings would carry on small speakers, and by ear the
// clean lows sounded saturated, almost overdriven (user decision 2026-11-02:
// lows as they come in the samples). Checks linearity, that the high register
// isn't louder than before on any speaker, and a safe peak ceiling.
test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: 'tests/helpers/guitarTone.js' });
});

test('K-weighting reproduces the BS.1770 coefficient table at 48 kHz', async ({ page }) => {
  await page.goto('/lecciones/temario/sala-de-pruebas');
  const k = await page.evaluate(() => window.__guitarTone.kWeighting(48000));
  const expected = {
    shelf: [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585],
    rlb: [1, -2, 1, -1.99004745483398, 0.99007225036621],
  };
  for (const key of ['shelf', 'rlb'] as const) {
    k[key].forEach((v: number, i: number) => expect(v).toBeCloseTo(expected[key][i], 6));
  }
});

test('clean tone: linear (no saturation), no brighter than before, safe peak', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/lecciones/temario/sala-de-pruebas');

  const result = await page.evaluate(async () => {
    const G = window.__guitarTone;
    const LOW = [40, 43, 45, 47, 50, 52]; // E2-E3
    const HIGH = [72, 76, 79, 84, 88]; // C5-E6
    const models = ['headphones', 'laptop', 'phone'] as const;
    async function registerGap(tone: 'raw' | 'clean') {
      const low = await Promise.all(LOW.map((m) => G.renderNotes([m], tone, { duration: 1 })));
      const high = await Promise.all(HIGH.map((m) => G.renderNotes([m], tone, { duration: 1 })));
      const out: Record<string, { low: number; high: number; gap: number }> = {};
      for (const model of models) {
        const avg = (xs: Float32Array[]) => xs.map((x) => G.lufs(x, G.SR, { model })).reduce((a, b) => a + b, 0) / xs.length;
        const l = avg(low), h = avg(high);
        out[model] = { low: l, high: h, gap: h - l };
      }
      return out;
    }
    const raw = await registerGap('raw');
    const clean = await registerGap('clean');

    // 3 notes at most: the fretboard's polyphony cap (MAX_VOICES).
    const chords = [[40, 47, 52], [45, 52, 57], [52, 56, 59], [64, 67, 71], [76, 79, 84]];
    const rawPeak = Math.max(...(await Promise.all(chords.map((c) => G.renderNotes(c, 'raw')))).map(G.peak));
    const cleanPeak = Math.max(...(await Promise.all(chords.map((c) => G.renderNotes(c, 'clean')))).map(G.peak));
    // Linearity: halving the volume must lower a low note by exactly 6.02 dB.
    const e2Full = G.lufs(await G.renderNotes([40], 'clean'), G.SR);
    const e2Half = G.lufs(await G.renderNotes([40], 'clean', { volume: 0.5 }), G.SR);
    return { raw, clean, rawPeak, cleanPeak, halfVolumeDrop: e2Full - e2Half };
  });

  console.log('clean tone measurements', JSON.stringify(result, null, 1));
  expect(result.halfVolumeDrop).toBeCloseTo(6.02, 1);
  // The high register is never more dominant than with the old raw path.
  for (const model of ['headphones', 'laptop', 'phone'] as const) {
    expect(result.clean[model].gap).toBeLessThanOrEqual(result.raw[model].gap + 0.25);
  }
  // Headphones: registers stay close.
  expect(Math.abs(result.clean.headphones.gap)).toBeLessThanOrEqual(3);
  // Peak ceiling (-1.5 dBFS, inter-sample margin) and not above the old peak.
  expect(result.cleanPeak).toBeLessThanOrEqual(0.84);
  expect(result.cleanPeak).toBeLessThanOrEqual(result.rawPeak);
});
