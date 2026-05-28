import { notFound } from 'next/navigation';
import AcordesPage from '../_lesson-pages/AcordesPage';
import AfinacionPage from '../_lesson-pages/AfinacionPage';
import AmpliacionArpegiosPage from '../_lesson-pages/AmpliacionArpegiosPage';
import ArpegiosPage from '../_lesson-pages/ArpegiosPage';
import ConceptosBasicosPage from '../_lesson-pages/ConceptosBasicosPage';
import EscalasPage from '../_lesson-pages/EscalasPage';
import FigurasAcordesPage from '../_lesson-pages/FigurasAcordesPage';
import LetItBeConAcordesPage from '../_lesson-pages/LetItBeConAcordesPage';
import NotacionMusicalPage from '../_lesson-pages/NotacionMusicalPage';
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

export default async function LessonBlockPage({ params }: LessonBlockPageProps) {
  const { slug } = await params;

  if (slug === 'ampliacion-arpegios') {
    return (
      <AmpliacionArpegiosPage
        previous={{
          href: '/lecciones/temario/arpegios',
          label: 'Arpegios',
        }}
      />
    );
  }

  if (slug === 'patrones-griegos') {
    return (
      <PlaceholderLessonPage
        title="Patrones griegos"
        previous={{
          href: '/lecciones/temario/escalas',
          label: 'Escalas',
        }}
      />
    );
  }

  if (slug === 'ejercicios-pentatonica') {
    return (
      <PlaceholderLessonPage
        title="Ejercicios de pentatonica"
        previous={{
          href: '/lecciones/temario/pentatonica',
          label: 'Pentatonica',
        }}
      />
    );
  }

  if (slug === 'pentatonica-blues') {
    return (
      <PlaceholderLessonPage
        title="Pentatonica de blues"
        previous={{
          href: '/lecciones/temario/pentatonica',
          label: 'Pentatonica',
        }}
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

  if (slug === 'tablaturas-dos-cuerdas') {
    return <TablaturasDosCuerdasPage {...lessonProps} />;
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
