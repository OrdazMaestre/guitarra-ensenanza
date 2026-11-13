import Image from 'next/image';

// Fondo a lápiz de la portada (instrumentos dibujados), compartido con el árbol del temario.
// Por defecto ocupa su contenedor (position: absolute; inset: 0); cada página puede colocarlo de
// otra forma con `className` (el temario lo deja fijo con sticky mientras se baja por el árbol).
export default function CoverBackdrop({ className = '', priority = false }: { className?: string; priority?: boolean }) {
  return (
    <div className={`portada2-bg-wrap ${className}`} aria-hidden="true">
      <Image
        src="/images/guitar/cover-instruments-pencil.png"
        alt=""
        width={1746}
        height={901}
        priority={priority}
        className="portada2-bg"
      />
      <style>{`
        /* El dibujo va SIEMPRE detrás del texto con el mismo filtro, en cualquier ancho. Su tamaño
           solo depende del alto de la pantalla (--portada2-bg-h), nunca del ancho: al ensanchar
           la ventana no crece ni encoge, solo se mueve. Mientras no cabe entero se recorta
           centrado en el 70% (se ven las guitarras); en cuanto cabe, se queda pegado a la derecha.
           Eso es el max() de "left": el primer término gana mientras sobra imagen (negativo), el
           segundo en cuanto sobra pantalla (positivo). 1.938 = 1746/901, proporción del dibujo. */
        .portada2-bg-wrap {
          --portada2-bg-h: clamp(520px, calc(100svh - 80px), 860px);
          --portada2-bg-w: calc(var(--portada2-bg-h) * 1.938);
          inset: 0;
          opacity: 0.35;
          overflow: hidden;
          pointer-events: none;
          position: absolute;
          z-index: 0;
        }

        /* Bordes difuminados con máscara sobre la propia imagen: el gris del papel del dibujo no
           coincide con el fondo de la página y sin esto se ve su recuadro. Funciona igual en modo
           oscuro, donde todo .site-shell se invierte (img.portada2-bg está exento en globals.css). */
        .portada2-bg {
          height: var(--portada2-bg-h);
          left: max(calc((100% - var(--portada2-bg-w)) * 0.7), calc(100% - var(--portada2-bg-w)));
          max-width: none;
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: var(--portada2-bg-w);
          -webkit-mask-image:
            linear-gradient(to right, transparent 0%, #000 14%),
            linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%);
          -webkit-mask-composite: source-in;
          mask-image:
            linear-gradient(to right, transparent 0%, #000 14%),
            linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%);
          mask-composite: intersect;
        }
      `}</style>
    </div>
  );
}
