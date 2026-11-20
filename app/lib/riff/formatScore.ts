// Formato de los puntos de la partida ("4" o "2,5"). Función pura, sin JSX ni audio -- sacada de
// RiffHighway.tsx para que ReducedFretboardDiagram.tsx pueda usarla sin cargar todo ese módulo
// (RiffHighway ahora se importa con next/dynamic; ver "Nuevo formato en toda la web" /
// rendimiento de compilación en AlphaTabPlayer.NOTES.md y AGENTS.md).
export function formatScore(points: number) {
  return Number.isInteger(points) ? String(points) : points.toFixed(1).replace('.', ',');
}
