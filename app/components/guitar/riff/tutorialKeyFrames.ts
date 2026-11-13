// Fotogramas de las animaciones de TECLADO de la partida tutorial en PC (RiffTutorialCard.tsx). Puros,
// para probarlos en Node. Índices de tecla = traste de la cuerda 6: Z 0, X 1, C 2, V 3, B 4, N 5.

// "Desliza" en PC (usuario, 2026-11-13): primero el recorrido N, V, X, Z y vuelta con las teclas, una vez
// normal (deslizar: solo la tecla que suena) y otra manteniendo pulsadas las graves (al bajar se sueltan
// las agudas = pull-off; al subir se vuelven a pulsar = hammer-on), y después el cursor de siempre.
export const SLIDE_KEY_PATH = [5, 3, 1, 0, 1, 3, 5];
export const SLIDE_STEP_MS = 400;
export type SlideVariant = 'keys-slide' | 'keys-legato' | 'cursor';
// Pasos de cada variante: las de teclas, una pasada (7 pasos); el cursor, ida y vuelta (2 × 2,4 s).
const SLIDE_PHASES: Array<[SlideVariant, number]> = [
  ['keys-slide', SLIDE_KEY_PATH.length],
  ['keys-legato', SLIDE_KEY_PATH.length],
  ['cursor', 12],
];
export const SLIDE_CYCLE_STEPS = SLIDE_PHASES.reduce((sum, [, steps]) => sum + steps, 0);

export interface SlideFrame {
  variant: SlideVariant;
  // Teclas pulsadas ahora mismo y la que suena (la más aguda de las pulsadas).
  held: number[];
  sounding: number | null;
}

export function slideFrame(tick: number): SlideFrame {
  let step = ((tick % SLIDE_CYCLE_STEPS) + SLIDE_CYCLE_STEPS) % SLIDE_CYCLE_STEPS;
  for (const [variant, steps] of SLIDE_PHASES) {
    if (step >= steps) {
      step -= steps;
      continue;
    }
    if (variant === 'cursor') return { variant, held: [], sounding: null };
    const sounding = SLIDE_KEY_PATH[step];
    const held = variant === 'keys-slide'
      ? [sounding]
      : [...new Set(SLIDE_KEY_PATH)].filter((key) => key <= sounding).sort((a, b) => a - b);
    return { variant, held, sounding };
  }
  return { variant: 'cursor', held: [], sounding: null };
}

// "Tapear" en PC: SIEMPRE empieza por las dos teclas (Z mantenida, N una y otra vez) y luego alterna
// con el clic del ratón (usuario, 2026-11-13).
export type TapVariant = 'keys' | 'mouse';
export const TAP_VARIANTS: TapVariant[] = ['keys', 'mouse'];
