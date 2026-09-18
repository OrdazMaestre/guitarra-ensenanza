// Banco de acordes centralizado para el quiz. Migra el shape de datos de
// app/lecciones/temario/_lesson-pages/AcordesPage.tsx (majorChords/minorChords/powerChordShapes)
// tal cual — es una fuente NUEVA solo para el quiz, AcordesPage.tsx no se toca ni importa de aquí.
// Cubre exactamente lo que pide la pregunta 4.1: "Facil: solo mayores basicos.
// Dificil: mayores + menores + power chords."

export type ChordMarker = { finger: string; fret: number; string: number };

export type ChordBarre = { fret: number; from: number; label: string; to: number };

export interface OpenChord {
  barre?: ChordBarre;
  english: string;
  markers: ChordMarker[];
  muted?: number[];
  open?: number[];
  quality: 'mayor' | 'menor';
  spanish: string;
}

export interface PowerChord {
  english: string;
  notes: { fret: number; label: string; string: number }[];
  quality: 'power';
  rootLabel: string;
  spanish: string;
}

export const majorChords: OpenChord[] = [
  { spanish: 'DO', english: 'C', quality: 'mayor', markers: [{ string: 5, fret: 3, finger: '3' }, { string: 4, fret: 2, finger: '2' }, { string: 2, fret: 1, finger: '1' }], muted: [6], open: [3, 1] },
  { spanish: 'RE', english: 'D', quality: 'mayor', markers: [{ string: 3, fret: 2, finger: '1' }, { string: 2, fret: 3, finger: '3' }, { string: 1, fret: 2, finger: '2' }], muted: [6, 5], open: [4] },
  { spanish: 'MI', english: 'E', quality: 'mayor', markers: [{ string: 5, fret: 2, finger: '2' }, { string: 4, fret: 2, finger: '3' }, { string: 3, fret: 1, finger: '1' }], open: [6, 2, 1] },
  { spanish: 'FA', english: 'F', quality: 'mayor', barre: { fret: 1, from: 6, to: 1, label: '1' }, markers: [{ string: 5, fret: 3, finger: '3' }, { string: 4, fret: 3, finger: '4' }, { string: 3, fret: 2, finger: '2' }] },
  { spanish: 'SOL', english: 'G', quality: 'mayor', markers: [{ string: 6, fret: 3, finger: '2' }, { string: 5, fret: 2, finger: '1' }, { string: 1, fret: 3, finger: '3' }], open: [4, 3, 2] },
  { spanish: 'LA', english: 'A', quality: 'mayor', markers: [{ string: 4, fret: 2, finger: '1' }, { string: 3, fret: 2, finger: '2' }, { string: 2, fret: 2, finger: '3' }], muted: [6], open: [5, 1] },
  { spanish: 'SI', english: 'B', quality: 'mayor', barre: { fret: 2, from: 5, to: 1, label: '1' }, markers: [{ string: 4, fret: 4, finger: '2' }, { string: 3, fret: 4, finger: '3' }, { string: 2, fret: 4, finger: '4' }], muted: [6] },
];

export const minorChords: OpenChord[] = [
  { spanish: 'DOm', english: 'Cm', quality: 'menor', barre: { fret: 3, from: 5, to: 1, label: '1' }, markers: [{ string: 4, fret: 5, finger: '3' }, { string: 3, fret: 5, finger: '4' }, { string: 2, fret: 4, finger: '2' }], muted: [6] },
  { spanish: 'REm', english: 'Dm', quality: 'menor', markers: [{ string: 3, fret: 2, finger: '2' }, { string: 2, fret: 3, finger: '3' }, { string: 1, fret: 1, finger: '1' }], muted: [6, 5], open: [4] },
  { spanish: 'MIm', english: 'Em', quality: 'menor', markers: [{ string: 5, fret: 2, finger: '2' }, { string: 4, fret: 2, finger: '3' }], open: [6, 3, 2, 1] },
  { spanish: 'FAm', english: 'Fm', quality: 'menor', barre: { fret: 1, from: 6, to: 1, label: '1' }, markers: [{ string: 5, fret: 3, finger: '3' }, { string: 4, fret: 3, finger: '4' }] },
  { spanish: 'SOLm', english: 'Gm', quality: 'menor', barre: { fret: 3, from: 6, to: 1, label: '1' }, markers: [{ string: 5, fret: 5, finger: '3' }, { string: 4, fret: 5, finger: '4' }] },
  { spanish: 'LAm', english: 'Am', quality: 'menor', markers: [{ string: 4, fret: 2, finger: '2' }, { string: 3, fret: 2, finger: '3' }, { string: 2, fret: 1, finger: '1' }], muted: [6], open: [5, 1] },
  { spanish: 'SIm', english: 'Bm', quality: 'menor', barre: { fret: 2, from: 5, to: 1, label: '1' }, markers: [{ string: 4, fret: 4, finger: '3' }, { string: 3, fret: 4, finger: '4' }, { string: 2, fret: 3, finger: '2' }], muted: [6] },
];

export const powerChords: PowerChord[] = [
  { spanish: 'MI5', english: 'E', quality: 'power', rootLabel: 'Mi', notes: [{ label: 'T', string: 6, fret: 0 }, { label: '5', string: 5, fret: 2 }, { label: '8', string: 4, fret: 2 }] },
  { spanish: 'FA5', english: 'F', quality: 'power', rootLabel: 'Fa', notes: [{ label: 'T', string: 6, fret: 1 }, { label: '5', string: 5, fret: 3 }, { label: '8', string: 4, fret: 3 }] },
  { spanish: 'LA5', english: 'A', quality: 'power', rootLabel: 'La', notes: [{ label: 'T', string: 5, fret: 0 }, { label: '5', string: 4, fret: 2 }, { label: '8', string: 3, fret: 2 }] },
  { spanish: 'SI5', english: 'B', quality: 'power', rootLabel: 'Si', notes: [{ label: 'T', string: 5, fret: 2 }, { label: '5', string: 4, fret: 4 }, { label: '8', string: 3, fret: 4 }] },
];

/** "DO Mayor" / "DO menor" — mismo criterio que spanishChordLabel() en AcordesPage.tsx. */
export function spanishChordLabel(chord: OpenChord): string {
  return `${chord.spanish.replace(/m$/, '')} ${chord.quality === 'menor' ? 'menor' : 'Mayor'}`;
}

export function allBasicChords(difficulty: 'facil' | 'dificil'): OpenChord[] {
  return difficulty === 'facil' ? majorChords : [...majorChords, ...minorChords];
}

/** Traste por cuerda de un acorde abierto/con cejilla, derivado de markers+open+barre — fuente
 * unica que comparten tablatureForOpenChord() y verticalTabLines() para que nunca puedan
 * desincronizarse entre si (mismo principio que el diagrama/tablatura de 6.4). */
function fretByStringMap(chord: OpenChord): Map<number, number> {
  const fretByString = new Map<number, number>();
  for (const s of chord.open ?? []) fretByString.set(s, 0);
  for (const m of chord.markers) fretByString.set(m.string, m.fret);
  if (chord.barre) {
    for (let s = chord.barre.to; s <= chord.barre.from; s += 1) {
      if (!fretByString.has(s)) fretByString.set(s, chord.barre.fret);
    }
  }
  return fretByString;
}

/** Cuerdas realmente sonando (con traste asignado y no mudas), de la 1 a la 6. */
function playedStrings(chord: OpenChord): number[] {
  const fretByString = fretByStringMap(chord);
  return [1, 2, 3, 4, 5, 6].filter((string) => fretByString.has(string) && !(chord.muted ?? []).includes(string));
}

/** Tablatura de un acorde abierto/con cejilla, en formato AlphaTab, derivada de las mismas markers
 * que dibujan el diagrama — así 6.4 nunca puede generar un diagrama y una tablatura que no coincidan. */
export function tablatureForOpenChord(chord: OpenChord): string {
  const fretByString = fretByStringMap(chord);
  const notes = playedStrings(chord)
    .map((string) => `${fretByString.get(string)}.${string}`)
    .join(' ');
  return `(${notes})`;
}

/** Trastes del acorde en columna vertical, cuerda 1 (aguda) arriba -> cuerda 6 (grave) abajo,
 * igual que una tablatura real dibujada verticalmente. Usado por 6.4 para pintar las opciones como
 * lineas de numeros en vez del formato compacto "(0.1 0.2 ...)", y para construir el distractor
 * "trampa" con los mismos numeros invertidos (ver generateChordTablatureMatch). */
export function verticalTabLines(chord: OpenChord): string[] {
  const fretByString = fretByStringMap(chord);
  return playedStrings(chord).map((string) => String(fretByString.get(string)));
}
