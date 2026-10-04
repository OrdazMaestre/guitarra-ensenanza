import { test, expect, type Page } from '@playwright/test';

// Locks in experimentalScheduler (AlphaTabPlayer.tsx, opt-in, only used by
// sala-de-pruebas today). The legacy setTimeout chain in playEvent let
// scroll-follow's per-note main-thread work accumulate into a slower tempo
// (measured: ~8% slower over 60 notes with follow on). On the AudioContext
// timeline, scroll-follow must not change WHEN notes are scheduled at all.
// See "Programador con anticipación (experimental)" in AlphaTabPlayer.NOTES.md.

const PLAY_MS = 8000;

async function recordGuitarNoteTimes(page: Page, disableFollow: boolean) {
  await page.addInitScript(() => {
    const w = window as unknown as { __starts: Array<{ ctx: number; dur: number; now: number; when: number }> };
    const ids = new WeakMap<BaseAudioContext, number>();
    let next = 1;
    w.__starts = [];
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, ...rest: number[]) {
      if (!ids.has(this.context)) ids.set(this.context, next++);
      w.__starts.push({ ctx: ids.get(this.context)!, dur: this.buffer?.duration ?? 0, now: this.context.currentTime, when });
      return original.call(this, when, ...rest);
    };
  });

  await page.goto('/lecciones/temario/sala-de-pruebas');
  await page.waitForSelector('.test-room-tab .at-surface-svg', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('.test-room-tab')?.scrollIntoView({ block: 'start' }));
  // Real click (user gesture) so Chrome's autoplay policy lets audio start.
  await page.locator('.test-room-tab button[aria-label="Reproducir"]').click();

  if (disableFollow) {
    // Same as the user dragging the tab's own scrollbar: turns follow off.
    await page.waitForTimeout(400);
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const bar = document.querySelector('.test-room-tab [aria-label="Desplazamiento horizontal de la tablatura"]') as HTMLElement;
        bar.scrollLeft += 1;
        bar.dispatchEvent(new Event('scroll'));
      });
      await page.waitForTimeout(150);
    }
  }

  await page.waitForTimeout(PLAY_MS);
  const starts = await page.evaluate(
    () => (window as unknown as { __starts: Array<{ ctx: number; dur: number; now: number; when: number }> }).__starts
  );

  // Guitar samples are the long buffers (>0.3s); drum/bass engine buffers are
  // short noise bursts on a different AudioContext.
  const guitar = starts.filter((s) => s.dur > 0.3);
  const ctx = guitar[0]?.ctx;
  const notes = guitar.filter((s) => s.ctx === ctx).sort((a, b) => a.when - b.when);
  // Collapse strum offsets (<40ms apart) into one event time.
  const events: Array<{ lead: number; when: number }> = [];
  for (const note of notes) {
    if (!events.length || note.when - events[events.length - 1].when > 0.04) {
      events.push({ lead: note.when - note.now, when: note.when });
    }
  }
  return events;
}

test('experimental scheduler: scroll-follow does not slow the tempo', async ({ browser }) => {
  test.setTimeout(120000);
  const baseURL = test.info().project.use.baseURL;

  const followPage = await browser.newPage({ baseURL, viewport: { width: 1280, height: 900 } });
  const follow = await recordGuitarNoteTimes(followPage, false);
  await followPage.close();

  const noFollowPage = await browser.newPage({ baseURL, viewport: { width: 1280, height: 900 } });
  const noFollow = await recordGuitarNoteTimes(noFollowPage, true);
  await noFollowPage.close();

  const count = Math.min(follow.length, noFollow.length);
  // The opening ~4.5s of this song is dense, then long notes: ~20+ events.
  expect(count).toBeGreaterThanOrEqual(20);

  const span = (events: Array<{ when: number }>) => events[count - 1].when - events[0].when;
  // Same song section, same audio timeline: spans must match to the ms.
  expect(Math.abs(span(follow) - span(noFollow))).toBeLessThan(0.002);

  // Every note is scheduled ahead of the audio clock, never in the past.
  for (const event of [...follow, ...noFollow]) {
    expect(event.lead).toBeGreaterThanOrEqual(0);
  }
});
