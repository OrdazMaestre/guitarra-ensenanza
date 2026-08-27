export type MaikaelTransientFace = 'analizando' | 'dibujando' | 'fuera-tema' | null;
export type MaikaelBodyState = 'idle' | 'guitar';
export type MaikaelFace =
  | 'normal'
  | 'analizando'
  | 'dibujando'
  | 'fuera-tema'
  | 'sensible'
  | 'tocando';

/** minúsculas + sin acentos, para comparar texto sin depender de mayúsculas/tildes. */
export function normalizeEs(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Frases que MAIkael debe decir literalmente en el prompt (Fase 4) para que esta
// detección por texto sea fiable — si el modelo las parafrasea, no disparan.
export const SENSITIVE_TRIGGER_PHRASE = normalizeEs('la música es medicina para el alma');
// El prompt le pide a MAIkael la frase completa "eso no lo tengo en mis
// circuitos", pero en pruebas reales a veces varía el arranque ("ese dato no
// lo tengo...", "esto no lo tengo..."). Se detecta solo el núcleo invariante
// —lo bastante específico para no dar falsos positivos en una respuesta
// normal de música— en vez de exigir la frase completa exacta.
export const OFF_TOPIC_TRIGGER_PHRASE = normalizeEs('no lo tengo en mis circuitos');

// Lista de la Fase 1.5: palabras/frases que indican que el alumno volvió a un
// tema normal de música/guitarra, para apagar la expresión sensible.
const SINGLE_WORD_RESET_KEYWORDS = [
  // Lecciones y práctica
  'lección', 'lecciones', 'ejercicio', 'ejercicios', 'práctica', 'practicar', 'deberes',
  'tarea', 'repaso', 'repasar', 'calentamiento', 'tutorial',
  // Técnica de tocar
  'digitación', 'postura', 'pulsación', 'punteo', 'rasgueo', 'técnica', 'cejilla', 'capo',
  'afinar', 'afinación', 'trastes', 'encordar',
  // Teoría y notación
  'acorde', 'acordes', 'escala', 'escalas', 'tablatura', 'tab', 'partitura', 'notación',
  'cifrado', 'intervalo', 'arpegio', 'compás', 'ritmo', 'solfeo',
  // Dibujos y esquemas
  'dibuja', 'dibújame', 'esquema', 'diagrama', 'gráfico', 'muéstrame', 'ilustra',
  // Equipo y sonido técnico
  'amplificador', 'pedal', 'efectos', 'ecualización', 'ganancia', 'configurar', 'ajustar',
  'cable', 'pastilla', 'pastillas', 'decibelios', 'frecuencia', 'hercios', 'armónicos',
];

const MULTI_WORD_RESET_KEYWORDS = [
  'aprender a tocar',
  'cómo se toca',
  'cómo se hace',
  'paso a paso',
  'cambiar cuerdas',
  'clave de sol',
  'enséñame cómo es',
  'ondas sonoras',
];

// Plurales irregulares que la regla genérica (vocal final → +s, consonante final → +es)
// no acertaría. El acento del resultado no importa: normalizeEs lo quita de todas formas.
const IRREGULAR_PLURALS: Record<string, string> = {
  compás: 'compases',
};

function pluralOf(word: string): string {
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word];
  const lastChar = word.slice(-1);
  return /[aeiouáéíóú]/i.test(lastChar) ? `${word}s` : `${word}es`;
}

// Pluralizar también las palabras que ya están en plural en la lista de arriba (p. ej.
// "lecciones") produce una forma extra sin sentido ("leccioneses"), pero es inofensivo:
// nunca hará match con nada real, así que no hace falta filtrarlas antes.
const RESET_KEYWORDS_NORMALIZED: ReadonlySet<string> = new Set(
  SINGLE_WORD_RESET_KEYWORDS.flatMap((word) => [normalizeEs(word), normalizeEs(pluralOf(word))])
);

const RESET_PHRASES_NORMALIZED = MULTI_WORD_RESET_KEYWORDS.map(normalizeEs);

/** ¿El mensaje del alumno indica que volvió a un tema normal de música/guitarra? */
export function containsResetKeyword(message: string): boolean {
  const normalized = normalizeEs(message);
  if (RESET_PHRASES_NORMALIZED.some((phrase) => normalized.includes(phrase))) {
    return true;
  }
  const tokens = new Set(normalized.split(/[^a-z]+/).filter(Boolean));
  for (const keyword of RESET_KEYWORDS_NORMALIZED) {
    if (tokens.has(keyword)) return true;
  }
  return false;
}

export function containsSvgBlock(text: string): boolean {
  return /<svg[\s>]/i.test(text);
}

/**
 * A partir del texto de una respuesta de MAIkael, decide si dispara la expresión
 * sensible (prioridad máxima, se gestiona aparte como "sticky") o una cara transitoria.
 */
export function detectFaceFromReply(replyText: string): {
  transientFace: MaikaelTransientFace;
  triggersSensitive: boolean;
} {
  const normalized = normalizeEs(replyText);
  if (normalized.includes(SENSITIVE_TRIGGER_PHRASE)) {
    return { transientFace: null, triggersSensitive: true };
  }
  if (normalized.includes(OFF_TOPIC_TRIGGER_PHRASE)) {
    return { transientFace: 'fuera-tema', triggersSensitive: false };
  }
  if (containsSvgBlock(replyText)) {
    return { transientFace: 'dibujando', triggersSensitive: false };
  }
  return { transientFace: null, triggersSensitive: false };
}

/**
 * Resuelve la cara final a mostrar, por prioridad:
 * sensible (sticky) > cara transitoria del último turno > cara por defecto del cuerpo.
 */
export function resolveFace(
  sensitiveSticky: boolean,
  transientFace: MaikaelTransientFace,
  bodyState: MaikaelBodyState
): MaikaelFace {
  if (sensitiveSticky) return 'sensible';
  if (transientFace) return transientFace;
  return bodyState === 'guitar' ? 'tocando' : 'normal';
}
