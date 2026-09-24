'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { MixingConsoleEngine, type EngineState } from './audioEngine';

export interface UseMixingConsoleResult {
  state: EngineState;
  engine: MixingConsoleEngine;
}

// El motor (MixingConsoleEngine) se crea una sola vez vía el inicializador perezoso de useState
// (nunca se vuelve a llamar tras el primer render) -- es un objeto con su propio AudioContext y
// nodos de Web Audio, no algo que React deba recrear entre renders. Este hook solo lo expone como
// estado reactivo vía useSyncExternalStore. Crucial: este hook debe llamarse desde un componente
// que NO se desmonte al colapsar el panel de la mesa de mezclas -- ver el comentario en
// MixingConsole.tsx sobre por qué el motor vive en el componente padre, no en el panel.
export function useMixingConsole(): UseMixingConsoleResult {
  const [engine] = useState(() => new MixingConsoleEngine());

  const subscribe = useCallback(
    (onStoreChange: () => void) => engine.subscribe(onStoreChange),
    [engine]
  );
  const getSnapshot = useCallback(() => engine.getState(), [engine]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Solo se libera el AudioContext si el componente que llama a este hook se desmonta de verdad --
  // en la práctica no ocurre mientras el sitio esté abierto, porque MixingConsole vive en el
  // layout raíz (app/layout.tsx), no dentro de una página individual -- nunca al simplemente
  // colapsar el panel visualmente ni al navegar entre páginas del sitio.
  useEffect(() => {
    return () => engine.dispose();
  }, [engine]);

  return { state, engine };
}
