const SAMPLE_BASE = '/samples/seagull-acoustic/';
const MAX_VOICES = 3;
const RELEASE_TIME = 0.18;
const DRAG_RELEASE_TIME = 0.08;

type SampleEntry = {
  file: string;
  rootKey: number;
  keyRange: { low: number; high: number };
  pitchCorrection: number;
  loopStart: number;
  loopEnd: number;
  sampleRate: number;
};

type LoadedSample = SampleEntry & { buffer: AudioBuffer };

type ActiveVoice = {
  id: number;
  source: AudioScheduledSourceNode; // BufferSourceNode (fretboard) or OscillatorNode (keyboard)
  gain: GainNode;
  startedAt: number;
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let pendingVolume = 1.0;
let metronomeLimiter: DynamicsCompressorNode | null = null;
let samples: LoadedSample[] | null = null;
let samplesPromise: Promise<LoadedSample[]> | null = null;
let voiceCounter = 0;
const voices: ActiveVoice[] = [];

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function getMaster(context: AudioContext): GainNode {
  if (masterGain) return masterGain;
  const g = context.createGain();
  g.gain.value = pendingVolume;
  g.connect(context.destination);
  masterGain = g;
  return g;
}

// The metronome's volume (playMetronomeClick's `volume` arg) is independent
// of the instrument volume and can go up to 2x its historical default (see
// useMetronome's metroVolume), which pushes the "kick" click type's three
// simultaneous layers (click + sine body + noise, ~0.58 combined peak at the
// old default) up to ~1.16 — past 0dBFS. Rather than cap the slider or
// quietly retune the click's own gains (which would change how it sounds at
// the old default), every metronome layer routes through this dedicated
// limiter instead of straight to master. Threshold sits just above the OLD
// default's peak, so nothing changes at or below it — this only engages
// while pushing into the new upper range, and only for kick (the one type
// that can reach it).
function getMetronomeLimiter(context: AudioContext): DynamicsCompressorNode {
  if (metronomeLimiter) return metronomeLimiter;
  const comp = context.createDynamicsCompressor();
  comp.threshold.value = -3;
  comp.knee.value = 6;
  comp.ratio.value = 20;
  comp.attack.value = 0.001;
  comp.release.value = 0.1;
  comp.connect(getMaster(context));
  metronomeLimiter = comp;
  return comp;
}

export function setMasterVolume(value: number): void {
  pendingVolume = value;
  if (masterGain && ctx) {
    masterGain.gain.setValueAtTime(value, ctx.currentTime);
  }
}

async function loadAllSamples(context: AudioContext): Promise<LoadedSample[]> {
  const resp = await fetch(`${SAMPLE_BASE}manifest.json`);
  const manifest = (await resp.json()) as { samples: SampleEntry[] };
  const loaded = await Promise.all(
    manifest.samples.map(async (s) => {
      const r = await fetch(`${SAMPLE_BASE}${s.file}`);
      const buf = await r.arrayBuffer();
      const buffer = await context.decodeAudioData(buf);
      return { ...s, buffer };
    })
  );
  samples = loaded;
  return loaded;
}

export async function preloadSamples(): Promise<void> {
  if (samples || samplesPromise) return;
  samplesPromise = loadAllSamples(getCtx());
  await samplesPromise;
}

async function ensureSamples(): Promise<void> {
  if (samples) return;
  const context = getCtx();
  if (!samplesPromise) samplesPromise = loadAllSamples(context);
  await samplesPromise;
}

function chooseSample(midi: number): LoadedSample | null {
  if (!samples?.length) return null;
  return (
    samples.find((s) => midi >= s.keyRange.low && midi <= s.keyRange.high) ??
    samples.toSorted((a, b) => Math.abs(a.rootKey - midi) - Math.abs(b.rootKey - midi))[0] ??
    null
  );
}

function killVoice(voice: ActiveVoice, context: AudioContext, fadeTime: number): void {
  const idx = voices.indexOf(voice);
  if (idx !== -1) voices.splice(idx, 1);

  const now = context.currentTime;
  const g = voice.gain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(Math.max(0.0001, g.value), now);
  g.exponentialRampToValueAtTime(0.0001, now + fadeTime);

  // Only BufferSourceNode has .loop — OscillatorNode does not
  if (voice.source instanceof AudioBufferSourceNode) {
    voice.source.loop = false;
  }
  try {
    voice.source.stop(now + fadeTime + 0.02);
  } catch {
    // source may have already ended naturally
  }
}

function enforcePolyphony(context: AudioContext): void {
  if (voices.length < MAX_VOICES) return;
  const oldest = voices.toSorted((a, b) => a.startedAt - b.startedAt)[0];
  if (oldest) killVoice(oldest, context, 0.05);
}

// Keyboard path: oscillator with true indefinite sustain.
// Triangle wave filtered to mids + slight highs — sustain holds while key is down,
// tail happens only on releaseNote().
function startOscillatorVoice(midi: number, context: AudioContext, volume = 1.0): number {
  enforcePolyphony(context);

  const now = context.currentTime;
  const freq = 440 * 2 ** ((midi - 69) / 12);

  const osc = context.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;

  // Cut boomy bass, preserve mids and a touch of highs
  const hp = context.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 140;
  hp.Q.value = 0.6;

  const lp = context.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 6500;
  lp.Q.value = 0.5;

  // 0.19 peak was chosen by rendering both voices offline and comparing RMS
  // loudness against the guitar sample voice (0.52 peak): the oscillator
  // sustains at full level while a plucked-string sample decays, so a naive
  // peak-to-peak match (0.308) left the keyboard 3-6.5 dB louder than the
  // guitar in practice. 0.19 splits the difference between attack-loudness
  // parity (~0.22) and sustained-note parity (~0.15).
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.19 * volume, now + 0.005); // fast attack

  osc.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(getMaster(context));

  osc.start(now);
  // No stop scheduled — oscillator sustains until releaseNote() is called

  const id = voiceCounter++;
  voices.push({ id, source: osc, gain, startedAt: now });
  return id;
}

// Fretboard path: guitar sample with pitch correction and natural decay + loop tail.
function startSampleVoice(midi: number, context: AudioContext, sample: LoadedSample, volume = 1.0): number {
  enforcePolyphony(context);

  const now = context.currentTime;
  const rate = 2 ** ((midi - sample.rootKey - sample.pitchCorrection / 100) / 12);

  const source = context.createBufferSource();
  source.buffer = sample.buffer;
  source.playbackRate.value = rate;
  if (sample.loopEnd > sample.loopStart + 8) {
    source.loop = true;
    source.loopStart = sample.loopStart / sample.sampleRate;
    source.loopEnd = sample.loopEnd / sample.sampleRate;
  }

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.52 * volume, now + 0.005);

  source.connect(gain);
  gain.connect(getMaster(context));
  source.start(now);

  const id = voiceCounter++;
  voices.push({ id, source, gain, startedAt: now });
  return id;
}

// ---------------------------------------------------------------------------
// Synth bass (Master of Puppets' 4-string bass track, AlphaTabPlayer.tsx's
// multiTrack mode). Fully synthesized (no samples), like the metronome/drum
// clicks above, but built as a proper "synth bass" patch instead of a single
// flat oscillator: saw (harmonic definition) + sub-sine (low-end weight),
// summed into a RESONANT lowpass filter that has its own envelope separate
// from the amplitude envelope (opens briefly on attack, then closes — the
// classic synth-bass "pluck"), then a mild waveshaper for harmonic bite.
// See AlphaTabPlayer.NOTES.md "Bajo sintetizado" for the full design
// rationale and measured levels.
//
// Deliberately NOT routed through a DynamicsCompressorNode (unlike the drum
// clicks' getMetronomeLimiter above): offline measurement showed its
// internal transient detector reacting to this voice's fast (~4ms) attack by
// cutting an already-safe peak (~0.19 at volume=1, single note) by 8-15dB —
// even with thresholds well above that peak — actively undermining the goal
// of matching the guitar's loudness instead of protecting headroom.
// Real bass headroom is fine without any limiting (single notes/dyads,
// which is nearly everything an actual bass line plays); the only scenario
// that can approach clipping is a synthetic worst case — every voice in the
// BASS_MAX_VOICES polyphony cap struck at once at max volume, which isn't
// realistic playing but IS reachable if a chord happens to land there. For
// that case only, getBassBus below applies a plain tanh soft-clip to the
// SUMMED signal (a WaveShaperNode reacts per-sample with no lookahead/
// smoothing, so unlike the compressor it doesn't touch normal single-voice
// peaks — tanh(x) ≈ x well under 1.0, see tests/bass-audio-loudness.spec.ts).
const BASS_MAX_VOICES = 4;
const BASS_VOICE_STEAL_FADE = 0.03;

type ActiveBassVoice = {
  id: number;
  osc: OscillatorNode;
  sub: OscillatorNode;
  gain: GainNode;
  startedAt: number;
};

let bassBus: WaveShaperNode | null = null;
let bassSaturationCurve: Float32Array<ArrayBuffer> | null = null;
let bassSoftClipCurve: Float32Array<ArrayBuffer> | null = null;
let bassVoiceCounter = 0;
const bassVoices: ActiveBassVoice[] = [];

// Soft (tanh) saturation curve, cached — gives the saw+sub mix some
// harmonic "bite" without sounding like hard digital clipping.
function getBassSaturationCurve(): Float32Array<ArrayBuffer> {
  if (bassSaturationCurve) return bassSaturationCurve;
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.8);
  }
  bassSaturationCurve = curve;
  return curve;
}

// Plain tanh(x), no extra drive — transparent (≈identity) at every level a
// real bass line reaches, only rounding off the rare summed-voice overshoot.
// Not the same curve as getBassSaturationCurve above (that one is tuned to
// drive a single voice's tone into character, this one must stay neutral).
function getBassSoftClipCurve(): Float32Array<ArrayBuffer> {
  if (bassSoftClipCurve) return bassSoftClipCurve;
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x);
  }
  bassSoftClipCurve = curve;
  return curve;
}

// Shared summing bus every bass voice connects to, instead of connecting to
// getMaster() individually — see the file header comment above for why.
function getBassBus(context: AudioContext): WaveShaperNode {
  if (bassBus) return bassBus;
  const shaper = context.createWaveShaper();
  shaper.curve = getBassSoftClipCurve();
  shaper.oversample = '2x';
  shaper.connect(getMaster(context));
  bassBus = shaper;
  return shaper;
}

function killBassVoice(voice: ActiveBassVoice, context: AudioContext, fadeTime: number): void {
  const idx = bassVoices.indexOf(voice);
  if (idx !== -1) bassVoices.splice(idx, 1);

  const now = context.currentTime;
  const g = voice.gain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(Math.max(0.0001, g.value), now);
  g.exponentialRampToValueAtTime(0.0001, now + fadeTime);
  try {
    voice.osc.stop(now + fadeTime + 0.02);
    voice.sub.stop(now + fadeTime + 0.02);
  } catch {
    // already scheduled to stop naturally
  }
}

function enforceBassPolyphony(context: AudioContext): void {
  if (bassVoices.length < BASS_MAX_VOICES) return;
  const oldest = bassVoices.toSorted((a, b) => a.startedAt - b.startedAt)[0];
  if (oldest) killBassVoice(oldest, context, BASS_VOICE_STEAL_FADE);
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// scheduledAt/durationSeconds/volume follow the same convention as
// playMetronomeClick above (absolute AudioContext time, linear 0-1-ish
// volume multiplier applied on top of this patch's own internal gain
// structure). palmMuted mirrors AlphaTabPlayer.tsx's own palm-mute
// articulation for the guitar tracks: Master of Puppets' bass sits right
// under the palm-muted rhythm guitar most of the time, so a muted bass note
// needs to die out just as fast or it smears into the next one.
export function playBassNote(
  scheduledAt: number,
  midiNote: number,
  durationSeconds: number,
  volume: number,
  palmMuted = false
): void {
  const context = getCtx();
  if (volume <= 0) return;
  enforceBassPolyphony(context);

  const freq = 440 * 2 ** ((midiNote - 69) / 12);

  const osc = context.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, scheduledAt);

  // Sub-oscillator one octave down: pure sine, no harmonics of its own, adds
  // low-end weight without turning the note into an undefined "bum".
  const sub = context.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(freq / 2, scheduledAt);

  const oscGain = context.createGain();
  oscGain.gain.value = 1;
  const subGain = context.createGain();
  subGain.gain.value = 0.5; // sub supports, doesn't dominate — see file header comment

  // Filter envelope, independent from the amplitude envelope below: starts
  // fairly closed, snaps open on attack (bright pluck), then closes down
  // into a darker sustain. Cutoffs scale with the note's own frequency so
  // low notes don't stay muddy and higher notes don't stay too closed.
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  // Q scales down for the lowest notes (E1/F#1, ~41-46Hz): a resonance of 5
  // combined with the 8ms attack sweep below rings audibly ("boing") at that
  // register instead of reading as a clean pluck — reviewed by
  // guitar-music-advisor, see AlphaTabPlayer.NOTES.md "Bajo sintetizado".
  // Stays at the original 5 from ~G2 (98Hz) upward, where the sweep is fast
  // relative to the note's own cycle and doesn't ring the same way.
  filter.Q.value = clampValue(freq / 20, 3, 5);
  const startCutoff = clampValue(freq * 2.2, 90, 260);
  const attackCutoff = clampValue(freq * 11, 900, 4200);
  const sustainCutoff = clampValue(freq * 3.4, 220, 950);
  const filterAttackTime = 0.008;
  const filterDecayTime = palmMuted ? 0.07 : 0.09;
  filter.frequency.setValueAtTime(startCutoff, scheduledAt);
  filter.frequency.linearRampToValueAtTime(attackCutoff, scheduledAt + filterAttackTime);
  filter.frequency.exponentialRampToValueAtTime(sustainCutoff, scheduledAt + filterAttackTime + filterDecayTime);

  // Mild waveshaper drive for harmonic "bite" — pre-gain pushes into the
  // tanh curve's knee, post-gain brings the level back down afterward.
  const shaper = context.createWaveShaper();
  shaper.curve = getBassSaturationCurve();
  shaper.oversample = '2x';
  const preGain = context.createGain();
  preGain.gain.value = 1.6;
  const postGain = context.createGain();
  postGain.gain.value = 0.62;

  // Amplitude envelope. 0.5 peak (at volume=1) sits close to the guitar
  // sample voice's own 0.52 peak (see startSampleVoice above) on purpose —
  // measured together offline, see AlphaTabPlayer.NOTES.md for the actual
  // RMS comparison, since peak alone doesn't guarantee comparable loudness
  // (same lesson as the keyboard-vs-guitar comparison documented there).
  const ampGain = context.createGain();
  const peak = 0.5 * volume;
  const attackTime = 0.004;
  ampGain.gain.setValueAtTime(0.0001, scheduledAt);
  ampGain.gain.linearRampToValueAtTime(peak, scheduledAt + attackTime);

  let voiceStop: number;
  if (palmMuted) {
    // Short and percussive regardless of the notated duration — matches how
    // GUITAR_SAMPLE_PALM_MUTE_RELEASE treats the same articulation on the
    // guitar tracks in AlphaTabPlayer.tsx. A SINGLE exponential decay
    // (rather than an early two-stage drop) matters specifically for a bass:
    // its lowest notes have a ~20-24ms period, so a decay that crashes to
    // near-silence within its first ~12ms (as an early version of this
    // function did) cuts the note off before a full cycle even completes,
    // making it measurably quieter than intended — confirmed by an offline
    // render, see AlphaTabPlayer.NOTES.md "Bajo sintetizado".
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
  ampGain.connect(getBassBus(context));

  osc.start(scheduledAt);
  sub.start(scheduledAt);
  osc.stop(voiceStop + 0.03);
  sub.stop(voiceStop + 0.03);

  const id = bassVoiceCounter++;
  const voice: ActiveBassVoice = { id, osc, sub, gain: ampGain, startedAt: scheduledAt };
  bassVoices.push(voice);
  osc.addEventListener('ended', () => {
    const idx = bassVoices.indexOf(voice);
    if (idx !== -1) bassVoices.splice(idx, 1);
  });
}

export function touchAudioContext(): void {
  const context = getCtx();
  if (context.state === 'suspended') context.resume().catch(() => {});
}

export function getAudioCurrentTime(): number {
  return ctx ? ctx.currentTime : 0;
}

export function playMetronomeClick(scheduledAt: number, volume: number, type: 'snare' | 'kick' | 'cymbal' = 'snare'): void {
  const context = getCtx();
  const sr = context.sampleRate;
  const limiter = getMetronomeLimiter(context);

  if (type === 'snare') {
    const noiseLen = Math.floor(sr * 0.045);
    const noiseBuf = context.createBuffer(1, noiseLen, sr);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen) ** 2.4;
    const ns = context.createBufferSource();
    ns.buffer = noiseBuf;
    const bp = context.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1850; bp.Q.value = 0.75;
    const hp = context.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420; hp.Q.value = 0.7;
    const ng = context.createGain();
    ng.gain.setValueAtTime(0.0001, scheduledAt);
    ng.gain.linearRampToValueAtTime(volume * 0.18, scheduledAt + 0.002);
    ng.gain.linearRampToValueAtTime(0.0001, scheduledAt + 0.045);
    ns.connect(bp); bp.connect(hp); hp.connect(ng); ng.connect(limiter);
    ns.start(scheduledAt);

    const bodyLen = Math.floor(sr * 0.055);
    const bodyBuf = context.createBuffer(1, bodyLen, sr);
    const bd = bodyBuf.getChannelData(0);
    for (let i = 0; i < bodyLen; i++) bd[i] = (Math.random() * 2 - 1) * (1 - i / bodyLen) ** 2.8;
    const bs = context.createBufferSource();
    bs.buffer = bodyBuf;
    const lp = context.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.6;
    const bg = context.createGain();
    bg.gain.setValueAtTime(0.0001, scheduledAt);
    bg.gain.linearRampToValueAtTime(volume * 0.075, scheduledAt + 0.003);
    bg.gain.linearRampToValueAtTime(0.0001, scheduledAt + 0.055);
    bs.connect(lp); lp.connect(bg); bg.connect(limiter);
    bs.start(scheduledAt);

  } else if (type === 'kick') {
    // 1. Click transient — 1200 Hz, 8 ms: audible on all speakers including phone/laptop
    const clkLen = Math.floor(sr * 0.008);
    const clkBuf = context.createBuffer(1, clkLen, sr);
    const clkd = clkBuf.getChannelData(0);
    for (let i = 0; i < clkLen; i++) clkd[i] = (Math.random() * 2 - 1) * (1 - i / clkLen) ** 1.5;
    const clkSrc = context.createBufferSource(); clkSrc.buffer = clkBuf;
    const clkBp = context.createBiquadFilter(); clkBp.type = 'bandpass'; clkBp.frequency.value = 1200; clkBp.Q.value = 1.5;
    const clkG = context.createGain();
    clkG.gain.setValueAtTime(volume * 0.28, scheduledAt);
    clkG.gain.exponentialRampToValueAtTime(0.0001, scheduledAt + 0.008);
    clkSrc.connect(clkBp); clkBp.connect(clkG); clkG.connect(limiter);
    clkSrc.start(scheduledAt);

    // 2. Sine body — low thump for large speakers / headphones (reduced to avoid boom)
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, scheduledAt);
    osc.frequency.exponentialRampToValueAtTime(80, scheduledAt + 0.06);
    const ohp = context.createBiquadFilter(); ohp.type = 'highpass'; ohp.frequency.value = 60; ohp.Q.value = 0.5;
    const og = context.createGain();
    og.gain.setValueAtTime(0.0001, scheduledAt);
    og.gain.linearRampToValueAtTime(volume * 0.20, scheduledAt + 0.003);
    og.gain.exponentialRampToValueAtTime(0.0001, scheduledAt + 0.08);
    osc.connect(ohp); ohp.connect(og); og.connect(limiter);
    osc.start(scheduledAt); osc.stop(scheduledAt + 0.09);

    // 3. Upper-bass noise — 280 Hz punch bridging click and sine
    const bodyLen = Math.floor(sr * 0.035);
    const bodyBuf = context.createBuffer(1, bodyLen, sr);
    const bd = bodyBuf.getChannelData(0);
    for (let i = 0; i < bodyLen; i++) bd[i] = (Math.random() * 2 - 1) * (1 - i / bodyLen) ** 2.5;
    const bs = context.createBufferSource(); bs.buffer = bodyBuf;
    const bbp = context.createBiquadFilter(); bbp.type = 'bandpass'; bbp.frequency.value = 280; bbp.Q.value = 0.9;
    const bg = context.createGain();
    bg.gain.setValueAtTime(0.0001, scheduledAt);
    bg.gain.linearRampToValueAtTime(volume * 0.10, scheduledAt + 0.002);
    bg.gain.exponentialRampToValueAtTime(0.0001, scheduledAt + 0.035);
    bs.connect(bbp); bbp.connect(bg); bg.connect(limiter);
    bs.start(scheduledAt);

  } else {
    // Light cymbal: short high-frequency noise burst
    const cymLen = Math.floor(sr * 0.03);
    const cymBuf = context.createBuffer(1, cymLen, sr);
    const cd = cymBuf.getChannelData(0);
    for (let i = 0; i < cymLen; i++) cd[i] = (Math.random() * 2 - 1) * (1 - i / cymLen) ** 2.0;
    const cs = context.createBufferSource();
    cs.buffer = cymBuf;
    const chp = context.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = 5000; chp.Q.value = 0.5;
    const cg = context.createGain();
    cg.gain.setValueAtTime(0.0001, scheduledAt);
    cg.gain.linearRampToValueAtTime(volume * 0.12, scheduledAt + 0.001);
    cg.gain.linearRampToValueAtTime(0.0001, scheduledAt + 0.03);
    cs.connect(chp); chp.connect(cg); cg.connect(limiter);
    cs.start(scheduledAt);
  }
}

// forKeyboard = true  → oscillator (sustain while held, tail on release)
// forKeyboard = false → guitar sample (for fretboard)
export async function playNote(midi: number, forKeyboard = false, volume = 1.0): Promise<number> {
  const context = getCtx();
  if (context.state === 'suspended') await context.resume();

  if (forKeyboard) {
    return startOscillatorVoice(midi, context, volume);
  }

  await ensureSamples();
  const sample = chooseSample(midi);
  if (!sample) return -1;
  return startSampleVoice(midi, context, sample, volume);
}

// Graceful release with short tail (call on pointerUp).
export function releaseNote(id: number): void {
  if (!ctx) return;
  const voice = voices.find((v) => v.id === id);
  if (voice) killVoice(voice, ctx, RELEASE_TIME);
}

// Quick crossfade for drag: kill old voice and start new one.
export async function switchNote(oldId: number, newMidi: number, forKeyboard = false, volume = 1.0): Promise<number> {
  if (ctx && oldId >= 0) {
    const old = voices.find((v) => v.id === oldId);
    if (old) killVoice(old, ctx, DRAG_RELEASE_TIME);
  }
  return playNote(newMidi, forKeyboard, volume);
}
