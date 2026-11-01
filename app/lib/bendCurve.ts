// Guitar bends as an audio pitch curve, shared by the tab player
// (AlphaTabPlayer.tsx) and Riff-Hero's background notes (app/lib/riff/*).
// Pure: no React, no audio context — tested in tests/bend-curve.spec.ts.
//
// Mirrors alphaTab 1.8.2's own MIDI generator (MidiFileGenerator._generateBend
// in alphaTab.core.mjs): BendPoint.offset 0..60 across the note, value in
// QUARTER TONES (4 = "full" = 200 cents), Gradual/Fast styles, prebends
// already bent at the attack, and a bend's curve stretched over the tied
// notes that follow it until one has its own bend or vibrato
// (extendBendArrowsOnTiedNotes, on by default). Two deliberate differences,
// recommended by the guitar-music-advisor agent:
//   - every rise/fall takes AT MOST `BEND_RAMP_CAP_SECONDS` (then holds), so a
//     bend on a long note sounds like a hand, not like a synth glide;
//   - values are clamped to ±2 tones (no acoustic guitar bends further).
// The whammy bar is ignored on purpose (hidden on the site; an acoustic guitar
// has none). See "Bends y ligaduras" in AlphaTabPlayer.NOTES.md.

export const BEND_RAMP_CAP_SECONDS = 0.18;
// alphaTab's player.songBookBendDuration: a Fast-style bend happens in the
// last 75 ms of the note.
export const BEND_FAST_SECONDS = 0.075;
export const BEND_MAX_CENTS = 400;
// Jump between two segments whose values don't connect (rare): a short ramp
// instead of an instant step, which would click.
const SEGMENT_JOIN_SECONDS = 0.01;

// alphaTab enums (alphaTab.d.ts), as plain numbers so this stays import-free.
const BEND_TYPE = { None: 0, Custom: 1, Bend: 2, Release: 3, BendRelease: 4, Hold: 5, Prebend: 6, PrebendBend: 7, PrebendRelease: 8 } as const;
const BEND_STYLE = { Default: 0, Gradual: 1, Fast: 2 } as const;
const MAX_OFFSET = 60;

export interface BendPointLike {
  offset: number;
  value: number;
}

// The few alphaTab Note fields this module reads (all optional: alphaTex
// notes or test doubles may lack them).
export interface BendNoteLike {
  bendPoints?: BendPointLike[] | null;
  bendStyle?: number;
  bendType?: number;
  isTieOrigin?: boolean;
  tieDestination?: BendNoteLike | null;
  vibrato?: number;
}

export interface BendSegment {
  // Position and length inside the sounding note, in the caller's units
  // (quarter notes in the tab player, song seconds in Riff-Hero).
  start: number;
  dur: number;
  // Either explicit points (at = 0..1 of the segment) or a Fast bend: the
  // values, played in the last BEND_FAST_SECONDS of the segment.
  points?: Array<{ at: number; cents: number }>;
  fast?: number[];
}

export interface BendCurve {
  segments: BendSegment[];
}

export interface BendAutomationPoint {
  t: number;
  cents: number;
}

export function isBent(note: BendNoteLike | null | undefined): boolean {
  return !!note && (note.bendType ?? BEND_TYPE.None) !== BEND_TYPE.None && (note.bendPoints?.length ?? 0) > 0;
}

function toCents(quarterTones: number) {
  return Math.max(-BEND_MAX_CENTS, Math.min(BEND_MAX_CENTS, quarterTones * 50));
}

// The tie chain starting at `head` (head included), in playback order.
export function tieChain(head: BendNoteLike): BendNoteLike[] {
  const chain: BendNoteLike[] = [head];
  let note = head;
  // Guard against malformed files with a cyclic tie chain.
  while (note.isTieOrigin && note.tieDestination && chain.length < 64) {
    note = note.tieDestination;
    chain.push(note);
  }
  return chain;
}

function segmentShape(note: BendNoteLike): Pick<BendSegment, 'points' | 'fast'> {
  const sorted = [...(note.bendPoints ?? [])].sort((a, b) => a.offset - b.offset);
  const raw = sorted.map((point) => ({
    at: Math.max(0, Math.min(1, point.offset / MAX_OFFSET)),
    cents: toCents(point.value),
  }));
  const v = sorted.map((point) => toCents(point.value));
  const style = note.bendStyle ?? BEND_STYLE.Default;
  const type = note.bendType ?? BEND_TYPE.None;
  const has = (count: number) => v.length >= count;

  if (style === BEND_STYLE.Default || type === BEND_TYPE.Custom || type === BEND_TYPE.Hold || type === BEND_TYPE.Prebend) {
    return { points: raw };
  }
  switch (type) {
    case BEND_TYPE.Bend:
    case BEND_TYPE.Release:
    case BEND_TYPE.PrebendBend:
    case BEND_TYPE.PrebendRelease:
      if (!has(2)) return { points: raw };
      return style === BEND_STYLE.Gradual
        ? { points: [{ at: 0, cents: v[0] }, { at: 1, cents: v[1] }] }
        : { fast: [v[0], v[1]] };
    case BEND_TYPE.BendRelease: {
      if (!has(3)) return { points: raw };
      // alphaTab reads bendPoints[2] as the release value, but Guitar Pro's
      // bend-release usually has 4 points (rise, hold, fall), so [2] is still
      // up and the release would never come down. Use the LAST point.
      const release = v[v.length - 1];
      return style === BEND_STYLE.Gradual
        ? { points: [{ at: 0, cents: v[0] }, { at: 0.5, cents: v[1] }, { at: 1, cents: release }] }
        : { fast: [v[0], v[1], release] };
    }
    default:
      return { points: raw };
  }
}

// The whole pitch curve of the note that sounds from `head` through its tie
// chain (the chain is ONE sounding note: ties are never re-plucked).
// `durationOf` gives each chain note's own length in the caller's units.
// Returns null when nothing in the chain bends.
export function buildBendCurve(head: BendNoteLike, durationOf: (note: BendNoteLike) => number): BendCurve | null {
  const chain = tieChain(head);
  const segments: BendSegment[] = [];
  let cursor = 0;
  for (let i = 0; i < chain.length; i++) {
    const note = chain[i];
    const ownDuration = Math.max(0, durationOf(note));
    if (isBent(note)) {
      // Stretch over the following tied notes that don't bend or vibrate on
      // their own (alphaTab's extendBendArrowsOnTiedNotes).
      let span = ownDuration;
      for (let j = i + 1; j < chain.length; j++) {
        const next = chain[j];
        if (isBent(next) || (next.vibrato ?? 0) !== 0) break;
        span += Math.max(0, durationOf(next));
      }
      if (span > 0) {
        segments.push({ start: cursor, dur: span, ...segmentShape(note) });
      }
    }
    cursor += ownDuration;
  }
  return segments.length > 0 ? { segments } : null;
}

// Converts a curve into absolute (seconds from the note's start, cents)
// points. `unitSeconds` = seconds per curve unit at the current speed (the
// tab player passes seconds per quarter note; Riff-Hero passes 1 / speed).
// `speed` scales the realism caps so a slowed-down practice sounds slowed
// down too. Returns [] when the curve never leaves 0 cents.
export function bendAutomation(curve: BendCurve | null | undefined, unitSeconds: number, speed = 1): BendAutomationPoint[] {
  if (!curve || curve.segments.length === 0 || !(unitSeconds > 0)) return [];
  const safeSpeed = speed > 0 ? speed : 1;
  const rampCap = BEND_RAMP_CAP_SECONDS / safeSpeed;
  const fastSeconds = BEND_FAST_SECONDS / safeSpeed;
  const out: BendAutomationPoint[] = [];
  const push = (t: number, cents: number) => {
    const last = out[out.length - 1];
    // Keep time monotonic (Web Audio requires non-decreasing event times).
    out.push({ t: last ? Math.max(last.t, t) : Math.max(0, t), cents });
  };
  let current = 0;

  for (const segment of [...curve.segments].sort((a, b) => a.start - b.start)) {
    const start = segment.start * unitSeconds;
    const duration = segment.dur * unitSeconds;
    const shape: BendAutomationPoint[] = [];
    if (segment.fast && segment.fast.length > 0) {
      const values = segment.fast;
      const bendDuration = Math.min(fastSeconds, duration);
      const bendStart = start + duration - bendDuration;
      shape.push({ t: start, cents: values[0] }, { t: bendStart, cents: values[0] });
      for (let i = 1; i < values.length; i++) {
        shape.push({ t: bendStart + (bendDuration * i) / (values.length - 1), cents: values[i] });
      }
    } else {
      const points = segment.points ?? [];
      if (points.length === 0) continue;
      // Before its first point, a segment holds that first value.
      shape.push({ t: start, cents: points[0].cents });
      for (const point of points) shape.push({ t: start + point.at * duration, cents: point.cents });
    }

    // Connect to whatever was sounding before this segment.
    if (out.length === 0 && start > 0) push(0, 0);
    if (out.length > 0 && current !== shape[0].cents) {
      push(start, current);
      push(start + SEGMENT_JOIN_SECONDS, shape[0].cents);
    } else {
      push(shape[0].t, shape[0].cents);
    }

    // Each change takes at most rampCap, then holds until the written point.
    for (let i = 1; i < shape.length; i++) {
      const previous = shape[i - 1];
      const point = shape[i];
      if (point.cents !== previous.cents && point.t - previous.t > rampCap) {
        push(previous.t + rampCap, point.cents);
      }
      push(point.t, point.cents);
    }
    current = shape[shape.length - 1].cents;
  }

  return out.some((point) => point.cents !== 0) ? out : [];
}

// Pitch (cents) of an automation at time `t` (seconds from the note's start).
export function centsAt(automation: BendAutomationPoint[], t: number): number {
  if (automation.length === 0) return 0;
  if (t <= automation[0].t) return automation[0].cents;
  for (let i = 1; i < automation.length; i++) {
    const b = automation[i];
    if (t <= b.t) {
      const a = automation[i - 1];
      const span = b.t - a.t;
      return span > 0 ? a.cents + ((b.cents - a.cents) * (t - a.t)) / span : b.cents;
    }
  }
  return automation[automation.length - 1].cents;
}

// Schedules the automation on a `detune` AudioParam (cents). `offset` =
// seconds of the curve already elapsed when the sound starts (a note started
// mid-tie or mid-bend), so it starts at the right height instead of rising
// again from 0. Linear ramps in cents = linear in semitones, like alphaTab's
// pitch wheel. Never throws: a bad curve must not break the note.
export function applyBend(param: AudioParam | null | undefined, startTime: number, automation: BendAutomationPoint[], offset = 0) {
  if (!param || automation.length === 0) return;
  try {
    param.setValueAtTime(centsAt(automation, offset), startTime);
    for (const point of automation) {
      if (point.t > offset) {
        param.linearRampToValueAtTime(point.cents, startTime + point.t - offset);
      }
    }
  } catch {
    // Leave the note at its unbent pitch.
  }
}
