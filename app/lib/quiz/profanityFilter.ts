// Blocklist simple en español para nombres del ranking. No pretende ser exhaustiva ni detectar
// ofuscaciones sofisticadas (leetspeak, espaciado letra-a-letra...) — es una web de niños con
// nombres provisionales cortos, el objetivo es filtrar lo obvio, no ganar una carrera armamentista.

// "zorrilla19" se coló (issue real reportado): la palabra base sí estaba pero no sus diminutivos.
// No hay stemming general aquí a propósito (demasiado riesgo de bloquear palabras inocentes por
// compartir raíz, ej. "perrita" de perro) — en su lugar se añaden a mano las variantes más obvias
// de cada palabra ya bloqueada (diminutivo/aumentativo/plural), igual de "no exhaustivo mejor que
// arriesgado" que el resto de la lista.
const BLOCKLIST = [
  // Insultos generales
  'puta', 'puto', 'putas', 'putos', 'putilla', 'putita', 'puton', 'putona',
  'mierda', 'mierdilla', 'mierdecilla', 'caca',
  'cabron', 'cabrona', 'cabronazo', 'cabroncito',
  'gilipollas', 'gilipollez', 'imbecil', 'idiota', 'estupido', 'estupida',
  'zorra', 'zorras', 'zorrilla', 'zorrillo', 'zorrita', 'zorron', 'zorrona',
  'perra', 'perras', 'perruzca',
  'maricon', 'marica',
  'joder', 'jodido', 'jodida',
  'nazi', 'hitler',

  // Anatomía / vulgarismos ligeros ya presentes — se toleran expresiones ambiguas tipo "guarra"
  // (inofensiva si no se piensa mal); el límite real está en la sección de abajo.
  'polla', 'pollas', 'coño', 'cono',
  'culo', 'culillo', 'teta', 'tetas',
  'follar', 'follon',
  'pene', 'vagina', 'sexo', 'porno',

  // Contenido sexual explícito / términos de búsqueda de pornografía. Esta es la categoría que
  // más importa filtrar bien: son palabras que solo tienen sentido como referencia directa a
  // contenido pornográfico concreto (no hay lectura inocente posible, a diferencia de "guarra"),
  // y son justo el tipo de cosa que un crío escribe de coña porque las ha visto en una búsqueda.
  //
  // NO están "anal" ni "oral" sueltas a propósito: como el filtro es substring (no palabra
  // completa), bloquearlas rompería un montón de palabras españolas normalísimas que las
  // contienen (canal, banal, analista, análisis / moral, coral, temporal, corporal, laboral...).
  // El coste de ese falso positivo es peor que dejar pasar esas dos sueltas — sin más contexto
  // ("sexo", "penetracion"...) tampoco son mucho más explícitas que "guarra".
  'felacion', 'felación', 'cunnilingus', 'penetracion', 'penetración',
  'masturbar', 'masturbacion', 'masturbación', 'paja', 'pajero', 'pajera',
  'eyacular', 'eyaculacion', 'eyaculación', 'correrse', 'corrida',
  'orgasmo', 'orgia', 'orgía', 'gangbang', 'bukkake',
  'squirt', 'squirting', 'fisting', 'bondage', 'sadomasoquismo', 'bdsm', 'dominatrix',
  'hentai', 'xxx', 'milf', 'creampie', 'deepthroat',
  'violacion', 'violación', 'violador', 'violar',
  'incesto', 'zoofilia', 'bestialismo', 'necrofilia',
  'pedofilia', 'pederasta', 'lolicon', 'shota',
  'prolapso', 'semen', 'esperma', 'clitoris', 'clítoris', 'escroto', 'verga',
];

/** Minúsculas, sin acentos, colapsa cualquier letra repetida >=3 veces seguidas a una sola (ej.
 * "puuuuta" -> "puta") para pillar el alargamiento típico de un niño escribiendo ("weeeey",
 * "nooooo"), sin necesitar una lista de variantes por palabra. A un solo carácter, no a dos: la
 * mayoría de palabrotas cortas de la lista (puta, caca, culo...) no repiten ninguna letra en su
 * forma normal, así que colapsar a dos ("puuuuta" -> "puuta") nunca las hace volver a coincidir —
 * era el bug real: antes de este cambio, "PUUUUTA" pasaba el filtro. */
export function normalizeForFilter(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(.)\1{2,}/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function containsProfanity(name: string): boolean {
  const normalized = normalizeForFilter(name);
  return BLOCKLIST.some((word) => normalized.includes(word));
}
