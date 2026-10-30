import Image from 'next/image';
import Link from 'next/link';

// Botón circular con el logo de la web que lleva al árbol de contenidos (sustituye al antiguo
// botón "Portada"). Al pasar el ratón (o con foco) el logo se convierte en "VER TODO": el círculo
// crece con transform: scale(), que no ocupa sitio en el layout, así que el buscador de al lado no
// se mueve. No crece en anchura a un lado porque en la portada tiene justo a la izquierda el botón
// fijo de la mesa de mezclas y en el otro lado el buscador.
// Con `home` (solo en el propio árbol, donde "Ver todo" no llevaría a ningún sitio nuevo) lleva a
// la portada y al pasar el ratón muestra una casita en lugar de "VER TODO".
export default function TreeButton({ home = false }: { home?: boolean }) {
  const label = home ? 'Ir a la portada' : 'Ver todo el temario';
  return (
    <Link href={home ? '/lecciones/temario' : '/lecciones/temario/pasos'} className="site-tree-button" aria-label={label} title={label}>
      <Image src="/android-chrome-192x192.png" alt="" width={192} height={192} className="site-tree-logo" />
      {home ? (
        <span className="site-tree-label site-tree-home" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M12 3 2.5 11.2l1.3 1.5L5 11.7V20a1 1 0 0 0 1 1h4.5v-6h3v6H18a1 1 0 0 0 1-1v-8.3l1.2 1 1.3-1.5L12 3Z" />
          </svg>
        </span>
      ) : (
        <span className="site-tree-label" aria-hidden="true">
          Ver
          <br />
          todo
        </span>
      )}
    </Link>
  );
}
