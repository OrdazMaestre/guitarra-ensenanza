import { upstashCommand } from '../upstash';
import type { QuizMode } from './types';
import type { QuizTopic } from '../../lecciones/temario/quizTemarioMap';

export interface RankingEntry {
  id: string;
  nombre: string;
  puntos: number;
  tiempoSeg: number;
  totalQuestions: number;
}

const TOP_N_BY_TOPIC = 10;
const TOP_N_TORNEO = 20;

// TODOS los modos van por tema (incluye mini-torneo/campeonato desde este arreglo -- antes
// compartían UNA clave global sin tema, así que un campeonato de 10 preguntas desde una lección
// temprana y uno de 79 desde el temario completo acababan compitiendo en el mismo ranking: mismo
// bug de fondo que ya afectó a los fantasmas, ver ghostEntriesFor, pero aquí con jugadores reales
// -- "tomaYA!" de un campeonato del último tema apareciendo en el campeonato del primero, reportado
// por el usuario). El punto de entrada (topic) es la unidad natural de comparación: dos campeonatos
// desde el MISMO punto de entrada sí tienen sentido en el mismo ranking porque siempre cubren
// exactamente el mismo temario, por eso rankingKey ahora exige `topic` siempre, sin excepción.
export function rankingKey(mode: QuizMode, topic: QuizTopic): string {
  return `ranking:${mode}:${topic}`;
}

export function topNFor(mode: QuizMode): number {
  return mode === 'mini-torneo' || mode === 'campeonato' ? TOP_N_TORNEO : TOP_N_BY_TOPIC;
}

function scoreFor(puntos: number, tiempoSeg: number): number {
  return puntos * 100000 - tiempoSeg;
}

// Perfiles falsos que compiten en TODOS los rankings (todo modo×tema, mini-torneo y campeonato, Y
// en el marcador de cada sala multijugador -- ver seedGhostsEnSala() en redisSala.ts, que reusa
// exactamente este mismo array) -- SIEMPRE presentes, nunca hace falta "sembrarlos": ver
// ghostEntriesFor() y por qué NO se guardan en Redis. Encargo explícito del usuario, expresado
// como un PERFIL de acierto/velocidad (no como una puntuación fija), para que tenga sentido sea
// cual sea el número de preguntas del test que se está mirando: ZOTE = 50% de aciertos a 45s/
// respuesta (no llega a ninguna insignia); PAUL = 100% de aciertos a 15s/respuesta (sin bonus de
// rapidez -> mínimo de bronce); ORDAZ = 100% a 10s/respuesta (bonus +1 -> mínimo de plata); MAIkael
// = 100% a 5s/respuesta (bonus +2 -> máximo posible, oro). PAUL (por Paul McCartney) sustituye a un
// HORNET original -- dos guiños a Hollow Knight (ZOTE+HORNET) saturaban el ranking, así que este es
// un guiño musical (The Beatles) en su lugar, ya que los otros tres perfiles no son referencias a
// Hollow Knight.
export const GHOST_PROFILES: { computeStats: (q: number) => { puntos: number; tiempoSeg: number }; nombre: string }[] = [
  { nombre: 'ZOTE', computeStats: (q) => ({ puntos: Math.floor(q / 2), tiempoSeg: 45 * q }) },
  { nombre: 'PAUL', computeStats: (q) => ({ puntos: q, tiempoSeg: 15 * q }) },
  { nombre: 'ORDAZ', computeStats: (q) => ({ puntos: 2 * q, tiempoSeg: 10 * q }) },
  { nombre: 'MAIkael', computeStats: (q) => ({ puntos: 3 * q, tiempoSeg: 5 * q }) },
];

/**
 * Los 4 fantasmas, calculados AL VUELO para `totalQuestions` -- nunca se persisten en Redis (a
 * diferencia de un intento anterior que los "sembraba" una sola vez por clave con ZADD). Ese
 * enfoque tenía dos bugs reales: (1) mini-torneo/campeonato usan una clave GLOBAL sin tema
 * (rankingKey), así que un campeonato de 10 preguntas desde una lección temprana y uno de 79 desde
 * el temario completo comparten ranking -- los fantasmas, sembrados una única vez con un "total
 * canónico" fijo, quedaban con una escala completamente ajena a la partida real que se estaba
 * mirando (puntuaciones como "231 pts" para un test de 10 preguntas); (2) al recortar al top N
 * (ZREMRANGEBYRANK en insertScore) los fantasmas son entradas más en el set y pueden acabar
 * recortados como cualquier otra, así que con el tiempo podían desaparecer 1 a 1 sin volver a
 * sembrarse nunca (el bug real de "solo queda ZOTE en el ranking"). Calculándolos aquí, en cada
 * lectura, con el `totalQuestions` de quien está mirando el ranking AHORA MISMO, los 4 aparecen
 * siempre y con una escala que tiene sentido para esa partida.
 */
function ghostEntriesFor(totalQuestions: number): RankingEntry[] {
  return GHOST_PROFILES.map((ghost) => {
    const { puntos, tiempoSeg } = ghost.computeStats(totalQuestions);
    return { id: `ghost-${ghost.nombre.toLowerCase()}`, nombre: ghost.nombre, puntos, tiempoSeg, totalQuestions };
  });
}

/**
 * Inserta un resultado y recorta al top N (10 por modo×tema, 20 en mini-torneo/campeonato) --
 * SOLO cuenta entradas reales, los fantasmas nunca se guardan aquí (ver ghostEntriesFor).
 * Redis Sorted Set: score = puntos*100000 - tiempoSeg, así que a igualdad de puntos gana quien
 * tuvo menos tiempo (score más alto = mejor puesto). El multiplicador deja margen de sobra frente
 * a cualquier tiempoSeg realista (nunca se acerca a 100000) para que el tiempo nunca "se coma" un
 * punto entero.
 *
 * El recorte comprueba primero ZCARD y solo llama a ZREMRANGEBYRANK cuando de verdad hay más de N
 * miembros, calculando el stop como índice NO negativo (`card - limit - 1`) en vez de confiar en
 * el índice negativo `-(limit+1)` -- con pocos miembros ese índice negativo puede clampear a 0 y
 * borrar una entrada real por error.
 */
export async function insertScore(mode: QuizMode, topic: QuizTopic, nombre: string, puntos: number, tiempoSeg: number, totalQuestions: number): Promise<RankingEntry> {
  const key = rankingKey(mode, topic);

  const limit = topNFor(mode);
  const entry: RankingEntry = { id: crypto.randomUUID(), nombre, puntos, tiempoSeg, totalQuestions };

  await upstashCommand('ZADD', key, scoreFor(puntos, tiempoSeg), JSON.stringify(entry));
  const card = Number(await upstashCommand('ZCARD', key));
  if (card > limit) {
    await upstashCommand('ZREMRANGEBYRANK', key, 0, card - limit - 1);
  }

  return entry;
}

/**
 * Top del ranking, con los 4 fantasmas mezclados dentro (a su escala correcta para
 * `totalQuestions`, la partida que se está mirando ahora) y recortado al `limit` final -- así un
 * fantasma sigue "hasta que lo superan" (suficientes entradas reales por encima lo sacan del
 * recorte), pero sin persistirlo nunca ni arriesgarse a que el recorte de insertScore() se lo lleve
 * por delante sin volver a aparecer.
 */
export async function getTop(mode: QuizMode, topic: QuizTopic, totalQuestions: number, limit: number = topNFor(mode)): Promise<RankingEntry[]> {
  const key = rankingKey(mode, topic);
  const raw = (await upstashCommand('ZREVRANGE', key, 0, -1)) as string[] | null;
  const reales = (raw ?? []).map((member) => JSON.parse(member) as RankingEntry);

  const combinado = [...reales, ...ghostEntriesFor(totalQuestions)];
  combinado.sort((a, b) => scoreFor(b.puntos, b.tiempoSeg) - scoreFor(a.puntos, a.tiempoSeg));
  return combinado.slice(0, limit);
}
