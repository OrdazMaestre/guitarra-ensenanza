import { test, expect } from '@playwright/test';

// Guards the overdrive tone of the fretboard (getOverdriveBus in
// app/lib/guitarAudioEngine.ts). Renders the exact same DSP graph offline
// with the real Seagull samples and checks:
//   - no clipping with 3-note chords at max volume (low and high register),
//   - overdrive RMS stays close to clean RMS (no loudness jump on toggle),
//   - the volume slider really lowers overdrive (it's applied post-clip).
// Every constant below must match guitarAudioEngine.ts.
test('overdrive tone: no clipping, loudness parity with clean, working volume', async ({ page }) => {
  await page.goto('/lecciones/temario/sala-de-pruebas');

  const result = await page.evaluate(async () => {
    const SR = 44100;
    const DURATION = 1.0;
    const OD_VOICE_LEVEL = 0.52;
    const OD_DRIVE = 3;
    const OD_SHAPE_K = 6;
    const OD_SHAPE_BIAS = 0.12;
    const OD_STAGE2_GAIN = 0.8;
    const OD_STAGE2_K = 1.5;
    const OD_ROOM_WET = 0.1;
    const OD_MAKEUP = 0.18;

    const resp = await fetch('/samples/seagull-acoustic/manifest.json');
    const manifest = await resp.json();
    type S = { file: string; rootKey: number; keyRange: { low: number; high: number }; pitchCorrection: number; loopStart: number; loopEnd: number; sampleRate: number };
    const samples = manifest.samples as S[];
    const buffers = new Map<string, AudioBuffer>();
    async function bufferFor(s: S) {
      if (!buffers.has(s.file)) {
        const r = await fetch(`/samples/seagull-acoustic/${s.file}`);
        buffers.set(s.file, await new OfflineAudioContext(1, SR, SR).decodeAudioData(await r.arrayBuffer()));
      }
      return buffers.get(s.file)!;
    }
    function choose(midi: number) {
      return samples.find((s) => midi >= s.keyRange.low && midi <= s.keyRange.high)
        ?? samples.slice().sort((a, b) => Math.abs(a.rootKey - midi) - Math.abs(b.rootKey - midi))[0];
    }
    function makeCurve(fn: (x: number) => number, n = 4096) {
      const c = new Float32Array(n);
      for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
      return c;
    }
    function biquad(ctx: BaseAudioContext, type: BiquadFilterType, f: number, Q: number, gain = 0) {
      const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; b.gain.value = gain; return b;
    }

    function buildOverdrive(ctx: OfflineAudioContext, volume: number) {
      const input = ctx.createGain();
      const preHp = biquad(ctx, 'highpass', 110, 0.7);
      const midHump = biquad(ctx, 'peaking', 720, 0.8, 6);
      const preLp = biquad(ctx, 'lowpass', 5500, 0.7);
      const drive = ctx.createGain(); drive.gain.value = OD_DRIVE;
      const stage1 = ctx.createWaveShaper();
      const dc = Math.tanh(OD_SHAPE_K * OD_SHAPE_BIAS);
      const norm = Math.tanh(OD_SHAPE_K * (1 + OD_SHAPE_BIAS)) - dc;
      stage1.curve = makeCurve((x) => (Math.tanh(OD_SHAPE_K * (x + OD_SHAPE_BIAS)) - dc) / norm);
      stage1.oversample = '4x';
      const stage2Gain = ctx.createGain(); stage2Gain.gain.value = OD_STAGE2_GAIN;
      const stage2 = ctx.createWaveShaper();
      stage2.curve = makeCurve((x) => Math.tanh(OD_STAGE2_K * x) / Math.tanh(OD_STAGE2_K));
      stage2.oversample = '4x';
      const cabHp = biquad(ctx, 'highpass', 85, 0.7);
      const cabMud = biquad(ctx, 'peaking', 400, 1, -3);
      const cabPresence = biquad(ctx, 'peaking', 2200, 1, 3);
      const cabLp1 = biquad(ctx, 'lowpass', 4800, 0.7);
      const cabLp2 = biquad(ctx, 'lowpass', 4800, 0.9);
      const room = ctx.createConvolver();
      const len = Math.floor(SR * 0.35);
      const ir = ctx.createBuffer(1, len, SR);
      const d = ir.getChannelData(0);
      let lp = 0;
      for (let i = 0; i < len; i++) { lp += 0.25 * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.exp((-i / SR) * 12); }
      room.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = OD_ROOM_WET;
      const makeup = ctx.createGain(); makeup.gain.value = OD_MAKEUP;
      const outVol = ctx.createGain(); outVol.gain.value = volume;
      const safety = ctx.createWaveShaper();
      safety.curve = makeCurve((x) => Math.tanh(x), 1024);
      safety.oversample = '2x';
      input.connect(preHp); preHp.connect(midHump); midHump.connect(preLp); preLp.connect(drive);
      drive.connect(stage1); stage1.connect(stage2Gain); stage2Gain.connect(stage2); stage2.connect(cabHp);
      cabHp.connect(cabMud); cabMud.connect(cabPresence); cabPresence.connect(cabLp1); cabLp1.connect(cabLp2);
      cabLp2.connect(makeup); cabLp2.connect(room); room.connect(wet); wet.connect(makeup);
      makeup.connect(outVol); outVol.connect(safety); safety.connect(ctx.destination);
      return input;
    }

    async function render(midis: number[], tone: 'clean' | 'overdrive', volume = 1) {
      const ctx = new OfflineAudioContext(1, SR * DURATION, SR);
      const bus = tone === 'overdrive' ? buildOverdrive(ctx, volume) : null;
      for (const midi of midis) {
        const s = choose(midi);
        const src = ctx.createBufferSource();
        src.buffer = await bufferFor(s);
        src.playbackRate.value = 2 ** ((midi - s.rootKey - s.pitchCorrection / 100) / 12);
        if (s.loopEnd > s.loopStart + 8) { src.loop = true; src.loopStart = s.loopStart / s.sampleRate; src.loopEnd = s.loopEnd / s.sampleRate; }
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, 0);
        src.connect(g);
        if (bus) { g.gain.linearRampToValueAtTime(OD_VOICE_LEVEL, 0.005); g.connect(bus); }
        else { g.gain.linearRampToValueAtTime(0.52 * volume, 0.005); g.connect(ctx.destination); }
        src.start(0);
      }
      return (await ctx.startRendering()).getChannelData(0);
    }

    function rms(data: Float32Array, a: number, b: number) {
      const from = Math.floor(a * SR), to = Math.min(data.length, Math.floor(b * SR));
      let sum = 0;
      for (let i = from; i < to; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / (to - from));
    }
    function peak(data: Float32Array) {
      let p = 0;
      for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]));
      return p;
    }
    const db = (a: number, b: number) => 20 * Math.log10(a / b);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    const notes = [40, 45, 50, 55, 59, 64, 71];
    const clean = await Promise.all(notes.map((m) => render([m], 'clean')));
    const od = await Promise.all(notes.map((m) => render([m], 'overdrive')));
    const earlyDb = db(avg(od.map((x) => rms(x, 0.02, 0.15))), avg(clean.map((x) => rms(x, 0.02, 0.15))));
    const sustainDb = db(avg(od.map((x) => rms(x, 0.1, 0.6))), avg(clean.map((x) => rms(x, 0.1, 0.6))));

    const chordLow = await render([40, 47, 52], 'overdrive');
    const chordHigh = await render([64, 67, 71], 'overdrive');
    const chordPeak = Math.max(peak(chordLow), peak(chordHigh));

    const quiet = await render([45], 'overdrive', 0.3);
    const volumeDropDb = db(rms(od[1], 0.02, 0.6), rms(quiet, 0.02, 0.6));

    return { earlyDb, sustainDb, chordPeak, volumeDropDb };
  });

  console.log('overdrive measurements', result);
  expect(result.chordPeak).toBeLessThan(1.0);
  expect(Math.abs(result.earlyDb)).toBeLessThan(2.5);
  // Overdrive compresses and sustains longer by design, so sustain may sit a
  // few dB above clean; the attack is what must match on toggle.
  expect(result.sustainDb).toBeGreaterThan(0);
  expect(result.sustainDb).toBeLessThan(6);
  expect(result.volumeDropDb).toBeGreaterThan(9); // 0.3 → ~10.5dB
});

test('CLEAN/OVERDRIVE toggle exists only where opted in', async ({ page }) => {
  await page.goto('/lecciones/temario/sala-de-pruebas');
  const btn = page.getByRole('button', { name: 'Cambiar sonido clean u overdrive' });
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
