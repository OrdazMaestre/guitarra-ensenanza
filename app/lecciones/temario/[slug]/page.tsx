import { notFound, redirect } from 'next/navigation';
import AcordesPage from '../_lesson-pages/AcordesPage';
import AfinacionPage from '../_lesson-pages/AfinacionPage';
import AmpliacionArpegiosPage from '../_lesson-pages/AmpliacionArpegiosPage';
import ArpegiosPage from '../_lesson-pages/ArpegiosPage';
import ConceptosBasicosPage from '../_lesson-pages/ConceptosBasicosPage';
import EjerciciosPentatonicaBluesPage from '../_lesson-pages/EjerciciosPentatonicaBluesPage';
import EjerciciosPentatonicaAvanzadosPage from '../_lesson-pages/EjerciciosPentatonicaAvanzadosPage';
import EjerciciosPentatonicaPage from '../_lesson-pages/EjerciciosPentatonicaPage';
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
import { getLessonBySlug, getLessonNeighbors } from '../temarioData';

interface LessonBlockPageProps {
  params: Promise<{
    slug: string;
  }>;
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

  if (slug === 'patrones-griegos') {
    redirect('/lecciones/temario/modos-griegos');
  }

  if (slug === 'modos-griegos') {
    return (
      <PlaceholderLessonPage
        title="Modos griegos"
        {...extensionPrevious('/lecciones/temario/escalas', 'Escalas')}
      />
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

  if (slug === 'ejercicios-escalas-avanzados') {
    return (
      <PlaceholderLessonPage
        title="Ejercicios avanzados de escalas"
        {...extensionPrevious('/lecciones/temario/ejercicios-escalas', 'Ejercicios de escalas')}
      />
    );
  }

  if (slug === 'ejercicios-pentatonica') {
    return (
      <EjerciciosPentatonicaPage
        {...extensionPrevious('/lecciones/temario/pentatonica', 'Pentatonica')}
      />
    );
  }

  if (slug === 'ejercicios-pentatonica-avanzados') {
    return (
      <EjerciciosPentatonicaAvanzadosPage
        {...extensionPrevious('/lecciones/temario/ejercicios-pentatonica', 'Ejercicios de pentatonica')}
      />
    );
  }

  if (slug === 'pentatonica-blues') {
    return (
      <PentatonicaBluesPage
        {...extensionPrevious('/lecciones/temario/pentatonica', 'Pentatonica')}
      />
    );
  }

  if (slug === 'ejercicios-pentatonica-blues') {
    return (
      <EjerciciosPentatonicaBluesPage
        {...extensionPrevious('/lecciones/temario/pentatonica-blues', 'Pentatonica de blues')}
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

  if (slug === 'afinacion') {
    return <AfinacionPage {...lessonProps} />;
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

  return <PlaceholderLessonPage title={lesson.title} {...lessonProps} />;
}
