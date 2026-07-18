const SAMPLE_BASE = '/samples/seagull-acoustic/';
const MAX_VOICES = 2;
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
function startOscillatorVoice(midi: number, context: AudioContext): number {
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
  gain.gain.linearRampToValueAtTime(0.44, now + 0.005); // fast attack

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
function startSampleVoice(midi: number, context: AudioContext, sample: LoadedSample): number {
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
  gain.gain.linearRampToValueAtTime(0.52, now + 0.005);

  source.connect(gain);
  gain.connect(getMaster(context));
  source.start(now);

  const id = voiceCounter++;
  voices.push({ id, source, gain, startedAt: now });
  return id;
}

// forKeyboard = true  → oscillator (sustain while held, tail on release)
// forKeyboard = false → guitar sample (for fretboard)
export async function playNote(midi: number, forKeyboard = false): Promise<number> {
  const context = getCtx();
  if (context.state === 'suspended') await context.resume();

  if (forKeyboard) {
    return startOscillatorVoice(midi, context);
  }

  await ensureSamples();
  const sample = chooseSample(midi);
  if (!sample) return -1;
  return startSampleVoice(midi, context, sample);
}

// Graceful release with short tail (call on pointerUp).
export function releaseNote(id: number): void {
  if (!ctx) return;
  const voice = voices.find((v) => v.id === id);
  if (voice) killVoice(voice, ctx, RELEASE_TIME);
}

// Quick crossfade for drag: kill old voice and start new one.
export async function switchNote(oldId: number, newMidi: number, forKeyboard = false): Promise<number> {
  if (ctx && oldId >= 0) {
    const old = voices.find((v) => v.id === oldId);
    if (old) killVoice(old, ctx, DRAG_RELEASE_TIME);
  }
  return playNote(newMidi, forKeyboard);
}
