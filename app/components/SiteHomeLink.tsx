'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Portada nueva en pruebas: solo se llega a ella desde la sala de pruebas, sin tocar la portada
// real del resto de páginas hasta que esté terminada (entonces se mueve a /lecciones/temario y
// este caso especial desaparece).
const DRAFT_COVER_PATH = '/lecciones/temario/portada-nueva';

export default function SiteHomeLink() {
  const pathname = usePathname();

  if (pathname === '/lecciones/temario' || pathname === DRAFT_COVER_PATH) {
    return null;
  }

  const href = pathname === '/lecciones/temario/sala-de-pruebas' ? DRAFT_COVER_PATH : '/lecciones/temario';

  return (
    <Link href={href} className="site-home-link">
      Portada
    </Link>
  );
}
