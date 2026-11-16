// "Hay una partida del juego de tablatura en curso" (cuenta de entrada o tocando), para que otras
// partes de la web no se metan en medio: MAIkael no se abre con un toque sin querer mientras se juega
// (petición del usuario). Un almacén mínimo para useSyncExternalStore; sin React.

let inProgress = false;
const listeners = new Set<() => void>();

// Fluidez (usuario, 2026-11-15: tirones en el móvil): mientras se juega, las animaciones del resto de la
// página (focos del quiz, brillo de los botones Tutorial, el vaivén de los enlaces...) quedan en pausa.
// Fuera de la vista seguían recalculando estilos en CADA fotograma y quitaban tiempo a la autopista. Se
// pausan por JavaScript (Web Animations), no con CSS: algunas reglas de la web llevan `!important` y más
// especificidad, y ganaban. Siguen las del propio juego: escenario (.riff-stage) y barra (.midi-float-controls).
let pausedByGame: Animation[] = [];
const GAME_PARTS = '.riff-stage, .midi-float-controls';

function pausePageAnimations() {
  if (typeof document === 'undefined' || !document.getAnimations) return;
  pausedByGame = document.getAnimations().filter((animation) => {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    if (!target || target.closest(GAME_PARTS) || animation.playState !== 'running') return false;
    animation.pause();
    return true;
  });
}

function resumePageAnimations() {
  for (const animation of pausedByGame) {
    try {
      animation.play();
    } catch {
      // Ya no está en la página: nada que reanudar.
    }
  }
  pausedByGame = [];
}

export function setGameInProgress(value: boolean) {
  if (value === inProgress) return;
  inProgress = value;
  if (value) pausePageAnimations();
  else resumePageAnimations();
  listeners.forEach((listener) => listener());
}

export function subscribeGameInProgress(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGameInProgress() {
  return inProgress;
}
