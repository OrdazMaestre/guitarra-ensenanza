// Teclas físicas → MIDI del teclado de piano (MiniKeyboard y el teclado jugable de Riff-Hero, keys.ts).
// Ver el comentario largo en MiniKeyboard.tsx: GRAVE = fila de abajo (naturales) + fila del medio
// (sostenidos); AGUDO = fila Q (naturales) + fila de números (sostenidos), solapadas en Do5-Fa5.
export const PIANO_KEYMAP: Record<string, number> = {
  // Grave: naturals. ShiftLeft = La3 y CapsLock (BloqMayús) = La#3 (usuario, 2026-11-18): dos teclas
  // más por abajo, a la izquierda de '<' (Si3). Ojo: BloqMayús sigue activándose en el sistema aunque se
  // llame a preventDefault (inofensivo: se usa e.code), y en Mac solo manda keydown al encenderse y keyup
  // al apagarse (por eso quien la use suelta la nota sola, ver PIANO_LATCHING_KEYS).
  'ShiftLeft': 57, 'CapsLock': 58,
  'IntlBackslash': 59,
  'KeyZ': 60, 'KeyX': 62, 'KeyC': 64, 'KeyV': 65, 'KeyB': 67,
  'KeyN': 69, 'KeyM': 71, 'Comma': 72, 'KeyL': 73, 'Period': 74, 'Semicolon': 75, 'Slash': 76,
  'ShiftRight': 77,
  // Grave: sharps/flats
  'KeyS': 61, 'KeyD': 63, 'KeyG': 66, 'KeyH': 68, 'KeyJ': 70,
  'Enter': 78,
  // Agudo: naturals (C5..A6, first 4 overlap grave's Comma/Period/Slash/ShiftRight)
  'KeyQ': 72, 'KeyW': 74, 'KeyE': 76, 'KeyR': 77, 'KeyT': 79, 'KeyY': 81, 'KeyU': 83,
  'KeyI': 84, 'KeyO': 86, 'KeyP': 88, 'BracketLeft': 89, 'BracketRight': 91, 'Backslash': 93,
  // Agudo: sharps/flats (Digit2/3/5 overlap grave's KeyL/Semicolon/Enter)
  'Digit2': 73, 'Digit3': 75, 'Digit5': 78, 'Digit6': 80, 'Digit7': 82,
  'Digit9': 85, 'Digit0': 87, 'Equal': 90, 'Backspace': 92,
};

// Teclas que el sistema "engancha" (BloqMayús): en Mac su keyup no llega al soltarla, así que una nota con
// ella se suelta sola al poco.
export const PIANO_LATCHING_KEYS = new Set(['CapsLock']);
export const LATCH_RELEASE_MS = 250;

// ¿Esta tecla, en este sistema, llega "enganchada"? Solo BloqMayús en Mac (un keydown al encenderse y un
// keyup al apagarse, sin el otro): ahí cada evento es una pulsación corta.
export function isLatchingQuirk(code: string): boolean {
  if (!PIANO_LATCHING_KEYS.has(code) || typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

// FILA AGUDA (fila Q + fila de números). En el teclado jugable de Riff-Hero (keys.ts) estas teclas valen por
// su NOTA EXACTA (la altura que suena), no por la tecla del trozo que se ve: para gente pro (usuario,
// 2026-11-18; lo sensato son las filas A y Z).
export const PIANO_TREBLE_CODES = new Set([
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash',
  'Digit2', 'Digit3', 'Digit5', 'Digit6', 'Digit7', 'Digit9', 'Digit0', 'Equal', 'Backspace',
]);
