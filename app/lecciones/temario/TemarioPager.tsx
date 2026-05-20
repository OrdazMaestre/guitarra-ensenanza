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
    <nav className="mt-16 flex items-center justify-between gap-4 text-sm sm:mt-20 sm:text-base" aria-label="Paginas del temario">
      <div className="min-w-0 flex-1">
        {previous ? (
          <Link
            href={previous.href}
            className="inline-flex max-w-full flex-col text-left text-zinc-950 no-underline transition hover:text-emerald-700"
          >
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              Pagina anterior
            </span>
            <span className="mt-1 truncate text-lg font-black">{previous.label}</span>
          </Link>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 text-right">
        {next ? (
          <Link
            href={next.href}
            className="inline-flex max-w-full flex-col text-right text-zinc-950 no-underline transition hover:text-emerald-700"
          >
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              Pagina siguiente
            </span>
            <span className="mt-1 truncate text-lg font-black">{next.label}</span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
