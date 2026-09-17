export interface PagerLink {
  href: string;
  label: string;
}

export interface LessonPageProps {
  next?: PagerLink;
  previous?: PagerLink;
  /** Href ya resuelto del botón QUIZ (`/lecciones/temario/quiz?from=<slug-de-esta-pagina>`),
   * calculado por quien renderiza la lección ([slug]/page.tsx o el archivo suelto de la página). */
  quizHref?: string;
}
