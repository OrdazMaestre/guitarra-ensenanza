import Image from 'next/image';
import Link from 'next/link';
import { Caveat_Brush, Poppins, Space_Mono } from 'next/font/google';
import { RenderTopNotice, VercelLimitNotice } from '../../../components/DeploymentNotice';
import PortadaShell from './PortadaShell';

// Portada NUEVA en pruebas. Solo se llega desde el botón "Portada" de la sala de pruebas (ver
// SiteHomeLink.tsx); la portada real sigue siendo ../page.tsx hasta que esta esté terminada.
// Las tipografías se cargan solo aquí para no cambiar nada del resto de la web.
const brush = Caveat_Brush({ subsets: ['latin'], weight: '400', variable: '--portada2-brush' });
const mono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--portada2-mono' });
const body = Poppins({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--portada2-body' });

export default function PortadaNuevaPage() {
  return (
    <main className="portada2-main">
      <PortadaShell className={`${brush.variable} ${mono.variable} ${body.variable}`}>
        <section className="portada2-stage">
          <div className="portada2-bg-wrap" aria-hidden="true">
            <Image
              src="/images/guitar/cover-instruments-pencil.png"
              alt=""
              width={1746}
              height={901}
              priority
              className="portada2-bg"
            />
          </div>

          <div className="portada2-copy">
            <RenderTopNotice />
            <p className="portada2-eyebrow">Tu guitarra, tu ritmo</p>
            <h1 className="portada2-title">
              <span className="portada2-title-top">Primeros</span>
              <span className="portada2-title-pasos">
                <span className="portada2-strokes portada2-strokes-left" aria-hidden="true">
                  <svg viewBox="0 0 40 60" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round">
                    <path d="M36 14 6 6" />
                    <path d="M34 32 4 30" />
                    <path d="M36 50 10 56" />
                  </svg>
                </span>
                <Link href="/lecciones/temario/pasos" className="portada2-pasos-link">
                  PASOS
                </Link>
                <span className="portada2-strokes portada2-strokes-right" aria-hidden="true">
                  <svg viewBox="0 0 60 60" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <g stroke="currentColor" strokeWidth="4">
                      <path d="M10 18 3 11" />
                      <path d="M8 30H1" />
                      <path d="M18 9 17 2" />
                    </g>
                    <path d="M20 18 52 34 38 37 46 52 39 55 31 40 21 49Z" fill="#111111" stroke="#ffffff" strokeWidth="2" />
                  </svg>
                </span>
              </span>
              <span className="portada2-title-bottom">con mi guitarra</span>
            </h1>
            <p className="portada2-author">
              Por: <span>Enrique Ordaz</span>
            </p>
            <div className="portada2-intro">
              <p>Aprende desde lo más básico hasta donde quieras llegar de forma visual, práctica y divertida.</p>
              <p>Cada uno aprende a su <strong>ritmo</strong> y cada uno tiene sus <strong>objetivos</strong>. Aquí preferimos enseñar <strong>un poco de todo</strong> para que cada uno elija en qué centrarse.</p>
              <p>La mejor forma de <strong>aprender</strong> y <strong>mejorar</strong> más rápido es en clase con un profesor, en un grupo de música y practicando en casa.</p>
            </div>
            <VercelLimitNotice />
          </div>
        </section>
      </PortadaShell>

      <style>{`
        .portada2-main {
          background: #fbfbfa;
          color: #111111;
          margin: 0;
          max-width: 100%;
          min-height: 100vh;
          overflow-x: clip;
          width: 100%;
        }

        .portada2-page {
          font-family: var(--portada2-body), system-ui, sans-serif;
          min-width: 0;
          position: relative;
        }

        /* ---------- Cabecera ---------- */

        /* Padding lateral de 64px como mínimo: arriba a la izquierda vive el botón fijo de la mesa
           de mezclas y arriba a la derecha el de claro/oscuro (44px + 12px de margen cada uno). */
        .portada2-header {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 12px 24px;
          justify-content: space-between;
          padding: 14px clamp(64px, 6vw, 96px);
          position: relative;
          z-index: 20;
        }

        .portada2-header.is-midis-open {
          padding-bottom: 76px;
        }

        .portada2-brand {
          align-items: center;
          display: flex;
          gap: 14px;
          min-width: 0;
        }

        .portada2-logo {
          border-radius: 10px;
          display: block;
          flex: 0 0 auto;
          height: 48px;
          width: 48px;
        }

        .portada2-brand-name {
          font-family: var(--portada2-mono), monospace;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .portada2-nav {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 4px 8px;
          position: relative;
        }

        .portada2-menu {
          position: static;
        }

        .portada2-nav-button {
          align-items: center;
          background: transparent;
          border: 0;
          border-bottom: 3px solid transparent;
          color: #111111;
          cursor: pointer;
          display: inline-flex;
          font-family: var(--portada2-mono), monospace;
          font-size: 15px;
          font-weight: 700;
          gap: 8px;
          letter-spacing: 0.08em;
          min-height: 44px;
          padding: 8px 12px;
          text-transform: uppercase;
        }

        .portada2-nav-button:hover,
        .portada2-nav-button[aria-expanded='true'] {
          border-bottom-color: #10b981;
          color: #047857;
        }

        .portada2-nav-button:focus-visible,
        .portada2-midi-option:focus-visible,
        .portada2-nav-link:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 2px;
        }

        .portada2-chevron {
          transition: transform 160ms ease;
        }

        .portada2-dropdown {
          background: #ffffff;
          border: 2px solid #111111;
          border-radius: 10px;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
          list-style: none;
          margin: 0;
          max-width: calc(100vw - 32px);
          padding: 8px;
          position: absolute;
          right: 0;
          top: calc(100% + 8px);
          width: 300px;
          z-index: 30;
        }

        .portada2-nav-link {
          align-items: center;
          border-radius: 6px;
          color: #111111;
          display: flex;
          font-size: 16px;
          font-weight: 600;
          gap: 12px;
          min-height: 44px;
          padding: 6px 10px;
          text-decoration: none;
        }

        .portada2-nav-link:hover {
          background: #ecfdf5;
          color: #047857;
        }

        .portada2-lesson-number {
          align-items: center;
          border: 2px solid currentColor;
          border-radius: 999px;
          display: inline-flex;
          flex: 0 0 auto;
          font-family: var(--portada2-mono), monospace;
          font-size: 13px;
          font-weight: 700;
          height: 28px;
          justify-content: center;
          width: 28px;
        }

        .portada2-midi-options {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          position: absolute;
          right: 0;
          top: calc(100% + 14px);
        }

        .portada2-midi-option {
          background: #ffffff;
          border: 2px solid #111111;
          border-radius: 999px;
          color: #111111;
          cursor: pointer;
          font-family: var(--portada2-mono), monospace;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.06em;
          min-height: 44px;
          padding: 8px 20px;
          text-transform: uppercase;
        }

        .portada2-midi-option:hover {
          border-color: #047857;
          color: #047857;
        }

        .portada2-midi-option[aria-pressed='true'] {
          background: #047857;
          border-color: #047857;
          color: #ffffff;
        }

        /* ---------- Instrumento en grande ---------- */

        .portada2-instrument {
          background: rgba(255, 255, 255, 0.96);
          border: 2px solid #111111;
          border-radius: 14px;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.12);
          box-sizing: border-box;
          margin: 0 auto clamp(24px, 4vw, 40px);
          max-width: min(1080px, calc(100% - 32px));
          min-width: 0;
          padding: clamp(16px, 3vw, 28px) clamp(12px, 3vw, 28px) clamp(64px, 8vw, 80px);
          position: relative;
          z-index: 10;
        }

        .portada2-instrument h2 {
          font-family: var(--portada2-brush), cursive;
          font-size: clamp(28px, 4vw, 40px);
          font-weight: 400;
          line-height: 1;
          margin: 0 0 clamp(12px, 2vw, 20px);
        }

        .portada2-keyboard {
          margin: 0 auto;
          max-width: 760px;
        }

        /* ---------- Hero ---------- */

        .portada2-stage {
          align-items: center;
          box-sizing: border-box;
          display: flex;
          min-height: calc(100svh - 80px);
          padding: clamp(16px, 4vh, 48px) clamp(24px, 6vw, 96px) clamp(48px, 8vh, 96px);
          position: relative;
        }

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
           oscuro, donde todo .site-shell se invierte. */
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

        .portada2-copy {
          max-width: 600px;
          min-width: 0;
          position: relative;
          width: 100%;
          z-index: 1;
        }

        .portada2-eyebrow {
          color: #059669;
          font-family: var(--portada2-mono), monospace;
          font-size: clamp(13px, 1.2vw, 17px);
          font-weight: 700;
          letter-spacing: 0.24em;
          margin: 0 0 12px;
          text-transform: uppercase;
        }

        .portada2-title {
          font-family: var(--portada2-brush), cursive;
          font-weight: 400;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 0;
        }

        .portada2-title > span {
          display: block;
        }

        /* Caveat Brush solo existe en un grosor: un trazo fino del mismo color lo engorda hasta
           parecerse al pincel del diseño. */
        .portada2-title-top,
        .portada2-title-bottom {
          -webkit-text-stroke: 0.025em currentColor;
        }

        .portada2-title-top {
          font-size: clamp(62px, 8vw, 118px);
          transform: rotate(-4deg);
          transform-origin: left center;
        }

        .portada2-title-pasos {
          align-items: center;
          display: flex !important;
          font-size: clamp(76px, 10vw, 148px);
          margin: 0.04em 0 0.02em 0.22em;
          transform: rotate(-4deg);
          transform-origin: left center;
          width: max-content;
          max-width: 100%;
        }

        /* El enlace sigue teniendo el balanceo y subrayado globales de todos los enlaces de la web
           (la pista para los niños de que se puede pulsar); solo el relleno es el degradado. */
        .portada2-pasos-link {
          background: linear-gradient(100deg, #10b981 0%, #14b8a6 55%, #06b6d4 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          padding: 0 0.04em;
        }

        .portada2-strokes {
          color: #10b981;
          display: inline-flex;
          flex: 0 0 auto;
        }

        .portada2-strokes-left {
          margin-right: 0.08em;
          width: 0.32em;
        }

        .portada2-strokes-right {
          align-self: flex-start;
          margin-left: 0.06em;
          width: 0.46em;
        }

        .portada2-strokes svg {
          display: block;
          height: auto;
          width: 100%;
        }

        .portada2-title-bottom {
          font-size: clamp(46px, 5.8vw, 88px);
          transform: rotate(-4deg);
          transform-origin: left center;
        }

        .portada2-author {
          font-family: var(--portada2-mono), monospace;
          font-size: clamp(15px, 1.4vw, 19px);
          font-weight: 700;
          letter-spacing: 0.16em;
          margin: clamp(22px, 3vw, 34px) 0 0;
          overflow-wrap: anywhere;
          text-transform: uppercase;
        }

        .portada2-author span {
          color: #059669;
        }

        .portada2-intro {
          color: #2a2a2a;
          font-size: clamp(16px, 1.25vw, 19px);
          line-height: 1.55;
          margin-top: clamp(14px, 2vw, 22px);
          max-width: 540px;
        }

        .portada2-intro p {
          margin: 0 0 10px;
        }

        .portada2-intro strong {
          color: #111111;
          font-weight: 700;
        }

        .render-top-notice {
          color: #8a8a8a;
          font-size: clamp(11px, 0.95vw, 13px);
          line-height: 1.45;
          margin: 0 0 20px;
          max-width: 480px;
        }

        .render-top-notice-link,
        .deployment-notice-link {
          color: #047857;
          font-weight: 700;
        }

        .deployment-notice {
          background: #f4f4f4;
          border-left: 3px solid #047857;
          color: #4b4b4b;
          font-size: clamp(13px, 1.1vw, 15px);
          line-height: 1.5;
          margin: 24px 0 0;
          max-width: 620px;
          padding: 10px 14px;
        }

        /* ---------- Pantallas medianas: la cabecera se centra ---------- */

        @media (max-width: 980px) {
          .portada2-header {
            justify-content: center;
          }

          .portada2-midi-options {
            justify-content: center;
            left: 0;
          }

          .portada2-dropdown {
            left: 50%;
            right: auto;
            transform: translateX(-50%);
          }

        }

        /* ---------- Móvil ---------- */

        @media (max-width: 620px) {
          .portada2-header {
            padding: 10px 56px;
          }

          .portada2-header.is-midis-open {
            padding-bottom: 72px;
          }

          .portada2-logo {
            height: 40px;
            width: 40px;
          }

          .portada2-brand-name {
            font-size: 12px;
            letter-spacing: 0.08em;
          }

          /* Aquí la barra de controles del instrumento siempre acaba en el flujo (MidiInstrumentChrome
             lo decide solo), así que no hace falta reservarle hueco flotante debajo. */
          .portada2-instrument {
            padding-bottom: 20px;
          }

          /* La fila de la nav queda por debajo de los botones fijos de las esquinas, así que puede
             recuperar el padding lateral de la cabecera y caber en una sola línea a 360px. */
          .portada2-nav {
            justify-content: center;
            margin: 0 -48px;
            width: calc(100% + 96px);
          }

          .portada2-nav-button {
            font-size: 13px;
            gap: 6px;
            padding: 8px 8px;
          }

          .portada2-midi-option {
            font-size: 13px;
            padding: 8px 16px;
          }

          .portada2-stage {
            padding: 12px 20px 40px;
          }

          .portada2-title-top {
            font-size: clamp(50px, 15vw, 70px);
          }

          .portada2-title-pasos {
            font-size: clamp(60px, 19vw, 88px);
            margin-left: 0.12em;
          }

          .portada2-title-bottom {
            font-size: clamp(36px, 11vw, 52px);
          }

          .portada2-intro {
            font-size: 16px;
          }
        }
      `}</style>
    </main>
  );
}
