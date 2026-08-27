/**
 * Filtro de datos personales — se ejecuta ANTES de llamar a Groq (encargo de
 * Ordaz, protección de menores). Heurístico a propósito: no es perfecto,
 * pero cubre los casos más comunes. Un falso positivo solo cuesta un aviso
 * amable; un falso negativo podría filtrar un dato real, así que se prefiere
 * pecar de cauto.
 */

export type PersonalDataType = 'email' | 'telefono' | 'direccion' | 'nombre_edad' | 'colegio' | 'red_social';

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// Teléfono español: 9 dígitos empezando por 6/7/8/9, con o sin +34, con o
// sin separadores.
const TELEFONO_RE = /(?:\+34[\s.-]?)?\b[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/;

const DIRECCION_KEYWORD_RE = /\b(calle|avenida|avda\.?|c\/|c[oó]digo postal|cp)\b/gi;

const NOMBRE_INTRO_RE = /\b(me llamo|soy)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/;
const EDAD_RE = /\btengo\s+\d{1,2}\s*años\b/i;

const COLEGIO_KEYWORD_RE = /\b(colegio|instituto|cole)\b/gi;

const RED_SOCIAL_RE = /(instagram|tiktok|twitter|x)\.com\/@?[a-z0-9_.]+|@[a-z0-9_.]{3,}\b/i;

/** ¿La siguiente palabra tras `index` empieza en mayúscula? (nombre propio). */
function siguientePalabraEsNombre(texto: string, index: number): boolean {
  const resto = texto.slice(index);
  const match = resto.match(/^\s+([A-Za-zÀ-ÿ]+)/);
  if (!match) return false;
  const primeraLetra = match[1][0];
  return primeraLetra === primeraLetra.toUpperCase() && primeraLetra !== primeraLetra.toLowerCase();
}

/** ¿Hay un dígito dentro de los `ventana` caracteres siguientes a `index`? */
function hayNumeroCerca(texto: string, index: number, ventana = 25): boolean {
  return /\d/.test(texto.slice(index, index + ventana));
}

/**
 * Analiza un mensaje del alumno en busca de datos personales identificativos.
 * Devuelve el tipo detectado (para depurar/loggear sin exponer el mensaje
 * en sí) o `null` si no se detectó nada.
 */
export function detectarDatosPersonales(mensajeUsuario: string): PersonalDataType | null {
  if (EMAIL_RE.test(mensajeUsuario)) return 'email';
  if (TELEFONO_RE.test(mensajeUsuario)) return 'telefono';

  for (const match of mensajeUsuario.matchAll(DIRECCION_KEYWORD_RE)) {
    if (hayNumeroCerca(mensajeUsuario, match.index)) return 'direccion';
  }

  if (NOMBRE_INTRO_RE.test(mensajeUsuario) && EDAD_RE.test(mensajeUsuario)) return 'nombre_edad';

  for (const match of mensajeUsuario.matchAll(COLEGIO_KEYWORD_RE)) {
    if (siguientePalabraEsNombre(mensajeUsuario, match.index + match[0].length)) return 'colegio';
  }

  if (RED_SOCIAL_RE.test(mensajeUsuario)) return 'red_social';

  return null;
}

/** Mensaje fijo de MAIkael cuando se bloquea un mensaje por datos personales. */
export const PERSONAL_DATA_REPLY =
  '¡Espera! Por tu seguridad no compartas tu nombre completo, dirección, teléfono o el nombre de tu cole aquí. Puedes seguir preguntándome de música sin decirme quién eres 😊';
