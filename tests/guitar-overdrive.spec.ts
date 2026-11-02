import { test, expect } from '@playwright/test';

// Guards the OVERDRIVE tone (createOverdriveChain in app/lib/guitarAudioEngine.ts),
// rendered offline with the real Seagull samples through the exact replicas in
// tests/helpers/guitarTone.js and measured in LUFS (BS.1770 K-weighting), not
// in plain RMS: the first version was "matched" on the attack's RMS and came
// out +5.5 LU louder than clean (up to +9.8 on E4). Checks:
//   - loudness vs the CLEAN tone: median about as loud (-2..+0.5 LU; it was
//     -1.2 with the first clean chain, -0.1 since its low boost was removed,
//     the overdrive itself unchanged), no case more than +2.5 LU over, held
//     part at most +6 dB over (an overdrive sustains, that's the sound),
//   - the 2-5 kHz band (ear's most sensitive/damaging region) stays modest on
//     low/mid notes — the old chain's resonant lowpasses made a +5 dB plateau
//     there (Web Audio's lowpass Q is in dB!),
//   - no clipping with 3-note chords at max volume (peak <= -1.5 dBFS),
//   - the volume slider really lowers overdrive (it's applied post-clip).
test('overdrive tone: LUFS parity with clean, tame 2-5 kHz, safe peak, working volume', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript({ path: 'tests/helpers/guitarTone.js' });
  await page.goto('/lecciones/temario/sala-de-pruebas');

  const result = await page.evaluate(async () => {
    const G = window.__guitarTone;
    const cases = [[40], [45], [50], [55], [64], [76], [84], [40, 47, 52], [45, 52, 57], [52, 56, 59]];
    const clean = await Promise.all(cases.map((c) => G.renderNotes(c, 'clean')));
    const od = await Promise.all(cases.map((c) => G.renderNotes(c, 'overdrive')));
    const lufsDiff = cases.map((_, i) => G.lufs(od[i], G.SR) - G.lufs(clean[i], G.SR));
    const sustainDiff = cases.map((_, i) => G.rmsDb(od[i], G.SR, 0.3) - G.rmsDb(clean[i], G.SR, 0.3));
    const sorted = lufsDiff.slice().sort((a, b) => a - b);
    const median = (sorted[4] + sorted[5]) / 2;
    // Low/mid single notes E2..E4.
    const band = [0, 1, 2, 3, 4].map((i) => G.bandShareDb(od[i], G.SR));
    const peak = Math.max(...od.slice(7).map(G.peak));
    const quiet = await G.renderNotes([45], 'overdrive', { volume: 0.3 });
    const volumeDropDb = G.rmsDb(od[1], G.SR, 0.02, 0.6) - G.rmsDb(quiet, G.SR, 0.02, 0.6);
    return { lufsDiff, median, sustainDiff, band, peak, volumeDropDb };
  });

  console.log('overdrive measurements', JSON.stringify(result));
  expect(result.median).toBeGreaterThanOrEqual(-2);
  expect(result.median).toBeLessThanOrEqual(0.5);
  expect(Math.max(...result.lufsDiff)).toBeLessThanOrEqual(2.5);
  expect(Math.max(...result.sustainDiff)).toBeLessThanOrEqual(6);
  for (const share of result.band) expect(share).toBeLessThanOrEqual(-20);
  expect(result.peak).toBeLessThanOrEqual(0.84);
  expect(result.volumeDropDb).toBeGreaterThan(9); // 0.3 -> ~10.5 dB
});

// Same criterion in the TAB PLAYER (AlphaTabPlayer.tsx playPluckedNote): per-
// string lowpass + envelope, clean voice -> createCleanToneChain, overdrive voice
// at level / volume x (OVERDRIVE_VOICE_LEVEL / 0.58) -> createOverdriveChain with
// the volume (x TAB_OVERDRIVE_OUTPUT_TRIM) after the drive; both into
// getAudioOutput's 0.85 x 1.35 bus.
test('tab player: overdrive about as loud as clean (LUFS)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript({ path: 'tests/helpers/guitarTone.js' });
  await page.goto('/lecciones/temario/sala-de-pruebas');
  const result = await page.evaluate(async () => {
    const G = window.__guitarTone;
    const SR = G.SR;
    const CUTOFFS = [2600, 3200, 4200, 5600, 7200, 9000]; // GUITAR_SAMPLE_CUTOFFS
    const VOLUME = 0.8; // DEFAULT_VOLUME
    const manifest = await (await fetch('/samples/seagull-acoustic/manifest.json')).json();
    const samples = manifest.samples as { file: string; rootKey: number; keyRange: { low: number; high: number }; pitchCorrection: number; loopStart: number; loopEnd: number }[];
    async function render(stringNumber: number, midi: number, tone: 'clean' | 'overdrive') {
      const sample = samples.find((x) => midi >= x.keyRange.low && midi <= x.keyRange.high)!;
      const buffer = await new OfflineAudioContext(1, SR, SR).decodeAudioData(await (await fetch(`/samples/seagull-acoustic/${sample.file}`)).arrayBuffer());
      const ctx = new OfflineAudioContext(1, Math.floor(SR * 1.5), SR);
      const busIn = ctx.createGain(); busIn.gain.value = 0.85;
      const master = ctx.createGain(); master.gain.value = 1.35;
      busIn.connect(master); master.connect(ctx.destination);
      const level = Math.min(0.62 * VOLUME, VOLUME * 0.58) * G.guitarSampleTrim(sample.file, midi);
      let dest: AudioNode;
      let voiceLevel = level;
      if (tone === 'clean') dest = G.createCleanToneChain(ctx, busIn).input;
      else {
        const od = G.createOverdriveChain(ctx, busIn);
        od.output.gain.value = VOLUME * 1.25; // TAB_OVERDRIVE_OUTPUT_TRIM
        dest = od.input;
        voiceLevel = (level / VOLUME) * (0.52 / 0.58);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 2 ** ((midi - sample.rootKey - sample.pitchCorrection / 100) / 12);
      src.loop = true; src.loopStart = sample.loopStart / SR; src.loopEnd = sample.loopEnd / SR;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = CUTOFFS[6 - stringNumber]; lp.Q.value = 0.55;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.linearRampToValueAtTime(voiceLevel, 0.004);
      g.gain.setValueAtTime(voiceLevel * 0.82, 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, 0.8);
      src.connect(lp); lp.connect(g); g.connect(dest);
      src.start(0);
      return (await ctx.startRendering()).getChannelData(0);
    }
    const notes: [number, number][] = [[6, 40], [5, 45], [4, 50], [3, 55], [2, 59], [1, 64], [1, 76]];
    const diffs: number[] = [];
    let peak = 0;
    for (const [string, midi] of notes) {
      const c = await render(string, midi, 'clean');
      const o = await render(string, midi, 'overdrive');
      diffs.push(G.lufs(o, SR) - G.lufs(c, SR));
      peak = Math.max(peak, G.peak(c), G.peak(o));
    }
    const sorted = diffs.slice().sort((a, b) => a - b);
    return { diffs, median: sorted[3], peak };
  });
  console.log('tab overdrive vs clean', JSON.stringify(result));
  expect(result.median).toBeGreaterThanOrEqual(-2);
  expect(result.median).toBeLessThanOrEqual(0.5);
  expect(Math.max(...result.diffs)).toBeLessThanOrEqual(2.5);
  expect(result.peak).toBeLessThan(0.7); // getAudioOutput's limiter stays idle
});

test('CLEAN/OVERDRIVE toggle exists only where opted in', async ({ page }) => {
  await page.goto('/lecciones/temario/sala-de-pruebas');
  // El del mástil (la tablatura de la sala tiene el suyo: tests/tab-song-tuning-overdrive.spec.ts).
  const btn = page.locator('.test-room-fretboard').getByRole('button', { name: 'Cambiar sonido clean u overdrive' });
  await expect(btn).toHaveText('CLEAN');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.click();
  await expect(btn).toHaveText('OVERDRIVE');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await btn.click();
  await expect(btn).toHaveText('CLEAN');

  await page.goto('/lecciones/temario/notacion-musical');
  await expect(page.getByRole('button', { name: 'Cambiar sonido clean u overdrive' })).toHaveCount(0);
});
