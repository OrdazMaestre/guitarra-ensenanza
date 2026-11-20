// MESA DE PRUEBA DE SONIDO (usuario, 2026-11-19; puro, sin React ni audio). Valores por INSTRUMENTO, comunes a
// todas las canciones, en sus TRES volúmenes:
//   normal = cuando se toca o se acierta · fondo = cuando suena en la banda · fallo = cuando es tu instrumento
//   y aún no aciertas (o lo fallas)
// Cada uno con su volumen (0-2; 1 = el de hoy, así que por defecto nada cambia) y su EQ de 3 bandas en dB (la
// de la mesa de mezclas: low 200 Hz, mid 1 kHz, high 5 kHz). La batería, por PIEZAS. El dispositivo recuerda
// la última configuración (localStorage) y se puede exportar e importar en JSON. Con lo que salga de la prueba
// del usuario se fijarán los valores oficiales de toda la web (tab, MIDI y Riff-Hero).

export type MixTarget = 'guitar' | 'bass' | 'keys' | 'kick' | 'snare' | 'toms' | 'hihat' | 'crash';
export type MixContext = 'normal' | 'fondo' | 'fallo';
export type EqBand = 'low' | 'mid' | 'high';

export interface MixChannel {
  volume: number;
  eq: Record<EqBand, number>;
}
export type MixTargetSettings = Record<MixContext, MixChannel>;
export type MixSettings = Record<MixTarget, MixTargetSettings>;

export const MIX_TARGETS: MixTarget[] = ['guitar', 'bass', 'keys', 'kick', 'snare', 'toms', 'hihat', 'crash'];
export const MIX_CONTEXTS: MixContext[] = ['normal', 'fondo', 'fallo'];
export const DRUM_MIX_TARGETS: MixTarget[] = ['kick', 'snare', 'toms', 'hihat', 'crash'];

export const MIX_TARGET_LABELS: Record<MixTarget, string> = {
  guitar: 'Guitarra',
  bass: 'Bajo',
  keys: 'Teclado',
  kick: 'Bombo',
  snare: 'Caja',
  toms: 'Toms',
  hihat: 'Plato',
  crash: 'Plato fuerte',
};
export const MIX_CONTEXT_LABELS: Record<MixContext, string> = { normal: 'Normal', fondo: 'Fondo', fallo: 'Fallo' };

export const MIX_VOLUME_MAX = 2;
// Mismos topes que la mesa de mezclas (EQ_MIN_DB = −40 se muestra "−∞").
export const MIX_EQ_MIN_DB = -40;
export const MIX_EQ_MAX_DB = 12;

const STORAGE_KEY = 'mesa-sonido-v1';
const FILE_VERSION = 1;

const flatChannel = (): MixChannel => ({ volume: 1, eq: { low: 0, mid: 0, high: 0 } });
const flatTarget = (): MixTargetSettings => ({ normal: flatChannel(), fondo: flatChannel(), fallo: flatChannel() });
export function defaultMixSettings(): MixSettings {
  return Object.fromEntries(MIX_TARGETS.map((target) => [target, flatTarget()])) as MixSettings;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Un canal leído de fuera (guardado o importado): números válidos dentro de sus topes, o null.
function readChannel(raw: unknown): MixChannel | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { volume?: unknown; eq?: Record<string, unknown> };
  if (typeof r.volume !== 'number' || !Number.isFinite(r.volume) || !r.eq || typeof r.eq !== 'object') return null;
  const band = (name: EqBand) => (typeof r.eq?.[name] === 'number' && Number.isFinite(r.eq[name] as number) ? (r.eq[name] as number) : null);
  const low = band('low');
  const mid = band('mid');
  const high = band('high');
  if (low === null || mid === null || high === null) return null;
  return {
    volume: clamp(r.volume, 0, MIX_VOLUME_MAX),
    eq: { low: clamp(low, MIX_EQ_MIN_DB, MIX_EQ_MAX_DB), mid: clamp(mid, MIX_EQ_MIN_DB, MIX_EQ_MAX_DB), high: clamp(high, MIX_EQ_MIN_DB, MIX_EQ_MAX_DB) },
  };
}

function readTarget(raw: unknown): MixTargetSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: Partial<MixTargetSettings> = {};
  for (const context of MIX_CONTEXTS) {
    const channel = readChannel(r[context]);
    if (!channel) return null;
    out[context] = channel;
  }
  return out as MixTargetSettings;
}

// Los instrumentos válidos de un objeto { targets: { bass: {...}, ... } } (los que no lo son se ignoran).
function readTargets(raw: unknown): Partial<MixSettings> {
  const out: Partial<MixSettings> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const target of MIX_TARGETS) {
    const settings = readTarget((raw as Record<string, unknown>)[target]);
    if (settings) out[target] = settings;
  }
  return out;
}

// ---------- Store ----------
let settings: MixSettings = defaultMixSettings();
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) settings = { ...defaultMixSettings(), ...readTargets(JSON.parse(raw)?.targets) };
  } catch {
    // Sin almacenamiento o dato roto: los valores de hoy.
  }
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: FILE_VERSION, targets: settings }));
  } catch {
    // Sin almacenamiento: vale para esta visita.
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function getMixSettings(): MixSettings {
  load();
  return settings;
}

export function subscribeMix(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setMixVolume(target: MixTarget, context: MixContext, volume: number) {
  load();
  const channel = settings[target][context];
  settings = { ...settings, [target]: { ...settings[target], [context]: { ...channel, volume: clamp(volume, 0, MIX_VOLUME_MAX) } } };
  save();
  emit();
}

export function setMixEq(target: MixTarget, context: MixContext, band: EqBand, db: number) {
  load();
  const channel = settings[target][context];
  settings = { ...settings, [target]: { ...settings[target], [context]: { ...channel, eq: { ...channel.eq, [band]: clamp(db, MIX_EQ_MIN_DB, MIX_EQ_MAX_DB) } } } };
  save();
  emit();
}

// Vuelve a los valores de hoy los instrumentos dados.
export function resetMix(targets: MixTarget[]) {
  load();
  settings = { ...settings, ...Object.fromEntries(targets.map((target) => [target, flatTarget()])) };
  save();
  emit();
}

// JSON de los instrumentos dados (la batería, sus 5 piezas).
export function exportMix(targets: MixTarget[]): string {
  load();
  return JSON.stringify({ version: FILE_VERSION, targets: Object.fromEntries(targets.map((target) => [target, settings[target]])) }, null, 2);
}

// Aplica un JSON exportado: solo los instrumentos válidos que trae. Devuelve cuáles aplicó (vacío = archivo malo).
export function importMix(text: string): MixTarget[] {
  load();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || (parsed as { version?: unknown }).version !== FILE_VERSION) return [];
  const found = readTargets((parsed as { targets?: unknown }).targets);
  const targets = Object.keys(found) as MixTarget[];
  if (targets.length === 0) return [];
  settings = { ...settings, ...found };
  save();
  emit();
  return targets;
}

// El instrumento de mesa de cada pieza de la batería (pads de drums.ts) y de cada sonido de batería.
export function drumPadTarget(pad: number, pads: { KICK: number; SNARE: number; HIGH_TOM: number; LOW_TOM: number; CRASH: number }): MixTarget {
  if (pad === pads.KICK) return 'kick';
  if (pad === pads.SNARE) return 'snare';
  if (pad === pads.HIGH_TOM || pad === pads.LOW_TOM) return 'toms';
  if (pad === pads.CRASH) return 'crash';
  return 'hihat';
}
export function drumSoundTarget(sound: string): MixTarget {
  if (sound === 'kick') return 'kick';
  if (sound === 'snare') return 'snare';
  if (sound === 'tomLow' || sound === 'tomHigh') return 'toms';
  if (sound === 'crash') return 'crash';
  return 'hihat';
}
