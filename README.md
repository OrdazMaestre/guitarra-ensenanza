# Guitarra Ensenanza

An interactive, Spanish-language guitar-learning platform for kids, built with Next.js. Lessons combine tablature playback, interactive fretboard/keyboard diagrams, and audio synthesis — almost entirely client-side, with no external audio files beyond a small sample set. The one exception is MAIkael, an AI chat tutor served through a couple of small API routes (see below).

Lives: 
[guitarraesperanza.vercel.app](https://guitarraesperanza.vercel.app/)
[guitarraesperanza.onrender.com](https://guitarraesperanza.onrender.com/)

## Project status

Actively developed, ongoing personal project — not a closed deliverable. Lessons, instruments, and tooling are still being added, which is also why the licensing note at the bottom of this file is marked "pending review."

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 + a hand-written global stylesheet for a shared floating-UI system
- **Tablature:** [`@coderline/alphatab`](https://www.alphatab.net/) for rendering and playing standard notation/tab
- **Audio:** a custom Web Audio synthesis engine (no external audio library) for sample-based guitar voices, oscillator-based keyboard voices, and procedurally synthesized metronome percussion
- **AI assistant:** [Groq](https://groq.com/) (`openai/gpt-oss-20b`, OpenAI-compatible chat completions API) for MAIkael, the in-app chat tutor; [Upstash Redis](https://upstash.com/) (plain REST calls, no SDK) for shared usage limits — see below
- **Testing:** Playwright (end-to-end + audio DSP verification, see below)
- **Deployment:** Vercel (primary) with a Docker/Render fallback

## Architecture highlights

- **Custom Web Audio engine** (`app/lib/guitarAudioEngine.ts`) — polyphony capping and voice stealing, sample-based playback with pitch correction, and procedurally synthesized percussion (filtered noise + oscillators) routed through a dedicated `DynamicsCompressorNode` limiter bus so the metronome can't clip regardless of user volume settings.
- **Interactive fretboard/keyboard input** — hammer-on, pull-off, and tapping are modeled as a small state machine driven directly by raw `keydown`/`keyup` events (`app/lib/fretboardKeymap.ts`), independent of any MIDI hardware. A shared floating-controls component (`MidiInstrumentChrome`) is reused across every instrument on the site instead of each one rolling its own UI.
- **Static prerendering for dynamic routes** — lesson pages under a dynamic `[slug]` segment use `generateStaticParams` with `dynamicParams = false`, trading route flexibility for full static generation so the site serves cleanly on Vercel's free tier.
- **Dual-deployment architecture with live cross-linking** — the app detects at runtime whether it's running on Vercel or Render (`app/lib/deployTarget.ts`) and shows an idle-triggered banner pointing to the other deployment when a free-tier usage limit is approaching, so the site degrades gracefully instead of going down.
- **MAIkael, an in-app AI chat tutor** (`app/api/maikael/`, `app/components/maikael/`, `app/lib/maikael*.ts`) — a TV-character widget that answers students' music/guitar questions, built on a third-party LLM with none of the "just call the API" assumptions that break in production:
  - Retries on Groq's `429`s with exponential backoff, header-driven wait times, and jitter to avoid a thundering-herd retry storm when several students hit the shared token-per-minute limit at once (`app/api/maikael/chat/route.ts`).
  - A cheap, keyword-based context retriever finds relevant lesson pages/secrets/videos and folds a short summary into the same request — deliberately not real tool-calling, to avoid paying for a second round-trip to the model on every message (`app/lib/maikaelPageIndex.ts`).
  - A heuristic personal-data filter runs *before* the LLM call and before any quota is spent, blocking students from sharing emails, phone numbers, addresses, full name + age, school, or social handles (`app/lib/maikaelPrivacyFilter.ts`).
  - Daily/session usage limits backed by Upstash Redis (plain REST calls, no client SDK), with a timezone-aware key that expires at midnight Europe/Madrid (`app/lib/maikaelLimits.ts`).
  - A state-driven SVG character rig — body pose, expressions, and idle animation all reacting to conversation state (`app/lib/maikaelRig.ts`, `maikaelBodyAnimation.ts`, `maikaelExpression.ts`).
- **Note-marking ("paint") mode on every fretboard** (`app/lib/useNoteMarks.ts`, `app/components/guitar/NoteMarksOverlay.tsx`) — toggling it lets a press mark every occurrence of that pitch class across the whole neck in a persistent color, independent of playback.
- **Custom drag-to-scroll for horizontally-scrolling diagrams** (`app/components/guitar/HorizontalScrollbar.tsx`) — a pointer-capture-driven scrollbar built to work around a real Android Chrome limitation: native touch scrollbars can't be restyled to stay visible, and the fretboards' own `touchAction: 'none'` (needed for hammer-on/pull-off input) swallows swipe gestures over the diagram itself.

## Testing

Testing here goes beyond typical click-through e2e coverage, because a lot of this app's correctness lives in its audio DSP graph and in raw keyboard-event handling rather than in visible UI state.

- **Offline audio DSP verification** — several tests reconstruct the exact production Web Audio graph inside an `OfflineAudioContext`, render it to a buffer, and assert directly on the resulting samples: measured loudness parity (in dB) between two entirely different synthesis methods (sample playback vs. oscillator), and hard anti-clipping assertions on the metronome's limiter chain at up to 2x gain (`tests/keyboard-audio-loudness.spec.ts`, `tests/metronome-volume-safety.spec.ts`).
- **Real hardware-input edge cases** — simultaneous multi-key chord input and keyboard ghosting/rollover behavior are tested against actual browser-delivered key events, not simulated state (`tests/mini-keyboard-kbchord.spec.ts`, `tests/mini-keyboard-range.spec.ts`).
- **Layout/regression testing** — zero-layout-shift assertions on floating UI, no-horizontal-overflow checks across desktop and mobile viewports, and DOM-order assertions on control placement (`tests/midi-floating-chrome.spec.ts`).
- **Touch/pointer input** — multi-touch note triggering on the interactive instruments (`tests/mini-keyboard-touch.spec.ts`).
- **Crash guarding** — uncaught JS errors fail the test run, swept across wide input ranges on the interactive components.

MAIkael (the AI chat assistant) does not have Playwright coverage yet — it's the newest piece and still being iterated on manually.

Run the suite:

```bash
npm run test:e2e
```

Framework: [Playwright](https://playwright.dev/) (`tests/`, config in `playwright.config.ts`).

## Project structure

```
app/
  lecciones/temario/          # lesson routes: main sequence, dynamic [slug] route, sitemap
    _lesson-pages/            # individual lesson page components
  components/guitar/          # AlphaTabPlayer, MiniKeyboard, ReducedFretboardDiagram, shared instrument chrome
  components/maikael/         # MAIkael chat widget (TV character UI, chat panel)
  api/maikael/                # Groq chat proxy + Upstash-backed usage-limit status route
  lib/                        # guitarAudioEngine, useMetronome, fretboardKeymap, deploy-target detection, maikael* (prompt, limits, privacy filter, page index, SVG rig)
scripts/                      # generate-video-index.mjs: codegen that scans lesson pages for YouTube links and looks up real titles/channels via YouTube's public oEmbed endpoint
tests/                        # Playwright specs (DSP verification, input, layout, touch)
```

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000/lecciones/temario
npm run lint
npm run build
npm run test:e2e
```

## Deployment

- **Vercel (primary):** static prerendering for lesson routes, no additional configuration required.
- **Render (fallback):** Docker-based deploy via `render.yaml` and `Dockerfile` (multi-stage build, Next.js standalone output, runs as a non-root user). Push to the connected branch to trigger `autoDeploy`.

## Content licensing note

Some images were extracted from a reference PDF booklet during early development and are pending a license/copyright review before final publish — see `references/IMAGE-SOURCES.md` and `references/AUDIO-SOURCES.md` for current sourcing notes.
