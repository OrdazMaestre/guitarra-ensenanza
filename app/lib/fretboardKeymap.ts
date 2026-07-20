export type FretKeyEntry = { string: number; fret: number; midi: number };

// Physical key codes (e.code) → guitar string/fret/MIDI
// Uses e.code (layout-independent) so dead keys (´, ^) still fire.
// Spanish QWERTY mapping:
//   Row Z (String 6, E2): z x c v b n m , . - [ShiftRight=fret10]
//   Row A (String 5, A2): a s d f g h j k l ñ ´ [Enter=fret11]
//   Row Q (String 4, D3): q w e r t y u i o p ` + [ç(Backslash)=fret12]
//   Row 1 (String 3, G3): 1 2 3 4 5 6 7 8 9 0 ' ¡ [Backspace=fret12]
export const FRETBOARD_KEYMAP: Record<string, FretKeyEntry> = {
  // String 6 (E2, MIDI 40) — row Z
  'KeyZ':       { string: 6, fret: 0,  midi: 40 },
  'KeyX':       { string: 6, fret: 1,  midi: 41 },
  'KeyC':       { string: 6, fret: 2,  midi: 42 },
  'KeyV':       { string: 6, fret: 3,  midi: 43 },
  'KeyB':       { string: 6, fret: 4,  midi: 44 },
  'KeyN':       { string: 6, fret: 5,  midi: 45 },
  'KeyM':       { string: 6, fret: 6,  midi: 46 },
  'Comma':      { string: 6, fret: 7,  midi: 47 },
  'Period':     { string: 6, fret: 8,  midi: 48 },
  'Slash':      { string: 6, fret: 9,  midi: 49 },
  'ShiftRight': { string: 6, fret: 10, midi: 50 },
  // String 5 (A2, MIDI 45) — row A
  'KeyA':      { string: 5, fret: 0,  midi: 45 },
  'KeyS':      { string: 5, fret: 1,  midi: 46 },
  'KeyD':      { string: 5, fret: 2,  midi: 47 },
  'KeyF':      { string: 5, fret: 3,  midi: 48 },
  'KeyG':      { string: 5, fret: 4,  midi: 49 },
  'KeyH':      { string: 5, fret: 5,  midi: 50 },
  'KeyJ':      { string: 5, fret: 6,  midi: 51 },
  'KeyK':      { string: 5, fret: 7,  midi: 52 },
  'KeyL':      { string: 5, fret: 8,  midi: 53 },
  'Semicolon': { string: 5, fret: 9,  midi: 54 },
  'Quote':     { string: 5, fret: 10, midi: 55 },
  'Enter':     { string: 5, fret: 11, midi: 56 },
  // String 4 (D3, MIDI 50) — row Q
  'KeyQ':        { string: 4, fret: 0,  midi: 50 },
  'KeyW':        { string: 4, fret: 1,  midi: 51 },
  'KeyE':        { string: 4, fret: 2,  midi: 52 },
  'KeyR':        { string: 4, fret: 3,  midi: 53 },
  'KeyT':        { string: 4, fret: 4,  midi: 54 },
  'KeyY':        { string: 4, fret: 5,  midi: 55 },
  'KeyU':        { string: 4, fret: 6,  midi: 56 },
  'KeyI':        { string: 4, fret: 7,  midi: 57 },
  'KeyO':        { string: 4, fret: 8,  midi: 58 },
  'KeyP':        { string: 4, fret: 9,  midi: 59 },
  'BracketLeft': { string: 4, fret: 10, midi: 60 },
  'BracketRight':{ string: 4, fret: 11, midi: 61 },
  'Backslash':   { string: 4, fret: 12, midi: 62 },
  // String 3 (G3, MIDI 55) — row 1
  'Digit1':   { string: 3, fret: 0,  midi: 55 },
  'Digit2':   { string: 3, fret: 1,  midi: 56 },
  'Digit3':   { string: 3, fret: 2,  midi: 57 },
  'Digit4':   { string: 3, fret: 3,  midi: 58 },
  'Digit5':   { string: 3, fret: 4,  midi: 59 },
  'Digit6':   { string: 3, fret: 5,  midi: 60 },
  'Digit7':   { string: 3, fret: 6,  midi: 61 },
  'Digit8':   { string: 3, fret: 7,  midi: 62 },
  'Digit9':   { string: 3, fret: 8,  midi: 63 },
  'Digit0':   { string: 3, fret: 9,  midi: 64 },
  'Minus':    { string: 3, fret: 10, midi: 65 },
  'Equal':    { string: 3, fret: 11, midi: 66 },
  'Backspace':{ string: 3, fret: 12, midi: 67 },
};

// Returns true when two held keys share the same keyboard-matrix column
// (same fret offset on different strings), meaning a 3rd key may be blocked
// by hardware ghosting on standard keyboards.
export function hasKeyboardGhosting(held: Map<string, FretKeyEntry>): boolean {
  const seen = new Set<number>();
  for (const entry of held.values()) {
    if (seen.has(entry.fret)) return true;
    seen.add(entry.fret);
  }
  return false;
}
