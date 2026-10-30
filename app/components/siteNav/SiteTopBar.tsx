'use client';

import { usePathname } from 'next/navigation';
import type { SiteSearchEntry } from '../../lib/siteSearchIndex';
import SiteSearch from './SiteSearch';
import TreeButton from './TreeButton';

// Barra superior de TODAS las páginas (incluidas las ocultas): botón del árbol + buscador. En la
// portada no se pinta aquí porque la propia cabecera de la portada los lleva (PortadaShell.tsx).
// En el árbol, el botón del árbol lleva a la portada (casita).
export default function SiteTopBar({ entries }: { entries: SiteSearchEntry[] }) {
  const pathname = usePathname();

  if (pathname === '/lecciones/temario') {
    return null;
  }

  return (
    <div className="site-top-bar">
      <TreeButton home={pathname === '/lecciones/temario/pasos'} />
      <SiteSearch entries={entries} />
    </div>
  );
}
