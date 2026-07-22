import { notFound, redirect } from 'next/navigation';
import AcordesEscalaSolMayorPage from '../_lesson-pages/AcordesEscalaSolMayorPage';
import AcordesPage from '../_lesson-pages/AcordesPage';
import AcordesSeptimaPage from '../_lesson-pages/AcordesSeptimaPage';
import AfinacionPage from '../_lesson-pages/AfinacionPage';
import AmpliacionArpegiosPage from '../_lesson-pages/AmpliacionArpegiosPage';
import ArpegiosPage from '../_lesson-pages/ArpegiosPage';
import ConceptosBasicosPage from '../_lesson-pages/ConceptosBasicosPage';
import EjerciciosPentatonicaBluesPage from '../_lesson-pages/EjerciciosPentatonicaBluesPage';
import EjerciciosPentatonicaAvanzadosPage from '../_lesson-pages/EjerciciosPentatonicaAvanzadosPage';
import EjerciciosPentatonicaPage from '../_lesson-pages/EjerciciosPentatonicaPage';
import EjerciciosEscalasAvanzadosPage from '../_lesson-pages/EjerciciosEscalasAvanzadosPage';
import EjerciciosEscalasPage from '../_lesson-pages/EjerciciosEscalasPage';
import EscalaCompletaSolMayorPage from '../_lesson-pages/EscalaCompletaSolMayorPage';
import EscalasPage from '../_lesson-pages/EscalasPage';
import FigurasAcordesPage from '../_lesson-pages/FigurasAcordesPage';
import LetItBeConAcordesPage from '../_lesson-pages/LetItBeConAcordesPage';
import NotacionMusicalPage from '../_lesson-pages/NotacionMusicalPage';
import PentatonicaBluesPage from '../_lesson-pages/PentatonicaBluesPage';
import PentatonicaPage from '../_lesson-pages/PentatonicaPage';
import PlaceholderLessonPage from '../_lesson-pages/PlaceholderLessonPage';
import TablaturasDosCuerdasPage from '../_lesson-pages/TablaturasDosCuerdasPage';
import TablaturasPage from '../_lesson-pages/TablaturasPage';
import { getLessonBySlug, getLessonNeighbors, lessonRouteSlugs } from '../temarioData';

interface LessonBlockPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return lessonRouteSlugs.map((slug) => ({ slug }));
}

function extensionPrevious(href: string, label: string) {
  // Extension pages only point back to their parent lesson.
  // They intentionally do not expose a "next" pager link, so branches stay discoverable from their parent page.
  return {
    previous: {
      href,
      label,
    },
  };
}

export default async function LessonBlockPage({ params }: LessonBlockPageProps) {
  const { slug } = await params;

  if (slug === 'ampliacion-arpegios') {
    return (
      <AmpliacionArpegiosPage
        {...extensionPrevious('/lecciones/temario/arpegios', 'Arpegios')}
      />
    );
  }

  if (slug === 'afinacion') {
    return (
      <AfinacionPage
        {...extensionPrevious('/lecciones/temario/notacion-musical', 'Notación musical')}
      />
    );
  }

  if (slug === 'patrones-griegos') {
    redirect('/lecciones/temario/modos-griegos');
  }

  if (slug === 'modos-griegos') {
    return (
      <PlaceholderLessonPage
        title="Modos"
        {...extensionPrevious('/lecciones/temario/escalas', 'Escalas')}
      >
        <section className="grid gap-4">
          <h2 className="text-2xl font-black text-zinc-50">Vídeos para empezar</h2>
          <div className="grid gap-3">
            <a
              className="font-black text-emerald-300 underline decoration-emerald-500 decoration-2 underline-offset-4 hover:text-emerald-200"
              href="https://www.youtube.com/watch?v=e9ay6zMICw8&t=2s"
              rel="noreferrer"
              target="_blank"
            >
              Jaime Altozano: modos
            </a>
            <a
              className="font-black text-emerald-300 underline decoration-emerald-500 decoration-2 underline-offset-4 hover:text-emerald-200"
              href="https://www.youtube.com/watch?v=8i7K9GYzbIY"
              rel="noreferrer"
              target="_blank"
            >
              Jaime Altozano: más sobre modos
            </a>
          </div>
        </section>
      </PlaceholderLessonPage>
    );
  }

  if (slug === 'escala-completa-sol-mayor') {
    return (
      <EscalaCompletaSolMayorPage
        {...extensionPrevious('/lecciones/temario/escalas', 'Escalas')}
      />
    );
  }

  if (slug === 'ejercicios-escalas') {
    return (
      <EjerciciosEscalasPage
        {...extensionPrevious('/lecciones/temario/escala-completa-sol-mayor', 'Escala completa de Sol Mayor')}
      />
    );
  }

  if (slug === 'acordes-escala-sol-mayor') {
    return (
      <AcordesEscalaSolMayorPage
        {...extensionPrevious('/lecciones/temario/escala-completa-sol-mayor', 'Escala completa de Sol Mayor')}
      />
    );
  }

  if (slug === 'acordes-con-septima') {
    return (
      <AcordesSeptimaPage
        {...extensionPrevious('/lecciones/temario/acordes-escala-sol-mayor', 'Acordes de la escala de Sol Mayor')}
      />
    );
  }

  if (slug === 'ejercicios-escalas-avanzados') {
    return (
      <EjerciciosEscalasAvanzadosPage
        {...extensionPrevious('/lecciones/temario/ejercicios-escalas', 'Ejercicios de escalas')}
      />
    );
  }

  if (slug === 'ejercicios-pentatonica') {
    return (
      <EjerciciosPentatonicaPage
        {...extensionPrevious('/lecciones/temario/pentatonica', 'Pentatónica')}
      />
    );
  }

  if (slug === 'ejercicios-pentatonica-avanzados') {
    return (
      <EjerciciosPentatonicaAvanzadosPage
        {...extensionPrevious('/lecciones/temario/ejercicios-pentatonica', 'Ejercicios de pentatónica')}
      />
    );
  }

  if (slug === 'pentatonica-blues') {
    return (
      <PentatonicaBluesPage
        {...extensionPrevious('/lecciones/temario/pentatonica', 'Pentatónica')}
      />
    );
  }

  if (slug === 'ejercicios-pentatonica-blues') {
    return (
      <EjerciciosPentatonicaBluesPage
        {...extensionPrevious('/lecciones/temario/pentatonica-blues', 'Pentatónica de blues')}
      />
    );
  }

  if (slug === 'tablaturas-dos-cuerdas') {
    return (
      <TablaturasDosCuerdasPage
        {...extensionPrevious('/lecciones/temario/tablaturas', 'Tablaturas')}
      />
    );
  }

  const lesson = getLessonBySlug(slug);

  if (!lesson) {
    notFound();
  }

  const neighbors = getLessonNeighbors(slug);
  const previous = neighbors.previous
    ? {
        href: `/lecciones/temario/${neighbors.previous.slug}`,
        label: neighbors.previous.title,
      }
    : {
        href: '/lecciones/temario',
        label: 'Portada',
      };
  const next = neighbors.next
    ? {
        href: `/lecciones/temario/${neighbors.next.slug}`,
        label: neighbors.next.title,
      }
    : undefined;

  const lessonProps = { previous, next };

  if (slug === 'conceptos-basicos') {
    return <ConceptosBasicosPage {...lessonProps} />;
  }

  if (slug === 'notacion-musical') {
    return <NotacionMusicalPage {...lessonProps} />;
  }

  if (slug === 'tablaturas') {
    return <TablaturasPage {...lessonProps} />;
  }

  if (slug === 'acordes') {
    return <AcordesPage {...lessonProps} />;
  }

  if (slug === 'let-it-be-con-acordes') {
    return <LetItBeConAcordesPage {...lessonProps} />;
  }

  if (slug === 'arpegios') {
    return <ArpegiosPage {...lessonProps} />;
  }

  if (slug === 'figuras-de-acordes') {
    return <FigurasAcordesPage {...lessonProps} />;
  }

  if (slug === 'pentatonica') {
    return <PentatonicaPage {...lessonProps} />;
  }

  if (slug === 'escalas') {
    return <EscalasPage {...lessonProps} />;
  }

  if (slug === 'funciones-tonales') {
    return (
      <PlaceholderLessonPage title={lesson.title} {...lessonProps}>
        <p>
          Hasta tener la página compuesta, podemos ver el{' '}
          <a
            className="font-black text-emerald-300 underline decoration-emerald-500 decoration-2 underline-offset-4 hover:text-emerald-200"
            href="https://www.youtube.com/watch?v=o6aOC3rERF0&t=65s"
            rel="noreferrer"
            target="_blank"
          >
            video de Jaime Altozano
          </a>
          , así como todo su canal, dado que son vídeos muy buenos a pesar de que toca piano y no guitarra.
        </p>
        <section className="grid gap-3 rounded-lg border-4 border-red-600 bg-red-50 p-5 text-center text-zinc-950">
          <p className="font-black uppercase">Última unidad del camino principal.</p>
          <p>Probablemente te dejaste atrás ampliaciones de muchas unidades anteriores.</p>
          <p>Ahora estás más preparado para volver a ellas.</p>
          <p>A partir de aquí toca investigar la web a tu ritmo.</p>
          <p>Entiende, asimila y practica poco a poco.</p>
          <p>Practica tempo con el metrónomo.</p>
          <p>Hay enlaces secretos.</p>
          <p>Explora, aprende y diviértete.</p>
          <p>Con un profesor siempre será más fácil avanzar contenidos.</p>
          <p>Pero luego hay que practicar mucho en casa.</p>
        </section>

        
      </PlaceholderLessonPage>
    );
  }

  return <PlaceholderLessonPage title={lesson.title} {...lessonProps} />;
}
