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

// ---------------------------------------------------------------------------
// Overdrive (opt-in, `tone === 'overdrive'` en playNote/switchNote; hoy solo
// el mástil de la sala de pruebas vía `allowOverdrive` en
// ReducedFretboardDiagram). Misma fuente que el clean (samples acústicos
// Seagull), pasada por una cadena de ampli completa en un ÚNICO bus
// compartido por todas las voces:
//   - Distorsionar la SUMA (no cada voz por separado) es lo que hace un ampli
//     real: quintas/power chords se funden con intermodulación auténtica.
//     Y una sola cadena es barata en CPU para móviles modestos.
//   1. Pre-EQ estilo Tube Screamer: highpass 110Hz (aprieta graves ANTES de
//      saturar — clave partiendo de una acústica con cuerpo resonante, o se
//      vuelve barro), joroba de medios en 720Hz, lowpass 5.5kHz antes del
//      clip (los chirridos de cuerda saturados se convierten en "fizz").
//   2. Dos etapas de saturación (preamp de dos válvulas): la primera
//      asimétrica (armónicos pares, carácter cálido) y fuerte, la segunda
//      suave. oversample '4x' en ambas: sin él, los armónicos que crea el
//      waveshaper por encima de Nyquist se reflejan como aliasing metálico.
//   3. Simulador de pantalla 1x12" con biquads: highpass 85Hz, -3dB en 400Hz
//      (des-embarrar), +3dB en 2.2kHz (presencia — es lo que sobrevive en
//      altavoces de móvil/portátil, que no reproducen graves), y dos lowpass
//      de 4.8kHz en cascada (24dB/oct, la caída de un cono real; elimina el
//      fizz digital que delata a un overdrive "de juguete").
//   4. Sala corta (ConvolverNode con IR sintética, ~10% húmedo): quita la
//      sequedad de "línea directa" sin emborronar. Mono, sin trucos estéreo.
//   5. Make-up gain calibrado offline para que el RMS overdrive ≈ clean en el
//      ataque (medido: +0.9dB; sin salto de volumen al pulsar el botón). En
//      sustain queda ~+5dB por diseño: un overdrive comprime y alarga la
//      nota, eso es parte del sonido. Pico con acordes de 3 notas a volumen
//      máximo: ~0.48, mucho margen. Volumen del slider aplicado
//      DESPUÉS de saturar (`overdriveOutGain`): antes del clip, bajar el
//      volumen solo limpiaría el sonido y apenas bajaría (el tanh comprime).
//      Por eso las voces overdrive entran al bus a nivel fijo.
//   6. Soft-clip tanh neutro a la salida (como getBassBus), sin
//      DynamicsCompressorNode (ver el comentario del bajo: reacciona mal a
//      ataques rápidos; la señal saturada ya llega comprimida).
// tests/guitar-overdrive.spec.ts replica esta cadena exacta offline (pico
// sin clipping con acordes a volumen máximo, paridad de RMS con el clean, y
// que el slider de volumen baje de verdad). Si cambias cualquier valor
// aquí, actualízalo allí también.
export type GuitarTone = 'clean' | 'overdrive';

const OD_VOICE_LEVEL = 0.52;
const OD_DRIVE = 3;
const OD_SHAPE_K = 6;
const OD_SHAPE_BIAS = 0.12;
const OD_STAGE2_GAIN = 0.8;
const OD_STAGE2_K = 1.5;
const OD_ROOM_WET = 0.1;
const OD_MAKEUP = 0.18;

let overdriveIn: GainNode | null = null;
let overdriveOutGain: GainNode | null = null;

function makeCurve(fn: (x: number) => number, n = 4096): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = fn((i / (n - 1)) * 2 - 1);
  return curve;
}

// IR sintética de sala pequeña: ruido con caída exponencial (~0.35s),
// oscurecido con un paso bajo de un polo para que suene a habitación y no
// a "chapa".
function makeRoomImpulse(context: BaseAudioContext): AudioBuffer {
  const sr = context.sampleRate;
  const len = Math.floor(sr * 0.35);
  const buf = context.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    lp += 0.25 * (white - lp);
    d[i] = lp * Math.exp((-i / sr) * 12);
  }
  return buf;
}

function biquad(context: BaseAudioContext, type: BiquadFilterType, frequency: number, Q: number, gain = 0): BiquadFilterNode {
  const f = context.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  f.gain.value = gain;
  return f;
}

function getOverdriveBus(context: AudioContext): GainNode {
  if (overdriveIn) return overdriveIn;
  const input = context.createGain();

  // 1. Pre-EQ (Tube Screamer)
  const preHp = biquad(context, 'highpass', 110, 0.7);
  const midHump = biquad(context, 'peaking', 720, 0.8, 6);
  const preLp = biquad(context, 'lowpass', 5500, 0.7);

  // 2. Dos etapas de saturación
  const drive = context.createGain();
  drive.gain.value = OD_DRIVE;
  const stage1 = context.createWaveShaper();
  const dcAtZero = Math.tanh(OD_SHAPE_K * OD_SHAPE_BIAS);
  const norm = Math.tanh(OD_SHAPE_K * (1 + OD_SHAPE_BIAS)) - dcAtZero;
  stage1.curve = makeCurve((x) => (Math.tanh(OD_SHAPE_K * (x + OD_SHAPE_BIAS)) - dcAtZero) / norm);
  stage1.oversample = '4x';
  const stage2Gain = context.createGain();
  stage2Gain.gain.value = OD_STAGE2_GAIN;
  const stage2 = context.createWaveShaper();
  stage2.curve = makeCurve((x) => Math.tanh(OD_STAGE2_K * x) / Math.tanh(OD_STAGE2_K));
  stage2.oversample = '4x';

  // 3. Pantalla 1x12"
  const cabHp = biquad(context, 'highpass', 85, 0.7);
  const cabMud = biquad(context, 'peaking', 400, 1, -3);
  const cabPresence = biquad(context, 'peaking', 2200, 1, 3);
  const cabLp1 = biquad(context, 'lowpass', 4800, 0.7);
  const cabLp2 = biquad(context, 'lowpass', 4800, 0.9);

  // 4. Sala corta (en paralelo con la señal seca)
  const room = context.createConvolver();
  room.buffer = makeRoomImpulse(context);
  const wet = context.createGain();
  wet.gain.value = OD_ROOM_WET;

  // 5. Make-up + volumen post-saturación
  const makeup = context.createGain();
  makeup.gain.value = OD_MAKEUP;
  const outVol = context.createGain();
  outVol.gain.value = 1;

  // 6. Soft-clip de seguridad
  const safety = context.createWaveShaper();
  safety.curve = getBassSoftClipCurve();
  safety.oversample = '2x';

  input.connect(preHp);
  preHp.connect(midHump);
  midHump.connect(preLp);
  preLp.connect(drive);
  drive.connect(stage1);
  stage1.connect(stage2Gain);
  stage2Gain.connect(stage2);
  stage2.connect(cabHp);
  cabHp.connect(cabMud);
  cabMud.connect(cabPresence);
  cabPresence.connect(cabLp1);
  cabLp1.connect(cabLp2);
  cabLp2.connect(makeup);
  cabLp2.connect(room);
  room.connect(wet);
  wet.connect(makeup);
  makeup.connect(outVol);
  outVol.connect(safety);
  safety.connect(getMaster(context));

  overdriveIn = input;
  overdriveOutGain = outVol;
  return input;
}

// Fretboard path: guitar sample with pitch correction and natural decay + loop tail.
function startSampleVoice(midi: number, context: AudioContext, sample: LoadedSample, volume = 1.0, tone: GuitarTone = 'clean'): number {
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
  source.connect(gain);
  if (tone === 'overdrive') {
    // Nivel fijo hacia la saturación; el volumen va después (ver getOverdriveBus).
    gain.gain.linearRampToValueAtTime(OD_VOICE_LEVEL, now + 0.005);
    gain.connect(getOverdriveBus(context));
    overdriveOutGain?.gain.setTargetAtTime(volume, now, 0.02);
  } else {
    gain.gain.linearRampToValueAtTime(0.52 * volume, now + 0.005);
    gain.connect(getMaster(context));
  }
  source.start(now);

  const id = voiceCounter++;
  voices.push({ id, source, gain, startedAt: now });
  return id;
}

// Notas de fondo del juego tipo Rocksmith (app/lib/riff): la canción suena sola aunque el alumno
// no toque. Van programadas a una hora EXACTA del AudioContext (`at`) con su propio final, y NO
// entran en `voices`: MAX_VOICES = 3 es la polifonía de lo que toca el alumno, y una nota de fondo
// nunca debe robarle (ni que le roben) una voz. Cada nota se para sola al acabar.
export interface GuideNoteHandle {
  // Sube (o baja) el volumen de esta nota de fondo sin volver a atacarla: si aún no ha empezado,
  // empezará ya con ese volumen; si está sonando, sube suavemente. Es lo que hace un acierto en
  // los niveles traducidos del juego ("la pista se abre", como en Rock Band).
  setVolume(volume: number): void;
}

export async function scheduleGuideNote(midi: number, at: number, duration: number, volume = 0.35): Promise<GuideNoteHandle | null> {
  const context = getCtx();
  await ensureSamples();
  const sample = chooseSample(midi);
  if (!sample) return null;
  const start = Math.max(at, context.currentTime);
  const end = start + Math.max(0.08, duration);
  const source = context.createBufferSource();
  source.buffer = sample.buffer;
  source.playbackRate.value = 2 ** ((midi - sample.rootKey - sample.pitchCorrection / 100) / 12);
  if (sample.loopEnd > sample.loopStart + 8) {
    source.loop = true;
    source.loopStart = sample.loopStart / sample.sampleRate;
    source.loopEnd = sample.loopEnd / sample.sampleRate;
  }
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.52 * volume, start + 0.005);
  gain.gain.setTargetAtTime(0.0001, end, 0.05);
  source.connect(gain);
  gain.connect(getMaster(context));
  source.start(start);
  source.stop(end + 0.4);
  return {
    setVolume(next: number) {
      const now = context.currentTime;
      if (now >= end) return;
      const g = gain.gain;
      g.cancelScheduledValues(now);
      if (now < start) {
        g.setValueAtTime(0.0001, start);
        g.linearRampToValueAtTime(0.52 * next, start + 0.005);
      } else {
        g.setValueAtTime(Math.max(0.0001, g.value), now);
        g.linearRampToValueAtTime(0.52 * next, now + 0.03);
      }
      g.setTargetAtTime(0.0001, end, 0.05);
    },
  };
}

// "Clac" apagado y SIN afinación (ruido filtrado muy corto) para cuando, en un nivel traducido del
// juego, el alumno toca un botón equivocado: como el sonido de fallo de Guitar Hero. Al no tener
// nota, nunca desafina contra la canción de fondo.
export function playDeadNote(volume = 0.6): void {
  const context = getCtx();
  const now = context.currentTime;
  const length = Math.floor(context.sampleRate * 0.07);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1400;
  band.Q.value = 1.1;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.32 * volume, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
  source.connect(band);
  band.connect(gain);
  gain.connect(getMaster(context));
  source.start(now);
  source.stop(now + 0.08);
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
// tone (solo guitarra): 'clean' (por defecto) o 'overdrive' — ver getOverdriveBus.
export async function playNote(midi: number, forKeyboard = false, volume = 1.0, tone: GuitarTone = 'clean'): Promise<number> {
  const context = getCtx();
  if (context.state === 'suspended') await context.resume();

  if (forKeyboard) {
    return startOscillatorVoice(midi, context, volume);
  }

  await ensureSamples();
  const sample = chooseSample(midi);
  if (!sample) return -1;
  return startSampleVoice(midi, context, sample, volume, tone);
}

// Graceful release with short tail (call on pointerUp).
export function releaseNote(id: number): void {
  if (!ctx) return;
  const voice = voices.find((v) => v.id === id);
  if (voice) killVoice(voice, ctx, RELEASE_TIME);
}

// Quick crossfade for drag: kill old voice and start new one.
export async function switchNote(oldId: number, newMidi: number, forKeyboard = false, volume = 1.0, tone: GuitarTone = 'clean'): Promise<number> {
  if (ctx && oldId >= 0) {
    const old = voices.find((v) => v.id === oldId);
    if (old) killVoice(old, ctx, DRAG_RELEASE_TIME);
  }
  return playNote(newMidi, forKeyboard, volume, tone);
}
