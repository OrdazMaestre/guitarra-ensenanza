import { ALL_QUESTIONS } from './engine';
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
const TOP_N_GLOBAL = 20;

function isGlobalMode(mode: QuizMode): boolean {
  return mode === 'mini-torneo' || mode === 'campeonato';
}

export function rankingKey(mode: QuizMode, topic?: QuizTopic): string {
  if (isGlobalMode(mode)) return `ranking:${mode}`;
  if (!topic) throw new Error(`rankingKey: falta topic para el modo "${mode}"`);
  return `ranking:${mode}:${topic}`;
}

export function topNFor(mode: QuizMode): number {
  return isGlobalMode(mode) ? TOP_N_GLOBAL : TOP_N_BY_TOPIC;
}

function scoreFor(puntos: number, tiempoSeg: number): number {
  return puntos * 100000 - tiempoSeg;
}

// Campeonato incluye SIEMPRE todas las preguntas del tema en alcance (nunca una muestra al azar,
// a diferencia de mini-torneo), así que su recuento total SÍ se puede calcular exacto en vez de
// aproximar: para cada pregunta, 2 apariciones si tiene CUALQUIER variable (>=1, no >=2 -- ver el
// comentario largo en allEntriesWithOccurrences() de engine.ts, MISMO umbral, tiene que
// coincidir exacto o el fantasma del ranking vuelve a quedar incoherente con el total real, que
// es justo el bug que esto arregla), 4 fijo para 9.2.1 (la excepción explícita del banco) -- sin
// depender del azar de qué temas concretos se vieron (se calcula sobre TODO el banco, el caso
// "campeonato completo" desde la última lección).
function fullCampeonatoQuestionCount(): number {
  return ALL_QUESTIONS.reduce((sum, entry) => {
    if (entry.id === '9.2.1') return sum + 4;
    return sum + (entry.variables.length >= 1 ? 2 : 1);
  }, 0);
}

// Recuento "típico" de preguntas por modo, usado solo para calcular la puntuación de los perfiles
// fantasma (ver GHOST_PROFILES) -- no hace falta que sea exacto en todos los casos (facil/dificil/
// mini-torneo pueden variar un poco por el relleno de temas anteriores o por si 9.2.1 entra en la
// selección), son los objetivos fijos de cada modo (meta.reglas_generales en questionBank.json).
function canonicalQuestionCount(mode: QuizMode): number {
  if (mode === 'facil') return 4;
  if (mode === 'dificil') return 6;
  if (mode === 'mini-torneo') return 10;
  return fullCampeonatoQuestionCount();
}

// Perfiles falsos permanentes que aparecen en TODOS los rankings (todo modo×tema, mini-torneo y
// campeonato) hasta que un jugador real los supera y los saca del top -- ver ensureGhostsSeeded().
// Encargo explícito del usuario: ZOTE = mitad de la puntuación de bronce sin bonus de tiempo (no
// llega a ninguna insignia); PAUL = mínimo de bronce; ORDAZ = mínimo de plata; MAIkael = máximo
// posible (oro). PAUL (por Paul McCartney) sustituye a un HORNET original -- dos guiños a Hollow
// Knight (ZOTE+HORNET) saturaban el ranking, así que este es un guiño musical (The Beatles) en su
// lugar, ya que los otros tres perfiles no son referencias a Hollow Knight. El "tiempo por
// respuesta" de cada uno es solo el tiempoSeg que se les asigna para mostrar en el ranking -- no se
// recalculan los puntos a partir de ese tiempo con la fórmula real de bonus (por eso ORDAZ a
// 10s/pregunta o MAIkael a 5s/pregunta no "cuadran" con el bonus real: son perfiles con puntuación
// fija, el tiempo es solo el dato que se les asigna para mostrar).
const GHOST_PROFILES: { computeStats: (q: number) => { puntos: number; tiempoSeg: number }; nombre: string }[] = [
  { nombre: 'ZOTE', computeStats: (q) => ({ puntos: Math.floor(q / 2), tiempoSeg: 45 * q }) },
  { nombre: 'PAUL', computeStats: (q) => ({ puntos: q, tiempoSeg: 15 * q }) },
  { nombre: 'ORDAZ', computeStats: (q) => ({ puntos: 2 * q, tiempoSeg: 10 * q }) },
  { nombre: 'MAIkael', computeStats: (q) => ({ puntos: 3 * q, tiempoSeg: 5 * q }) },
];

/**
 * Siembra los 4 perfiles fantasma SOLO si el ranking está completamente vacío (ZCARD === 0) --
 * "permanentes mientras no sean superados": una vez que suficientes jugadores reales los superan y
 * el recorte a top N los saca del set (ZREMRANGEBYRANK, igual que a cualquier entrada real), no se
 * vuelven a sembrar en la siguiente lectura. Los ids son fijos (`ghost-zote`, etc.) y el JSON de
 * cada miembro se construye siempre igual, así que volver a llamar a esto sobre un ranking que ya
 * los tiene (card > 0) es un no-op seguro sin duplicarlos.
 */
async function ensureGhostsSeeded(key: string, mode: QuizMode): Promise<void> {
  const card = Number(await upstashCommand('ZCARD', key));
  if (card > 0) return;

  const totalQuestions = canonicalQuestionCount(mode);
  for (const ghost of GHOST_PROFILES) {
    const { puntos, tiempoSeg } = ghost.computeStats(totalQuestions);
    const entry: RankingEntry = {
      id: `ghost-${ghost.nombre.toLowerCase()}`,
      nombre: ghost.nombre,
      puntos,
      tiempoSeg,
      totalQuestions,
    };
    await upstashCommand('ZADD', key, scoreFor(puntos, tiempoSeg), JSON.stringify(entry));
  }
}

/**
 * Inserta un resultado y recorta al top N (10 por modo×tema, 20 en mini-torneo/campeonato).
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
export async function insertScore(mode: QuizMode, topic: QuizTopic | undefined, nombre: string, puntos: number, tiempoSeg: number, totalQuestions: number): Promise<RankingEntry> {
  const key = rankingKey(mode, topic);
  await ensureGhostsSeeded(key, mode);

  const limit = topNFor(mode);
  const entry: RankingEntry = { id: crypto.randomUUID(), nombre, puntos, tiempoSeg, totalQuestions };

  await upstashCommand('ZADD', key, scoreFor(puntos, tiempoSeg), JSON.stringify(entry));
  const card = Number(await upstashCommand('ZCARD', key));
  if (card > limit) {
    await upstashCommand('ZREMRANGEBYRANK', key, 0, card - limit - 1);
  }

  return entry;
}

export async function getTop(mode: QuizMode, topic: QuizTopic | undefined, limit: number = topNFor(mode)): Promise<RankingEntry[]> {
  const key = rankingKey(mode, topic);
  await ensureGhostsSeeded(key, mode);

  const raw = (await upstashCommand('ZREVRANGE', key, 0, limit - 1)) as string[] | null;
  if (!raw) return [];
  return raw.map((member) => JSON.parse(member) as RankingEntry);
}
