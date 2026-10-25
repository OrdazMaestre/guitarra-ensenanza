'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SiteHomeLink() {
  const pathname = usePathname();

  if (pathname === '/lecciones/temario') {
    return null;
  }

  return (
    <Link href="/lecciones/temario" className="site-home-link">
      Portada
    </Link>
  );
}
