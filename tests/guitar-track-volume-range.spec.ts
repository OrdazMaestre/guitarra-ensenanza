import { test, expect } from '@playwright/test';

// Regression guard for the "double the per-track/per-drum-element volume
// range" follow-up to AlphaTabPlayer.tsx's multiTrack mode (sliders in the
// "Pistas"/"Batería" dropdowns, only reachable via sala-de-pruebas). See
// "Volumen por pista y por elemento de batería — rango x2" in
// AlphaTabPlayer.NOTES.md for the full writeup this locks in.
//
// trackVolumesRef/drumElementVolumesRef went from a [0,1] multiplier (max =
// "unchanged from before the slider existed") to [0,2] (default/midpoint 1 =
// that same old max, new max 2 = double it). That doubling pushes real peaks
// past 1.0 on the guitar sample engine specifically (see below) — the bass
// and drum engines were re-checked too and did NOT need a fix (their own
// existing headroom/limiter already covers the new worst case).
test('guitar output limiter: identity at trackVolumeMultiplier=1, caps trackVolumeMultiplier=2 worst case', async ({ page }) => {
  await page.goto('/lecciones/temario/notacion-musical');

  const result = await page.evaluate(async () => {
    const SR = 44100;
    const DURATION = 1.2;

    function clamp(value: number, min: number, max: number) {
      return Math.min(max, Math.max(min, value));
    }

    // Constants copied from AlphaTabPlayer.tsx.
    const GUITAR_SAMPLE_CUTOFFS = [2600, 3200, 4200, 5600, 7200, 9000];
    const GUITAR_STRING_GAINS: Record<number, number> = { 1: 1.2, 2: 1.15, 3: 1.4, 5: 0.8, 6: 0.5 };
    const STRUM_OFFSETS = [0, 0.012, 0.021, 0.031, 0.043, 0.058];
    const GUITAR_SAMPLE_RELEASE = 0.2;
    const MIN_AUDIBLE_NOTE_LEVEL = 0.028;
    const DENSE_CHORD_NOTE_COUNT = 3;
    const OPEN_STRING_MIDI_BY_STRING: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
    const GUITAR_OUTPUT_LIMITER_THRESHOLD = 0.7;

    function stringArrayIndex(stringNumber: number) {
      return clamp(6 - stringNumber, 0, GUITAR_SAMPLE_CUTOFFS.length - 1);
    }

    // Exact copy of getGuitarOutputLimiterCurve (AlphaTabPlayer.tsx).
    function makeGuitarOutputLimiterCurve(threshold: number) {
      const n = 4096;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        const ax = Math.abs(x);
        if (ax <= threshold) {
          curve[i] = x;
        } else {
          const sign = x < 0 ? -1 : 1;
          const knee = (ax - threshold) / (1 - threshold);
          curve[i] = sign * (threshold + (1 - threshold) * Math.tanh(knee));
        }
      }
      return curve;
    }

    // Exact copy of getAudioOutput's chain (AlphaTabPlayer.tsx), with the
    // limiter toggleable so we can compare on/off for the same signal.
    function makeOutput(ctx: OfflineAudioContext, withLimiter: boolean) {
      const input = ctx.createGain();
      const master = ctx.createGain();
      input.gain.setValueAtTime(0.85, 0);
      master.gain.setValueAtTime(1.35, 0);
      input.connect(master);
      if (withLimiter) {
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeGuitarOutputLimiterCurve(GUITAR_OUTPUT_LIMITER_THRESHOLD);
        shaper.oversample = '2x';
        master.connect(shaper);
        shaper.connect(ctx.destination);
      } else {
        master.connect(ctx.destination);
      }
      return input;
    }

    const manifestResp = await fetch('/samples/seagull-acoustic/manifest.json');
    const manifest = await manifestResp.json();
    const samples = manifest.samples as {
      file: string;
      rootKey: number;
      keyRange: { low: number; high: number };
      pitchCorrection: number;
      loopStart: number;
      loopEnd: number;
    }[];
    const bufferCache = new Map<string, AudioBuffer>();
    async function chooseSampleAndBuffer(midi: number) {
      const sample =
        samples.find((s) => midi >= s.keyRange.low && midi <= s.keyRange.high) ??
        samples.slice().sort((a, b) => Math.abs(a.rootKey - midi) - Math.abs(b.rootKey - midi))[0];
      if (!bufferCache.has(sample.file)) {
        const r = await fetch(`/samples/seagull-acoustic/${sample.file}`);
        const buf = await new OfflineAudioContext(1, SR, SR).decodeAudioData(await r.arrayBuffer());
        bufferCache.set(sample.file, buf);
      }
      return { sample, buffer: bufferCache.get(sample.file)! };
    }

    // Exact copy of playPluckedNote's level formula + voice graph.
    async function scheduleNote(
      ctx: OfflineAudioContext,
      destination: AudioNode,
      stringNumber: number,
      midi: number,
      startTime: number,
      duration: number,
      eventNoteCount: number,
      volumeRefCurrent: number,
      trackVolumeMultiplier: number
    ) {
      const { sample, buffer } = await chooseSampleAndBuffer(midi);
      const stringIndex = stringArrayIndex(stringNumber);
      const cutoff = GUITAR_SAMPLE_CUTOFFS[stringIndex];
      const playbackRate = 2 ** ((midi - sample.rootKey - sample.pitchCorrection / 100) / 12);
      const release = GUITAR_SAMPLE_RELEASE;
      const sustainDuration = clamp(duration, 0.18, 2.4);
      const chordCompensation = 1 / Math.sqrt(Math.max(1, eventNoteCount));
      const stringBalance = eventNoteCount >= DENSE_CHORD_NOTE_COUNT ? GUITAR_STRING_GAINS[stringNumber] ?? 1 : 1;
      const articulationLevel = 0.58;
      const currentVolume = volumeRefCurrent * trackVolumeMultiplier;
      const targetLevel = currentVolume * articulationLevel * stringBalance * chordCompensation;
      const level = clamp(targetLevel, MIN_AUDIBLE_NOTE_LEVEL * currentVolume, 0.62 * currentVolume);

      const source = ctx.createBufferSource();
      const toneFilter = ctx.createBiquadFilter();
      const voiceGain = ctx.createGain();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(playbackRate, startTime);
      if (sample.loopEnd > sample.loopStart + 8) {
        source.loop = true;
        source.loopStart = sample.loopStart / SR;
        source.loopEnd = sample.loopEnd / SR;
      }
      toneFilter.type = 'lowpass';
      toneFilter.frequency.setValueAtTime(cutoff, startTime);
      toneFilter.Q.setValueAtTime(0.55, startTime);
      voiceGain.gain.setValueAtTime(0.0001, startTime);
      voiceGain.gain.linearRampToValueAtTime(Math.max(0.0001, level), startTime + 0.004);
      voiceGain.gain.setValueAtTime(Math.max(0.0001, level * 0.82), startTime + sustainDuration);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + sustainDuration + release);
      source.connect(toneFilter);
      toneFilter.connect(voiceGain);
      voiceGain.connect(destination);
      source.start(startTime);
      source.stop(startTime + sustainDuration + release + 0.03);
    }

    function peakAbs(data: Float32Array) {
      let p = 0;
      for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]));
      return p;
    }

    async function renderChord(
      strings: number[],
      volumeRefCurrent: number,
      trackVolumeMultiplier: number,
      withLimiter: boolean
    ) {
      const ctx = new OfflineAudioContext(1, Math.floor(SR * DURATION), SR);
      const output = makeOutput(ctx, withLimiter);
      const notes = strings.map((s) => ({ s, midi: OPEN_STRING_MIDI_BY_STRING[s] }));
      for (const { s, midi } of notes) {
        const chordDelay = notes.length >= DENSE_CHORD_NOTE_COUNT ? STRUM_OFFSETS[stringArrayIndex(s)] ?? 0 : 0;
        await scheduleNote(ctx, output, s, midi, 0.05 + chordDelay, 0.3, notes.length, volumeRefCurrent, trackVolumeMultiplier);
      }
      const buf = await ctx.startRendering();
      return peakAbs(buf.getChannelData(0));
    }

    const allStrings = [1, 2, 3, 4, 5, 6];
    const top3Strings = [1, 2, 3]; // highest GUITAR_STRING_GAINS, N=3 (largest chordCompensation among dense chords)

    return {
      // Today's real playback (trackVolumeMultiplier=1, the only value this
      // parameter could ever have before this change): with vs. without the
      // new limiter must be identical (floating-point noise only) — this is
      // the "must not change today's sound" requirement.
      baselineSingleNoLimiter: await renderChord([1], 1.0, 1, false),
      baselineSingleWithLimiter: await renderChord([1], 1.0, 1, true),
      baselineChordNoLimiter: await renderChord(allStrings, 1.0, 1, false),
      baselineChordWithLimiter: await renderChord(allStrings, 1.0, 1, true),
      baselineTop3NoLimiter: await renderChord(top3Strings, 1.0, 1, false),
      baselineTop3WithLimiter: await renderChord(top3Strings, 1.0, 1, true),
      // New worst case: volumeRef maxed (1.0) and the per-track slider maxed
      // at its new range top (2) — must stay clipping-free with the limiter.
      newSingleWithLimiter: await renderChord([1], 1.0, 2, true),
      newChordWithLimiter: await renderChord(allStrings, 1.0, 2, true),
      newTop3WithLimiter: await renderChord(top3Strings, 1.0, 2, true),
    };
  });

  // Identity at trackVolumeMultiplier=1: the limiter must not audibly change
  // anything at today's levels. Floating-point/oversampling noise only.
  expect(Math.abs(result.baselineSingleWithLimiter - result.baselineSingleNoLimiter)).toBeLessThan(0.001);
  expect(Math.abs(result.baselineChordWithLimiter - result.baselineChordNoLimiter)).toBeLessThan(0.001);
  expect(Math.abs(result.baselineTop3WithLimiter - result.baselineTop3NoLimiter)).toBeLessThan(0.001);

  // Confirms these scenarios actually exercise real, non-trivial levels
  // (not silently near-zero, which would make the identity check above
  // meaningless).
  expect(result.baselineSingleNoLimiter).toBeGreaterThan(0.3);

  // New worst case (trackVolumeMultiplier=2) no longer clips — measured
  // without any limiter this reaches ~1.06-1.09 (see AlphaTabPlayer.NOTES.md
  // for the raw numbers); with the limiter it must stay safely under 1.0.
  expect(result.newSingleWithLimiter).toBeLessThan(0.95);
  expect(result.newChordWithLimiter).toBeLessThan(0.95);
  expect(result.newTop3WithLimiter).toBeLessThan(0.95);
});

test('drum element volume worst case (DRUM_TRACK_VOLUME_BOOST * trackVolume(2) * drumElementVolume(2)) stays clipping-free', async ({
  page,
}) => {
  await page.goto('/lecciones/temario/notacion-musical');

  const result = await page.evaluate(async () => {
    const SR = 44100;
    const DURATION = 0.5;

    // Exact copy of getMetronomeLimiter + the 'kick' branch of
    // playMetronomeClick (app/lib/guitarAudioEngine.ts) — the drum engine
    // already had a dedicated DynamicsCompressorNode limiter before this
    // session; this just confirms it still absorbs the new, higher worst
    // case (DRUM_TRACK_VOLUME_BOOST=1.3 * trackVolume up to 2 *
    // drumElementVolume up to 2 = up to x5.2 over the base level) without
    // needing any change.
    function makeLimiter(ctx: OfflineAudioContext) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -3;
      comp.knee.value = 6;
      comp.ratio.value = 20;
      comp.attack.value = 0.001;
      comp.release.value = 0.1;
      comp.connect(ctx.destination);
      return comp;
    }

    function scheduleKick(ctx: OfflineAudioContext, limiter: AudioNode, scheduledAt: number, volume: number) {
      const sr = ctx.sampleRate;
      const clkLen = Math.floor(sr * 0.008);
      const clkBuf = ctx.createBuffer(1, clkLen, sr);
      const clkd = clkBuf.getChannelData(0);
      for (let i = 0; i < clkLen; i++) clkd[i] = (Math.random() * 2 - 1) * (1 - i / clkLen) ** 1.5;
      const clkSrc = ctx.createBufferSource();
      clkSrc.buffer = clkBuf;
      const clkBp = ctx.createBiquadFilter();
      clkBp.type = 'bandpass';
      clkBp.frequency.value = 1200;
      clkBp.Q.value = 1.5;
      const clkG = ctx.createGain();
      clkG.gain.setValueAtTime(volume * 0.28, scheduledAt);
      clkG.gain.exponentialRampToValueAtTime(0.0001, scheduledAt + 0.008);
      clkSrc.connect(clkBp);
      clkBp.connect(clkG);
      clkG.connect(limiter);
      clkSrc.start(scheduledAt);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, scheduledAt);
      osc.frequency.exponentialRampToValueAtTime(80, scheduledAt + 0.06);
      const ohp = ctx.createBiquadFilter();
      ohp.type = 'highpass';
      ohp.frequency.value = 60;
      ohp.Q.value = 0.5;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, scheduledAt);
      og.gain.linearRampToValueAtTime(volume * 0.2, scheduledAt + 0.003);
      og.gain.exponentialRampToValueAtTime(0.0001, scheduledAt + 0.08);
      osc.connect(ohp);
      ohp.connect(og);
      og.connect(limiter);
      osc.start(scheduledAt);
      osc.stop(scheduledAt + 0.09);

      const bodyLen = Math.floor(sr * 0.035);
      const bodyBuf = ctx.createBuffer(1, bodyLen, sr);
      const bd = bodyBuf.getChannelData(0);
      for (let i = 0; i < bodyLen; i++) bd[i] = (Math.random() * 2 - 1) * (1 - i / bodyLen) ** 2.5;
      const bs = ctx.createBufferSource();
      bs.buffer = bodyBuf;
      const bbp = ctx.createBiquadFilter();
      bbp.type = 'bandpass';
      bbp.frequency.value = 280;
      bbp.Q.value = 0.9;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, scheduledAt);
      bg.gain.linearRampToValueAtTime(volume * 0.1, scheduledAt + 0.002);
      bg.gain.exponentialRampToValueAtTime(0.0001, scheduledAt + 0.035);
      bs.connect(bbp);
      bbp.connect(bg);
      bg.connect(limiter);
      bs.start(scheduledAt);
    }

    function peakAbs(data: Float32Array) {
      let p = 0;
      for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]));
      return p;
    }

    async function renderKick(volume: number) {
      const ctx = new OfflineAudioContext(1, Math.floor(SR * DURATION), SR);
      const limiter = makeLimiter(ctx);
      scheduleKick(ctx, limiter, 0.02, volume);
      const buf = await ctx.startRendering();
      return peakAbs(buf.getChannelData(0));
    }

    const DRUM_TRACK_VOLUME_BOOST = 1.3;
    return {
      // Worst case: volumeRef=1.0 * DRUM_TRACK_VOLUME_BOOST * trackVolume(2) * drumElementVolume(2).
      worstCase: await renderKick(1.0 * DRUM_TRACK_VOLUME_BOOST * 2 * 2),
    };
  });

  expect(result.worstCase).toBeLessThan(0.95);
});
