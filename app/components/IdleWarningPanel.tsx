'use client';

import Image from 'next/image';
import Link from 'next/link';

interface IdleWarningPanelProps {
  title?: string;
  primaryLabel: string;
  primaryHref?: string;
  onPrimaryClick?: () => void;
  secondaryLabel?: string;
  onSecondaryClick?: () => void;
}

export default function IdleWarningPanel({
  title = '¿Sigues ahí?',
  primaryLabel,
  primaryHref,
  onPrimaryClick,
  secondaryLabel = 'Ir a la portada',
  onSecondaryClick,
}: IdleWarningPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-xl">
        <Image
          src="/images/loading-piratas.png"
          alt=""
          width={1536}
          height={1268}
          className="h-auto w-full rounded-lg"
        />
        <div className="absolute left-[7%] right-[7.5%] top-[83%] bottom-[3%] flex flex-col items-center justify-center gap-2 text-center sm:gap-3">
          <p className="text-base font-black tracking-tight text-amber-950 sm:text-xl">
            {title}
          </p>
          {primaryHref ? (
            <a
              href={primaryHref}
              className="inline-flex items-center justify-center rounded-full bg-amber-900 px-4 py-2 text-xs font-black text-amber-50 shadow-md transition hover:bg-amber-800 active:scale-95 sm:px-5 sm:py-2.5 sm:text-sm"
            >
              {primaryLabel}
            </a>
          ) : (
            <button
              type="button"
              onClick={onPrimaryClick}
              className="inline-flex items-center justify-center rounded-full bg-amber-900 px-4 py-2 text-xs font-black text-amber-50 shadow-md transition hover:bg-amber-800 active:scale-95 sm:px-5 sm:py-2.5 sm:text-sm"
            >
              {primaryLabel}
            </button>
          )}
          <Link
            href="/lecciones/temario"
            onClick={onSecondaryClick}
            className="text-xs font-bold text-amber-900 underline decoration-amber-700 decoration-2 underline-offset-4 transition hover:text-amber-700 sm:text-sm"
          >
            {secondaryLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
