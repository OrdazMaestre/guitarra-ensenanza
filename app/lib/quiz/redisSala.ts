import { generateRoomCode } from './salaCodigo';
import { upstashCommand } from '../upstash';
import type { QuizMode, RuntimeQuestion } from './types';

// Esquema de claves (ver plan): el estado de CONTROL (un solo escritor, el anfitrión) va en un
// Hash normal; los datos POR JUGADOR usan estructuras donde cada escritura toca un único campo/
// miembro (HSET de un campo propio, HSETNX, ZINCRBY) para que dos jugadores uniéndose o
// respondiendo a la vez nunca se pisen entre sí -- nunca se lee el estado entero para modificarlo
// y reescribirlo completo.
const SALA_TTL_SECONDS = 6 * 60 * 60; // 6h, de sobra para una clase; las salas abandonadas expiran solas.
const MAX_CODE_ATTEMPTS = 5;

export type SalaEstado = 'lobby' | 'jugando' | 'terminada';
export type SalaAccion = 'empezar' | 'revelar' | 'siguiente' | 'terminar';

// Umbrales fijos del modo sala (encargo explícito del usuario): el botón "Revelar" del anfitrión
// solo se activa cuando TODOS han contestado Y han pasado >=30s desde que empezó la pregunta;
// pase lo que pase, a los 60s se revela sola. Tras revelar, "Siguiente" se puede pulsar en
// cualquier momento, pero a los 10s de revelada se avanza sola si el anfitrión no lo hace.
export const SALA_REVELAR_MIN_SEGUNDOS = 30;
export const SALA_REVELAR_MAX_SEGUNDOS = 60;
export const SALA_AUTO_SIGUIENTE_SEGUNDOS = 10;

export interface SalaControl {
  anfitrionToken: string;
  estado: SalaEstado;
  indice: number;
  modo: QuizMode;
  preguntaInicioMs: number;
  revelada: boolean;
  reveladaEnMs: number;
  totalPreguntas: number;
}

export interface SalaJugador {
  id: string;
  nombre: string;
}

export interface SalaRespuesta {
  correcta: boolean;
  opcionIndex: number;
  orden: number;
  puntos: number;
}

function controlKey(codigo: string): string {
  return `sala:${codigo}:control`;
}
function preguntasKey(codigo: string): string {
  return `sala:${codigo}:preguntas`;
}
function jugadoresKey(codigo: string): string {
  return `sala:${codigo}:jugadores`;
}
function puntuacionesKey(codigo: string): string {
  return `sala:${codigo}:puntuaciones`;
}
function respuestasKey(codigo: string, indice: number): string {
  return `sala:${codigo}:respuestas:${indice}`;
}
/** Contador atómico (INCR) del orden de llegada de las respuestas de una pregunta -- ver
 * registrarRespuesta(). Se necesita una clave aparte porque HSETNX (para bloquear el doble envío)
 * no puede devolver "cuantas hay ya" de forma atómica junto con la propia escritura. */
function ordenRespuestasKey(codigo: string, indice: number): string {
  return `sala:${codigo}:orden:${indice}`;
}

/** Upstash REST devuelve HGETALL como array plano [campo1, valor1, campo2, valor2...]. */
function flatArrayToObject(flat: unknown): Record<string, string> {
  const arr = Array.isArray(flat) ? (flat as string[]) : [];
  const obj: Record<string, string> = {};
  for (let i = 0; i < arr.length; i += 2) obj[arr[i]] = arr[i + 1];
  return obj;
}

function controlFromHash(hash: Record<string, string>): SalaControl {
  return {
    anfitrionToken: hash.anfitrionToken ?? '',
    estado: (hash.estado as SalaEstado) ?? 'lobby',
    indice: Number(hash.indice ?? -1),
    modo: (hash.modo as QuizMode) ?? 'facil',
    preguntaInicioMs: Number(hash.preguntaInicioMs ?? 0),
    revelada: hash.revelada === '1',
    reveladaEnMs: Number(hash.reveladaEnMs ?? 0),
    totalPreguntas: Number(hash.totalPreguntas ?? 0),
  };
}

/**
 * Crea la sala: genera un código libre (reintenta ante colisión, improbable con ~24M
 * combinaciones), guarda las preguntas YA GENERADAS (una sola vez, para que todos los jugadores
 * vean exactamente las mismas -- nunca se regeneran por jugador) y el estado de control inicial.
 */
export async function crearSala(modo: QuizMode, questions: RuntimeQuestion[]): Promise<{ anfitrionToken: string; codigo: string }> {
  let codigo = '';
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const candidate = generateRoomCode();
    const exists = await upstashCommand('EXISTS', controlKey(candidate));
    if (Number(exists) === 0) {
      codigo = candidate;
      break;
    }
  }
  if (!codigo) throw new Error('No se pudo generar un código de sala libre');

  const anfitrionToken = crypto.randomUUID();
  await upstashCommand(
    'HSET',
    controlKey(codigo),
    'estado', 'lobby',
    'modo', modo,
    'indice', -1,
    'revelada', '0',
    'preguntaInicioMs', 0,
    'reveladaEnMs', 0,
    'anfitrionToken', anfitrionToken,
    'totalPreguntas', questions.length,
  );
  await upstashCommand('EXPIRE', controlKey(codigo), SALA_TTL_SECONDS);
  await upstashCommand('SET', preguntasKey(codigo), JSON.stringify(questions));
  await upstashCommand('EXPIRE', preguntasKey(codigo), SALA_TTL_SECONDS);

  return { anfitrionToken, codigo };
}

export async function getControl(codigo: string): Promise<SalaControl | null> {
  const raw = await upstashCommand('HGETALL', controlKey(codigo));
  const hash = flatArrayToObject(raw);
  if (!hash.estado) return null;
  return controlFromHash(hash);
}

export async function getPreguntas(codigo: string): Promise<RuntimeQuestion[] | null> {
  const raw = await upstashCommand('GET', preguntasKey(codigo));
  if (typeof raw !== 'string') return null;
  return JSON.parse(raw) as RuntimeQuestion[];
}

/** Alta de un jugador nuevo. Dos altas simultáneas nunca chocan: cada una escribe un campo propio
 * (el `jugadorId`) del mismo Hash, y arranca la puntuación con ZADD (no ZINCRBY, es la primera vez). */
export async function unirseSala(codigo: string, nombre: string): Promise<string> {
  const jugadorId = crypto.randomUUID();
  await upstashCommand('HSET', jugadoresKey(codigo), jugadorId, nombre);
  await upstashCommand('EXPIRE', jugadoresKey(codigo), SALA_TTL_SECONDS);
  await upstashCommand('ZADD', puntuacionesKey(codigo), 0, jugadorId);
  await upstashCommand('EXPIRE', puntuacionesKey(codigo), SALA_TTL_SECONDS);
  return jugadorId;
}

export async function getJugadores(codigo: string): Promise<SalaJugador[]> {
  const raw = await upstashCommand('HGETALL', jugadoresKey(codigo));
  const hash = flatArrayToObject(raw);
  return Object.entries(hash).map(([id, nombre]) => ({ id, nombre }));
}

/** Marcador ordenado de mayor a menor puntuación. */
export async function getMarcador(codigo: string): Promise<{ id: string; nombre: string; puntos: number }[]> {
  const [scoresRaw, jugadores] = await Promise.all([
    upstashCommand('ZREVRANGE', puntuacionesKey(codigo), 0, -1, 'WITHSCORES'),
    getJugadores(codigo),
  ]);
  const nombreById = new Map(jugadores.map((j) => [j.id, j.nombre]));
  const arr = Array.isArray(scoresRaw) ? (scoresRaw as string[]) : [];
  const marcador: { id: string; nombre: string; puntos: number }[] = [];
  for (let i = 0; i < arr.length; i += 2) {
    const id = arr[i];
    marcador.push({ id, nombre: nombreById.get(id) ?? '???', puntos: Number(arr[i + 1]) });
  }
  return marcador;
}

function segundosDesde(ms: number): number {
  if (!ms) return Infinity;
  return (Date.now() - ms) / 1000;
}

/** true si el anfitrión ya puede pulsar "Revelar respuesta": todos los jugadores de la sala han
 * contestado la pregunta actual Y han pasado >=30s desde que empezó -- pasados los 60s se revela
 * sola de todas formas (ver autoAvanzarSiToca), así que esta función nunca necesita mirar el
 * límite superior. */
export function puedeRevelarAhora(control: SalaControl, respondieron: number, totalJugadores: number): boolean {
  return totalJugadores > 0 && respondieron >= totalJugadores && segundosDesde(control.preguntaInicioMs) >= SALA_REVELAR_MIN_SEGUNDOS;
}

/** Solo el anfitrión llama a esto (el endpoint ya verifica el token antes, y para 'revelar'
 * también las condiciones de puedeRevelarAhora -- ver el route handler). `empezar`/`siguiente`
 * fijan `preguntaInicioMs` = AHORA, el reloj compartido contra el que se mide la rapidez de
 * TODOS los jugadores (nunca el reloj de cada navegador), y resetean `reveladaEnMs` a 0 porque la
 * pregunta nueva todavía no está revelada. */
export async function avanzarSala(codigo: string, accion: SalaAccion): Promise<SalaControl | null> {
  const control = await getControl(codigo);
  if (!control) return null;

  if (accion === 'empezar' || accion === 'siguiente') {
    const nextIndex = accion === 'empezar' ? 0 : control.indice + 1;
    if (nextIndex >= control.totalPreguntas) {
      await upstashCommand('HSET', controlKey(codigo), 'estado', 'terminada');
    } else {
      await upstashCommand(
        'HSET', controlKey(codigo),
        'estado', 'jugando',
        'indice', nextIndex,
        'revelada', '0',
        'preguntaInicioMs', Date.now(),
        'reveladaEnMs', 0,
      );
    }
  } else if (accion === 'revelar') {
    await upstashCommand('HSET', controlKey(codigo), 'revelada', '1', 'reveladaEnMs', Date.now());
  } else if (accion === 'terminar') {
    await upstashCommand('HSET', controlKey(codigo), 'estado', 'terminada');
  }

  return getControl(codigo);
}

/**
 * Avances por tiempo que NO dependen de que el anfitrión pulse nada: se llama en cada sondeo de
 * /api/quiz/sala/estado (de cualquiera, anfitrión o jugador), así que dispara puntualmente sin
 * importar si la pestaña del anfitrión sigue abierta. Dos disparos casi simultáneos (dos personas
 * sondeando a la vez) son inofensivos: ambos escriben el mismo valor final (HSET no es un
 * contador), así que no hace falta ningún lock.
 * - >=60s sin revelar -> revela sola, salte lo que salte (bypassa puedeRevelarAhora a propósito).
 * - >=10s desde que se reveló -> avanza sola a la siguiente pregunta (o termina si era la última).
 */
export async function autoAvanzarSiToca(codigo: string): Promise<SalaControl | null> {
  let control = await getControl(codigo);
  if (!control || control.estado !== 'jugando') return control;

  if (!control.revelada && segundosDesde(control.preguntaInicioMs) >= SALA_REVELAR_MAX_SEGUNDOS) {
    await upstashCommand('HSET', controlKey(codigo), 'revelada', '1', 'reveladaEnMs', Date.now());
    control = await getControl(codigo);
    if (!control) return null;
  }

  if (control.revelada && segundosDesde(control.reveladaEnMs) >= SALA_AUTO_SIGUIENTE_SEGUNDOS) {
    return avanzarSala(codigo, 'siguiente');
  }

  return control;
}

/**
 * Registra la respuesta de un jugador a una pregunta concreta. HSETNX es atómico y "set-si-no-
 * existe": si el jugador ya había respondido esa pregunta, devuelve false SIN escribir nada y sin
 * necesidad de leer antes -- así se resuelve el doble-clic/doble-envío de raíz, sin condición de
 * carrera posible entre dos peticiones casi simultáneas del mismo jugador. El `orden` (para la
 * lista en vivo de "quién ha contestado ya") viene de un INCR aparte, atómico y sin colisiones
 * aunque dos jugadores respondan en el mismo instante -- si luego el HSETNX falla (ya había
 * respondido), ese número de orden simplemente se pierde, no pasa nada porque no necesita ser
 * consecutivo, solo estrictamente creciente por orden real de llegada.
 */
export async function registrarRespuesta(codigo: string, indice: number, jugadorId: string, respuestaSinOrden: Omit<SalaRespuesta, 'orden'>): Promise<boolean> {
  const orden = Number(await upstashCommand('INCR', ordenRespuestasKey(codigo, indice)));
  await upstashCommand('EXPIRE', ordenRespuestasKey(codigo, indice), SALA_TTL_SECONDS);
  const respuesta: SalaRespuesta = { ...respuestaSinOrden, orden };
  const wasSet = await upstashCommand('HSETNX', respuestasKey(codigo, indice), jugadorId, JSON.stringify(respuesta));
  if (Number(wasSet) === 0) return false;
  await upstashCommand('EXPIRE', respuestasKey(codigo, indice), SALA_TTL_SECONDS);
  if (respuesta.puntos > 0) await upstashCommand('ZINCRBY', puntuacionesKey(codigo), respuesta.puntos, jugadorId);
  return true;
}

export async function getRespuesta(codigo: string, indice: number, jugadorId: string): Promise<SalaRespuesta | null> {
  const raw = await upstashCommand('HGET', respuestasKey(codigo, indice), jugadorId);
  if (typeof raw !== 'string') return null;
  return JSON.parse(raw) as SalaRespuesta;
}

/** Todas las respuestas de una pregunta, por jugador -- usado para la lista en vivo de "quién ha
 * contestado ya" (necesita el `orden` de cada uno, no solo el recuento de contarRespuestas). */
export async function getRespuestas(codigo: string, indice: number): Promise<Record<string, SalaRespuesta>> {
  const raw = await upstashCommand('HGETALL', respuestasKey(codigo, indice));
  const hash = flatArrayToObject(raw);
  const result: Record<string, SalaRespuesta> = {};
  for (const [jugadorId, json] of Object.entries(hash)) result[jugadorId] = JSON.parse(json) as SalaRespuesta;
  return result;
}

export async function contarRespuestas(codigo: string, indice: number): Promise<number> {
  const count = await upstashCommand('HLEN', respuestasKey(codigo, indice));
  return Number(count ?? 0);
}
