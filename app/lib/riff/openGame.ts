// Una sola partida abierta en la página (usuario, 2026-11-17: la Sala de pruebas tiene el mástil y la batería
// suelta, cada uno con su JUGAR). Abrir JUGAR en uno avisa a los demás, que se cierran (como con SALIR).
// Sin React, como gameInProgress.ts.
type Listener = (owner: symbol) => void;
const listeners = new Set<Listener>();

export function claimOpenGame(owner: symbol): void {
  for (const listener of listeners) listener(owner);
}

export function onOpenGameClaim(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
