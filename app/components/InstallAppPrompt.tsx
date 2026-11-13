'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getGameInProgress, subscribeGameInProgress } from '@/app/lib/gameInProgress';

// Aviso para instalar la web como app (petición del usuario, 2026-11-13): la PRIMERA vez que se entra desde
// un dispositivo, una tarjeta pequeña abajo, una sola vez (`localStorage`).
// - Chrome/Edge (ordenador y Android): botón "Instalar" directo, con el evento `beforeinstallprompt` (la web
//   ya es instalable: app/manifest.ts).
// - iPhone/iPad (Safari no tiene ese evento): dos pasos, "Compartir" y "Añadir a pantalla de inicio".
// - Ya instalada (`display-mode: standalone`) o un navegador que no ofrece nada: no sale.
// Se decide por lo que el navegador permite; solo iOS se reconoce por su nombre, porque no avisa de nada.
// Solo en la PORTADA (la entrada normal; abajo en el juego taparía SALIR/PAUSA): quien entra directo a otra
// página lo verá al pasar por ella. Nunca durante una partida, y va fuera de .site-shell: el `filter` del tema oscuro rompería `position: fixed`.

export const INSTALL_PROMPT_STORAGE_KEY = 'riff-aviso-instalar-v1';
const DELAY_MS = 4000;
const HOME_PATHS = new Set(['/', '/lecciones/temario']);

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function alreadySeen() {
  try {
    return window.localStorage.getItem(INSTALL_PROMPT_STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(INSTALL_PROMPT_STORAGE_KEY, String(Date.now()));
  } catch {
    // Sin almacenamiento: volverá a salir en otra visita.
  }
}

function installed() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function InstallAppPrompt() {
  const [mode, setMode] = useState<'install' | 'ios' | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const playing = useSyncExternalStore(subscribeGameInProgress, getGameInProgress, () => false);
  const home = HOME_PATHS.has(usePathname() ?? '');

  useEffect(() => {
    if (alreadySeen() || installed()) return;
    let timer = 0;
    const show = (next: 'install' | 'ios') => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMode(next), DELAY_MS);
    };
    const onPrompt = (event: Event) => {
      // Sin esto Chrome enseña su propia barra; aquí se ofrece con nuestro botón.
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
      show('install');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    if (isIos()) show('ios');
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.clearTimeout(timer);
    };
  }, []);

  if (!mode || playing || !home) return null;

  const close = () => {
    markSeen();
    setMode(null);
  };
  const install = async () => {
    markSeen();
    setMode(null);
    try {
      await installEvent?.prompt();
    } catch {
      // El navegador ya no deja instalar desde aquí: queda su menú (⋮ → Instalar).
    }
  };

  return (
    <div aria-label="Instalar Riffcademy" className="install-app-prompt" data-mode={mode} role="dialog">
      <style>{`
        .install-app-prompt {
          background: #ffffff;
          border: 2px solid #047857;
          border-radius: 16px;
          bottom: 16px;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
          box-sizing: border-box;
          color: #1f2937;
          left: 50%;
          max-width: calc(100vw - 32px);
          padding: 12px 16px;
          position: fixed;
          transform: translateX(-50%);
          width: 320px;
          z-index: 60;
        }
        .install-app-title {
          font-size: 17px;
          font-weight: 900;
          margin: 0 0 4px;
        }
        .install-app-line {
          font-size: 14px;
          font-weight: 700;
          line-height: 1.35;
          margin: 2px 0;
        }
        .install-app-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 10px;
        }
        .install-app-btn {
          background: #ffffff;
          border: 1.5px solid #9ca3af;
          border-radius: 999px;
          color: #374151;
          cursor: pointer;
          font-size: 14px;
          font-weight: 900;
          min-height: 40px;
          padding: 6px 16px;
        }
        .install-app-main {
          background: #047857;
          border-color: #047857;
          color: #ffffff;
        }
      `}</style>
      <p className="install-app-title">Ten Riffcademy como una app</p>
      {mode === 'install' ? (
        <>
          <p className="install-app-line">Ábrela desde tu pantalla.</p>
          <p className="install-app-line">Sin buscarla en el navegador.</p>
          <div className="install-app-actions">
            <button className="install-app-btn" onClick={close} type="button">Ahora no</button>
            <button className="install-app-btn install-app-main" onClick={() => void install()} type="button">Instalar</button>
          </div>
        </>
      ) : (
        <>
          <p className="install-app-line">1. Toca Compartir (el cuadrado con flecha).</p>
          <p className="install-app-line">2. Elige «Añadir a pantalla de inicio».</p>
          <div className="install-app-actions">
            <button className="install-app-btn install-app-main" onClick={close} type="button">Entendido</button>
          </div>
        </>
      )}
    </div>
  );
}
