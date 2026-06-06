import Link from 'next/link';

interface PagerLink {
  href: string;
  label: string;
}

interface TemarioPagerProps {
  next?: PagerLink;
  previous?: PagerLink;
}

export default function TemarioPager({ next, previous }: TemarioPagerProps) {
  if (!previous && !next) {
    return null;
  }

  const renderPager = (className: string, label: string) => (
    <nav className={className} aria-label={label}>
      <div className="temario-pager-side">
        {previous ? (
          <Link
            href={previous.href}
            aria-label={`Página anterior: ${previous.label}`}
            className="temario-pager-link"
          >
            <span aria-hidden="true">←</span>
          </Link>
        ) : null}
      </div>

      <div className="temario-pager-side temario-pager-side-next">
        {next ? (
          <Link
            href={next.href}
            aria-label={`Página siguiente: ${next.label}`}
            className="temario-pager-link"
          >
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
    </nav>
  );

  return (
    <>
      {renderPager('temario-pager temario-pager-top', 'Páginas del temario arriba')}
      {renderPager('temario-pager temario-pager-bottom', 'Páginas del temario abajo')}
      <style>{`
        .temario-pager {
          align-items: center;
          display: flex;
          gap: 16px;
          justify-content: space-between;
          width: 100%;
        }

        .temario-pager-bottom {
          margin-top: clamp(64px, 9vw, 96px);
        }

        .temario-pager-top {
          box-sizing: border-box;
          left: 0;
          padding: 0 clamp(10px, 3vw, 28px);
          pointer-events: none;
          position: absolute;
          right: 0;
          top: clamp(10px, 2vw, 22px);
          z-index: 80;
        }

        .temario-pager-side {
          display: flex;
          flex: 1 1 0;
          min-width: 0;
        }

        .temario-pager-side-next {
          justify-content: flex-end;
        }

        .temario-pager-top .temario-pager-side {
          pointer-events: none;
        }

        .temario-pager-link {
          align-items: center;
          background: rgba(255, 255, 255, 0.9);
          border: 2px solid #080808;
          border-radius: 6px;
          color: #080808;
          display: inline-flex;
          font-size: clamp(28px, 4vw, 38px);
          font-weight: 950;
          height: clamp(48px, 8vw, 58px);
          justify-content: center;
          line-height: 1;
          max-width: 100%;
          pointer-events: auto;
          text-decoration: none;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
          width: clamp(48px, 8vw, 58px);
        }

        .temario-pager-link:hover,
        .temario-pager-link:focus-visible {
          background: #ffffff;
          border-color: #047857;
          color: #047857;
        }

        .temario-pager-link:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }
      `}</style>
    </>
  );
}
