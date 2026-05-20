export interface PagerLink {
  href: string;
  label: string;
}

export interface LessonPageProps {
  next?: PagerLink;
  previous?: PagerLink;
}
