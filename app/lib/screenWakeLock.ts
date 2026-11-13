// Pantalla encendida durante la partida (petición del usuario, 2026-11-13): con la partida en marcha la
// pantalla del móvil no se apaga sola; solo si el usuario la apaga a mano.
//
// Wake Lock API: se pide mientras se JUEGA (cuenta atrás y jugando) y se suelta en pausa, al terminar y al
// salir. El navegador la suelta solo al ocultarse la página, así que al volver a ella con la partida en
// marcha se pide otra vez. Sin la API (iPhone antiguo) o si el navegador se niega, no pasa nada.
//
// Esto NO decide cuándo sigue o se para la partida (con la pantalla apagada a mano, al cambiar de
// pestaña...): eso sigue siendo cosa del navegador, como hasta ahora.

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener?(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

let wanted = false;
let sentinel: WakeLockSentinelLike | null = null;
let requesting = false;

const api = () => (typeof navigator !== 'undefined' ? (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock : undefined);

async function request() {
  const wakeLock = api();
  if (!wanted || sentinel || requesting || !wakeLock || document.visibilityState !== 'visible') return;
  requesting = true;
  try {
    const next = await wakeLock.request('screen');
    next.addEventListener?.('release', () => {
      if (sentinel === next) sentinel = null;
    });
    if (wanted) sentinel = next;
    else void next.release().catch(() => {});
  } catch {
    // Sin permiso (batería baja, pestaña oculta...): la pantalla se apagará como siempre.
  } finally {
    requesting = false;
  }
}

export function keepScreenOn(on: boolean) {
  wanted = on;
  if (on) {
    void request();
    return;
  }
  const current = sentinel;
  sentinel = null;
  if (current) void current.release().catch(() => {});
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void request();
  });
}
