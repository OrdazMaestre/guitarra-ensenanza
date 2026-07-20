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

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.308 * volume, now + 0.005); // fast attack

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
    ns.connect(bp); bp.connect(hp); hp.connect(ng); ng.connect(getMaster(context));
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
    bs.connect(lp); lp.connect(bg); bg.connect(getMaster(context));
    bs.start(scheduledAt);

  } else if (type === 'kick') {
    // Sine pitch-drop (220 → 80 Hz) — midrange thud, no sub-bass
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, scheduledAt);
    osc.frequency.exponentialRampToValueAtTime(110, scheduledAt + 0.05);
    const ohp = context.createBiquadFilter(); ohp.type = 'highpass'; ohp.frequency.value = 75; ohp.Q.value = 0.5;
    const og = context.createGain();
    og.gain.setValueAtTime(0.0001, scheduledAt);
    og.gain.linearRampToValueAtTime(volume * 0.20, scheduledAt + 0.002);
    og.gain.exponentialRampToValueAtTime(0.0001, scheduledAt + 0.06);
    osc.connect(ohp); ohp.connect(og); og.connect(getMaster(context));
    osc.start(scheduledAt); osc.stop(scheduledAt + 0.07);

    // Noise body filtered to upper-bass range only (no sub)
    const bodyLen = Math.floor(sr * 0.04);
    const bodyBuf = context.createBuffer(1, bodyLen, sr);
    const bd = bodyBuf.getChannelData(0);
    for (let i = 0; i < bodyLen; i++) bd[i] = (Math.random() * 2 - 1) * (1 - i / bodyLen) ** 3.0;
    const bs = context.createBufferSource();
    bs.buffer = bodyBuf;
    const lp = context.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 450; lp.Q.value = 0.5;
    const bhp = context.createBiquadFilter(); bhp.type = 'highpass'; bhp.frequency.value = 80; bhp.Q.value = 0.5;
    const bg = context.createGain();
    bg.gain.setValueAtTime(0.0001, scheduledAt);
    bg.gain.linearRampToValueAtTime(volume * 0.06, scheduledAt + 0.002);
    bg.gain.linearRampToValueAtTime(0.0001, scheduledAt + 0.04);
    bs.connect(lp); lp.connect(bhp); bhp.connect(bg); bg.connect(getMaster(context));
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
    cs.connect(chp); chp.connect(cg); cg.connect(getMaster(context));
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
