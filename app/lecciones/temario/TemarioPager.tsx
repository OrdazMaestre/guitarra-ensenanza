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

  return (
    <nav className="temario-pager" aria-label="Paginas del temario">
      <div className="temario-pager-side">
        {previous ? (
          <Link
            href={previous.href}
            aria-label={`Pagina anterior: ${previous.label}`}
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
            aria-label={`Pagina siguiente: ${next.label}`}
            className="temario-pager-link"
          >
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>

      <style>{`
        .temario-pager {
          align-items: center;
          display: flex;
          gap: 16px;
          justify-content: space-between;
          margin-top: clamp(64px, 9vw, 96px);
          width: 100%;
        }

        .temario-pager-side {
          display: flex;
          flex: 1 1 0;
          min-width: 0;
        }

        .temario-pager-side-next {
          justify-content: flex-end;
        }

        .temario-pager-link {
          align-items: center;
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
          text-decoration: none;
          transition: border-color 160ms ease, color 160ms ease;
          width: clamp(48px, 8vw, 58px);
        }

        .temario-pager-link:hover,
        .temario-pager-link:focus-visible {
          border-color: #047857;
          color: #047857;
        }

        .temario-pager-link:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }
      `}</style>
    </nav>
  );
}
