<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:project-workflow-rules -->
# Project workflow rules

- Public pages must be fully responsive on the X axis. Do not leave horizontal overflow on desktop or mobile; prefer fluid widths, `minmax(0, ...)`, and `max-width: 100%`.
- Lesson pages with previous/next navigation must leave clear vertical breathing room between the page content and the pager links. Prefer the shared `TemarioPager` spacing instead of one-off page margins.
- Lesson copy for children should use short, separated sentences whenever practical. Prefer several brief lines or paragraphs over long multi-sentence paragraphs.
- In fretboard note maps, red is reserved for one concrete note that the current lesson intentionally marks as special, such as a blue note or a chord seventh. Do not use red for ordinary notes inside a full scale; keep only the major and minor tonics highlighted unless the lesson explicitly teaches another special note.
- Secret links must be truly indistinguishable from the ordinary element they replace. They must not show link styling, animation, hover color, focus outline, extra spacing, layout shifts, tooltip-like text, or a pointer cursor. If the normal surrounding UI changes the mouse cursor on hover, the secret link should deliberately keep the normal cursor so the hidden target feels like an easter egg, not a visible control.
- When adding a new lesson page, extension page, practice page, or any new route that branches from the temario, update `/lecciones/temario/pasos` in the same change so the visual tree stays true to the real navigation paths. Main sequence changes belong in `app/lecciones/temario/temarioData.ts`; side branches belong in `branchMap` inside `app/lecciones/temario/pasos/page.tsx`.
- When reporting work on a page, always include a direct browser link to the page being reviewed so it can be opened in Google Chrome with one click.
<!-- END:project-workflow-rules -->
