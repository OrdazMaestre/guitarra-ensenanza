import Link from 'next/link';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

interface PlaceholderLessonPageProps extends LessonPageProps {
  title: string;
}

export default function PlaceholderLessonPage({ next, previous, title }: PlaceholderLessonPageProps) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/lecciones/temario" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
        Volver a la portada
      </Link>

      <section className="mt-8 border border-zinc-700 bg-zinc-900 px-6 py-8 shadow-xl sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Bloque del temario
        </p>
        <h1 className="mt-4 text-4xl font-black text-zinc-50">{title}</h1>
        <p className="mt-4 text-lg leading-8 text-zinc-300">
          Esta pagina queda preparada para escribir la leccion real cuando empecemos a desarrollar este bloque.
        </p>
      </section>

      <TemarioPager previous={previous} next={next} />
    </main>
  );
}
