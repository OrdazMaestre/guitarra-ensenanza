// "Hay una partida del juego de tablatura en curso" (cuenta de entrada o tocando), para que otras
// partes de la web no se metan en medio: MAIkael no se abre con un toque sin querer mientras se juega
// (petición del usuario). Un almacén mínimo para useSyncExternalStore; sin React.

let inProgress = false;
const listeners = new Set<() => void>();

export function setGameInProgress(value: boolean) {
  if (value === inProgress) return;
  inProgress = value;
  listeners.forEach((listener) => listener());
}

export function subscribeGameInProgress(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGameInProgress() {
  return inProgress;
}
