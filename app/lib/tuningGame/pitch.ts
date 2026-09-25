// Matemática de afinación para el minijuego "afinar a oído" (sala-de-pruebas). Funciones puras,
// sin dependencias de React. Todo el pitch se representa en MIDI (fraccionario, no solo enteros) --
// a petición explícita del usuario ("el mástil para afinar debe ser MIDI") -- porque
// guitarAudioEngine.ts ya acepta un `midi: number` fraccionario para `playNote`/`switchNote`:
// `startSampleVoice` calcula la velocidad de reproducción de la muestra como
// `2 ** ((midi - sample.rootKey - sample.pitchCorrection / 100) / 12)`, una fórmula continua que
// no asume `midi` entero. Esto significa que NO hace falta tocar guitarAudioEngine.ts para nada de
// esto -- pasarle un MIDI fraccionario ya afina la muestra en cents de forma correcta. Ver
// app/lib/tuningGame/NOTES.md para el diseño completo.

export type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;

// Misma convención que OPEN_STRING_MIDI en ReducedFretboardDiagram.tsx (cuerda 1 = Mi agudo, MIDI
// estándar), para que el número de cuerda signifique lo mismo en toda la web. No se reutiliza el
// export de aquel fichero a propósito -- son conceptualmente el mismo dato pero este vive en el
// minijuego de afinación y no tiene por qué depender del componente de mástil interactivo.
export const STANDARD_TUNING_MIDI: Record<StringNumber, number> = {
  1: 64, // Mi4 (E4)
  2: 59, // Si3 (B3)
  3: 55, // Sol3 (G3)
  4: 50, // Re3 (D3)
  5: 45, // La2 (A2)
  6: 40, // Mi2 (E2)
};

const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Nombre de la nota más cercana (redondeada al semitono) para un MIDI continuo -- lo que se ve
// mientras se gira la clavija, igual que un afinador real muestra la nota más próxima aunque el
// tono real esté unos cents por encima o por debajo (y por eso SÍ cambia de letra en cuanto la
// desafinación cruza medio camino hacia la nota vecina, no solo en el múltiplo exacto de 100 cents).
export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const pitchClass = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return `${CHROMATIC_NOTES[pitchClass]}${octave}`;
}

// Clavijas de afinación: "una vuelta completa = tono entero, media vuelta = 1 semitono" -- a
// petición explícita del usuario, sin cambios respecto a la primera iteración. 360deg / 2
// semitonos = 180deg por semitono; un semitono son 100 cents, así que 180/100 = 1.8deg por cent.
export const DEGREES_PER_SEMITONE = 180;
export const DEGREES_PER_CENT = DEGREES_PER_SEMITONE / 100; // 1.8

// "Unidad mínima funcional" pedida explícitamente por el usuario, con el ejemplo "un octavo de
// tono cada 45 grados" (o más precisa si es posible). Se eligió 1 CENT (1/100 de semitono) --
// literalmente la unidad más pequeña con significado musical real: es la unidad estándar que usa
// cualquier afinador profesional/DAW, y por debajo de un cent ya no hay nada perceptible ni
// práctico que cuantificar (el umbral de percepción humana de la diferencia de tono ronda los 5-6
// cents incluso para oídos entrenados). Con esto, DEGREES_PER_STEP = 1.8deg por paso -- 25 pasos
// para un octavo de tono (45deg, coincide EXACTO con el ejemplo del usuario), 100 pasos para un
// semitono (180deg), 200 pasos para un tono entero (360deg).
export const MIN_STEP_CENTS = 1;
export const DEGREES_PER_STEP = DEGREES_PER_CENT * MIN_STEP_CENTS; // 1.8

// El estado de afinación de cada cuerda se guarda como un número ENTERO de cents (no de grados ni
// de MIDI directamente) -- ver TuningPeg.tsx para por qué el acumulador de arrastre es un ángulo
// exacto sin cuantizar y solo el valor que sale hacia fuera se redondea a cents.
export function centsToMidiOffset(cents: number): number {
  return cents / 100;
}
