import type { RiffLevel } from '@/app/lib/riff/levels';

// Partida tutorial de mecánicas (petición del usuario): una canción "remix" fabricada nota a nota
// con trozos de la pista cargada (app/lib/riff/remix.ts), que se juega de principio a fin como una
// canción más. Enseña mantener pulsado, tapping y slide. Se lanza al final del tutorial del panel.
// Antes de cada parte, la partida se para sola en un compás de silencio y sale su tarjeta
// (mensajes + animación); "¡A tocar!" sigue desde ahí con la cuenta de entrada.

export type TutorialAnimation = 'tapping' | 'slide';

export interface TutorialSection {
  title: string;
  lines: string[];
  animation?: TutorialAnimation;
  // Notas de qué nivel (todos de modo trastes 0-5: el mástil del juego no cambia en toda la canción).
  level: RiffLevel;
  fromBar: number;
  toBar: number;
  repeats: number;
}

export const RIFF_TUTORIAL: TutorialSection[] = [
  {
    title: 'Mantener pulsado',
    lines: [
      'Si la nota se repite, puedes mantenerla pulsada.',
      'Puntúa distinto según lo que tarde en llegar.',
      'Si quieres la puntuación máxima, no la mantengas: tócala cada vez.',
    ],
    level: 'neofito',
    fromBar: 42,
    toBar: 42,
    repeats: 6,
  },
  {
    title: 'Tapping',
    lines: ['Mantén pulsada la nota grave.', 'Mientras, pulsa las demás.'],
    animation: 'tapping',
    level: 'neofito',
    fromBar: 9,
    toBar: 12,
    repeats: 2,
  },
  {
    title: 'Desliza',
    lines: ['Arrastra sin soltar hasta la nota siguiente.', '¡Cuidado si el salto es grande!'],
    animation: 'slide',
    level: 'principiante',
    fromBar: 9,
    toBar: 12,
    repeats: 2,
  },
];

export const RIFF_TUTORIAL_END = {
  title: '¡Lo has conseguido!',
  lines: ['Ya conoces los trucos.', 'Ahora elige canción y nivel.'],
};
