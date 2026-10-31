import type { TourStep } from '@/app/components/guitar/ButtonTour';

// Tutoriales de los diagramas de esta página (petición del usuario: como los de instrumentos y
// juegos). Cada carrusel tiene UN botón "Tutorial" y sus pasos cambian según la pantalla visible.
// Cada paso busca su elemento por `data-tour`, nunca por posición ni por clases de estilo.
const byTour = (id: string) => (root: HTMLElement) => root.querySelector(`[data-tour="${id}"]`);

const ARROWS: TourStep = { title: 'Flechas', lines: ['Cambia de dibujo.'], find: byTour('flechas') };

const FOURIER_TOUR: TourStep[] = [
  ARROWS,
  { title: 'El dibujo', lines: ['Las líneas finas son ondas perfectas.', 'La gruesa es la suma de todas.'], find: byTour('dibujo') },
  { title: 'Armónicos', lines: ['Súmale más ondas.', 'Cuantas más, más cuadrada.'], find: byTour('armonicos') },
  { title: 'Colores', lines: ['Cada color es una onda.'], find: byTour('leyenda') },
];

const TIMBRE_TOUR: TourStep[] = [
  ARROWS,
  { title: 'El dibujo', lines: ['La línea roja es el sonido que oyes.', 'Las finas son sus armónicos.'], find: byTour('dibujo') },
  { title: 'Casillas H1 a H10', lines: ['Pulsa una casilla.', 'Cambia la fuerza de ese armónico.'], find: byTour('casillas') },
  { title: 'Instrumentos', lines: ['Prueba la mezcla de un instrumento real.'], find: byTour('instrumentos') },
];

const CANCELLATION_TOUR: TourStep[] = [
  ARROWS,
  { title: 'El dibujo', lines: ['Dos ondas opuestas se borran.'], find: byTour('dibujo') },
  { title: 'Onda (+)', lines: ['Enciende o apaga cada onda.'], find: byTour('onda') },
  { title: 'Onda al revés (−)', lines: ['Es la misma onda, pero al revés.', 'Juntas: silencio.'], find: byTour('contraonda') },
];

const NOISE_TOUR: TourStep[] = [
  ARROWS,
  { title: 'El dibujo', lines: ['Muchas ondas sin orden.', 'Eso es el ruido.'], find: byTour('dibujo') },
  { title: 'Número de ondas', lines: ['Elige cuántas se mezclan.'], find: byTour('numero') },
  { title: 'Regenerar', lines: ['Mezcla otras al azar.'], find: byTour('regenerar') },
  { title: 'Colores', lines: ['La línea naranja es la suma.'], find: byTour('leyenda') },
];

// Mismo orden que las pantallas de AcousticsCarousel.
export const ACOUSTICS_TOURS: TourStep[][] = [FOURIER_TOUR, TIMBRE_TOUR, CANCELLATION_TOUR, NOISE_TOUR];

// Mismo orden que las pantallas de HarmonicsCarousel.
export const HARMONICS_TOURS: TourStep[][] = [
  [
    ARROWS,
    { title: 'Formas de vibrar', lines: ['Cada fila es una forma de vibrar la cuerda.', 'Los puntos no se mueven: son los nodos.'], find: byTour('filas') },
  ],
  [
    ARROWS,
    { title: 'El mástil', lines: ['Roza la cuerda justo encima del traste.'], find: byTour('mastil') },
    { title: 'Los trastes', lines: ['Cada traste da un armónico distinto.'], find: byTour('leyenda') },
  ],
];
