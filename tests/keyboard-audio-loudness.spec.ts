import { test, expect } from '@playwright/test';

// Regression guard for perceived-loudness parity between MiniKeyboard's
// oscillator voice and ReducedFretboardDiagram's guitar sample voice.
//
// A naive peak-gain match is misleading here: the oscillator sustains at
// full level for as long as a key is held, while a plucked-string sample
// decays immediately — so equal peak gain left the keyboard clearly louder
// than the guitar in practice (measured ~6.5 dB louder during a held note).
// This renders both DSP graphs offline (mirroring
// app/lib/guitarAudioEngine.ts's startOscillatorVoice/startSampleVoice
// exactly) and checks the RMS gap stays within a "sounds similarly loud"
// tolerance at both the attack (most audible moment of a guitar pluck) and
// during sustain (most of a held keyboard note's duration). Also checks the
// full extended grave+agudo pitch range (B3-A6) never clips.
test('keyboard oscillator and guitar sample are perceptually similar in loudness', async ({ page }) => {
  await page.goto('/lecciones/temario/notacion-musical');

  const result = await page.evaluate(async () => {
    const DURATION = 1.0;
    const SR = 44100;
    const KB_GAIN = 0.19; // must match startOscillatorVoice in guitarAudioEngine.ts

    async function renderOscillator(midi: number) {
      const ctx = new OfflineAudioContext(1, SR * DURATION, SR);
      const freq = 440 * 2 ** ((midi - 69) / 12);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140; hp.Q.value = 0.6;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500; lp.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, 0);
      gain.gain.linearRampToValueAtTime(KB_GAIN, 0.005);
      osc.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
      osc.start(0);
      const buf = await ctx.startRendering();
      return buf.getChannelData(0);
    }

    async function renderSample(midi: number) {
      const resp = await fetch('/samples/seagull-acoustic/manifest.json');
      const manifest = await resp.json();
      const samples = manifest.samples as { file: string; rootKey: number; keyRange: { low: number; high: number }; pitchCorrection: number }[];
      const sample = samples.find((s) => midi >= s.keyRange.low && midi <= s.keyRange.high)
        ?? samples.slice().sort((a, b) => Math.abs(a.rootKey - midi) - Math.abs(b.rootKey - midi))[0];
      const r = await fetch(`/samples/seagull-acoustic/${sample.file}`);
      const audioBuffer = await new OfflineAudioContext(1, SR, SR).decodeAudioData(await r.arrayBuffer());

      const ctx = new OfflineAudioContext(1, SR * DURATION, SR);
      const rate = 2 ** ((midi - sample.rootKey - sample.pitchCorrection / 100) / 12);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = rate;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, 0);
      gain.gain.linearRampToValueAtTime(0.52, 0.005); // must match startSampleVoice
      source.connect(gain); gain.connect(ctx.destination);
      source.start(0);
      const buf = await ctx.startRendering();
      return buf.getChannelData(0);
    }

    function rms(data: Float32Array, fromSec: number, toSec: number) {
      const from = Math.floor(fromSec * SR);
      const to = Math.min(data.length, Math.floor(toSec * SR));
      let sum = 0;
      for (let i = from; i < to; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / (to - from));
    }
    function peakAbs(data: Float32Array) {
      let p = 0;
      for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]));
      return p;
    }

    // Extended grave+agudo range: B3 (new low edge) .. A6 (new top edge).
    const kbNotes = [59, 65, 72, 78, 84, 93];
    const kbRuns = await Promise.all(kbNotes.map(renderOscillator));
    const kbPeak = Math.max(...kbRuns.map(peakAbs));
    const kbEarly = kbRuns.map((d) => rms(d, 0.02, 0.15)).reduce((a, b) => a + b, 0) / kbRuns.length;
    const kbSustain = kbRuns.map((d) => rms(d, 0.1, 0.6)).reduce((a, b) => a + b, 0) / kbRuns.length;

    const guitarNotes = [40, 50, 64, 71];
    const guitarRuns = await Promise.all(guitarNotes.map(renderSample));
    const guitarEarly = guitarRuns.map((d) => rms(d, 0.02, 0.15)).reduce((a, b) => a + b, 0) / guitarRuns.length;
    const guitarSustain = guitarRuns.map((d) => rms(d, 0.1, 0.6)).reduce((a, b) => a + b, 0) / guitarRuns.length;

    return {
      kbPeak,
      earlyDb: 20 * Math.log10(guitarEarly / kbEarly),
      sustainDb: 20 * Math.log10(guitarSustain / kbSustain),
    };
  });

  expect(result.kbPeak).toBeLessThan(1.0); // no clipping anywhere in the extended range
  expect(Math.abs(result.earlyDb)).toBeLessThan(3); // attack loudness within ~3dB
  expect(Math.abs(result.sustainDb)).toBeLessThan(5); // sustained loudness within ~5dB
});
