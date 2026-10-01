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
