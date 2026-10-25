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
    title: 'MANTÉN PULSADO',
    lines: [
      'Sin puntuacion alta pero mejor que no pulsar.',
      'Pulsa cada nota si quieres más puntos.',
    ],
    level: 'facil',
    fromBar: 42,
    toBar: 42,
    repeats: 6,
  },
  {
    title: 'TAPEA',
    lines: ['Deja pulsada la nota grave.', 'mientras pulsas las demás.'],
    animation: 'tapping',
    level: 'facil',
    fromBar: 9,
    toBar: 12,
    repeats: 2,
  },
  {
    title: 'DESLIZA',
    lines: ['Arrastra sin soltar.', '¡Cuidado si el salto es grande!'],
    animation: 'slide',
    level: 'medio',
    fromBar: 9,
    toBar: 12,
    repeats: 2,
  },
];

export const RIFF_TUTORIAL_END = {
  title: '¡Lo has conseguido!',
  lines: ['Ya conoces los trucos.', 'Ahora practica con la canción entera.', 'Selecciona pista, nivel y velocidad.'],
};
