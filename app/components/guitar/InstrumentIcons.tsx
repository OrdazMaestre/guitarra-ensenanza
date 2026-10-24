// Iconos de la barra de controles de los instrumentos MIDI (petición del usuario: ahorrar espacio
// cambiando texto por iconos). Trazo fino que hereda el color del botón (`currentColor`). El texto
// de antes queda oculto a la vista pero sigue siendo el nombre accesible del botón, así los
// lectores de pantalla (y los tests, que buscan "KEYBOARD") no cambian.

import type { CSSProperties } from 'react';

const SR_ONLY: CSSProperties = {
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: 1,
};

const ICON_STYLE: CSSProperties = { display: 'block' };

// Teclado de ordenador (botón KEYBOARD de cada instrumento).
export function KeyboardToggleLabel() {
  return (
    <>
      <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" style={ICON_STYLE} viewBox="0 0 24 24" width="22">
        <title>Tocar con el teclado del ordenador</title>
        <rect height="14" rx="2" width="20" x="2" y="5" />
        <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h.01M12 13h.01M16 13h.01M7 16h10" />
      </svg>
      <span style={SR_ONLY}>KEYBOARD</span>
    </>
  );
}

// Mano (diestro/zurdo): la mano derecha vista por el dorso, con el pulgar a la izquierda; la
// izquierda es su reflejo.
export function HandIcon({ side }: { side: 'right' | 'left' }) {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" style={{ ...ICON_STYLE, transform: side === 'left' ? 'scaleX(-1)' : undefined }} viewBox="0 0 24 24" width="18">
      <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}
