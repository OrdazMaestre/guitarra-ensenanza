// ===== BUS DE MEZCLA DE LA PARTIDA (usuario, 2026-11-15) =====
// La barra "Vol" de la partida (0-2) se aplica a la SALIDA de la mezcla, no en cada nota: así el tanh del
// bajo (getBassBus) y el limitador de la batería (getMetronomeLimiter) reciben siempre la misma señal y el
// timbre de cada instrumento no cambia con la barra. Antes, a 200 %, el bajo saturaba, la batería se
// aplastaba y la suma recortaba en seco en la salida (pico 1,56).
//
// Cadena de mastering: volumen -> compresor de bus ("glue") -> limitador -> techo de seguridad.
// - El compresor trabaja más cuanto más se sube la barra (la señal le entra más caliente): esa es la
//   compensación según el volumen. Ataque 15 ms para dejar pasar el golpe del bombo y de la púa; release
//   200 ms para no bombear con el bajo.
// - El limitador (con el lookahead de 6 ms del compresor de Chrome) coge los picos.
// - El techo (WaveShaper, lineal hasta `clipKnee`, curva suave hasta `ceiling` = -0,3 dBFS) recoge lo
//   poco que se escape: nunca hay recorte duro.
// - DynamicsCompressorNode sube la ganancia por su cuenta (makeup automático); `compTrim`/`limitTrim` lo
//   anulan, MEDIDOS offline (tests/riff-game-mix.spec.ts), para que por debajo del umbral el bus sea
//   transparente (ganancia 1).
// Solo se usa durante la partida (setGameMix en guitarAudioEngine.ts).
export const GAME_MIX = {
  comp: { threshold: -10, knee: 10, ratio: 3, attack: 0.015, release: 0.2 },
  // -2,081 dB: makeup automático del compresor medido en Chrome (seno a -30 dBFS).
  compTrim: 0.787,
  limit: { threshold: -1, knee: 0, ratio: 20, attack: 0.001, release: 0.08 },
  // -0,570 dB: el del limitador.
  limitTrim: 0.937,
  clipKnee: 0.85,
  ceiling: 0.966,
};

export type GameMixParams = typeof GAME_MIX;

// La cadena, en `context`, saliendo a `destination`; `input.gain` = volumen de la partida.
// AUTOCONTENIDA a propósito (sin nada de fuera de la función): las pruebas la ejecutan tal cual en un
// OfflineAudioContext del navegador con `buildGameMixChain.toString()`.
export function buildGameMixChain(context: BaseAudioContext, destination: AudioNode, p: GameMixParams): { input: GainNode } {
  const dyn = (q: GameMixParams['comp']) => {
    const node = context.createDynamicsCompressor();
    node.threshold.value = q.threshold;
    node.knee.value = q.knee;
    node.ratio.value = q.ratio;
    node.attack.value = q.attack;
    node.release.value = q.release;
    return node;
  };
  const gain = (value: number) => {
    const node = context.createGain();
    node.gain.value = value;
    return node;
  };
  // Curva del techo: identidad hasta la rodilla y, por encima, una tanh que se acerca al techo sin
  // tocarlo (continua en valor y pendiente). Cubre ±4 de entrada: se entra a 1/4 (un WaveShaper lee su
  // curva en -1..1) y la curva devuelve ya el valor real.
  const range = 4;
  const n = 8193;
  const room = p.ceiling - p.clipKnee;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * range;
    const a = Math.abs(x);
    const y = a <= p.clipKnee ? a : p.clipKnee + room * Math.tanh((a - p.clipKnee) / room);
    curve[i] = Math.sign(x) * y;
  }
  const ceiling = context.createWaveShaper();
  ceiling.curve = curve;
  // Sin oversampling a propósito: el filtro de remuestreo de '4x' rebota y dejaba picos de 1,005 con
  // golpes muy calientes; así el techo se cumple muestra a muestra (y solo actúa en picos sueltos).
  ceiling.oversample = 'none';

  const input = gain(1);
  const chain: AudioNode[] = [input, dyn(p.comp), gain(p.compTrim), dyn(p.limit), gain(p.limitTrim), gain(1 / range), ceiling, destination];
  for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
  return { input };
}
