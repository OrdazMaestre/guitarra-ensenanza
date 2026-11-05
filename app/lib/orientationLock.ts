// Bloqueo del giro durante la partida (petición del usuario, 2026-11-05): mientras se juega en un
// móvil, la pantalla se queda como está, en vertical o en horizontal, hasta pausar o salir.
//
// Una web solo puede bloquear el giro si el navegador lo permite, y casi siempre en pantalla completa:
// se intenta sin ella (app instalada) y, si el navegador dice que no, se entra en pantalla completa.
// Hay que llamar a `lockGameScreen` desde un toque del usuario, porque la pantalla completa lo exige.
// Sin la función (iPhone) o si el navegador se niega, la partida sigue igual, sin bloqueo.

import { isTouchOnly } from './localSongs';

type Lockable = ScreenOrientation & {
  lock?: (orientation: 'portrait' | 'landscape') => Promise<void>;
  unlock?: () => void;
};

// Se quiere bloqueado ahora mismo.
let wanted = false;
// La pantalla completa la ha pedido el juego (si ya estaba, no se quita al salir).
let enteredFullscreen = false;
let leaving = false;

const orientation = () => screen.orientation as Lockable | undefined;

function unlock() {
  try {
    orientation()?.unlock?.();
  } catch {
    // Nada que soltar.
  }
}

function leaveFullscreen() {
  if (enteredFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  enteredFullscreen = false;
}

export async function lockGameScreen() {
  const target = orientation();
  if (!isTouchOnly() || !target?.lock) return;
  wanted = true;
  leaving = false;
  const direction = target.type.startsWith('portrait') ? 'portrait' : 'landscape';
  try {
    await target.lock(direction);
  } catch {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        enteredFullscreen = true;
      }
      await target.lock(direction);
    } catch {
      return;
    }
  }
  // Se pausó o se salió mientras el navegador contestaba.
  if (!wanted) {
    unlock();
    if (leaving) leaveFullscreen();
  }
}

// PAUSA: se puede girar, pero la pantalla completa sigue para que la página no salte.
export function unlockGameOrientation() {
  if (!wanted) return;
  wanted = false;
  unlock();
}

// Salir o acabar: todo como estaba.
export function releaseGameScreen() {
  leaving = true;
  unlockGameOrientation();
  leaveFullscreen();
}
