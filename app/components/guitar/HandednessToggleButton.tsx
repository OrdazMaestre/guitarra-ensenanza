'use client';

// Botón diestro/zurdo compartido por todos los mástiles MIDI del sitio -- a petición explícita del
// usuario de implementarlo en TODOS ellos. Extraído a su propio fichero (en vez de duplicar el
// mismo botón en ReducedFretboardDiagram.tsx, TuningBoard.tsx y cada diagrama page-local) para que
// el estilo y el texto ("DIESTRO"/"ZURDO", a petición explícita) solo vivan en un sitio. Mismo
// patrón visual/estilo inline que el botón KEYBOARD de cada mástil: texto en vez de icono, mismo
// par de colores activo/inactivo. Cada mástil sigue siendo dueño de su propio estado `lefty` y de
// cómo lo aplica (mirror de coordenadas X, mapa de teclado invertido) -- este componente es solo el
// control visual.
export function HandednessToggleButton({ lefty, onClick }: { lefty: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={lefty ? 'Cambiar a modo diestro' : 'Cambiar a modo zurdo'}
      aria-pressed={lefty}
      style={{
        background: lefty ? '#047857' : 'transparent',
        border: `1.5px solid ${lefty ? '#047857' : '#9ca3af'}`,
        borderRadius: '5px',
        color: lefty ? '#fff' : '#6b7280',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 700,
        lineHeight: 1.4,
        padding: '3px 8px',
      }}
    >
      {lefty ? 'ZURDO' : 'DIESTRO'}
    </button>
  );
}

// Aviso compartido: "zurdo + teclado" a la vez -- a petición explícita del usuario, en TODOS los
// mástiles MIDI del sitio. Se renderiza vía el nuevo prop `belowNote` de MidiInstrumentChrome, que
// lo coloca en el hueco entre el final del mástil (números de traste) y la fila de botones --
// posición DISTINTA del aviso de ghosting existente (`warning`, que flota POR ENCIMA del
// instrumento) ya que el usuario pidió explícitamente ese hueco concreto, no reemplazar el aviso de
// ghosting ni compartir su sitio. Mismo lenguaje visual ámbar que ese aviso (mismo tema de fondo:
// "tu teclado físico puede no comportarse como se espera") para no introducir un tercer estilo de
// aviso en la interfaz. Cada mástil decide cuándo mostrarlo: `kbMode && lefty` (modo teclado Y
// zurdo activos a la vez), nunca uno sin el otro.
export function KeyboardLeftyNote() {
  return (
    <span style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
      ⌨ Funcionará mejor o peor según las teclas de tu teclado
    </span>
  );
}
