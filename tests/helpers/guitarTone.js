// Browser-side helpers for the guitar tone/loudness tests. Inject with
//   await page.addInitScript({ path: 'tests/helpers/guitarTone.js' })
// and use `window.__guitarTone` inside page.evaluate.
//
// 1. A K-weighted loudness meter (ITU-R BS.1770 / EBU Tech 3341): the two
//    K-weighting biquads computed for ANY sample rate with the formulas FFmpeg's
//    f_ebur128 uses (at 48 kHz they reproduce the standard's coefficient table,
//    checked by tests/guitar-clean-tone.spec.ts), mono loudness
//    L = -0.691 + 10·log10(mean(y²)), plus max momentary (400 ms) loudness.
// 2. Speaker models: "laptop" = 4th-order Butterworth highpass at 180 Hz,
//    "phone" = at 400 Hz (what small speakers can't reproduce).
// 3. EXACT replicas of app/lib/guitarAudioEngine.ts's createCleanToneChain,
//    createOverdriveChain and guitarSampleTrim. Tests can't import the engine
//    in the browser, so these copies must be kept identical to it: if you
//    change a value there, change it here.
(() => {
  // ---- plain-JS biquads (for metering only; the replicas use real Web Audio nodes)
  function rbj(type, f0, Q, sr) {
    const w = (2 * Math.PI * f0) / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  function filter(x, co) {
    const [b0, b1, b2, a1, a2] = co;
    const y = new Float64Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      const o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o;
    }
    return y;
  }
  // BS.1770 K-weighting for sample rate `sr` (FFmpeg f_ebur128 formulas).
  function kWeighting(sr) {
    let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    let K = Math.tan((Math.PI * f0) / sr);
    const Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
    let a0 = 1 + K / Q + K * K;
    const shelf = [
      (Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0,
      (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0,
    ];
    f0 = 38.13547087602444; Q = 0.5003270373238773;
    K = Math.tan((Math.PI * f0) / sr);
    a0 = 1 + K / Q + K * K;
    const rlb = [1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
    return { shelf, rlb };
  }
  const BUTTER_Q = Math.SQRT1_2;
  function speaker(x, model, sr) {
    if (!model || model === 'headphones') return x;
    const f = model === 'phone' ? 400 : 180;
    const co = rbj('highpass', f, BUTTER_Q, sr);
    return filter(filter(x, co), co);
  }
  function kFiltered(x, sr) {
    const k = kWeighting(sr);
    return filter(filter(x, k.shelf), k.rlb);
  }
  const toLufs = (meanSquare) => -0.691 + 10 * Math.log10(meanSquare + 1e-20);
  // Loudness of the whole buffer (or [from, to) seconds), optionally through a speaker model.
  function lufs(x, sr, { model, from = 0, to } = {}) {
    const y = kFiltered(speaker(x, model, sr), sr);
    const a = Math.floor(from * sr), b = Math.min(y.length, Math.floor((to ?? y.length / sr) * sr));
    let s = 0;
    for (let i = a; i < b; i++) s += y[i] * y[i];
    return toLufs(s / (b - a));
  }
  function maxMomentary(x, sr, { model } = {}) {
    const y = kFiltered(speaker(x, model, sr), sr);
    const W = Math.floor(0.4 * sr), hop = Math.floor(0.1 * sr);
    let best = -200;
    for (let s = 0; s + W <= y.length; s += hop) {
      let e = 0;
      for (let i = s; i < s + W; i++) e += y[i] * y[i];
      best = Math.max(best, toLufs(e / W));
    }
    return best;
  }
  function rmsDb(x, sr, from = 0, to) {
    const a = Math.floor(from * sr), b = Math.min(x.length, Math.floor((to ?? x.length / sr) * sr));
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] * x[i];
    return 10 * Math.log10(s / (b - a) + 1e-20);
  }
  function peak(x) {
    let p = 0;
    for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
    return p;
  }
  // Energy share (dB) of the 2-5 kHz band (4th-order Butterworth band edges).
  function bandShareDb(x, sr, lo = 2000, hi = 5000) {
    const hp = rbj('highpass', lo, BUTTER_Q, sr), lp = rbj('lowpass', hi, BUTTER_Q, sr);
    const band = filter(filter(filter(filter(x, hp), hp), lp), lp);
    let eb = 0, et = 0;
    for (let i = 0; i < x.length; i++) { eb += band[i] * band[i]; et += x[i] * x[i]; }
    return 10 * Math.log10(eb / et + 1e-20);
  }

  // ---- replicas of guitarAudioEngine.ts (keep identical!)
  const FLAT_Q = -3.01;
  const SAMPLE_TRIM_DB = {
    '02-si.wav': 3,
    '01-hoge-mi.wav': 3.5,
    '08-sol.wav': 1,
    '06-la.wav': 1,
    '07-hoge-la.wav': -1,
  };
  const HIGH_STRETCH_FROM_MIDI = 76;
  const HIGH_STRETCH_DB_PER_SEMITONE = -0.15;
  const REGISTER_LOW_TOP_MIDI = 52;
  const REGISTER_HIGH_FROM_MIDI = 59;
  const REGISTER_LOW_DB = 20 * Math.log10(1.25);
  const REGISTER_HIGH_DB = 20 * Math.log10(0.75);
  const OD_REGISTER_EXTRA_HIGH_DB = -6;
  function registerHighWeight(midi) {
    return Math.min(1, Math.max(0, (midi - REGISTER_LOW_TOP_MIDI) / (REGISTER_HIGH_FROM_MIDI - REGISTER_LOW_TOP_MIDI)));
  }
  function overdriveRegisterTrim(midi) {
    return 10 ** ((registerHighWeight(midi) * OD_REGISTER_EXTRA_HIGH_DB) / 20);
  }
  function registerDb(midi) {
    if (midi <= REGISTER_LOW_TOP_MIDI) return REGISTER_LOW_DB;
    if (midi >= REGISTER_HIGH_FROM_MIDI) return REGISTER_HIGH_DB;
    const k = (midi - REGISTER_LOW_TOP_MIDI) / (REGISTER_HIGH_FROM_MIDI - REGISTER_LOW_TOP_MIDI);
    return REGISTER_LOW_DB + (REGISTER_HIGH_DB - REGISTER_LOW_DB) * k;
  }
  function guitarSampleTrim(file, midi) {
    const db = (SAMPLE_TRIM_DB[file] ?? 0) + Math.max(0, midi - HIGH_STRETCH_FROM_MIDI) * HIGH_STRETCH_DB_PER_SEMITONE + registerDb(midi);
    return 10 ** (db / 20);
  }
  const CLEAN_TRIM = 0.7;
  const OD_VOICE_LEVEL = 0.52;
  const OD_DRIVE = 2.2;
  const OD_SHAPE_K = 5;
  const OD_SHAPE_BIAS = 0.12;
  const OD_STAGE2_GAIN = 0.8;
  const OD_STAGE2_K = 1.5;
  const OD_ROOM_WET = 0.08;
  const OD_MAKEUP = 0.086;

  function makeCurve(fn, n = 4096) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
    return c;
  }
  function biquad(ctx, type, frequency, Q, gain = 0) {
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = frequency; f.Q.value = Q; f.gain.value = gain;
    return f;
  }
  function connectChain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  }
  function roomImpulse(ctx) {
    const sr = ctx.sampleRate, len = Math.floor(sr * 0.35);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) { lp += 0.25 * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.exp((-i / sr) * 12); }
    return buf;
  }
  function createCleanToneChain(ctx, destination) {
    const input = ctx.createGain();
    const out = ctx.createGain();
    out.gain.value = CLEAN_TRIM;
    connectChain(input, biquad(ctx, 'peaking', 1700, 0.8, -1), out);
    out.connect(destination);
    return { input };
  }
  function createOverdriveChain(ctx, destination) {
    const input = ctx.createGain();
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
    const deHarsh = biquad(ctx, 'peaking', 3300, 2.5, -4);
    const room = ctx.createConvolver(); room.buffer = roomImpulse(ctx);
    const wet = ctx.createGain(); wet.gain.value = OD_ROOM_WET;
    const makeup = ctx.createGain(); makeup.gain.value = OD_MAKEUP;
    const outVol = ctx.createGain(); outVol.gain.value = 1;
    const safety = ctx.createWaveShaper();
    safety.curve = makeCurve((x) => Math.tanh(x), 1024);
    safety.oversample = '2x';
    connectChain(input, biquad(ctx, 'highpass', 120, FLAT_Q), biquad(ctx, 'peaking', 700, 0.8, 4), biquad(ctx, 'highshelf', 1000, 0, -8), biquad(ctx, 'lowpass', 4000, FLAT_Q),
      drive, stage1, stage2Gain, stage2,
      biquad(ctx, 'highpass', 80, FLAT_Q), biquad(ctx, 'peaking', 180, 0.8, 2), biquad(ctx, 'peaking', 400, 1, -2),
      biquad(ctx, 'peaking', 1800, 1, 1.5), biquad(ctx, 'lowpass', 4000, FLAT_Q), biquad(ctx, 'lowpass', 4000, FLAT_Q), deHarsh, makeup);
    connectChain(deHarsh, room, wet, makeup);
    connectChain(makeup, outVol, safety, destination);
    return { input, output: outVol };
  }

  // ---- samples + rendering of the fretboard voice (startSampleVoice)
  const SR = 44100;
  let samplesPromise = null;
  function loadSamples() {
    if (!samplesPromise) {
      samplesPromise = (async () => {
        const manifest = await (await fetch('/samples/seagull-acoustic/manifest.json')).json();
        return Promise.all(manifest.samples.map(async (s) => {
          const r = await fetch(`/samples/seagull-acoustic/${s.file}`);
          const buffer = await new OfflineAudioContext(1, SR, SR).decodeAudioData(await r.arrayBuffer());
          return { ...s, buffer };
        }));
      })();
    }
    return samplesPromise;
  }
  function choose(samples, midi) {
    return samples.find((s) => midi >= s.keyRange.low && midi <= s.keyRange.high)
      ?? samples.slice().sort((a, b) => Math.abs(a.rootKey - midi) - Math.abs(b.rootKey - midi))[0];
  }
  // tone: 'raw' (the old clean: sample × 0.52 straight out), 'clean' or 'overdrive'.
  async function renderNotes(midis, tone, { volume = 1, duration = 1.5 } = {}) {
    const samples = await loadSamples();
    const ctx = new OfflineAudioContext(1, Math.floor(SR * duration), SR);
    let bus = ctx.destination;
    if (tone === 'clean') bus = createCleanToneChain(ctx, ctx.destination).input;
    if (tone === 'overdrive') {
      const od = createOverdriveChain(ctx, ctx.destination);
      od.output.gain.value = volume;
      bus = od.input;
    }
    for (const midi of midis) {
      const s = choose(samples, midi);
      const src = ctx.createBufferSource();
      src.buffer = s.buffer;
      src.playbackRate.value = 2 ** ((midi - s.rootKey - s.pitchCorrection / 100) / 12);
      if (s.loopEnd > s.loopStart + 8) { src.loop = true; src.loopStart = s.loopStart / s.sampleRate; src.loopEnd = s.loopEnd / s.sampleRate; }
      const g = ctx.createGain();
      const trim = tone === 'raw' ? 1 : guitarSampleTrim(s.file, midi);
      const level = tone === 'overdrive' ? OD_VOICE_LEVEL * trim * overdriveRegisterTrim(midi) : 0.52 * trim * volume;
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.linearRampToValueAtTime(level, 0.005);
      src.connect(g); g.connect(bus);
      src.start(0);
    }
    return (await ctx.startRendering()).getChannelData(0);
  }

  window.__guitarTone = {
    SR, lufs, maxMomentary, rmsDb, peak, bandShareDb, kWeighting, speaker,
    guitarSampleTrim, overdriveRegisterTrim, createCleanToneChain, createOverdriveChain, loadSamples, renderNotes,
  };
})();
