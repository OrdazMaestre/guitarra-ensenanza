// Motor de audio dedicado a la mesa de mezclas (disponible en toda la web, ver MixingConsole.tsx).
// Deliberadamente independiente de `app/lib/guitarAudioEngine.ts` (ese sintetiza notas de guitarra/bajo/batería
// con osciladores/samples cortos; esto reproduce 3-4 archivos MP3 de ~3 minutos por canción y los
// mezcla). Ver `NOTES.md` en esta misma carpeta para el diseño completo del grafo de audio.
//
// Clase sin dependencias de React: `useMixingConsole.ts` la envuelve con `useSyncExternalStore`
// para exponerla como estado reactivo. Esto mantiene el grafo de Web Audio (AudioContext, nodos)
// vivo mientras el componente `MixingConsole` esté montado, sin que el panel se abra/cierre lo
// recree -- ver el comentario de "no destruir al colapsar" en `MixingConsole.tsx`.

export type SongId = 'facil' | 'dificil' | 'mini-torneo' | 'campeonato';
export type EQBand = 'low' | 'mid' | 'high';

export interface InstrumentDef {
  id: string;
  label: string;
}

export interface SongDef {
  id: SongId;
  label: string;
  /** Escala/tonalidad de la canción, tal cual aparece en el nombre de la carpeta origen (ver
   * SONG_SCALES más abajo). Puramente informativa -- no afecta al audio. */
  scale: string;
  instruments: InstrumentDef[];
}

// Nombre del grupo ficticio que "toca" cada canción, no el nombre del modo de quiz -- por
// instrucción explícita del usuario. Toma el nombre entre paréntesis de cada carpeta origen en
// "C:\Users\Enrique\Desktop\pal cuadernillo\WAVS\" (p.ej. "FACIL (MAIkael)-G major-71bpm-441hz").
// Deliberadamente distinto de MODE_LABELS en QuizModeSwitcher.tsx (ese sigue mostrando
// Facil/Dificil/Mini-torneo/Campeonato en el quiz); aquí solo afecta al selector de la mesa de
// mezclas.
const SONG_LABELS: Record<SongId, string> = {
  facil: 'MAIkael',
  dificil: 'Black Gilmur',
  'mini-torneo': 'Electric Warlock',
  campeonato: 'Iron Rain',
};

// Escala/tonalidad de cada canción, tomada literalmente del nombre de su carpeta origen (p.ej.
// "FACIL (MAIkael)-G major-71bpm-441hz" -> "G major").
const SONG_SCALES: Record<SongId, string> = {
  facil: 'G major',
  dificil: 'C# minor',
  'mini-torneo': 'F# minor',
  campeonato: 'Eb minor',
};

const INSTRUMENT_LABELS: Record<string, string> = {
  bass: 'Bajo',
  drums: 'Batería',
  guitars: 'Guitarras',
  lead: 'Guitarra líder',
  rhythm: 'Guitarra rítmica',
};

function instrument(id: string): InstrumentDef {
  return { id, label: INSTRUMENT_LABELS[id] ?? id };
}

// Pistas ya preparadas por el usuario en public/audio/mesa-mezclas/<songId>/<instrumentId>.mp3.
export const MIXING_SONGS: SongDef[] = [
  {
    id: 'facil',
    label: SONG_LABELS.facil,
    scale: SONG_SCALES.facil,
    instruments: ['bass', 'drums', 'guitars'].map(instrument),
  },
  {
    id: 'dificil',
    label: SONG_LABELS.dificil,
    scale: SONG_SCALES.dificil,
    instruments: ['bass', 'drums', 'guitars'].map(instrument),
  },
  {
    id: 'mini-torneo',
    label: SONG_LABELS['mini-torneo'],
    scale: SONG_SCALES['mini-torneo'],
    instruments: ['bass', 'drums', 'lead', 'rhythm'].map(instrument),
  },
  {
    id: 'campeonato',
    label: SONG_LABELS.campeonato,
    scale: SONG_SCALES.campeonato,
    instruments: ['bass', 'drums', 'lead', 'rhythm'].map(instrument),
  },
];

export function trackUrl(songId: SongId, instrumentId: string): string {
  return `/audio/mesa-mezclas/${songId}/${instrumentId}.mp3`;
}

export interface ChannelState {
  volume: number; // 0..1
  pan: number; // -1 (izquierda) .. 1 (derecha), 0 = centro
  eq: { low: number; mid: number; high: number }; // dB, EQ_MIN_DB (-∞ práctico)..EQ_MAX_DB, taper no lineal, ver eqRatioToDb/eqDbToRatio
  muted: boolean;
}

export interface EngineState {
  songId: SongId;
  playing: boolean;
  masterVolume: number; // 0..1
  soloId: string | null; // id de instrumento en solo, o null
  channels: Record<string, ChannelState>; // solo los instrumentos de la canción actual
  /** true si la última comprobación periódica detectó una pista desincronizada >150ms y la
   * realineó. Informativo, se limpia solo en la siguiente comprobación si ya no hay deriva. */
  desynced: boolean;
}

const DEFAULT_CHANNEL: ChannelState = { volume: 0.85, pan: 0, eq: { low: 0, mid: 0, high: 0 }, muted: false };

// Perilla de EQ con taper no lineal (como una perilla analógica real), a petición explícita del
// usuario, en vez del barrido lineal -12..12 que tenía antes. Los puntos de referencia son
// posiciones de la propia perilla (mismo sistema de ángulo que Knob.tsx: -135deg = tope izquierdo,
// 0deg = las 12 en punto, +135deg = tope derecho, barrido total 270deg):
//   tope izquierdo (ratio 0)        -> EQ_MIN_DB ("-∞", silencia esa banda en la práctica)
//   las 9 en punto (ratio 1/6)      -> -12dB
//   las 12 en punto (ratio 1/2)     -> 0dB (posición por defecto, sin cambios)
//   tope derecho (ratio 1)          -> EQ_MAX_DB (+12dB)
// Así la mitad derecha de la perilla (0 a +12dB) sigue teniendo la misma resolución de siempre,
// pero la mitad izquierda comprime -12..-∞ en el último sexto del recorrido, dejando mucho más
// margen de giro para el rango -12..0 que antes (antes ese rango solo ocupaba la mitad izquierda
// completa junto con todo el resto del corte). EQ_MIN_DB se queda en -40 (no -Infinity real) porque
// BiquadFilterNode.gain tiene un rango nominal de ±40dB en la especificación de Web Audio; -40dB ya
// es inaudible para un filtro lowshelf/peaking/highshelf, así que a efectos prácticos equivale a
// mutear esa banda.
export const EQ_MIN_DB = -40;
export const EQ_MAX_DB = 12;
const EQ_TAPER_BREAKPOINTS: Array<[ratio: number, db: number]> = [
  [0, EQ_MIN_DB],
  [1 / 6, -12],
  [0.5, 0],
  [1, EQ_MAX_DB],
];

export function eqRatioToDb(ratio: number): number {
  const r = clamp(ratio, 0, 1);
  for (let i = 1; i < EQ_TAPER_BREAKPOINTS.length; i++) {
    const [r0, db0] = EQ_TAPER_BREAKPOINTS[i - 1];
    const [r1, db1] = EQ_TAPER_BREAKPOINTS[i];
    if (r <= r1) return db0 + ((r - r0) / (r1 - r0)) * (db1 - db0);
  }
  return EQ_MAX_DB;
}

export function eqDbToRatio(db: number): number {
  const v = clamp(db, EQ_MIN_DB, EQ_MAX_DB);
  for (let i = 1; i < EQ_TAPER_BREAKPOINTS.length; i++) {
    const [r0, db0] = EQ_TAPER_BREAKPOINTS[i - 1];
    const [r1, db1] = EQ_TAPER_BREAKPOINTS[i];
    if (v <= db1) return r0 + ((v - db0) / (db1 - db0)) * (r1 - r0);
  }
  return 1;
}

const EQ_MIN = EQ_MIN_DB;
const EQ_MAX = EQ_MAX_DB;
const PAN_MIN = -1;
const PAN_MAX = 1;
const VOLUME_MIN = 0;
const VOLUME_MAX = 1;
// Umbral de deriva entre pistas de una misma canción a partir del cual se realinean. 150ms es
// imperceptible como "empuje" al corregir pero ya es audible como eco/flanging si se deja crecer.
const DRIFT_THRESHOLD_SECONDS = 0.15;
const DRIFT_CHECK_INTERVAL_MS = 2000;

interface ChannelNodes {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  panner: StereoPannerNode;
  gain: GainNode;
}

type Listener = (state: EngineState) => void;

// Ver getDebugSnapshot() más abajo.
export interface ChannelDebugSnapshot {
  paused: boolean;
  gain: number;
  pan: number;
  low: number;
  mid: number;
  high: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cloneChannel(channel: ChannelState): ChannelState {
  return { volume: channel.volume, pan: channel.pan, eq: { ...channel.eq }, muted: channel.muted };
}

export class MixingConsoleEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private channels = new Map<string, ChannelNodes>();
  private listeners = new Set<Listener>();
  private driftTimer: number | null = null;

  private state: EngineState = {
    songId: MIXING_SONGS[0].id,
    playing: false,
    masterVolume: 0.9,
    soloId: null,
    channels: {},
    desynced: false,
  };

  constructor() {
    this.state = { ...this.state, channels: defaultChannelsFor(this.state.songId) };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): EngineState {
    return this.state;
  }

  private emit(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private emitChannel(instrumentId: string, channel: ChannelState): void {
    this.emit({ channels: { ...this.state.channels, [instrumentId]: channel } });
  }

  // Crea el AudioContext de forma perezosa. Debe invocarse siempre desde dentro de un gesto real
  // del usuario (onClick de play, de una perilla, etc.) para respetar la política de autoplay del
  // navegador -- mismo patrón de idea que `touchAudioContext` en guitarAudioEngine.ts, aunque este
  // motor no comparte código ni contexto con aquel.
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.state.masterVolume;
      master.connect(ctx.destination);
      this.master = master;
      this.buildChannelsForCurrentSong();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private effectiveGain(instrumentId: string, channel: ChannelState): number {
    if (this.state.soloId !== null && this.state.soloId !== instrumentId) return 0;
    if (channel.muted) return 0;
    return channel.volume;
  }

  private teardownChannels(): void {
    for (const nodes of this.channels.values()) {
      try {
        nodes.audio.pause();
      } catch {
        // ignore -- el elemento puede ya estar en un estado que no permite pausar
      }
      nodes.audio.src = '';
      nodes.source.disconnect();
      nodes.low.disconnect();
      nodes.mid.disconnect();
      nodes.high.disconnect();
      nodes.panner.disconnect();
      nodes.gain.disconnect();
    }
    this.channels.clear();
  }

  private buildChannelsForCurrentSong(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    this.teardownChannels();
    const song = MIXING_SONGS.find(s => s.id === this.state.songId);
    if (!song) return;

    for (const inst of song.instruments) {
      const audio = new Audio(trackUrl(song.id, inst.id));
      audio.preload = 'auto';

      // Cadena por canal: MediaElementSource -> EQ (low/mid/high) -> pan -> volumen de canal
      // (con mute/solo ya aplicados) -> bus máster -> destino. Ver NOTES.md.
      const source = ctx.createMediaElementSource(audio);
      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 200;
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1000;
      mid.Q.value = 0.8;
      const high = ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 5000;
      const panner = ctx.createStereoPanner();
      const gain = ctx.createGain();

      source.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(panner);
      panner.connect(gain);
      gain.connect(master);

      const channelState = this.state.channels[inst.id] ?? DEFAULT_CHANNEL;
      low.gain.value = channelState.eq.low;
      mid.gain.value = channelState.eq.mid;
      high.gain.value = channelState.eq.high;
      panner.pan.value = channelState.pan;
      gain.gain.value = this.effectiveGain(inst.id, channelState);

      this.channels.set(inst.id, { audio, source, low, mid, high, panner, gain });
    }
  }

  /** Llamar desde un gesto de usuario (p.ej. el primer click en el botón de abrir la mesa) para
   * "calentar" el AudioContext lo antes posible. No es estrictamente necesario porque play()
   * también lo hace, pero reduce la latencia del primer play(). */
  init(): void {
    this.ensureContext();
  }

  selectSong(songId: SongId): void {
    if (songId === this.state.songId) return;
    this.stopDriftCheck();
    // Decisión de diseño: los niveles (volumen/pan/EQ/mute/solo) se REINICIAN a los valores por
    // defecto al cambiar de canción, no se recuerdan por canción. Ver NOTES.md ("Persistencia de
    // niveles por canción") para la justificación. Este método en sí deja `playing: false` (los
    // <audio> antiguos se destruyen y los nuevos aún no han arrancado) -- es la capa de UI
    // (MixingConsole.tsx) la que llama a play() justo después, a petición del usuario, para que
    // elegir una canción la reproduzca de inmediato. Se mantiene separado aquí para que el motor
    // no asuma que selectSong() siempre ocurre dentro de un gesto de click.
    this.emit({ songId, playing: false, soloId: null, desynced: false, channels: defaultChannelsFor(songId) });
    if (this.ctx) this.buildChannelsForCurrentSong();
  }

  play(): void {
    this.ensureContext();
    for (const nodes of this.channels.values()) {
      nodes.audio.play().catch(() => {});
    }
    this.emit({ playing: true });
    this.startDriftCheck();
  }

  pause(): void {
    for (const nodes of this.channels.values()) {
      nodes.audio.pause();
    }
    this.emit({ playing: false });
    this.stopDriftCheck();
  }

  // Cada uno de los setters de abajo llama a ensureContext() antes de tocar los nodos: mover
  // cualquier control (perilla, fader, mute/solo) es en sí mismo un gesto real del usuario, así
  // que es un punto tan válido como play() para crear el AudioContext de forma perezosa -- esto
  // permite ajustar la mezcla antes de la primera reproducción, no solo durante ella.

  setMasterVolume(value: number): void {
    this.ensureContext();
    const clamped = clamp(value, VOLUME_MIN, VOLUME_MAX);
    if (this.master) this.master.gain.value = clamped;
    this.emit({ masterVolume: clamped });
  }

  setChannelVolume(instrumentId: string, value: number): void {
    this.ensureContext();
    const channel = this.state.channels[instrumentId];
    if (!channel) return;
    const next = { ...channel, volume: clamp(value, VOLUME_MIN, VOLUME_MAX) };
    const nodes = this.channels.get(instrumentId);
    if (nodes) nodes.gain.gain.value = this.effectiveGain(instrumentId, next);
    this.emitChannel(instrumentId, next);
  }

  setChannelPan(instrumentId: string, value: number): void {
    this.ensureContext();
    const channel = this.state.channels[instrumentId];
    if (!channel) return;
    const next = { ...channel, pan: clamp(value, PAN_MIN, PAN_MAX) };
    const nodes = this.channels.get(instrumentId);
    if (nodes) nodes.panner.pan.value = next.pan;
    this.emitChannel(instrumentId, next);
  }

  setChannelEQ(instrumentId: string, band: EQBand, value: number): void {
    this.ensureContext();
    const channel = this.state.channels[instrumentId];
    if (!channel) return;
    const clamped = clamp(value, EQ_MIN, EQ_MAX);
    const next = { ...channel, eq: { ...channel.eq, [band]: clamped } };
    const nodes = this.channels.get(instrumentId);
    if (nodes) nodes[band].gain.value = clamped;
    this.emitChannel(instrumentId, next);
  }

  toggleMute(instrumentId: string): void {
    this.ensureContext();
    const channel = this.state.channels[instrumentId];
    if (!channel) return;
    const next = { ...channel, muted: !channel.muted };
    const nodes = this.channels.get(instrumentId);
    if (nodes) nodes.gain.gain.value = this.effectiveGain(instrumentId, next);
    this.emitChannel(instrumentId, next);
  }

  // Solo es exclusivo por canción: si un instrumento entra en solo, todos los demás quedan
  // silenciados (sin tocar su propio flag de mute), igual que el patrón ya usado para las pistas
  // del multipista en AlphaTabPlayer.tsx (referencia de interacción, sin compartir código).
  toggleSolo(instrumentId: string): void {
    this.ensureContext();
    const nextSoloId = this.state.soloId === instrumentId ? null : instrumentId;
    const nextChannels: Record<string, ChannelState> = {};
    for (const [id, channel] of Object.entries(this.state.channels)) {
      nextChannels[id] = cloneChannel(channel);
      const nodes = this.channels.get(id);
      if (nodes) {
        const gain =
          nextSoloId !== null && nextSoloId !== id ? 0 : channel.muted ? 0 : channel.volume;
        nodes.gain.gain.value = gain;
      }
    }
    this.emit({ soloId: nextSoloId, channels: nextChannels });
  }

  // Comprobación periódica sencilla de desincronización (ver NOTES.md, "Sincronización entre
  // pistas"). Los <audio> son independientes y pueden derivar en reproducciones largas; cada
  // pocos segundos se compara su currentTime contra la primera pista de la canción actual (la
  // referencia) y se realinean las que se hayan separado más de DRIFT_THRESHOLD_SECONDS.
  private startDriftCheck(): void {
    this.stopDriftCheck();
    this.driftTimer = window.setInterval(() => {
      const nodesList = [...this.channels.values()];
      if (nodesList.length < 2) return;
      const reference = nodesList[0].audio.currentTime;
      let corrected = false;
      for (const nodes of nodesList.slice(1)) {
        if (nodes.audio.paused) continue;
        const drift = Math.abs(nodes.audio.currentTime - reference);
        if (drift > DRIFT_THRESHOLD_SECONDS) {
          nodes.audio.currentTime = reference;
          corrected = true;
        }
      }
      if (corrected !== this.state.desynced) this.emit({ desynced: corrected });
    }, DRIFT_CHECK_INTERVAL_MS);
  }

  private stopDriftCheck(): void {
    if (this.driftTimer !== null) {
      window.clearInterval(this.driftTimer);
      this.driftTimer = null;
    }
  }

  // Solo para verificación en Playwright (tests/mixing-console.spec.ts); no se usa en la UI de
  // producción. `new Audio()` crea elementos que nunca se insertan en el DOM, así que un test no
  // puede encontrarlos con document.querySelector -- esta instantánea de solo lectura expone los
  // valores REALES del grafo de Web Audio (si cada <audio> está en pausa, y el valor real de cada
  // AudioParam) para comprobar que mover un control produce un cambio real en el grafo, no solo en
  // el estado de React. Ver cómo se expone (gateado a NODE_ENV !== 'production') en
  // MixingConsole.tsx.
  getDebugSnapshot(): Record<string, ChannelDebugSnapshot> {
    const out: Record<string, ChannelDebugSnapshot> = {};
    for (const [id, nodes] of this.channels.entries()) {
      out[id] = {
        paused: nodes.audio.paused,
        gain: nodes.gain.gain.value,
        pan: nodes.panner.pan.value,
        low: nodes.low.gain.value,
        mid: nodes.mid.gain.value,
        high: nodes.high.gain.value,
      };
    }
    return out;
  }

  dispose(): void {
    this.stopDriftCheck();
    this.teardownChannels();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.master = null;
    this.listeners.clear();
  }
}

function defaultChannelsFor(songId: SongId): Record<string, ChannelState> {
  const song = MIXING_SONGS.find(s => s.id === songId);
  const out: Record<string, ChannelState> = {};
  if (!song) return out;
  for (const inst of song.instruments) {
    out[inst.id] = cloneChannel(DEFAULT_CHANNEL);
  }
  return out;
}
