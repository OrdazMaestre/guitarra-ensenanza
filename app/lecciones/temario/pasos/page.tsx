import Link from 'next/link';
import TemarioPager from '../TemarioPager';

const contentTree = [
  'Conceptos basicos',
  'Notacion musical',
  'Tablaturas',
  'Acordes',
  'Arpegios',
  'Pentatonica',
  'Escalas',
];

export default function PasosPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/lecciones/temario" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
        Volver a la portada
      </Link>

      <section className="mt-8 border border-zinc-700 bg-zinc-900 px-6 py-8 shadow-xl sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-300">
          Arbol de contenidos
        </p>
        <h1 className="mt-4 text-4xl font-black text-zinc-50">
          Primeros PASOS
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-300">
          Este mapa ira creciendo a medida que convirtamos el cuadernillo en paginas reales de la web.
        </p>

        <ol className="mt-8 grid gap-3 sm:grid-cols-2">
          {contentTree.map((item, index) => (
            <li key={item} className="border border-zinc-700 bg-zinc-950 px-4 py-4">
              <span className="mr-3 inline-flex h-8 w-8 items-center justify-center bg-emerald-400 font-bold text-zinc-950">
                {index + 1}
              </span>
              <span className="font-semibold text-zinc-100">{item}</span>
            </li>
          ))}
        </ol>
      </section>
      <TemarioPager
        previous={{ href: '/lecciones/temario', label: 'Portada' }}
        next={{ href: '/lecciones/temario/conceptos-basicos', label: 'Conceptos basicos' }}
      />
    </main>
  );
}
