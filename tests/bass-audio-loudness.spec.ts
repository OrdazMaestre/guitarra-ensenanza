import { test, expect } from '@playwright/test';

// Regression guard for the synth bass voice added to AlphaTabPlayer.tsx's
// multiTrack mode (app/lib/guitarAudioEngine.ts's playBassNote, used only by
// the "sala-de-pruebas" Master of Puppets bass track). Renders the exact DSP
// graph offline (mirroring playBassNote's saw+sub/filter-envelope/waveshaper
// chain, and separately the guitar sample voice's playPluckedNote formula)
// to confirm:
//  (a) the bass voice produces a real, non-silent signal at both palm-muted
//      and normal articulations,
//  (b) its RMS level is in the same order of magnitude as a single plucked
//      guitar note at the real riff's matching octave (bass and rhythm
//      guitar play the same Master of Puppets intro line an octave apart),
//      so neither buries the other in the mix, and
//  (c) nothing clips, including the worst case of the bass's whole 4-voice
//      polyphony cap (BASS_MAX_VOICES) firing at once at maximum volume.
test('synth bass voice is audible, clipping-free, and comparable in level to the guitar', async ({ page }) => {
  await page.goto('/lecciones/temario/notacion-musical');

  const result = await page.evaluate(async () => {
    const SR = 44100;
    const DURATION = 0.6;

    function clampValue(value: number, min: number, max: number) {
      return Math.min(max, Math.max(min, value));
    }

    function makeBassSaturationCurve() {
      const n = 1024;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 1.8);
      }
      return curve;
    }
    const bassCurve = makeBassSaturationCurve();

    function makeBassSoftClipCurve() {
      const n = 1024;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x);
      }
      return curve;
    }
    const softClipCurve = makeBassSoftClipCurve();

    function makeBassBus(ctx: OfflineAudioContext) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = softClipCurve;
      shaper.oversample = '2x';
      shaper.connect(ctx.destination);
      return shaper;
    }

    // Exact copy of playBassNote's DSP graph (app/lib/guitarAudioEngine.ts),
    // parameterized by an explicit destination so several voices can be
    // rendered into the same OfflineAudioContext (polyphony test) or their
    // own (single-voice level tests).
    function scheduleBassVoice(
      ctx: OfflineAudioContext,
      destination: AudioNode,
      scheduledAt: number,
      midiNote: number,
      durationSeconds: number,
      volume: number,
      palmMuted: boolean
    ) {
      const freq = 440 * 2 ** ((midiNote - 69) / 12);

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, scheduledAt);

      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(freq / 2, scheduledAt);

      const oscGain = ctx.createGain();
      oscGain.gain.value = 1;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = clampValue(freq / 20, 3, 5);
      const startCutoff = clampValue(freq * 2.2, 90, 260);
      const attackCutoff = clampValue(freq * 11, 900, 4200);
      const sustainCutoff = clampValue(freq * 3.4, 220, 950);
      const filterAttackTime = 0.008;
      const filterDecayTime = palmMuted ? 0.07 : 0.09;
      filter.frequency.setValueAtTime(startCutoff, scheduledAt);
      filter.frequency.linearRampToValueAtTime(attackCutoff, scheduledAt + filterAttackTime);
      filter.frequency.exponentialRampToValueAtTime(sustainCutoff, scheduledAt + filterAttackTime + filterDecayTime);

      const shaper = ctx.createWaveShaper();
      shaper.curve = bassCurve;
      shaper.oversample = '2x';
      const preGain = ctx.createGain();
      preGain.gain.value = 1.6;
      const postGain = ctx.createGain();
      postGain.gain.value = 0.62;

      const ampGain = ctx.createGain();
      const peak = 0.5 * volume;
      const attackTime = 0.004;
      ampGain.gain.setValueAtTime(0.0001, scheduledAt);
      ampGain.gain.linearRampToValueAtTime(peak, scheduledAt + attackTime);

      let voiceStop: number;
      if (palmMuted) {
        const decayTime = 0.13;
        ampGain.gain.exponentialRampToValueAtTime(0.0001, scheduledAt + attackTime + decayTime);
        voiceStop = scheduledAt + attackTime + decayTime + 0.02;
      } else {
        const sustainLevel = Math.max(0.0002, peak * 0.55);
        const decayEnd = Math.min(scheduledAt + 0.13, scheduledAt + Math.max(durationSeconds, 0.05));
        ampGain.gain.exponentialRampToValueAtTime(sustainLevel, decayEnd);
        const releaseStart = Math.max(decayEnd, scheduledAt + durationSeconds);
        ampGain.gain.setValueAtTime(sustainLevel, releaseStart);
        ampGain.gain.exponentialRampToValueAtTime(0.0001, releaseStart + 0.09);
        voiceStop = releaseStart + 0.12;
      }

      osc.connect(oscGain);
      sub.connect(subGain);
      oscGain.connect(filter);
      subGain.connect(filter);
      filter.connect(preGain);
      preGain.connect(shaper);
      shaper.connect(postGain);
      postGain.connect(ampGain);
      ampGain.connect(destination);

      osc.start(scheduledAt);
      sub.start(scheduledAt);
      osc.stop(voiceStop + 0.03);
      sub.stop(voiceStop + 0.03);
    }

    // No DynamicsCompressorNode here on purpose — matches playBassNote
    // itself, which connects to a shared tanh soft-clip bus (getBassBus)
    // instead. See guitarAudioEngine.ts's comment on why a compressor was
    // tried and reverted.
    async function renderBass(midi: number, durationSeconds: number, volume: number, palmMuted: boolean) {
      const ctx = new OfflineAudioContext(1, Math.floor(SR * DURATION), SR);
      const bus = makeBassBus(ctx);
      scheduleBassVoice(ctx, bus, 0, midi, durationSeconds, volume, palmMuted);
      const buf = await ctx.startRendering();
      return buf.getChannelData(0);
    }

    async function renderBassChord(midis: number[], volume: number) {
      const ctx = new OfflineAudioContext(1, Math.floor(SR * DURATION), SR);
      const bus = makeBassBus(ctx);
      for (const midi of midis) {
        scheduleBassVoice(ctx, bus, 0, midi, 0.3, volume, false);
      }
      const buf = await ctx.startRendering();
      return buf.getChannelData(0);
    }

    // Guitar sample voice, matching playPluckedNote's single-note
    // (eventNoteCount=1, no dense-chord compensation) formula exactly, at
    // the shared engine's default volume (DEFAULT_VOLUME = 0.8).
    async function renderGuitarNote(midi: number, palmMuted: boolean) {
      const resp = await fetch('/samples/seagull-acoustic/manifest.json');
      const manifest = await resp.json();
      const samples = manifest.samples as {
        file: string;
        rootKey: number;
        keyRange: { low: number; high: number };
        pitchCorrection: number;
        loopStart: number;
        loopEnd: number;
      }[];
      const sample =
        samples.find((s) => midi >= s.keyRange.low && midi <= s.keyRange.high) ??
        samples.slice().sort((a, b) => Math.abs(a.rootKey - midi) - Math.abs(b.rootKey - midi))[0];
      const r = await fetch(`/samples/seagull-acoustic/${sample.file}`);
      const audioBuffer = await new OfflineAudioContext(1, SR, SR).decodeAudioData(await r.arrayBuffer());

      const ctx = new OfflineAudioContext(1, Math.floor(SR * DURATION), SR);
      const startTime = 0;
      const currentVolume = 0.8; // DEFAULT_VOLUME in AlphaTabPlayer.tsx
      const articulationLevel = palmMuted ? 0.34 : 0.58;
      const targetLevel = currentVolume * articulationLevel; // stringBalance=1, chordCompensation=1 (single note)
      const level = Math.min(0.62 * currentVolume, Math.max(0.028 * currentVolume, targetLevel));
      const release = palmMuted ? 0.055 : 0.2;
      const sustainDuration = palmMuted ? Math.min(0.16, 0.3) : Math.min(2.4, Math.max(0.18, 0.3));
      // stringArrayIndex/GUITAR_SAMPLE_CUTOFFS aren't the point of this
      // comparison (tone shaping, not level) — use a representative cutoff.
      const cutoff = 4200 * (palmMuted ? 0.5 : 1);

      const rate = 2 ** ((midi - sample.rootKey - sample.pitchCorrection / 100) / 12);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.setValueAtTime(rate, startTime);

      const toneFilter = ctx.createBiquadFilter();
      toneFilter.type = 'lowpass';
      toneFilter.frequency.setValueAtTime(cutoff, startTime);
      toneFilter.Q.setValueAtTime(0.55, startTime);

      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(0.0001, startTime);
      voiceGain.gain.linearRampToValueAtTime(Math.max(0.0001, level), startTime + 0.004);
      voiceGain.gain.setValueAtTime(Math.max(0.0001, level * (palmMuted ? 0.22 : 0.82)), startTime + sustainDuration);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + sustainDuration + release);

      source.connect(toneFilter);
      toneFilter.connect(voiceGain);
      voiceGain.connect(ctx.destination);
      source.start(startTime);

      const buf = await ctx.startRendering();
      return buf.getChannelData(0);
    }

    function rms(data: Float32Array) {
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / data.length);
    }
    function peakAbs(data: Float32Array) {
      let p = 0;
      for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]));
      return p;
    }

    // Real riff pairing verified from prueba-master-of-puppets.gp: bass and
    // rhythm guitar play the intro's palm-muted line an octave apart
    // (bass MIDI 30 / guitar MIDI 42), and later a sustained low note
    // (bass MIDI 33 / guitar MIDI 45).
    //
    // 0.8 * 0.5 mirrors the real call site (AlphaTabPlayer.tsx's
    // scheduleAuxiliaryTracks passes volumeRef.current * BASS_TRACK_VOLUME_MULTIPLIER,
    // DEFAULT_VOLUME=0.8 * 0.5 after the "-50%" follow-up request) — this is
    // the actual effective volume during normal playback, not playBassNote's
    // own raw volume parameter.
    const BASS_TRACK_VOLUME_MULTIPLIER = 0.5;
    const bassMutedDefault = await renderBass(30, 0.14, 0.8 * BASS_TRACK_VOLUME_MULTIPLIER, true);
    const guitarMutedDefault = await renderGuitarNote(42, true);
    const bassSustainedDefault = await renderBass(33, 0.6, 0.8 * BASS_TRACK_VOLUME_MULTIPLIER, false);
    const guitarSustainedDefault = await renderGuitarNote(45, false);

    // These three deliberately use playBassNote's raw volume=1.0 ceiling
    // (its own contract), not *BASS_TRACK_VOLUME_MULTIPLIER — the multiplier
    // is a call-site mix-balance choice in AlphaTabPlayer.tsx that could
    // change independently of this. What must never clip is the synth voice
    // itself at its own maximum input, regardless of how quiet the current
    // call site happens to dial it back.
    const bassMutedMax = await renderBass(30, 0.14, 1.0, true);
    const bassSustainedMax = await renderBass(33, 0.6, 1.0, false);

    // Worst case for the bass's own limiter: its full polyphony cap
    // (BASS_MAX_VOICES = 4) firing simultaneously at maximum volume.
    const bassChordMax = await renderBassChord([28, 33, 38, 43], 1.0);

    return {
      bassMutedPeakDefault: peakAbs(bassMutedDefault),
      bassSustainedPeakDefault: peakAbs(bassSustainedDefault),
      bassMutedPeakMax: peakAbs(bassMutedMax),
      bassSustainedPeakMax: peakAbs(bassSustainedMax),
      bassChordPeakMax: peakAbs(bassChordMax),
      mutedDb: 20 * Math.log10(rms(bassMutedDefault) / rms(guitarMutedDefault)),
      sustainedDb: 20 * Math.log10(rms(bassSustainedDefault) / rms(guitarSustainedDefault)),
      bassMutedRms: rms(bassMutedDefault),
      guitarMutedRms: rms(guitarMutedDefault),
      bassSustainedRms: rms(bassSustainedDefault),
      guitarSustainedRms: rms(guitarSustainedDefault),
      guitarMutedPeak: peakAbs(guitarMutedDefault),
      guitarSustainedPeak: peakAbs(guitarSustainedDefault),
    };
  });

  // Real signal, not silence, even at the quieter -50% default.
  expect(result.bassMutedPeakDefault).toBeGreaterThan(0.01);
  expect(result.bassSustainedPeakDefault).toBeGreaterThan(0.01);

  // No clipping anywhere, including the 4-voice worst case at max volume.
  expect(result.bassMutedPeakMax).toBeLessThan(0.95);
  expect(result.bassSustainedPeakMax).toBeLessThan(0.95);
  expect(result.bassChordPeakMax).toBeLessThan(0.95);

  // Deliberately quieter than the guitar since the "-50% bass volume" request
  // (roughly -6dB from halving amplitude, stacked on the pre-existing ~-6dB/
  // -1.4dB mix balance) — expect clearly below the guitar (at least -6dB) but
  // not buried into inaudibility (no more than -18dB), not "matched" like the
  // original 1:1 balance this replaced. See AlphaTabPlayer.NOTES.md "Bajo
  // sintetizado" for the measured before/after figures.
  expect(result.mutedDb).toBeLessThan(-6);
  expect(result.mutedDb).toBeGreaterThan(-18);
  expect(result.sustainedDb).toBeLessThan(-6);
  expect(result.sustainedDb).toBeGreaterThan(-18);
});
