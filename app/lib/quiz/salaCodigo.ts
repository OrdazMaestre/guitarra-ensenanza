// Alfabeto sin caracteres ambiguos (fuera 0/O, 1/I/L) para que un niño pueda escribir el código a
// mano sin confundirse entre mayúscula/minúscula ni entre letra/número.
const SAFE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 5;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += SAFE_ALPHABET[Math.floor(Math.random() * SAFE_ALPHABET.length)];
  }
  return code;
}

/** Normaliza lo que escribe el usuario en la caja de "unirse": mayúsculas, sin espacios, y solo
 * caracteres del alfabeto seguro (para que pegar algo con espacios/minúsculas no rompa la unión). */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .filter((ch) => SAFE_ALPHABET.includes(ch))
    .join('');
}

export function isValidRoomCode(code: string): boolean {
  return code.length === CODE_LENGTH && normalizeRoomCode(code) === code;
}
