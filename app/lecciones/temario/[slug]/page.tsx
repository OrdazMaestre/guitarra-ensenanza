import { notFound } from 'next/navigation';
import AfinacionPage from '../_lesson-pages/AfinacionPage';
import ConceptosBasicosPage from '../_lesson-pages/ConceptosBasicosPage';
import NotacionMusicalPage from '../_lesson-pages/NotacionMusicalPage';
import PlaceholderLessonPage from '../_lesson-pages/PlaceholderLessonPage';
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

  return <PlaceholderLessonPage title={lesson.title} {...lessonProps} />;
}
