import { notFound } from 'next/navigation';
import AcordesPage from '../_lesson-pages/AcordesPage';
import AfinacionPage from '../_lesson-pages/AfinacionPage';
import AmpliacionArpegiosPage from '../_lesson-pages/AmpliacionArpegiosPage';
import ArpegiosPage from '../_lesson-pages/ArpegiosPage';
import ConceptosBasicosPage from '../_lesson-pages/ConceptosBasicosPage';
import LetItBeConAcordesPage from '../_lesson-pages/LetItBeConAcordesPage';
import NotacionMusicalPage from '../_lesson-pages/NotacionMusicalPage';
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

  if (slug === 'ampliacion-arpegios') {
    return <AmpliacionArpegiosPage {...lessonProps} />;
  }

  return <PlaceholderLessonPage title={lesson.title} {...lessonProps} />;
}
