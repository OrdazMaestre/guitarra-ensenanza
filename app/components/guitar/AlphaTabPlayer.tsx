// app/components/guitar/AlphaTabPlayer.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactNode, UIEvent } from 'react';
import * as alphaTab from '@coderline/alphatab';
import {
  getAudioCurrentTime,
  playBassNote,
  playMetronomeClick as playDrumClick,
  touchAudioContext,
} from '@/app/lib/guitarAudioEngine';

interface AlphaTabPlayerProps {
  centerHorizontalContent?: boolean;
  compact?: boolean;
  disablePlaybackScrollFollow?: boolean;
  horizontalLeftCrop?: number;
  horizontalBarFit?: {
    barCount: number;
    firstBarWidth?: number;
    maxRestBarWidth?: number;
    minRestBarWidth?: number;
    sidePadding?: number;
  };
  horizontalBarWidth?: number;
  horizontalBarWidths?: number[];
  initialSpeed?: number;
  layout?: 'page' | 'horizontal';
  minHeight?: number;
  // Opt-in only: when true (and the loaded score has more than one usable
  // track), shows a track selector with per-track mute/solo that actually
  // gates the custom audio scheduler. Every other prop/page is unaffected
  // because this defaults to false and every new code path it triggers is
  // additive (see "Multipista" in AlphaTabPlayer.NOTES.md).
  multiTrack?: boolean;
  showHorizontalScrollbar?: boolean;
  source?: string;
  tab?: string;
  title?: string;
}

const DEFAULT_METRONOME = false;
const DEFAULT_VOLUME = 0.8;
const DEFAULT_SPEED = 1;
const DEFAULT_BPM = 96;
const MIN_AUDIBLE_NOTE_LEVEL = 0.028;
const DENSE_CHORD_NOTE_COUNT = 3;
// +30% requested for the drum track specifically, independent of the shared
// volumeRef slider it's derived from. Safe headroom-wise: guitarAudioEngine.ts's
// kick synthesis peaks at 0.58 * volume (see its own file), so even at
// volumeRef=1.0 this reaches 0.754 — just past the metronome limiter's -3dB
// (~0.708) threshold, which is exactly what that limiter exists to absorb
// gracefully (see "Multipista" > drum volume in AlphaTabPlayer.NOTES.md).
const DRUM_TRACK_VOLUME_BOOST = 1.3;
// Bass volume relative to the shared volumeRef slider, same pattern as
// DRUM_TRACK_VOLUME_BOOST above. See AlphaTabPlayer.NOTES.md "Bajo
// sintetizado" for the measured RMS comparison against the guitar track that
// the original 1.0 value was based on, and its "-50%" follow-up entry for
// why this dropped to 0.5.
const BASS_TRACK_VOLUME_MULTIPLIER = 0.5;
const TAB_DRAG_THRESHOLD = 8;
const HORIZONTAL_SCROLL_MIN_EXTRA_WIDTH = 80;
const MAX_GUITAR_VOICES = 12;
const GUITAR_SAMPLE_BASE_URL = '/samples/seagull-acoustic/';
const GUITAR_SAMPLE_CUTOFFS = [2600, 3200, 4200, 5600, 7200, 9000];
const GUITAR_STRING_GAINS: Record<number, number> = {
  1: 1.2,
  2: 1.15,
  3: 1.4,
  5: 0.8,
  6: 0.5,
};
const GUITAR_SAMPLE_RELEASE = 0.2;
const GUITAR_SAMPLE_PALM_MUTE_RELEASE = 0.055;
const STRUM_OFFSETS = [0, 0.012, 0.021, 0.031, 0.043, 0.058];
// Soft-knee limiter threshold for the shared guitar/metronome-click output
// bus (getAudioOutput below), in the SAME amplitude units as its final
// output (post input.gain=0.85 * master.gain=1.35). Chosen from real offline
// measurement (see tests/guitar-output-limiter.spec.ts and "Volumen por
// pista... — techo de guitarra" in AlphaTabPlayer.NOTES.md): every
// trackVolumeMultiplier=1 scenario measured (single notes on every string,
// dense 3-6 note chords, at volumeRef up to its max of 1.0) peaks at ~0.567
// — comfortably under this threshold, so the limiter is provably identity
// (bit-for-bit, floating-point noise only) for every page that doesn't pass
// a >1 trackVolumeMultiplier. It only engages once trackVolumeMultiplier's
// new max of 2 (added alongside this constant) pushes a real peak above it.
const GUITAR_OUTPUT_LIMITER_THRESHOLD = 0.7;
const STRING_LABELS_TOP_TO_BOTTOM = ['E', 'B', 'G', 'D', 'A', 'E'];
const TAB_LINE_SPACING = 12.45;
const LOOP_VISUAL_X_OFFSET = -31;
const LOOP_HANDLE_OUTSIDE_OFFSET = 30;
const CURSOR_LINE_WIDTH = 3;
const PLAYBACK_SCROLL_RESUME_DELAY = 1600;
const PAGE_LAYOUT_HORIZONTAL_SCROLL_MARGIN_RATIO = 0.22;
const LINEAR_PLAYBACK_CURSOR_RATIO = 0.34;
const ANNOTATED_BAR_BASE_WIDTH = 72;
const ANNOTATED_BAR_TEXT_WIDTH = 7.5;
const ANNOTATED_BAR_BEAT_WIDTH = 28;
const ANNOTATED_BAR_NOTE_WIDTH = 6;
const TIMING_EPSILON = 0.001;
const DEFAULT_METRONOME_SUBDIVISION: MetronomeSubdivision = 'quarter';
const METRONOME_SUBDIVISION_QUARTERS: Record<MetronomeSubdivision, number> = {
  eighth: 0.5,
  quarter: 1,
  sixteenth: 0.25,
};
let selectedKeyboardPlayerId: symbol | null = null;
let currentPlayingPlayerId: symbol | null = null;
let stopCurrentPlayingPlayer: (() => void) | null = null;
const OPEN_STRING_MIDI_BY_STRING: Record<number, number> = {
  1: 64, // E4
  2: 59, // B3
  3: 55, // G3
  4: 50, // D3
  5: 45, // A2
  6: 40, // E2
};
// 4-string bass, standard tuning (E1-A1-D2-G2). Verified against the real
// bass track's staff.tuning in prueba-master-of-puppets.gp ([43,38,33,28] =
// G2,D2,A1,E1 high-to-low, same convention as the guitar tuning array above)
// rather than assumed — see AlphaTabPlayer.NOTES.md "Bajo sintetizado". Not
// derived from staff.tuning at runtime because classifyTrackKind only checks
// the string COUNT (4) to decide 'bass'; a track tuned differently than
// standard EADG would still play through this fixed map (same limitation
// OPEN_STRING_MIDI_BY_STRING already has for 6-string 'guitar' tracks, see
// the "Limitación conocida" note).
const OPEN_STRING_MIDI_BY_STRING_BASS: Record<number, number> = {
  1: 43, // G2
  2: 38, // D2
  3: 33, // A1
  4: 28, // E1
};

interface TabNote {
  fret: number;
  palmMuted?: boolean;
  stringNumber: number;
}

interface TabEvent {
  beat?: AlphaTabBeatLike;
  beatId?: number;
  duration: number;
  isFirstPlayableBeatOfBar?: boolean;
  notes: TabNote[];
  quarterNotes: number;
}

interface CursorBox {
  height: number;
  visible: boolean;
  x: number;
  y: number;
}

interface BeatBoundsLike {
  barBounds: {
    masterBarBounds: {
      realBounds: {
        h: number;
        w: number;
        x: number;
        y: number;
      };
    };
  };
  notes?: Array<{
    noteHeadBounds: {
      w: number;
      x: number;
    };
  }> | null;
  onNotesX: number;
  realBounds: {
    w: number;
    x: number;
  };
  visualBounds: {
    x: number;
  };
}

interface HighlightBox {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface LoopHandleBox {
  side: 'end' | 'start';
  x: number;
  y: number;
}

interface StringLabelGroup {
  labels: Array<{
    note: string;
    x: number;
    y: number;
  }>;
  systemY: number;
}

// Multipista (opt-in, see AlphaTabPlayerProps.multiTrack): a track is
// 'guitar' when it's a standard 6-string staff (reuses the same
// OPEN_STRING_MIDI_BY_STRING/normalizeAlphaTabStringNumber math as the
// existing single-track engine, so it only works for tracks tuned like a
// regular guitar), 'bass' when it's a standard 4-string staff (own
// OPEN_STRING_MIDI_BY_STRING_BASS map + playBassNote synth voice, see
// AlphaTabPlayer.NOTES.md "Bajo sintetizado"), 'percussion' when the staff is
// flagged as a drum staff, and 'unsupported' for anything else — there is no
// audio voice for that category, so it never gets scheduled regardless of
// its mute/solo state. See AlphaTabPlayer.NOTES.md "Multipista".
type TrackKind = 'bass' | 'guitar' | 'percussion' | 'unsupported';
type DrumClickType = 'cymbal' | 'kick' | 'snare';

// Per-drum-element mute/solo/volume UI (see "Volumen por pista y por
// elemento de batería" in AlphaTabPlayer.NOTES.md). Array order below
// (kick, snare, cymbal) is also the dropdown's display order — matches how
// the feature was requested ("bombo, caja, platillo").
const DRUM_CLICK_TYPES: DrumClickType[] = ['kick', 'snare', 'cymbal'];
const DRUM_ELEMENT_LABELS: Record<DrumClickType, string> = {
  cymbal: 'Platillo',
  kick: 'Bombo',
  snare: 'Caja',
};

interface TrackDisplayInfo {
  index: number;
  kind: TrackKind;
  name: string;
}

interface AuxTrackEvent {
  bassNotes?: TabNote[];
  guitarNotes?: TabNote[];
  percussionHits?: DrumClickType[];
  quarterNotes: number;
  quarterStart: number;
}

interface AuxTrackSchedule {
  events: AuxTrackEvent[];
  index: number;
  kind: 'bass' | 'guitar' | 'percussion';
}

interface AudioOutputChain {
  input: GainNode;
  master: GainNode;
}

interface GuitarSample {
  duration: number;
  file: string;
  keyRange: {
    high: number;
    low: number;
  };
  loopEnd: number;
  loopStart: number;
  name: string;
  pitchCorrection: number;
  rootKey: number;
  sampleRate: number;
}

interface GuitarSampleManifest {
  samples: GuitarSample[];
}

interface LoadedGuitarSample extends GuitarSample {
  buffer: AudioBuffer;
}

class GuitarSampleVoice {
  cleanupTimer: number | null;

  constructor(
    public id: number,
    public midi: number,
    public nodes: AudioNode[],
    public sources: AudioScheduledSourceNode[],
    public startedAt: number
  ) {
    this.cleanupTimer = null;
  }

  stop(context?: AudioContext) {
    if (this.cleanupTimer !== null) {
      window.clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    const stopTime = context ? context.currentTime + 0.01 : 0;
    for (const source of this.sources) {
      try {
        source.stop(stopTime);
      } catch {
        // The source may already be stopped or not yet started.
      }
    }
  }

  destroy() {
    if (this.cleanupTimer !== null) {
      window.clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const node of this.nodes) {
      node.disconnect();
    }
  }
}

interface AlphaTabNoteLike {
  fret: number;
  isDead?: boolean;
  percussionArticulation?: number;
  string: number;
}

interface AlphaTabBeatLike {
  absolutePlaybackStart: number;
  dots: number;
  duration: number;
  id: number;
  isPalmMute: boolean;
  isRest: boolean;
  lyrics?: string[] | null;
  notes: AlphaTabNoteLike[];
  text?: string | null;
  tupletDenominator: number;
  tupletNumerator: number;
}

interface AlphaTabScoreLike {
  // Real initial tempo (BPM) of the loaded file, per AlphaTab's own `Score.tempo`
  // getter (node_modules/@coderline/alphatab/dist/alphaTab.d.ts). Only read when
  // multiTrack is true — see the `bpm` useMemo and AlphaTabPlayer.NOTES.md
  // "Multipista" for why this isn't wired up for every `source` page.
  tempo?: number;
  masterBars?: Array<{
    displayWidth?: number;
    section?: {
      marker?: string;
      text?: string;
    } | null;
  }>;
  tracks: Array<{
    name?: string;
    // GP7-style articulation table for percussion tracks. When present,
    // note.percussionArticulation is an index into this array; when absent
    // (or the index isn't listed), it falls back to being a raw GM drum
    // number directly (see the SDK's own doc comment on
    // Note.percussionArticulation). See "Multipista" in the NOTES file.
    percussionArticulations?: Array<{ outputMidiNumber?: number }>;
    staves: Array<{
      bars: Array<{
        displayWidth?: number;
        index?: number;
        masterBar?: {
          displayWidth?: number;
          section?: {
            marker?: string;
            text?: string;
          } | null;
        };
        voices: Array<{
          beats: AlphaTabBeatLike[];
        }>;
      }>;
      isPercussion?: boolean;
      // Only read/written by the percussion notation preview (see
      // "Previsualización de partitura de batería" in AlphaTabPlayer.NOTES.md).
      // Every other code path in this file never touches these two flags.
      showStandardNotation?: boolean;
      showTablature?: boolean;
      tuning?: number[];
    }>;
  }>;
}

interface IconButtonProps {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}

type MetronomeSubdivision = 'eighth' | 'quarter' | 'sixteenth';

interface NoteIconProps {
  size?: number;
}

function IconButton({ active = false, disabled = false, label, onClick, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        alignItems: 'center',
        background: active ? '#34d399' : '#27272a',
        border: `1px solid ${active ? '#6ee7b7' : '#52525b'}`,
        color: active ? '#09090b' : '#ffffff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        height: 52,
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
        width: 52,
      }}
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="32" height="32" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="32" height="32" fill="currentColor">
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

function MetronomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 21h8" />
      <path d="M6 21l4-18h4l4 18" />
      <path d="M12 7l4 7" />
    </svg>
  );
}

function TracksIcon({ size = 32 }: NoteIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="11" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Opens the per-drum-element (bombo/caja/platillo) mute/solo/volume
// dropdown — see "Volumen por pista y por elemento de batería" in
// AlphaTabPlayer.NOTES.md. Purely decorative snare-drum silhouette, same
// stroke-based style as the other icons in this file.
function DrumIcon({ size = 32 }: NoteIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="7" rx="8" ry="3" />
      <path d="M4 7v6c0 1.66 3.58 3 8 3s8-1.34 8-3V7" />
      <path d="M4 13v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4" />
    </svg>
  );
}

function MutedMetronomeIcon({ size = 32 }: NoteIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 21h8" />
      <path d="M6 21l4-18h4l4 18" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

function QuarterNoteIcon({ size = 32 }: NoteIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={size} height={size} fill="currentColor">
      <ellipse cx="8" cy="18" rx="4.2" ry="3" transform="rotate(-22 8 18)" />
      <rect x="11.4" y="4" width="2.2" height="14" rx="1" />
    </svg>
  );
}

function EighthNoteIcon({ size = 32 }: NoteIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={size} height={size} fill="currentColor">
      <ellipse cx="7.5" cy="18" rx="4" ry="2.9" transform="rotate(-22 7.5 18)" />
      <rect x="10.8" y="4" width="2.2" height="14" rx="1" />
      <path d="M12.4 4c4.3 1 6.5 3.4 6.5 7.1c0 1.3-.4 2.5-1.1 3.6c-.3.4-.9.2-.9-.3c.1-2.8-1.4-4.6-4.5-5.5z" />
    </svg>
  );
}

function SixteenthNoteIcon({ size = 32 }: NoteIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={size} height={size} fill="currentColor">
      <ellipse cx="7.2" cy="18.2" rx="3.9" ry="2.8" transform="rotate(-22 7.2 18.2)" />
      <rect x="10.4" y="3.7" width="2.2" height="14.2" rx="1" />
      <path d="M12 3.9c4.4.9 6.6 3.1 6.6 6.7c0 1.1-.3 2.1-.8 3c-.3.5-1 .3-1-.3c.1-2.4-1.5-4-4.8-4.8z" />
      <path d="M12 8.3c3.8.8 5.8 2.9 5.8 6.2c0 1-.3 1.9-.8 2.8c-.3.5-1 .3-1-.3c.1-2.1-1.2-3.5-4-4.3z" />
    </svg>
  );
}

function MetronomeSubdivisionIcon({ subdivision, size = 32 }: NoteIconProps & { subdivision: MetronomeSubdivision }) {
  if (subdivision === 'sixteenth') {
    return <SixteenthNoteIcon size={size} />;
  }

  if (subdivision === 'eighth') {
    return <EighthNoteIcon size={size} />;
  }

  return <QuarterNoteIcon size={size} />;
}

function parseRepeatCount(value: string | undefined) {
  return Math.max(1, Math.min(64, value ? Number(value) || 1 : 1));
}

function parseAlphaTexEvents(tab: string): TabEvent[] {
  const body = tab.replace(/\{[^{}]*\}/g, ' ');
  const tokens = body.matchAll(/:(\d+)|r(?:\.(\d+))?(?:\*(\d+))?|\(([^)]*)\)(?:\.(\d+))?(?:\*(\d+))?|(\d+)\.(\d+)(?:\.(\d+))?(?:\*(\d+))?|\|/g);
  let currentDuration = 4;
  const events: TabEvent[] = [];

  for (const match of tokens) {
    if (match[1]) {
      currentDuration = Number(match[1]) || currentDuration;
      continue;
    }

    if (match[0] === '|') {
      continue;
    }

    if (match[0].startsWith('r')) {
      const eventDuration = Number(match[2]) || currentDuration;
      const repeatCount = parseRepeatCount(match[3]);
      currentDuration = eventDuration;
      for (let repeat = 0; repeat < repeatCount; repeat++) {
        events.push({ duration: eventDuration, notes: [], quarterNotes: 4 / eventDuration });
      }
      continue;
    }

    const notes: TabNote[] = [];
    let eventDuration = currentDuration;
    let repeatCount = 1;

    if (match[4]) {
      const noteMatches = match[4].matchAll(/(\d+)\.(\d+)/g);
      for (const noteMatch of noteMatches) {
        const fret = Number(noteMatch[1]);
        const stringNumber = Number(noteMatch[2]);
        if (OPEN_STRING_MIDI_BY_STRING[stringNumber] !== undefined && fret >= 0 && fret <= 24) {
          notes.push({ fret, palmMuted: /\bpm\b/.test(match[0]), stringNumber });
        }
      }
      eventDuration = Number(match[5]) || currentDuration;
      repeatCount = parseRepeatCount(match[6]);
    } else if (match[7] && match[8]) {
      const fret = Number(match[7]);
      const stringNumber = Number(match[8]);
      if (OPEN_STRING_MIDI_BY_STRING[stringNumber] !== undefined && fret >= 0 && fret <= 24) {
        notes.push({ fret, palmMuted: /\bpm\b/.test(match[0]), stringNumber });
      }
      eventDuration = Number(match[9]) || currentDuration;
      repeatCount = parseRepeatCount(match[10]);
    }

    if (notes.length > 0) {
      currentDuration = eventDuration;
      for (let repeat = 0; repeat < repeatCount; repeat++) {
        events.push({ duration: eventDuration, notes, quarterNotes: 4 / eventDuration });
      }
    }
  }

  return events;
}

function beatQuarterNotes(beat: AlphaTabBeatLike) {
  let dotFactor = 1;
  let nextDot = 0.5;
  for (let dot = 0; dot < beat.dots; dot++) {
    dotFactor += nextDot;
    nextDot /= 2;
  }

  const tupletFactor =
    beat.tupletNumerator > 0 && beat.tupletDenominator > 0
      ? beat.tupletDenominator / beat.tupletNumerator
      : 1;

  return (4 / beat.duration) * dotFactor * tupletFactor;
}

function normalizeAlphaTabStringNumber(stringNumber: number) {
  return 7 - stringNumber;
}

// Same convention as normalizeAlphaTabStringNumber above, generalized to a
// 4-string instrument: AlphaTab's note.string counts up from 1 = lowest
// string, so normalized = (stringCount + 1) - string. Verified against the
// real file's tuning array — see OPEN_STRING_MIDI_BY_STRING_BASS.
function normalizeBassStringNumber(stringNumber: number) {
  return 5 - stringNumber;
}

function extractGuitarNotesFromBeat(beat: AlphaTabBeatLike): TabNote[] {
  if (beat.isRest) {
    return [];
  }

  return beat.notes
    .map((note) => ({ ...note, normalizedString: normalizeAlphaTabStringNumber(note.string) }))
    .filter((note) => !note.isDead && OPEN_STRING_MIDI_BY_STRING[note.normalizedString] !== undefined)
    .map((note) => ({ fret: note.fret, palmMuted: beat.isPalmMute, stringNumber: note.normalizedString }));
}

function extractBassNotesFromBeat(beat: AlphaTabBeatLike): TabNote[] {
  if (beat.isRest) {
    return [];
  }

  return beat.notes
    .map((note) => ({ ...note, normalizedString: normalizeBassStringNumber(note.string) }))
    .filter((note) => !note.isDead && OPEN_STRING_MIDI_BY_STRING_BASS[note.normalizedString] !== undefined)
    .map((note) => ({ fret: note.fret, palmMuted: beat.isPalmMute, stringNumber: note.normalizedString }));
}

// trackIndex defaults to 0 so every existing call site (there was only one)
// keeps behaving exactly as before. Multipista mode is the only caller that
// ever passes something else. The note extractor is picked from the target
// track's own classifyTrackKind() result ('bass' -> extractBassNotesFromBeat,
// anything else -> extractGuitarNotesFromBeat, same as before this track was
// introduced) so the primary-track pipeline (cursor/scroll-follow/playEvent)
// works for a bass track exactly like it already did for guitar, without a
// second parallel code path. For every existing non-multiTrack page,
// trackIndex is always the literal 0 and that track is always classified
// 'guitar' (lesson tabs are guitar tabs), so this resolves to
// extractGuitarNotesFromBeat exactly as before — see "Multipista" > "Bajo
// como pista principal" in AlphaTabPlayer.NOTES.md.
function buildEventsFromScore(score: AlphaTabScoreLike, trackIndex = 0) {
  const track = score.tracks[trackIndex];
  const extractNotes = track && classifyTrackKind(track) === 'bass' ? extractBassNotesFromBeat : extractGuitarNotesFromBeat;
  const beatEntries = track?.staves[0]?.bars
    .flatMap((bar) => {
      const beats = bar.voices[0]?.beats ?? [];
      const firstPlayableBeatId = beats.find((beat) => !beat.isRest && beat.notes.length > 0)?.id;
      return beats.map((beat) => ({
        beat,
        isFirstPlayableBeatOfBar: firstPlayableBeatId !== undefined && beat.id === firstPlayableBeatId,
      }));
    })
    .sort((a, b) => a.beat.absolutePlaybackStart - b.beat.absolutePlaybackStart);

  if (!beatEntries?.length) {
    return [];
  }

  return beatEntries.map(({ beat, isFirstPlayableBeatOfBar }) => ({
    beat,
    beatId: beat.id,
    duration: beat.duration,
    isFirstPlayableBeatOfBar,
    notes: extractNotes(beat),
    quarterNotes: beatQuarterNotes(beat),
  }));
}

function classifyTrackKind(track: AlphaTabScoreLike['tracks'][number]): TrackKind {
  const staff = track.staves[0];
  if (staff?.isPercussion) {
    return 'percussion';
  }
  if (staff?.tuning?.length === 6) {
    return 'guitar';
  }
  if (staff?.tuning?.length === 4) {
    return 'bass';
  }
  return 'unsupported';
}

function choosePrimaryTrackIndex(score: AlphaTabScoreLike) {
  const guitarIndex = score.tracks.findIndex((track) => classifyTrackKind(track) === 'guitar');
  return guitarIndex >= 0 ? guitarIndex : 0;
}

// GM percussion map, grouped into the 3 drum sounds the metronome engine
// already knows how to synthesize (playMetronomeClick in guitarAudioEngine.ts).
// Kick/snare are the notes the user explicitly asked for; toms are folded
// into whichever of the two they read closer to (low toms -> kick's low
// thump, mid/high toms -> snare's sharper transient); everything else
// (hi-hats, crashes, rides, latin percussion, etc.) falls back to 'cymbal'.
// Not a perfect GM mapping, deliberately — see AlphaTabPlayer.NOTES.md.
const PERCUSSION_KICK_MIDI = new Set([35, 36, 41, 43, 45]);
const PERCUSSION_SNARE_MIDI = new Set([31, 33, 34, 37, 38, 40, 47, 48, 50]);
const PERCUSSION_CYMBAL_MIDI = new Set([26, 27, 28, 29, 30, 39, 42, 44, 46, 49, 51, 52, 53, 54, 55, 56, 57, 58, 59]);

function percussionClickType(midiNumber: number): DrumClickType {
  if (PERCUSSION_KICK_MIDI.has(midiNumber)) {
    return 'kick';
  }
  if (PERCUSSION_SNARE_MIDI.has(midiNumber)) {
    return 'snare';
  }
  if (PERCUSSION_CYMBAL_MIDI.has(midiNumber)) {
    return 'cymbal';
  }
  // Coarse fallback for anything not explicitly listed above.
  if (midiNumber < 42) {
    return 'kick';
  }
  return midiNumber < 60 ? 'snare' : 'cymbal';
}

function resolvePercussionMidi(track: AlphaTabScoreLike['tracks'][number], note: AlphaTabNoteLike) {
  const index = note.percussionArticulation;
  if (index === undefined) {
    return undefined;
  }
  const mapped = track.percussionArticulations?.[index]?.outputMidiNumber;
  return typeof mapped === 'number' ? mapped : index;
}

function extractPercussionHitsFromBeat(beat: AlphaTabBeatLike, track: AlphaTabScoreLike['tracks'][number]): DrumClickType[] {
  if (beat.isRest) {
    return [];
  }

  return beat.notes
    .map((note) => resolvePercussionMidi(track, note))
    .filter((midiNumber): midiNumber is number => midiNumber !== undefined)
    .map((midiNumber) => percussionClickType(midiNumber));
}

// One flattened, chronologically-ordered event list per auxiliary track,
// independent from the primary track's own `events` state. quarterStart is
// derived the same way playEvent derives eventStartQuarter for the primary
// track (a running sum of quarterNotes) rather than from
// beat.absolutePlaybackStart, so both timelines share the same units without
// needing to know that field's internal (undocumented) unit.
function buildAuxiliaryTrackSchedule(
  track: AlphaTabScoreLike['tracks'][number],
  kind: 'bass' | 'guitar' | 'percussion'
): AuxTrackEvent[] {
  const beats = (track.staves[0]?.bars ?? []).flatMap((bar) => bar.voices[0]?.beats ?? []);
  const events: AuxTrackEvent[] = [];
  let quarterCursor = 0;

  for (const beat of beats) {
    const quarterNotes = beatQuarterNotes(beat);
    if (kind === 'guitar') {
      const guitarNotes = extractGuitarNotesFromBeat(beat);
      if (guitarNotes.length > 0) {
        events.push({ guitarNotes, quarterNotes, quarterStart: quarterCursor });
      }
    } else if (kind === 'bass') {
      const bassNotes = extractBassNotesFromBeat(beat);
      if (bassNotes.length > 0) {
        events.push({ bassNotes, quarterNotes, quarterStart: quarterCursor });
      }
    } else {
      const percussionHits = extractPercussionHitsFromBeat(beat, track);
      if (percussionHits.length > 0) {
        events.push({ percussionHits, quarterNotes, quarterStart: quarterCursor });
      }
    }
    quarterCursor += quarterNotes;
  }

  return events;
}

function buildAuxiliaryTrackSchedules(
  score: AlphaTabScoreLike,
  trackInfos: TrackDisplayInfo[],
  primaryTrackIndex: number
): AuxTrackSchedule[] {
  const schedules: AuxTrackSchedule[] = [];
  for (const info of trackInfos) {
    if (info.index === primaryTrackIndex || info.kind === 'unsupported') {
      continue;
    }
    const track = score.tracks[info.index];
    const events = buildAuxiliaryTrackSchedule(track, info.kind);
    if (events.length > 0) {
      schedules.push({ events, index: info.index, kind: info.kind });
    }
  }
  return schedules;
}

// Percussion notation preview (opt-in, multiTrack only — see
// "Previsualización de partitura de batería" in AlphaTabPlayer.NOTES.md).
// A drum beat has no fret/string model at all, so this deliberately does NOT
// reuse TabEvent (whose `notes: TabNote[]` would always be empty and
// misleading) — it only carries what playEvent's preview hook needs to find
// "which drum beat is happening right now" while the primary track plays.
interface PercussionPreviewEvent {
  beat: AlphaTabBeatLike;
  quarterNotes: number;
  quarterStart: number;
}

// Sibling of buildEventsFromScore/buildAuxiliaryTrackSchedule, used only by
// the percussion preview. quarterStart is a running sum of quarterNotes,
// same convention buildAuxiliaryTrackSchedule already uses for drum AUDIO
// scheduling, so both share the same "negras desde el inicio" timeline as
// playEvent's own eventStartQuarter without depending on
// beat.absolutePlaybackStart's undocumented unit.
function buildPercussionEventsFromScore(score: AlphaTabScoreLike, trackIndex: number): PercussionPreviewEvent[] {
  const track = score.tracks[trackIndex];
  const beats = (track?.staves[0]?.bars ?? []).flatMap((bar) => bar.voices[0]?.beats ?? []);
  const events: PercussionPreviewEvent[] = [];
  let quarterCursor = 0;

  for (const beat of beats) {
    const quarterNotes = beatQuarterNotes(beat);
    if (!beat.isRest && beat.notes.length > 0) {
      events.push({ beat, quarterNotes, quarterStart: quarterCursor });
    }
    quarterCursor += quarterNotes;
  }

  return events;
}

function parseTempo(tab: string) {
  return Number(tab.match(/\\tempo\s*\(\s*(\d+)/)?.[1]) || DEFAULT_BPM;
}

function noteMidi(note: TabNote) {
  return OPEN_STRING_MIDI_BY_STRING[note.stringNumber] + note.fret;
}

function bassNoteMidi(note: TabNote) {
  return OPEN_STRING_MIDI_BY_STRING_BASS[note.stringNumber] + note.fret;
}

function stringArrayIndex(note: TabNote) {
  return clamp(6 - note.stringNumber, 0, GUITAR_SAMPLE_CUTOFFS.length - 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

let guitarOutputLimiterCurve: Float32Array<ArrayBuffer> | null = null;

// Identity below GUITAR_OUTPUT_LIMITER_THRESHOLD, a tanh knee above it —
// same shape/reasoning as guitarAudioEngine.ts's getBassSoftClipCurve (a
// WaveShaperNode reacts per-sample with no lookahead, so unlike a
// DynamicsCompressorNode it never mis-fires on this engine's fast note
// attacks), except this one has an explicit linear region instead of a pure
// tanh(x): the guitar bus's normal levels (~0.4-0.57) are much closer to 1.0
// than the bass's (~0.19), so a plain tanh over the whole domain would
// audibly compress today's normal playback — see GUITAR_OUTPUT_LIMITER_THRESHOLD's
// comment for the measured numbers that set the threshold. Cached at module
// level (pure function of no runtime state, safe to share across every
// AlphaTabPlayer instance on a page) same pattern as guitarAudioEngine.ts's
// curve caches.
function getGuitarOutputLimiterCurve(): Float32Array<ArrayBuffer> {
  if (guitarOutputLimiterCurve) return guitarOutputLimiterCurve;
  const n = 4096;
  const curve = new Float32Array(n);
  const t = GUITAR_OUTPUT_LIMITER_THRESHOLD;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    if (ax <= t) {
      curve[i] = x;
    } else {
      const sign = x < 0 ? -1 : 1;
      const knee = (ax - t) / (1 - t);
      curve[i] = sign * (t + (1 - t) * Math.tanh(knee));
    }
  }
  guitarOutputLimiterCurve = curve;
  return curve;
}

function eventDurationSeconds(event: TabEvent, speed: number, bpm: number) {
  return ((60 / bpm) * event.quarterNotes) / speed;
}

function getBarAnnotationText(bar: AlphaTabScoreLike['tracks'][number]['staves'][number]['bars'][number], score: AlphaTabScoreLike) {
  const textParts: string[] = [];
  const masterBar = bar.masterBar ?? (typeof bar.index === 'number' ? score.masterBars?.[bar.index] : undefined);
  if (masterBar?.section) {
    textParts.push(masterBar.section.marker ?? '', masterBar.section.text ?? '');
  }

  for (const voice of bar.voices) {
    for (const beat of voice.beats) {
      textParts.push(beat.text ?? '', ...(beat.lyrics ?? []));
    }
  }

  return textParts.filter(Boolean).join(' ');
}

function getAnnotatedBarWidth(bar: AlphaTabScoreLike['tracks'][number]['staves'][number]['bars'][number], score: AlphaTabScoreLike) {
  const beats = bar.voices.flatMap((voice) => voice.beats);
  const annotationText = getBarAnnotationText(bar, score);
  if (!annotationText) {
    return null;
  }

  const playableBeats = beats.filter((beat) => !beat.isRest && beat.notes.length > 0).length;
  const noteCount = beats.reduce((total, beat) => total + beat.notes.length, 0);
  const longestAnnotation = annotationText
    .split(/\s+/)
    .reduce((longest, part) => Math.max(longest, part.length), annotationText.length);

  return Math.ceil(
    ANNOTATED_BAR_BASE_WIDTH +
      Math.max(annotationText.length, longestAnnotation + 8) * ANNOTATED_BAR_TEXT_WIDTH +
      playableBeats * ANNOTATED_BAR_BEAT_WIDTH +
      noteCount * ANNOTATED_BAR_NOTE_WIDTH
  );
}

function applyAnnotatedHorizontalBarWidths(score: AlphaTabScoreLike) {
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        const annotatedWidth = getAnnotatedBarWidth(bar, score);
        if (annotatedWidth === null) {
          continue;
        }

        bar.displayWidth = Math.max(bar.displayWidth ?? 0, annotatedWidth);
        if (bar.masterBar) {
          bar.masterBar.displayWidth = Math.max(bar.masterBar.displayWidth ?? 0, annotatedWidth);
        }
      }
    }
  }
}

function applyExplicitHorizontalBarWidths(score: AlphaTabScoreLike, widths: number[]) {
  for (const [index, masterBar] of (score.masterBars ?? []).entries()) {
    const width = widths[index];
    if (width) {
      masterBar.displayWidth = width;
    }
  }

  for (const track of score.tracks) {
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        const width = widths[bar.index ?? staff.bars.indexOf(bar)];
        if (!width) {
          continue;
        }

        bar.displayWidth = width;
        if (bar.masterBar) {
          bar.masterBar.displayWidth = width;
        }
      }
    }
  }
}

export default function AlphaTabPlayer({
  centerHorizontalContent = false,
  compact = false,
  disablePlaybackScrollFollow = false,
  horizontalLeftCrop = 0,
  horizontalBarFit,
  horizontalBarWidth,
  horizontalBarWidths,
  initialSpeed = DEFAULT_SPEED,
  layout = 'page',
  minHeight,
  multiTrack = false,
  showHorizontalScrollbar = true,
  source,
  tab = '',
}: AlphaTabPlayerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerIdRef = useRef(Symbol('AlphaTabPlayer'));
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioOutputRef = useRef<AudioOutputChain | null>(null);
  const activeSourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const activeVoicesRef = useRef<GuitarSampleVoice[]>([]);
  const auxiliaryTrackScheduleRef = useRef<AuxTrackSchedule[]>([]);
  const mutedTrackIndexesRef = useRef<Set<number>>(new Set());
  // Per-track volume multiplier (see "Volumen por pista..." in
  // AlphaTabPlayer.NOTES.md), [0, 1], default 1 (no change) — an ADDITIONAL
  // multiplier on top of volumeRef, never a replacement for it or for the
  // already-tuned BASS_TRACK_VOLUME_MULTIPLIER/DRUM_TRACK_VOLUME_BOOST
  // constants. Same twin-ref/state pattern as mutedTrackIndexesRef above.
  const trackVolumesRef = useRef<Map<number, number>>(new Map());
  // Same idea as trackVolumesRef/mutedTrackIndexesRef/soloTrackIndexRef, but
  // keyed by DrumClickType instead of track index — per-hit-type (bombo/
  // caja/platillo) mute/solo/volume, independent of which track is muted/
  // soloed. See "Volumen por pista..." in AlphaTabPlayer.NOTES.md.
  const drumElementMutedRef = useRef<Set<DrumClickType>>(new Set());
  const drumElementSoloRef = useRef<DrumClickType | null>(null);
  const drumElementVolumesRef = useRef<Map<DrumClickType, number>>(new Map());
  const primaryTrackIndexRef = useRef(0);
  // Kind of the current primary track (see applyPrimaryTrack), read by
  // playEvent to decide which synth to use for the primary track's own
  // notes: 'bass' -> playBassNote (guitarAudioEngine.ts's own AudioContext),
  // anything else -> playPluckedNote (this component's sample engine, same
  // as always). Defaults to 'guitar' and playEvent additionally gates this
  // dispatch on `multiTrack` so non-multiTrack pages never take the bass
  // branch even if this were ever miscomputed. See "Multipista" in
  // AlphaTabPlayer.NOTES.md.
  const primaryTrackKindRef = useRef<TrackKind>('guitar');
  // The score object currently loaded (identity check to tell a genuinely new
  // score apart from the reentrant scoreLoaded fire caused by our own
  // api.renderTracks() call below — see applyPrimaryTrack).
  const scoreRef = useRef<AlphaTabScoreLike | null>(null);
  // Which track index AlphaTab is actually rendering right now. null until the
  // first scoreLoaded fire so applyPrimaryTrack always runs at least once.
  const renderedTrackIndexRef = useRef<number | null>(null);
  // Set only when the user manually picks a track from the dropdown; overrides
  // choosePrimaryTrackIndex's auto-pick for the rest of this score's lifetime.
  const selectedTrackIndexOverrideRef = useRef<number | null>(null);
  const soloTrackIndexRef = useRef<number | null>(null);
  // Percussion notation preview (multiTrack only — see "Previsualización de
  // partitura de batería" in AlphaTabPlayer.NOTES.md). null = normal view
  // (whatever primaryTrackIndexRef points at). Set synchronously, before the
  // api.renderTracks() call that shows the drum track, so the reentrant
  // scoreLoaded fire that call triggers can tell "we're mid-preview" apart
  // from a genuine track change and skip applyPrimaryTrack.
  const previewedTrackIndexRef = useRef<number | null>(null);
  // Beat list for the currently previewed drum track, built once when the
  // preview starts (see buildPercussionEventsFromScore). Read every tick by
  // playEvent while a preview is active, matched against eventStartQuarter.
  const percussionPreviewEventsRef = useRef<PercussionPreviewEvent[]>([]);
  // Per-staff showTablature/showStandardNotation captured right before
  // previewPercussionTrack overwrites them, keyed `${trackIndex}-${staffIndex}`,
  // so exitPercussionPreview restores exactly what was there instead of
  // assuming a fixed value (every non-multiTrack page never touches these two
  // fields at all, so this stays an empty Map for them).
  const originalStaveVisibilityRef = useRef<Map<string, { showStandardNotation: boolean; showTablature: boolean }>>(
    new Map()
  );
  // api.settings.display.staveProfile as it was before previewPercussionTrack
  // forced StaveProfile.Score. Captured (not hardcoded to StaveProfile.Tab,
  // the value this file's own AlphaTabApi config sets — see scoreLoaded)
  // so this stays correct even if that config value ever changes.
  const originalStaveProfileRef = useRef<alphaTab.StaveProfile | null>(null);
  const beatToEventIndexRef = useRef(new Map<number, number>());
  const finishTimerRef = useRef<number | null>(null);
  const guitarSamplesLoadingRef = useRef<Promise<LoadedGuitarSample[]> | null>(null);
  const guitarSamplesRef = useRef<LoadedGuitarSample[] | null>(null);
  const isPlayingRef = useRef(false);
  const keyboardActionRef = useRef<() => void>(() => {});
  const metronomeSubdivisionRef = useRef<MetronomeSubdivision>(DEFAULT_METRONOME_SUBDIVISION);
  const metronomeRef = useRef(DEFAULT_METRONOME);
  const playbackScrollPendingRef = useRef(false);
  const playbackScrollUserOverrideRef = useRef(false);
  const pointerDragHandleRef = useRef<'end' | 'start' | null>(null);
  const pointerScrollDragRef = useRef<{
    pointerId: number;
    scrollLeft: number;
    startX: number;
    startY: number;
    target: HTMLElement;
    wasDragging: boolean;
  } | null>(null);
  const pointerStartIndexRef = useRef<number | null>(null);
  const pointerSuppressUpRef = useRef(false);
  const pointerTapRef = useRef<{ index: number; time: number; x: number; y: number } | null>(null);
  const playTimerRef = useRef<number | null>(null);
  const removeTabScrollListenerRef = useRef<() => void>(() => {});
  const programmaticPageScrollRef = useRef(false);
  const programmaticPageScrollTimerRef = useRef<number | null>(null);
  const programmaticScrollbarScrollRef = useRef(false);
  const programmaticScrollbarScrollTimerRef = useRef<number | null>(null);
  const programmaticTabScrollRef = useRef(false);
  const programmaticTabScrollTimerRef = useRef<number | null>(null);
  const speedRef = useRef(initialSpeed);
  const tabScrollbarRef = useRef<HTMLDivElement | null>(null);
  const tabScrollElementRef = useRef<HTMLElement | null>(null);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const voiceIdRef = useRef(0);
  const fallbackEvents = useMemo(() => (tab ? parseAlphaTexEvents(tab) : []), [tab]);
  // detectedScoreTempo is the real score.tempo (BPM) read off the loaded file,
  // only populated when multiTrack is true (see the scoreLoaded handler and
  // "Multipista" > tempo in AlphaTabPlayer.NOTES.md for why this isn't
  // wired up for every `source` page — it would silently change the playback
  // speed of existing, already-tuned lesson pages).
  const [detectedScoreTempo, setDetectedScoreTempo] = useState<number | null>(null);
  const bpm = useMemo(() => {
    if (multiTrack && detectedScoreTempo) {
      return detectedScoreTempo;
    }
    return tab ? parseTempo(tab) : DEFAULT_BPM;
  }, [tab, multiTrack, detectedScoreTempo]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [metronome, setMetronome] = useState(DEFAULT_METRONOME);
  const [metronomeMenuOpen, setMetronomeMenuOpen] = useState(false);
  const [metronomeSubdivision, setMetronomeSubdivision] = useState<MetronomeSubdivision>(DEFAULT_METRONOME_SUBDIVISION);
  const [scoreTracks, setScoreTracks] = useState<TrackDisplayInfo[]>([]);
  const [primaryTrackIndex, setPrimaryTrackIndex] = useState(0);
  // React-visible twin of previewedTrackIndexRef (same pattern as
  // primaryTrackIndex/primaryTrackIndexRef above) — drives the dropdown's
  // "Volver a tablatura" pill and the JSX that hides string labels/loop boxes
  // while a drum preview is active. See "Previsualización de partitura de
  // batería" in AlphaTabPlayer.NOTES.md.
  const [previewedTrackIndex, setPreviewedTrackIndex] = useState<number | null>(null);
  const [mutedTrackIndexes, setMutedTrackIndexes] = useState<Set<number>>(new Set());
  const [soloTrackIndex, setSoloTrackIndex] = useState<number | null>(null);
  // React-visible twin of trackVolumesRef — see that ref's comment above.
  const [trackVolumes, setTrackVolumes] = useState<Map<number, number>>(new Map());
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  // React-visible twins of drumElementMutedRef/drumElementSoloRef/
  // drumElementVolumesRef — see those refs' comments above.
  const [drumElementMuted, setDrumElementMuted] = useState<Set<DrumClickType>>(new Set());
  const [drumElementSolo, setDrumElementSolo] = useState<DrumClickType | null>(null);
  const [drumElementVolumes, setDrumElementVolumes] = useState<Map<DrumClickType, number>>(new Map());
  const [drumMenuOpen, setDrumMenuOpen] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [speed, setSpeed] = useState(initialSpeed);
  const [startEventIndex, setStartEventIndex] = useState(0);
  const [loopEndIndex, setLoopEndIndex] = useState<number | null>(null);
  const [loopHandleBoxes, setLoopHandleBoxes] = useState<LoopHandleBox[]>([]);
  const [loopStartIndex, setLoopStartIndex] = useState<number | null>(null);
  const [cursorBox, setCursorBox] = useState<CursorBox>({ height: 0, visible: false, x: 0, y: 0 });
  const [events, setEvents] = useState<TabEvent[]>(fallbackEvents);
  const [loopHighlightBoxes, setLoopHighlightBoxes] = useState<HighlightBox[]>([]);
  const [stringLabelGroups, setStringLabelGroups] = useState<StringLabelGroup[]>([]);
  const [tabScrollMetrics, setTabScrollMetrics] = useState({ clientWidth: 0, scrollWidth: 0 });
  const [tabScrollLeft, setTabScrollLeft] = useState(0);
  const [fitContainerWidth, setFitContainerWidth] = useState(0);
  const [horizontalExtraVisualOffset, setHorizontalExtraVisualOffset] = useState(0);
  const effectiveHorizontalBarWidths = useMemo(() => {
    if (!horizontalBarFit || fitContainerWidth <= 0) {
      return horizontalBarWidths;
    }

    const barCount = Math.max(1, horizontalBarFit.barCount);
    const firstBarWidth = horizontalBarFit.firstBarWidth ?? horizontalBarWidth ?? 132;
    const sidePadding = horizontalBarFit.sidePadding ?? 220;
    const restCount = Math.max(1, barCount - 1);
    const availableForRest = Math.max(0, fitContainerWidth - firstBarWidth - sidePadding);
    const restBarWidth = clamp(
      Math.floor(availableForRest / restCount),
      horizontalBarFit.minRestBarWidth ?? 68,
      horizontalBarFit.maxRestBarWidth ?? 96
    );

    return [firstBarWidth, ...Array.from({ length: barCount - 1 }, () => restBarWidth)];
  }, [fitContainerWidth, horizontalBarFit, horizontalBarWidth, horizontalBarWidths]);
  const estimatedHorizontalScrollWidth =
    layout === 'horizontal'
      ? Math.max(
          tabScrollMetrics.scrollWidth,
          tabScrollMetrics.clientWidth + HORIZONTAL_SCROLL_MIN_EXTRA_WIDTH,
          fallbackEvents.length * (horizontalBarWidth ?? effectiveHorizontalBarWidths?.[1] ?? 120) + 320
        )
      : tabScrollMetrics.scrollWidth;
  const shouldShowTabScrollbar =
    showHorizontalScrollbar &&
    (layout === 'horizontal' || tabScrollMetrics.scrollWidth > tabScrollMetrics.clientWidth + 2);
  const useLinearPlaybackOffset = layout === 'horizontal' && showHorizontalScrollbar && !disablePlaybackScrollFollow;
  const linearPlaybackLeftGutter =
    useLinearPlaybackOffset && tabScrollMetrics.clientWidth > 0
      ? Math.round(tabScrollMetrics.clientWidth * LINEAR_PLAYBACK_CURSOR_RATIO)
      : 0;
  const linearVisualOffset = layout === 'horizontal' ? linearPlaybackLeftGutter : 0;
  const visualScrollOffset = tabScrollLeft - linearVisualOffset;

  function getTabContainerPadding() {
    if (!containerRef.current) {
      return { left: 0, top: 0 };
    }

    const styles = window.getComputedStyle(containerRef.current);
    return {
      left: Number.parseFloat(styles.paddingLeft) || 0,
      top: Number.parseFloat(styles.paddingTop) || 0,
    };
  }

  function getCursorXFromBeatBounds(beatBounds: BeatBoundsLike) {
    const noteBounds = beatBounds.notes?.map((note) => note.noteHeadBounds).filter((bounds) => bounds.w > 0);
    if (noteBounds?.length) {
      const noteCenter = noteBounds.reduce((sum, bounds) => sum + bounds.x + bounds.w / 2, 0) / noteBounds.length;
      return noteCenter;
    }

    return beatBounds.onNotesX || beatBounds.visualBounds.x || beatBounds.realBounds.x;
  }

  function placeCursorForBeat(beat: AlphaTabBeatLike | undefined, shouldScroll = false) {
    const boundsLookup = apiRef.current?.boundsLookup;
    if (!beat || !boundsLookup) {
      return;
    }

    const beatBounds =
      boundsLookup.findBeat(beat as unknown as alphaTab.model.Beat) ??
      boundsLookup.findBeats(beat as unknown as alphaTab.model.Beat)?.[0];
    if (!beatBounds) {
      return;
    }

    const barBounds = beatBounds.barBounds.masterBarBounds.realBounds;
    const padding = getTabContainerPadding();
    const cursorX = getCursorXFromBeatBounds(beatBounds);
    const nextBox = {
      height: Math.max(40, barBounds.h),
      visible: true,
      x: Math.max(0, cursorX + padding.left - CURSOR_LINE_WIDTH / 2),
      y: Math.max(0, barBounds.y) + padding.top,
    };
    setCursorBox({
      height: nextBox.height,
      visible: nextBox.visible,
      x: nextBox.x,
      y: nextBox.y,
    });

    if (shouldScroll && !disablePlaybackScrollFollow) {
      followCursorHorizontally(nextBox.x);
      keepCursorVisibleOnPage(nextBox, true);
      return;
    }

    if (isPlayingRef.current) {
      keepCursorVisibleDuringPlayback(nextBox);
    }
  }

  function selectKeyboardPlayer() {
    // Intentional module-singleton reassignment — see "Global singletons" in
    // AlphaTabPlayer.NOTES.md. react-hooks/globals is a false positive here:
    // this reassignment already existed before the percussion-preview work
    // in this file and was previously unflagged; it started firing once this
    // file's total size crossed some internal complexity threshold in the
    // react-compiler ESLint plugin (confirmed by bisection — removing
    // unrelated new code elsewhere in this file makes it disappear again,
    // with zero change to this line). See "Previsualización de partitura de
    // batería" in AlphaTabPlayer.NOTES.md for the full account.
    // eslint-disable-next-line react-hooks/globals
    selectedKeyboardPlayerId = playerIdRef.current;
  }

  function clearGlobalPlaybackIfCurrent(playerId = playerIdRef.current) {
    if (currentPlayingPlayerId === playerId) {
      // Same false positive as selectKeyboardPlayer above (react-hooks/globals
      // on a pre-existing, intentional module-singleton reassignment).
      // eslint-disable-next-line react-hooks/globals
      currentPlayingPlayerId = null;
      // eslint-disable-next-line react-hooks/globals
      stopCurrentPlayingPlayer = null;
    }
  }

  function findTabScrollElement() {
    const root = containerRef.current;
    if (!root) {
      return null;
    }

    const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    const widestScrollableElement =
      candidates
        .filter((element) => element.scrollWidth > element.clientWidth + 2)
        .sort((a, b) => b.scrollWidth - b.clientWidth - (a.scrollWidth - a.clientWidth))[0] ?? null;

    if (widestScrollableElement) {
      return widestScrollableElement;
    }

    const surfaceWidth = root.querySelector<HTMLElement>('.at-surface')?.getBoundingClientRect().width ?? 0;
    return surfaceWidth > root.clientWidth + 2 ? root : null;
  }

  function bindTabScrollElement() {
    const nextElement = findTabScrollElement();
    if (nextElement === tabScrollElementRef.current) {
      updateTabScrollMetrics(nextElement);
      return nextElement;
    }

    removeTabScrollListenerRef.current();
    tabScrollElementRef.current = nextElement;

    if (!nextElement) {
      if (layout === 'horizontal') {
        updateTabScrollMetrics(containerRef.current);
        removeTabScrollListenerRef.current = () => {};
        return null;
      }

      setTabScrollMetrics({ clientWidth: 0, scrollWidth: 0 });
      setTabScrollLeft(0);
      removeTabScrollListenerRef.current = () => {};
      return null;
    }

    const handleScroll = () => {
      updateTabScrollMetrics(nextElement);
      syncVisibleScrollbar(nextElement.scrollLeft);
      setTabScrollLeft(nextElement.scrollLeft);
      if (isPlayingRef.current && !programmaticTabScrollRef.current) {
        playbackScrollUserOverrideRef.current = true;
      }
    };
    nextElement.addEventListener('scroll', handleScroll, { passive: true });
    updateTabScrollMetrics(nextElement);
    setTabScrollLeft(nextElement.scrollLeft);
    syncVisibleScrollbar(nextElement.scrollLeft);
    removeTabScrollListenerRef.current = () => nextElement.removeEventListener('scroll', handleScroll);
    return nextElement;
  }

  function syncVisibleScrollbar(scrollLeft: number) {
    const scrollbar = tabScrollbarRef.current;
    if (!scrollbar || Math.abs(scrollbar.scrollLeft - scrollLeft) < 1) {
      return;
    }

    programmaticScrollbarScrollRef.current = true;
    if (programmaticScrollbarScrollTimerRef.current !== null) {
      window.clearTimeout(programmaticScrollbarScrollTimerRef.current);
    }
    scrollbar.scrollLeft = scrollLeft;
    programmaticScrollbarScrollTimerRef.current = window.setTimeout(() => {
      programmaticScrollbarScrollRef.current = false;
      programmaticScrollbarScrollTimerRef.current = null;
    }, 120);
  }

  function updateTabScrollMetrics(element = tabScrollElementRef.current) {
    const fallbackElement = containerRef.current;
    const measuredElement = element ?? fallbackElement;
    const surface = fallbackElement?.querySelector<HTMLElement>('.at-surface');
    const surfaceWidth = surface ? Math.ceil(surface.getBoundingClientRect().width) : 0;
    const clientWidth = measuredElement?.clientWidth ?? 0;
    const nextMetrics = {
      clientWidth,
      scrollWidth:
        layout === 'horizontal'
          ? Math.max(clientWidth + HORIZONTAL_SCROLL_MIN_EXTRA_WIDTH, surfaceWidth + clientWidth)
          : Math.max(measuredElement?.scrollWidth ?? 0, surfaceWidth),
    };

    setTabScrollMetrics((currentMetrics) =>
      currentMetrics.clientWidth === nextMetrics.clientWidth && currentMetrics.scrollWidth === nextMetrics.scrollWidth
        ? currentMetrics
        : nextMetrics
    );
  }

  function syncTabScrollFromScrollbar(event: UIEvent<HTMLDivElement>) {
    if (layout === 'horizontal') {
      setTabScrollLeft(event.currentTarget.scrollLeft);
      if (programmaticScrollbarScrollRef.current) {
        return;
      }
      markExplicitManualPlaybackScroll();
      return;
    }

    const scrollFrame = bindTabScrollElement();
    if (!scrollFrame) {
      return;
    }

    scrollFrame.scrollLeft = event.currentTarget.scrollLeft;
    setTabScrollLeft(scrollFrame.scrollLeft);
    if (programmaticScrollbarScrollRef.current) {
      return;
    }
    markExplicitManualPlaybackScroll();
  }

  function getTabScrollPosition() {
    const scrollFrame = bindTabScrollElement();
    const left = layout === 'horizontal' ? tabScrollLeft - linearPlaybackLeftGutter : scrollFrame?.scrollLeft ?? containerRef.current?.scrollLeft ?? 0;
    const top = scrollFrame?.scrollTop ?? containerRef.current?.scrollTop ?? 0;

    if (layout !== 'horizontal' && left !== tabScrollLeft) {
      setTabScrollLeft(left);
    }

    return { left, top };
  }

  function markProgrammaticTabScroll() {
    programmaticTabScrollRef.current = true;
    if (programmaticTabScrollTimerRef.current !== null) {
      window.clearTimeout(programmaticTabScrollTimerRef.current);
    }
    programmaticTabScrollTimerRef.current = window.setTimeout(() => {
      programmaticTabScrollRef.current = false;
      programmaticTabScrollTimerRef.current = null;
    }, PLAYBACK_SCROLL_RESUME_DELAY);
  }

  function markProgrammaticPageScroll() {
    programmaticPageScrollRef.current = true;
    if (programmaticPageScrollTimerRef.current !== null) {
      window.clearTimeout(programmaticPageScrollTimerRef.current);
    }
    programmaticPageScrollTimerRef.current = window.setTimeout(() => {
      programmaticPageScrollRef.current = false;
      programmaticPageScrollTimerRef.current = null;
    }, PLAYBACK_SCROLL_RESUME_DELAY);
  }

  function markManualPlaybackScroll() {
    if (isPlayingRef.current && !programmaticPageScrollRef.current && !programmaticTabScrollRef.current) {
      playbackScrollUserOverrideRef.current = true;
    }
  }

  function markExplicitManualPlaybackScroll() {
    if (isPlayingRef.current) {
      playbackScrollUserOverrideRef.current = true;
    }
  }

  function isPlaybackControlTarget(target: EventTarget | null) {
    return target instanceof Element && target.closest('button, input, label, [role="menu"]') !== null;
  }

  function stopFollowingPlaybackOnTouch(pointerType: string, target: EventTarget | null) {
    if (pointerType === 'touch' && !isPlaybackControlTarget(target)) {
      markExplicitManualPlaybackScroll();
    }
  }

  function getScrollableTabElement() {
    const scrollFrame = bindTabScrollElement();
    return scrollFrame && scrollFrame.scrollWidth > scrollFrame.clientWidth + 2 ? scrollFrame : null;
  }

  function beginTabScrollDrag(event: PointerEvent<HTMLDivElement>) {
    if (layout === 'horizontal') {
      const clientWidth = tabScrollMetrics.clientWidth || tabScrollbarRef.current?.clientWidth || containerRef.current?.clientWidth || 0;
      const scrollWidth = estimatedHorizontalScrollWidth || tabScrollbarRef.current?.scrollWidth || 0;
      if (scrollWidth <= clientWidth + 2) {
        pointerScrollDragRef.current = null;
        return;
      }

      pointerScrollDragRef.current = {
        pointerId: event.pointerId,
        scrollLeft: tabScrollLeft,
        startX: event.clientX,
        startY: event.clientY,
        target: tabScrollbarRef.current ?? event.currentTarget,
        wasDragging: false,
      };
      return;
    }

    const target = getScrollableTabElement();
    if (!target) {
      pointerScrollDragRef.current = null;
      return;
    }

    pointerScrollDragRef.current = {
      pointerId: event.pointerId,
      scrollLeft: target.scrollLeft,
      startX: event.clientX,
      startY: event.clientY,
      target,
      wasDragging: false,
    };
  }

  function updateTabScrollDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = pointerScrollDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return false;
    }

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (!drag.wasDragging) {
      if (Math.abs(deltaX) < TAB_DRAG_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) {
        return false;
      }

      drag.wasDragging = true;
      pointerStartIndexRef.current = null;
      pointerSuppressUpRef.current = true;
      pointerTapRef.current = null;
      markExplicitManualPlaybackScroll();
    }

    event.preventDefault();
    if (layout === 'horizontal') {
      const clientWidth = tabScrollMetrics.clientWidth || tabScrollbarRef.current?.clientWidth || containerRef.current?.clientWidth || 0;
      const scrollWidth = estimatedHorizontalScrollWidth || tabScrollbarRef.current?.scrollWidth || 0;
      const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
      const nextScrollLeft = clamp(drag.scrollLeft - deltaX, 0, maxScrollLeft);
      setTabScrollLeft(nextScrollLeft);
      syncVisibleScrollbar(nextScrollLeft);
      return true;
    }

    drag.target.scrollLeft = drag.scrollLeft - deltaX;
    setTabScrollLeft(drag.target.scrollLeft);
    return true;
  }

  function endTabScrollDrag(event: PointerEvent<HTMLDivElement>) {
    const wasDragging = pointerScrollDragRef.current?.pointerId === event.pointerId && pointerScrollDragRef.current.wasDragging;
    pointerScrollDragRef.current = null;
    return wasDragging;
  }

  function followLinearCursorHorizontally(cursorX: number) {
    const scrollFrame = bindTabScrollElement();
    const clientWidth = tabScrollMetrics.clientWidth || tabScrollbarRef.current?.clientWidth || scrollFrame?.clientWidth || 0;
    const scrollWidth = estimatedHorizontalScrollWidth || tabScrollbarRef.current?.scrollWidth || scrollFrame?.scrollWidth || 0;
    if (clientWidth <= 0 || scrollWidth <= clientWidth) {
      return;
    }

    const maxScrollLeft = scrollWidth - clientWidth;
    const targetLeft = Math.min(maxScrollLeft, Math.max(0, cursorX));

    if (Math.abs(tabScrollLeft - targetLeft) < 1) {
      return;
    }

    markProgrammaticTabScroll();
    setTabScrollLeft(targetLeft);
    syncVisibleScrollbar(targetLeft);
  }

  function followCursorHorizontally(cursorX: number) {
    if (layout === 'horizontal') {
      followLinearCursorHorizontally(cursorX);
      return;
    }

    keepCursorVisibleHorizontally(cursorX);
  }

  function keepCursorVisibleHorizontally(cursorX: number) {
    const scrollFrame = bindTabScrollElement();
    if (!scrollFrame || scrollFrame.scrollWidth <= scrollFrame.clientWidth) {
      return;
    }

    const visibleLeft = scrollFrame.scrollLeft;
    const visibleRight = visibleLeft + scrollFrame.clientWidth;
    const comfortMargin = Math.min(180, Math.max(72, scrollFrame.clientWidth * PAGE_LAYOUT_HORIZONTAL_SCROLL_MARGIN_RATIO));
    const maxScrollLeft = scrollFrame.scrollWidth - scrollFrame.clientWidth;

    if (cursorX > visibleRight - comfortMargin) {
      markProgrammaticTabScroll();
      scrollFrame.scrollTo({
        behavior: 'smooth',
        left: Math.min(maxScrollLeft, Math.max(0, cursorX - scrollFrame.clientWidth * 0.45)),
      });
      return;
    }

    if (cursorX < visibleLeft + comfortMargin) {
      markProgrammaticTabScroll();
      scrollFrame.scrollTo({
        behavior: 'smooth',
        left: Math.max(0, cursorX - comfortMargin),
      });
    }
  }

  function keepCursorVisibleOnPage(nextBox: CursorBox, force = false) {
    if (!containerRef.current) {
      return;
    }

    const scrollPosition = getTabScrollPosition();
    const rect = containerRef.current.getBoundingClientRect();
    const cursorTop = rect.top + nextBox.y - scrollPosition.top;
    const cursorBottom = cursorTop + nextBox.height;
    const topComfort = Math.min(180, Math.max(96, window.innerHeight * 0.22));
    const bottomComfort = Math.min(220, Math.max(120, window.innerHeight * 0.26));

    if (force || cursorTop < topComfort) {
      markProgrammaticPageScroll();
      window.scrollBy({
        behavior: 'smooth',
        top: cursorTop - topComfort,
      });
      return;
    }

    if (cursorBottom > window.innerHeight - bottomComfort) {
      markProgrammaticPageScroll();
      window.scrollBy({
        behavior: 'smooth',
        top: cursorBottom - (window.innerHeight - bottomComfort),
      });
    }
  }

  function keepCursorVisibleDuringPlayback(nextBox: CursorBox) {
    if (disablePlaybackScrollFollow) {
      return;
    }

    if (playbackScrollUserOverrideRef.current) {
      return;
    }

    followCursorHorizontally(nextBox.x);
    keepCursorVisibleOnPage(nextBox);
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const effectPlayerId = playerIdRef.current;

    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    if (playTimerRef.current !== null) {
      window.clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // The source may have already finished naturally.
      }
    }
    activeSourcesRef.current = [];
    for (const voice of activeVoicesRef.current) {
      voice.stop(audioContextRef.current ?? undefined);
      voice.destroy();
    }
    activeVoicesRef.current = [];

    setIsPlaying(false);
    isPlayingRef.current = false;
    clearGlobalPlaybackIfCurrent();
    setMetronome(DEFAULT_METRONOME);
    setMetronomeMenuOpen(false);
    setMetronomeSubdivision(DEFAULT_METRONOME_SUBDIVISION);
    metronomeSubdivisionRef.current = DEFAULT_METRONOME_SUBDIVISION;
    metronomeRef.current = DEFAULT_METRONOME;
    setScoreTracks([]);
    setMutedTrackIndexes(new Set());
    mutedTrackIndexesRef.current = new Set();
    setSoloTrackIndex(null);
    soloTrackIndexRef.current = null;
    setTrackVolumes(new Map());
    trackVolumesRef.current = new Map();
    setTrackMenuOpen(false);
    setDrumElementMuted(new Set());
    drumElementMutedRef.current = new Set();
    setDrumElementSolo(null);
    drumElementSoloRef.current = null;
    setDrumElementVolumes(new Map());
    drumElementVolumesRef.current = new Map();
    setDrumMenuOpen(false);
    primaryTrackIndexRef.current = 0;
    setPrimaryTrackIndex(0);
    scoreRef.current = null;
    renderedTrackIndexRef.current = null;
    selectedTrackIndexOverrideRef.current = null;
    previewedTrackIndexRef.current = null;
    setPreviewedTrackIndex(null);
    percussionPreviewEventsRef.current = [];
    originalStaveVisibilityRef.current = new Map();
    originalStaveProfileRef.current = null;
    setDetectedScoreTempo(null);
    auxiliaryTrackScheduleRef.current = [];
    setVolume(DEFAULT_VOLUME);
    volumeRef.current = DEFAULT_VOLUME;
    setSpeed(initialSpeed);
    speedRef.current = initialSpeed;
    setStartEventIndex(0);
    setLoopEndIndex(null);
    setLoopStartIndex(null);
    setLoopHighlightBoxes([]);
    setLoopHandleBoxes([]);
    setStringLabelGroups([]);
    setTabScrollLeft(0);
    setHorizontalExtraVisualOffset(0);
    setCursorBox({ height: 0, visible: false, x: 0, y: 0 });
    setEvents(fallbackEvents);
    playbackScrollUserOverrideRef.current = false;
    programmaticPageScrollRef.current = false;
    programmaticTabScrollRef.current = false;
    beatToEventIndexRef.current = new Map(
      fallbackEvents
        .map((event, index) => (event.beatId === undefined ? null : ([event.beatId, index] as const)))
        .filter((entry): entry is readonly [number, number] => entry !== null)
    );
    containerRef.current.textContent = tab;

    const api = new alphaTab.AlphaTabApi(containerRef.current, {
      core: {
        fontDirectory: '/alphatab-fonts/', // Next sirve public/ desde la raiz
        tex: !source,
        useWorkers: false,
        enableLazyLoading: false,
        includeNoteBounds: true,
      },
      player: {
        enablePlayer: false,
        scrollMode: alphaTab.ScrollMode.Off,
        scrollSpeed: 350,
      },
      display: {
        layoutMode: layout === 'horizontal' ? alphaTab.LayoutMode.Horizontal : alphaTab.LayoutMode.Page,
        padding: compact ? [18, 24] : [56, 35],
        startBar: 1,
        staveProfile: alphaTab.StaveProfile.Tab,
        systemPaddingBottom: compact ? 14 : 40,
        systemPaddingTop: compact ? 14 : 40,
        // AlphaTab dibuja sobre fondo transparente con sus colores por
        // defecto (negro sobre hoja blanca). El wrapper `.alphatab-surface`
        // (línea ~2386, bg-white de Tailwind) es el fondo real detrás del
        // SVG, así que los colores por defecto ya son correctos aquí.
        // No tocar: ver "Colores de notación" en AlphaTabPlayer.NOTES.md.
      },
      notation: {
        elements: new Map([
          [alphaTab.NotationElement.EffectTempo, false],
          [alphaTab.NotationElement.GuitarTuning, false],
          [alphaTab.NotationElement.TrackNames, false],
        ]),
        rhythmHeight: compact ? 18 : 32,
        rhythmMode: alphaTab.TabRhythmMode.ShowWithBars,
      }
    });

    apiRef.current = api;
    const offScoreLoaded = api.scoreLoaded.on((score) => {
      const typedScore = score as AlphaTabScoreLike;
      // multiTrack calls api.renderTracks() below (to make AlphaTab actually
      // render the chosen track instead of always defaulting to tracks[0] —
      // see "Multipista" > scroll-follow fix in AlphaTabPlayer.NOTES.md),
      // which re-fires this same scoreLoaded event with the same score
      // object. isNewScore tells a genuinely new file apart from that
      // reentrant fire so the one-time-per-file setup below (bar widths,
      // track list, mute defaults, detected tempo) never runs twice.
      const isNewScore = scoreRef.current !== typedScore;
      scoreRef.current = typedScore;

      if (isNewScore) {
        if (layout === 'horizontal') {
          applyAnnotatedHorizontalBarWidths(typedScore);

          if (horizontalBarWidth) {
            for (const masterBar of typedScore.masterBars ?? []) {
              masterBar.displayWidth = Math.max(masterBar.displayWidth ?? 0, horizontalBarWidth);
            }

            for (const track of typedScore.tracks) {
              for (const staff of track.staves) {
                for (const bar of staff.bars) {
                  bar.displayWidth = Math.max(bar.displayWidth ?? 0, horizontalBarWidth);
                  if (bar.masterBar) {
                    bar.masterBar.displayWidth = Math.max(bar.masterBar.displayWidth ?? 0, horizontalBarWidth);
                  }
                }
              }
            }
          }

          if (effectiveHorizontalBarWidths?.length) {
            applyExplicitHorizontalBarWidths(typedScore, effectiveHorizontalBarWidths);
          }
        }

        if (multiTrack) {
          const trackInfos: TrackDisplayInfo[] = typedScore.tracks.map((track, index) => ({
            index,
            kind: classifyTrackKind(track),
            name: track.name || `Pista ${index + 1}`,
          }));
          const initialMutedTracks = new Set(
            trackInfos.filter((info) => info.kind === 'unsupported').map((info) => info.index)
          );
          setScoreTracks(trackInfos);
          setMutedTrackIndexes(initialMutedTracks);
          mutedTrackIndexesRef.current = initialMutedTracks;
          setSoloTrackIndex(null);
          soloTrackIndexRef.current = null;
          // New score: per-track/per-drum-element volume overrides and drum
          // mute/solo don't carry meaning across a different file, so they
          // reset to defaults here too, same as mute/solo above.
          setTrackVolumes(new Map());
          trackVolumesRef.current = new Map();
          setDrumElementMuted(new Set());
          drumElementMutedRef.current = new Set();
          setDrumElementSolo(null);
          drumElementSoloRef.current = null;
          setDrumElementVolumes(new Map());
          drumElementVolumesRef.current = new Map();

          // Real tempo (BPM) is only trusted for multiTrack — see the `bpm`
          // useMemo and AlphaTabPlayer.NOTES.md.
          if (typeof typedScore.tempo === 'number' && typedScore.tempo > 0) {
            setDetectedScoreTempo(typedScore.tempo);
          }
        } else {
          setScoreTracks([]);
          auxiliaryTrackScheduleRef.current = [];
        }
      }

      const desiredTrackIndex = multiTrack
        ? selectedTrackIndexOverrideRef.current ?? choosePrimaryTrackIndex(typedScore)
        : 0;
      // Skip while a percussion preview is active: previewPercussionTrack's
      // own api.renderTracks() call re-fires this same scoreLoaded event
      // (isNewScore is false by then, same score object), and
      // previewedTrackIndexRef is set synchronously before that call
      // specifically so this check can tell the two apart — without it,
      // applyPrimaryTrack would immediately re-render the primary track and
      // undo the drum notation that call was trying to show. See
      // "Previsualización de partitura de batería" in AlphaTabPlayer.NOTES.md.
      //
      // applyPrimaryTrack is declared further down in this component and
      // called here before its declaration (function hoisting — an
      // already-established, working pattern in this file, e.g. the
      // spacebar handler below calls startLocalPlayback the same way).
      // react-hooks/immutability started flagging that as an error only
      // once this file's total size crossed some internal complexity
      // threshold in the react-compiler ESLint plugin — confirmed by
      // bisection, see "Previsualización de partitura de batería" in
      // AlphaTabPlayer.NOTES.md for the full account.
      if (previewedTrackIndexRef.current === null) {
        // eslint-disable-next-line react-hooks/immutability
        applyPrimaryTrack(typedScore, desiredTrackIndex);
      }
    });
    if (source) {
      api.load(source);
    }
    return () => {
      offScoreLoaded();
      if (finishTimerRef.current !== null) {
        window.clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
      if (playTimerRef.current !== null) {
        window.clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
      }
      if (programmaticPageScrollTimerRef.current !== null) {
        window.clearTimeout(programmaticPageScrollTimerRef.current);
        programmaticPageScrollTimerRef.current = null;
      }
      if (programmaticScrollbarScrollTimerRef.current !== null) {
        window.clearTimeout(programmaticScrollbarScrollTimerRef.current);
        programmaticScrollbarScrollTimerRef.current = null;
      }
      if (programmaticTabScrollTimerRef.current !== null) {
        window.clearTimeout(programmaticTabScrollTimerRef.current);
        programmaticTabScrollTimerRef.current = null;
      }
      for (const source of activeSourcesRef.current) {
        try {
          source.stop();
        } catch {
          // The source may have already finished naturally.
        }
      }
      activeSourcesRef.current = [];
      for (const voice of activeVoicesRef.current) {
        voice.destroy();
      }
      activeVoicesRef.current = [];
      removeTabScrollListenerRef.current();
      tabScrollElementRef.current = null;
      if (apiRef.current) {
        apiRef.current.destroy();
      }
      clearGlobalPlaybackIfCurrent(effectPlayerId);
      if (selectedKeyboardPlayerId === effectPlayerId) {
        selectedKeyboardPlayerId = null;
      }
    };
  // AlphaTab must be recreated only when the tab content changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveHorizontalBarWidths, fallbackEvents, horizontalBarWidth, initialSpeed, source, tab]);

  useEffect(() => {
    const handleSpace = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }

      if (selectedKeyboardPlayerId !== playerIdRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (event.type === 'keydown' && !event.repeat) {
        keyboardActionRef.current();
      }
    };

    document.addEventListener('keydown', handleSpace, { capture: true });
    document.addEventListener('keyup', handleSpace, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleSpace, { capture: true });
      document.removeEventListener('keyup', handleSpace, { capture: true });
    };
  }, []);

  useEffect(() => {
    const handleManualScrollIntent = () => markExplicitManualPlaybackScroll();
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      stopFollowingPlaybackOnTouch(event.pointerType, event.target);
    };
    const handleKeyboardScrollIntent = (event: KeyboardEvent) => {
      if (
        event.code === 'ArrowDown' ||
        event.code === 'ArrowLeft' ||
        event.code === 'ArrowRight' ||
        event.code === 'ArrowUp' ||
        event.code === 'End' ||
        event.code === 'Home' ||
        event.code === 'PageDown' ||
        event.code === 'PageUp' ||
        event.code === 'Space'
      ) {
        markExplicitManualPlaybackScroll();
      }
    };
    const handleWindowScroll = () => {
      markManualPlaybackScroll();
    };

    window.addEventListener('wheel', handleManualScrollIntent, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    window.addEventListener('touchmove', handleManualScrollIntent, { passive: true });
    window.addEventListener('keydown', handleKeyboardScrollIntent, { capture: true });
    window.addEventListener('scroll', handleWindowScroll, { passive: true });

    return () => {
      window.removeEventListener('wheel', handleManualScrollIntent);
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('touchmove', handleManualScrollIntent);
      window.removeEventListener('keydown', handleKeyboardScrollIntent, { capture: true });
      window.removeEventListener('scroll', handleWindowScroll);
    };
  // These window listeners read mutable refs so they can stay stable for the player lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // stopLocalPlayback/startLocalPlayback are declared further down in this
    // component and called here before their declaration — function
    // hoisting, an already-established pattern in this file. Flagged by
    // react-hooks/immutability only once this file's total size crossed some
    // internal complexity threshold in the react-compiler ESLint plugin;
    // confirmed a false positive by bisection (see "Previsualización de
    // partitura de batería" in AlphaTabPlayer.NOTES.md).
    keyboardActionRef.current = () => {
      if (isPlayingRef.current) {
        // eslint-disable-next-line react-hooks/immutability
        stopLocalPlayback();
        return;
      }

      // eslint-disable-next-line react-hooks/immutability
      void startLocalPlayback();
    };
  });

  useEffect(() => {
    const surface = containerRef.current?.querySelector<HTMLElement>('.at-surface');
    if (!surface) {
      return;
    }

    if (layout !== 'horizontal') {
      surface.style.transform = '';
      surface.style.willChange = '';
      return;
    }

    const surfaceWidth = surface.getBoundingClientRect().width;
    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const centerOffset = centerHorizontalContent ? Math.max(0, (containerWidth - surfaceWidth) / 2) : 0;
    const extraVisualOffset = centerOffset - horizontalLeftCrop;
    surface.style.transform = `translateX(${linearPlaybackLeftGutter - tabScrollLeft + extraVisualOffset}px)`;
    surface.style.willChange = 'transform';
    setHorizontalExtraVisualOffset((currentOffset) =>
      Math.abs(currentOffset - extraVisualOffset) < 1 ? currentOffset : extraVisualOffset
    );
  }, [centerHorizontalContent, horizontalLeftCrop, layout, linearPlaybackLeftGutter, tabScrollLeft, tabScrollMetrics.scrollWidth]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || typeof ResizeObserver === 'undefined') {
      return;
    }

    const refresh = () => {
      bindTabScrollElement();
      updateTabScrollMetrics();
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(root);
    window.setTimeout(refresh, 0);
    window.setTimeout(refresh, 120);
    window.setTimeout(refresh, 420);

    return () => observer.disconnect();
  // The observer is tied to the AlphaTab DOM node, not to each render's function identities.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!horizontalBarFit || typeof ResizeObserver === 'undefined') {
      return;
    }

    const target = frameRef.current;
    if (!target) {
      return;
    }

    const updateFitWidth = () => {
      const nextWidth = Math.floor(containerRef.current?.clientWidth || target.clientWidth || 0);
      setFitContainerWidth((currentWidth) => (Math.abs(currentWidth - nextWidth) < 2 ? currentWidth : nextWidth));
    };

    const observer = new ResizeObserver(updateFitWidth);
    observer.observe(target);
    updateFitWidth();
    window.setTimeout(updateFitWidth, 0);

    return () => observer.disconnect();
  }, [horizontalBarFit]);

  function getAudioContext() {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }

  function getAudioOutput(context: AudioContext) {
    if (audioOutputRef.current) {
      return audioOutputRef.current;
    }

    const input = context.createGain();
    const master = context.createGain();
    // Soft-knee limiter, see GUITAR_OUTPUT_LIMITER_THRESHOLD/
    // getGuitarOutputLimiterCurve above — identity at every level this bus
    // reached before trackVolumeMultiplier could exceed 1.
    const limiter = context.createWaveShaper();

    input.gain.setValueAtTime(0.85, context.currentTime);
    master.gain.setValueAtTime(1.35, context.currentTime);
    limiter.curve = getGuitarOutputLimiterCurve();
    limiter.oversample = '2x';

    input.connect(master);
    master.connect(limiter);
    limiter.connect(context.destination);

    audioOutputRef.current = { input, master };
    return audioOutputRef.current;
  }

  async function loadGuitarSamples(context: AudioContext) {
    if (guitarSamplesRef.current) {
      return guitarSamplesRef.current;
    }

    if (!guitarSamplesLoadingRef.current) {
      guitarSamplesLoadingRef.current = fetch(`${GUITAR_SAMPLE_BASE_URL}manifest.json`)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Unable to load guitar sample manifest: ${response.status}`);
          }
          return response.json() as Promise<GuitarSampleManifest>;
        })
        .then(async (manifest) => {
          const samples = await Promise.all(
            manifest.samples.map(async (sample) => {
              const response = await fetch(`${GUITAR_SAMPLE_BASE_URL}${sample.file}`);
              if (!response.ok) {
                throw new Error(`Unable to load guitar sample ${sample.file}: ${response.status}`);
              }
              const arrayBuffer = await response.arrayBuffer();
              const buffer = await context.decodeAudioData(arrayBuffer);
              return { ...sample, buffer };
            })
          );
          guitarSamplesRef.current = samples;
          return samples;
        });
    }

    return guitarSamplesLoadingRef.current;
  }

  function chooseGuitarSample(midi: number) {
    const samples = guitarSamplesRef.current;
    if (!samples?.length) {
      return null;
    }

    return (
      samples.find((sample) => midi >= sample.keyRange.low && midi <= sample.keyRange.high) ??
      samples.toSorted((a, b) => Math.abs(a.rootKey - midi) - Math.abs(b.rootKey - midi))[0]
    );
  }

  function clearPlaybackTimers() {
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }

    if (playTimerRef.current !== null) {
      window.clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
  }

  function stopActiveSources() {
    for (const voice of activeVoicesRef.current) {
      voice.stop(audioContextRef.current ?? undefined);
      voice.destroy();
    }
    activeVoicesRef.current = [];

    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // The source may have already finished naturally.
      }
    }
    activeSourcesRef.current = [];
  }

  function stopLocalPlayback() {
    clearPlaybackTimers();
    stopActiveSources();
    isPlayingRef.current = false;
    setIsPlaying(false);
    clearGlobalPlaybackIfCurrent();
  }

  function placeCursorForEvent(index: number, shouldScroll = false) {
    const event = events[index];
    placeCursorForBeat(event?.beat, shouldScroll);
  }

  function getBeatBounds(index: number) {
    const beat = events[index]?.beat;
    const boundsLookup = apiRef.current?.boundsLookup;
    if (!beat || !boundsLookup) {
      return undefined;
    }

    return (
      boundsLookup.findBeat(beat as unknown as alphaTab.model.Beat) ??
      boundsLookup.findBeats(beat as unknown as alphaTab.model.Beat)?.[0]
    );
  }

  function getBeatBox(index: number) {
    const beatBounds = getBeatBounds(index);
    if (!beatBounds) {
      return undefined;
    }

    const padding = getTabContainerPadding();
    const barBounds = beatBounds.barBounds.masterBarBounds.realBounds;
    const cursorX = getCursorXFromBeatBounds(beatBounds);
    return {
      height: Math.max(40, barBounds.h),
      width: Math.max(10, beatBounds.realBounds.w || 14),
      x: Math.max(0, cursorX + padding.left - CURSOR_LINE_WIDTH / 2),
      y: Math.max(0, barBounds.y) + padding.top,
    };
  }

  function buildLoopHighlightBoxes(startIndex: number, endIndex: number) {
    const boxes: HighlightBox[] = [];
    const nextStart = Math.max(0, Math.min(startIndex, endIndex));
    const nextEnd = Math.min(events.length - 1, Math.max(startIndex, endIndex));

    for (let index = nextStart; index <= nextEnd; index++) {
      const box = getBeatBox(index);
      if (!box) continue;
      box.x = Math.max(0, box.x + LOOP_VISUAL_X_OFFSET);

      const previousBox = boxes[boxes.length - 1];
      const sameSystem =
        previousBox &&
        Math.abs(previousBox.y - box.y) < 4 &&
        Math.abs(previousBox.height - box.height) < 4;

      if (sameSystem) {
        const right = Math.max(previousBox.x + previousBox.width, box.x + box.width);
        previousBox.x = Math.min(previousBox.x, box.x);
        previousBox.width = right - previousBox.x;
        previousBox.height = Math.max(previousBox.height, box.height);
      } else {
        boxes.push(box);
      }
    }

    return boxes;
  }

  function buildLoopHandleBoxes(startIndex: number | null, endIndex: number | null) {
    if (startIndex === null || endIndex === null) {
      return [];
    }

    const nextStart = Math.max(0, Math.min(startIndex, endIndex));
    const nextEnd = Math.min(events.length - 1, Math.max(startIndex, endIndex));
    const startBox = getBeatBox(nextStart);
    const endBox = getBeatBox(nextEnd);
    if (!startBox || !endBox) {
      return [];
    }

    return [
      {
        side: 'start' as const,
        x: Math.max(0, startBox.x + LOOP_VISUAL_X_OFFSET - LOOP_HANDLE_OUTSIDE_OFFSET),
        y: startBox.y + startBox.height / 2,
      },
      {
        side: 'end' as const,
        x: Math.max(0, endBox.x + LOOP_VISUAL_X_OFFSET + endBox.width + LOOP_HANDLE_OUTSIDE_OFFSET),
        y: endBox.y + endBox.height / 2,
      },
    ];
  }

  function buildStringLabelGroups(sourceEvents: TabEvent[]) {
    const systemMap = new Map<number, HighlightBox>();

    for (const event of sourceEvents) {
      const beat = event.beat;
      const boundsLookup = apiRef.current?.boundsLookup;
      if (!beat || !boundsLookup) continue;

      const beatBounds =
        boundsLookup.findBeat(beat as unknown as alphaTab.model.Beat) ??
        boundsLookup.findBeats(beat as unknown as alphaTab.model.Beat)?.[0];
      if (!beatBounds) continue;

      const barBounds = beatBounds.barBounds.masterBarBounds.realBounds;
      const systemKey = Math.round(barBounds.y);
      if (!systemMap.has(systemKey)) {
        systemMap.set(systemKey, {
          height: Math.max(40, barBounds.h),
          width: Math.max(10, barBounds.w),
          x: Math.max(0, barBounds.x) + 10,
          y: Math.max(0, barBounds.y) + 24,
        });
      }
    }

    return Array.from(systemMap.values())
      .sort((a, b) => a.y - b.y)
      .slice(0, 1)
      .map((box) => {
      const lineGap = TAB_LINE_SPACING;
      const firstStringY = box.y + 2;
      return {
        labels: STRING_LABELS_TOP_TO_BOTTOM.map((note, stringIndex) => ({
          note,
          x: Math.max(8, box.x - 20),
          y: firstStringY + stringIndex * lineGap,
        })),
        systemY: box.y,
      };
    });
  }

  function scheduleStringLabelRefresh(sourceEvents: TabEvent[]) {
    for (const delay of [0, 120, 360]) {
      window.setTimeout(() => {
        const nextGroups = buildStringLabelGroups(sourceEvents);
        if (nextGroups.length > 0) {
          setStringLabelGroups(nextGroups);
        }
      }, delay);
    }
  }

  // Makes `trackIndex` both the "primary" track (the one that drives the
  // sequential setTimeout scheduler, the events list, the cursor and
  // boundsLookup-based scroll-follow/click-to-select/loop-selection — see
  // "Arquitectura general" in AlphaTabPlayer.NOTES.md) and, when multiTrack,
  // the track AlphaTab is actually rendering on screen via api.renderTracks().
  // Root cause this fixes: AlphaTabApi.load()/scoreLoaded always renders
  // tracks[0] by default, but the chosen "primary" track can be a different
  // index (choosePrimaryTrackIndex skips non-guitar tracks) — boundsLookup
  // only has bounds for beats that are actually rendered, so every bounds
  // lookup for the primary track's beats silently failed (cursor never
  // moved, scroll-follow never triggered, tap-to-select never matched).
  // See "Multipista" > scroll-follow fix in AlphaTabPlayer.NOTES.md.
  //
  // No-ops if `trackIndex` is already the rendered track (renderedTrackIndexRef),
  // which both (a) keeps this safe to call from every scoreLoaded fire,
  // including the reentrant one caused by this function's own
  // api.renderTracks() call, and (b) is what makes calling it from the track
  // selector UI (selectVisibleTrack) a no-op when clicking the already-visible
  // track.
  function applyPrimaryTrack(typedScore: AlphaTabScoreLike, trackIndex: number) {
    if (renderedTrackIndexRef.current === trackIndex) {
      return;
    }
    renderedTrackIndexRef.current = trackIndex;
    primaryTrackIndexRef.current = trackIndex;
    setPrimaryTrackIndex(trackIndex);
    primaryTrackKindRef.current = typedScore.tracks[trackIndex] ? classifyTrackKind(typedScore.tracks[trackIndex]) : 'guitar';

    if (multiTrack) {
      const trackInfos: TrackDisplayInfo[] = typedScore.tracks.map((track, index) => ({
        index,
        kind: classifyTrackKind(track),
        name: track.name || `Pista ${index + 1}`,
      }));
      auxiliaryTrackScheduleRef.current = buildAuxiliaryTrackSchedules(typedScore, trackInfos, trackIndex);
    }

    const scoreEvents = buildEventsFromScore(typedScore, trackIndex);
    if (scoreEvents.length === 0) {
      return;
    }

    setEvents(scoreEvents);
    beatToEventIndexRef.current = new Map(
      scoreEvents
        .map((event, index) => (event.beatId === undefined ? null : ([event.beatId, index] as const)))
        .filter((entry): entry is readonly [number, number] => entry !== null)
    );
    setStartEventIndex(0);
    setLoopEndIndex(null);
    setLoopStartIndex(null);
    setLoopHighlightBoxes([]);
    setLoopHandleBoxes([]);
    window.setTimeout(() => {
      placeCursorForBeat(scoreEvents[0]?.beat);
      bindTabScrollElement();
    }, 0);
    if (!compact) {
      scheduleStringLabelRefresh(scoreEvents);
    }

    // Only multiTrack ever renders anything other than the default
    // tracks[0], so this is a no-op call for every other page (trackIndex is
    // always 0 there, which AlphaTab already shows by default).
    if (multiTrack) {
      // AlphaTabScoreLike only declares the subset of Track's fields this
      // file actually reads (see its definition above); the real object
      // passed in via scoreLoaded is a full alphaTab.Track, so this cast is
      // safe — same pattern as the `score as AlphaTabScoreLike` casts already
      // used throughout this handler.
      apiRef.current?.renderTracks([typedScore.tracks[trackIndex] as unknown as alphaTab.model.Track]);
    }
  }

  // User-driven track switch from the dropdown (see selectVisibleTrack's
  // call site in the track menu JSX). Stops playback first because the
  // scheduler's already-queued setTimeout closures capture the *old* events
  // array (see playEvent) — letting it keep running against a swapped-out
  // events list could desync the cursor/audio from what's on screen.
  function selectVisibleTrack(trackIndex: number) {
    if (!multiTrack || !scoreRef.current) {
      return;
    }
    // Picking any guitar/bass track from the dropdown always means "leave
    // the drum preview" first, even if trackIndex is already the primary
    // track (that row's own button is `disabled` in that case — see the JSX
    // — so this mainly matters when switching to a DIFFERENT guitar/bass
    // track while a preview is active). See "Previsualización de partitura
    // de batería" in AlphaTabPlayer.NOTES.md.
    if (previewedTrackIndexRef.current !== null) {
      exitPercussionPreview();
    }
    if (trackIndex === primaryTrackIndexRef.current) {
      return;
    }
    // Defense in depth: the track menu only renders a clickable "view" button
    // for 'guitar'/'bass'-kind tracks (see canView in the JSX), but guard
    // here too — renderTracks() on a standalone percussion staff throws
    // inside AlphaTab, and 'unsupported' tracks have no note-extraction
    // pipeline at all.
    const targetKind = classifyTrackKind(scoreRef.current.tracks[trackIndex]);
    if (targetKind !== 'guitar' && targetKind !== 'bass') {
      return;
    }
    if (isPlayingRef.current) {
      stopLocalPlayback();
    }
    selectedTrackIndexOverrideRef.current = trackIndex;
    applyPrimaryTrack(scoreRef.current, trackIndex);
  }

  function getEventIndexFromPointer(event: PointerEvent<HTMLElement>) {
    if (!containerRef.current) return undefined;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollPosition = getTabScrollPosition();
    const padding = getTabContainerPadding();
    const x = event.clientX - rect.left + scrollPosition.left - padding.left - horizontalExtraVisualOffset;
    const y = event.clientY - rect.top + scrollPosition.top - padding.top;
    const candidates = events
      .map((_, eventIndex) => {
        const beatBounds = getBeatBounds(eventIndex);
        if (!beatBounds) {
          return undefined;
        }

        const barBounds = beatBounds.barBounds.masterBarBounds.realBounds;
        const verticalDistance =
          y < barBounds.y ? barBounds.y - y : y > barBounds.y + barBounds.h ? y - (barBounds.y + barBounds.h) : 0;

        if (verticalDistance > 28) {
          return undefined;
        }

        const centerX = getCursorXFromBeatBounds(beatBounds);
        return {
          eventIndex,
          score: Math.abs(x - centerX) + verticalDistance * 8,
        };
      })
      .filter((candidate): candidate is { eventIndex: number; score: number } => candidate !== undefined)
      .sort((a, b) => a.score - b.score);

    return candidates[0]?.eventIndex;
  }

  function applyLoopSelection(startIndex: number, endIndex: number) {
    const nextStart = Math.max(0, Math.min(startIndex, endIndex));
    const nextEnd = Math.min(events.length - 1, Math.max(startIndex, endIndex));
    setStartEventIndex(nextStart);
    setLoopStartIndex(nextStart);
    setLoopEndIndex(nextEnd);
    setLoopHighlightBoxes(buildLoopHighlightBoxes(nextStart, nextEnd));
    setLoopHandleBoxes(buildLoopHandleBoxes(nextStart, nextEnd));
    placeCursorForEvent(nextStart);
  }

  function getBarRangeForEventIndex(index: number) {
    const targetBeatBounds = getBeatBounds(index);
    const targetBarBounds = targetBeatBounds?.barBounds.masterBarBounds.realBounds;
    if (!targetBarBounds) {
      return { end: index, start: index };
    }

    const indexes = events
      .map((_, eventIndex) => {
        const beatBounds = getBeatBounds(eventIndex);
        const barBounds = beatBounds?.barBounds.masterBarBounds.realBounds;
        if (!barBounds) {
          return undefined;
        }

        const sameBar =
          Math.abs(barBounds.x - targetBarBounds.x) < 2 &&
          Math.abs(barBounds.y - targetBarBounds.y) < 2 &&
          Math.abs(barBounds.w - targetBarBounds.w) < 2;
        return sameBar ? eventIndex : undefined;
      })
      .filter((eventIndex): eventIndex is number => eventIndex !== undefined);

    if (indexes.length === 0) {
      return { end: index, start: index };
    }

    return { end: indexes[indexes.length - 1], start: indexes[0] };
  }

  function selectBarLoopFromPointer(event: PointerEvent<HTMLElement>) {
    const eventIndex = getEventIndexFromPointer(event);
    if (eventIndex === undefined) {
      return false;
    }

    const range = getBarRangeForEventIndex(eventIndex);
    applyLoopSelection(range.start, range.end);
    return true;
  }

  function selectStartFromPointer(event: PointerEvent<HTMLElement>) {
    if (isPlayingRef.current) {
      pointerStartIndexRef.current = null;
      pointerSuppressUpRef.current = false;
      return;
    }
    event.preventDefault();

    const eventIndex = getEventIndexFromPointer(event);
    if (eventIndex !== undefined) {
      setStartEventIndex(eventIndex);
      setLoopEndIndex(null);
      setLoopStartIndex(null);
      setLoopHighlightBoxes([]);
      setLoopHandleBoxes([]);
      placeCursorForEvent(eventIndex);
    }
  }

  function beginPointerSelection(event: PointerEvent<HTMLDivElement>) {
    stopFollowingPlaybackOnTouch(event.pointerType, event.target);
    beginTabScrollDrag(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (isPlayingRef.current) return;

    const eventIndex = getEventIndexFromPointer(event);
    const now = window.performance.now();
    const previousTap = pointerTapRef.current;
    if (
      eventIndex !== undefined &&
      previousTap &&
      previousTap.index === eventIndex &&
      now - previousTap.time < 380 &&
      Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) < 34
    ) {
      pointerTapRef.current = null;
      pointerStartIndexRef.current = null;
      pointerSuppressUpRef.current = true;
      selectBarLoopFromPointer(event);
      return;
    }

    pointerTapRef.current =
      eventIndex === undefined
        ? null
        : {
            index: eventIndex,
            time: now,
            x: event.clientX,
            y: event.clientY,
          };
    pointerStartIndexRef.current = getEventIndexFromPointer(event) ?? null;
  }

  function endPointerSelection(event: PointerEvent<HTMLDivElement>) {
    const wasScrollDrag = endTabScrollDrag(event);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }

    if (isPlayingRef.current) return;
    if (wasScrollDrag) {
      pointerSuppressUpRef.current = false;
      return;
    }
    event.preventDefault();

    if (pointerSuppressUpRef.current) {
      pointerSuppressUpRef.current = false;
      return;
    }

    const pointerStartIndex = pointerStartIndexRef.current;
    const pointerEndIndex = getEventIndexFromPointer(event);
    pointerStartIndexRef.current = null;

    if (pointerStartIndex === null || pointerEndIndex === undefined) {
      selectStartFromPointer(event);
      return;
    }

    const nextStart = Math.min(pointerStartIndex, pointerEndIndex);
    const nextEnd = Math.max(pointerStartIndex, pointerEndIndex);
    setStartEventIndex(nextStart);
    placeCursorForEvent(nextStart);

    if (nextStart === nextEnd) {
      setLoopEndIndex(null);
      setLoopStartIndex(null);
      setLoopHighlightBoxes([]);
      setLoopHandleBoxes([]);
      return;
    }

    setLoopStartIndex(nextStart);
    setLoopEndIndex(nextEnd);
    setLoopHighlightBoxes(buildLoopHighlightBoxes(nextStart, nextEnd));
    setLoopHandleBoxes(buildLoopHandleBoxes(nextStart, nextEnd));
  }

  function updatePointerSelection(event: PointerEvent<HTMLDivElement>) {
    if (updateTabScrollDrag(event)) return;
    if (isPlayingRef.current || pointerStartIndexRef.current === null) return;
    event.preventDefault();

    const pointerEndIndex = getEventIndexFromPointer(event);
    if (pointerEndIndex !== undefined) {
      setLoopHighlightBoxes(buildLoopHighlightBoxes(pointerStartIndexRef.current, pointerEndIndex));
    }
  }

  function beginLoopHandleDrag(side: 'end' | 'start', event: PointerEvent<HTMLButtonElement>) {
    if (isPlayingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    pointerDragHandleRef.current = side;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateLoopHandleDrag(event: PointerEvent<HTMLButtonElement>) {
    if (isPlayingRef.current || pointerDragHandleRef.current === null) return;
    event.preventDefault();
    event.stopPropagation();

    const eventIndex = getEventIndexFromPointer(event);
    if (eventIndex === undefined) {
      return;
    }

    const side = pointerDragHandleRef.current;
    const nextStart = side === 'start' ? eventIndex : loopStartIndex ?? startEventIndex;
    const nextEnd = side === 'end' ? eventIndex : loopEndIndex ?? startEventIndex;
    applyLoopSelection(nextStart, nextEnd);
  }

  function endLoopHandleDrag(event: PointerEvent<HTMLButtonElement>) {
    if (pointerDragHandleRef.current === null) return;
    event.preventDefault();
    event.stopPropagation();
    pointerDragHandleRef.current = null;
  }

  function cleanupGuitarSampleVoice(voice: GuitarSampleVoice) {
    voice.destroy();
    activeVoicesRef.current = activeVoicesRef.current.filter((activeVoice) => activeVoice.id !== voice.id);
    activeSourcesRef.current = activeSourcesRef.current.filter((source) => !voice.sources.includes(source));
  }

  function stopGuitarSampleVoice(voice: GuitarSampleVoice, context: AudioContext) {
    voice.stop(context);
    voice.cleanupTimer = window.setTimeout(() => cleanupGuitarSampleVoice(voice), 40);
  }

  function enforceGuitarSamplePolyphony(context: AudioContext) {
    while (activeVoicesRef.current.length >= MAX_GUITAR_VOICES) {
      const oldestVoice = activeVoicesRef.current.toSorted((a, b) => a.startedAt - b.startedAt)[0];
      if (!oldestVoice) {
        break;
      }
      stopGuitarSampleVoice(oldestVoice, context);
      activeVoicesRef.current = activeVoicesRef.current.filter((voice) => voice.id !== oldestVoice.id);
    }
  }

  function playPluckedNote(
    context: AudioContext,
    note: TabNote,
    startTime: number,
    duration: number,
    eventNoteCount: number,
    // Additional per-track multiplier, [0, 1], on top of the shared
    // volumeRef slider — only ever non-1 when multiTrack passes a real
    // per-track override from getTrackVolume(). Every non-multiTrack call
    // site omits this argument, so it defaults to 1 and this is a pure
    // no-op for the rest of the site. See "Volumen por pista..." in
    // AlphaTabPlayer.NOTES.md.
    trackVolumeMultiplier: number = 1
  ) {
    const midi = noteMidi(note);
    const isPalmMuted = note.palmMuted ?? false;
    const stringIndex = stringArrayIndex(note);
    const sample = chooseGuitarSample(midi);
    if (!sample) {
      return;
    }

    const cutoff = GUITAR_SAMPLE_CUTOFFS[stringIndex] * (isPalmMuted ? 0.5 : 1);
    const playbackRate = 2 ** ((midi - sample.rootKey - sample.pitchCorrection / 100) / 12);
    const release = isPalmMuted ? GUITAR_SAMPLE_PALM_MUTE_RELEASE : GUITAR_SAMPLE_RELEASE;
    const sustainDuration = isPalmMuted ? Math.min(0.16, duration) : clamp(duration, 0.18, 2.4);
    const chordCompensation = 1 / Math.sqrt(Math.max(1, eventNoteCount));
    const stringBalance = eventNoteCount >= DENSE_CHORD_NOTE_COUNT ? GUITAR_STRING_GAINS[note.stringNumber] ?? 1 : 1;
    const articulationLevel = isPalmMuted ? 0.34 : 0.58;
    const currentVolume = volumeRef.current * trackVolumeMultiplier;
    const targetLevel = currentVolume * articulationLevel * stringBalance * chordCompensation;
    const level =
      currentVolume <= 0
        ? 0
        : clamp(targetLevel, MIN_AUDIBLE_NOTE_LEVEL * currentVolume, 0.62 * currentVolume);

    enforceGuitarSamplePolyphony(context);

    const source = context.createBufferSource();
    const toneFilter = context.createBiquadFilter();
    const voiceGain = context.createGain();

    source.buffer = sample.buffer;
    source.playbackRate.setValueAtTime(playbackRate, startTime);
    if (sample.loopEnd > sample.loopStart + 8) {
      source.loop = !isPalmMuted;
      source.loopStart = sample.loopStart / sample.sampleRate;
      source.loopEnd = sample.loopEnd / sample.sampleRate;
    }

    toneFilter.type = 'lowpass';
    toneFilter.frequency.setValueAtTime(cutoff, startTime);
    toneFilter.Q.setValueAtTime(0.55, startTime);
    voiceGain.gain.setValueAtTime(0.0001, startTime);
    voiceGain.gain.linearRampToValueAtTime(Math.max(0.0001, level), startTime + 0.004);
    voiceGain.gain.setValueAtTime(Math.max(0.0001, level * (isPalmMuted ? 0.22 : 0.82)), startTime + sustainDuration);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + sustainDuration + release);

    source.connect(toneFilter);
    toneFilter.connect(voiceGain);
    voiceGain.connect(getAudioOutput(context).input);

    source.start(startTime);
    source.stop(startTime + sustainDuration + release + 0.03);
    const voice = new GuitarSampleVoice(
      voiceIdRef.current++,
      midi,
      [toneFilter, voiceGain],
      [source],
      startTime
    );

    activeVoicesRef.current.push(voice);
    activeSourcesRef.current.push(source);
    voice.cleanupTimer = window.setTimeout(
      () => cleanupGuitarSampleVoice(voice),
      Math.max(0, (startTime + sustainDuration + release + 0.05 - context.currentTime) * 1000)
    );
  }

  function playMetronomeClick(context: AudioContext, startTime: number) {
    if (!metronomeRef.current) return;

    const currentVolume = volumeRef.current;

    const noiseSource = context.createBufferSource();
    const bodySource = context.createBufferSource();
    const noiseGain = context.createGain();
    const bodyGain = context.createGain();
    const noiseFilter = context.createBiquadFilter();
    const bodyFilter = context.createBiquadFilter();
    const highPass = context.createBiquadFilter();
    const output = context.createGain();

    const noiseLength = Math.max(1, Math.floor(context.sampleRate * 0.045));
    const bodyLength = Math.max(1, Math.floor(context.sampleRate * 0.055));
    const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
    const bodyBuffer = context.createBuffer(1, bodyLength, context.sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    const body = bodyBuffer.getChannelData(0);
    // This whole function only ever runs from an event handler (Play button/
    // spacebar), never during React's render phase, so Math.random() here is
    // safe despite react-hooks/purity's "impure function during render"
    // wording — that rule started flagging it only once this file's total
    // size crossed some internal complexity threshold in the react-compiler
    // ESLint plugin; confirmed a false positive by bisection (see
    // "Previsualización de partitura de batería" in AlphaTabPlayer.NOTES.md).
    for (let index = 0; index < noiseLength; index++) {
      const progress = index / noiseLength;
      // eslint-disable-next-line react-hooks/purity
      noise[index] = (Math.random() * 2 - 1) * (1 - progress) ** 2.4;
    }
    for (let index = 0; index < bodyLength; index++) {
      const progress = index / bodyLength;
      // eslint-disable-next-line react-hooks/purity
      body[index] = (Math.random() * 2 - 1) * (1 - progress) ** 2.8;
    }

    noiseSource.buffer = noiseBuffer;
    bodySource.buffer = bodyBuffer;
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1850, startTime);
    noiseFilter.Q.setValueAtTime(0.75, startTime);
    noiseGain.gain.setValueAtTime(0.0001, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(currentVolume * 0.18, startTime + 0.002);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.045);

    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(480, startTime);
    bodyFilter.Q.setValueAtTime(0.6, startTime);
    bodyGain.gain.setValueAtTime(0.0001, startTime);
    bodyGain.gain.exponentialRampToValueAtTime(currentVolume * 0.075, startTime + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.055);

    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(420, startTime);
    highPass.Q.setValueAtTime(0.7, startTime);
    output.gain.setValueAtTime(1.05, startTime);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    bodySource.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    noiseGain.connect(highPass);
    bodyGain.connect(output);
    highPass.connect(output);
    output.connect(getAudioOutput(context).input);

    noiseSource.start(startTime);
    bodySource.start(startTime);
    noiseSource.stop(startTime + noiseLength / context.sampleRate);
    bodySource.stop(startTime + bodyLength / context.sampleRate);
    activeSourcesRef.current.push(noiseSource, bodySource);
  }

  function scheduleMetronomeClicks(
    context: AudioContext,
    eventStartQuarter: number,
    startTime: number,
    eventDuration: number,
    eventQuarterNotes: number
  ) {
    if (!metronomeRef.current) return;

    const eventEndQuarter = eventStartQuarter + eventQuarterNotes;
    const subdivisionQuarterNotes = METRONOME_SUBDIVISION_QUARTERS[metronomeSubdivisionRef.current];
    const secondsPerQuarter = (60 / bpm) / speedRef.current;
    const firstTickIndex = Math.ceil((eventStartQuarter - TIMING_EPSILON) / subdivisionQuarterNotes);
    const lastTickIndex = Math.floor((eventEndQuarter - TIMING_EPSILON) / subdivisionQuarterNotes);

    for (let tickIndex = firstTickIndex; tickIndex <= lastTickIndex; tickIndex++) {
      const tickQuarter = tickIndex * subdivisionQuarterNotes;
      const offsetSeconds = (tickQuarter - eventStartQuarter) * secondsPerQuarter;
      if (offsetSeconds >= -TIMING_EPSILON && offsetSeconds < eventDuration + TIMING_EPSILON) {
        playMetronomeClick(context, startTime + Math.max(0, offsetSeconds));
      }
    }
  }

  // Multipista mute/solo (see AlphaTabPlayerProps.multiTrack). Solo is
  // exclusive: while any track is soloed, every other track (primary
  // included) is silent regardless of its own mute flag.
  function isTrackAudible(trackIndex: number) {
    if (soloTrackIndexRef.current !== null) {
      return trackIndex === soloTrackIndexRef.current;
    }
    return !mutedTrackIndexesRef.current.has(trackIndex);
  }

  // Per-track volume multiplier read by every place that actually plays a
  // note for a given track (primary or auxiliary) — see trackVolumesRef's
  // comment for what it does and doesn't affect.
  function getTrackVolume(trackIndex: number) {
    return trackVolumesRef.current.get(trackIndex) ?? 1;
  }

  // Same idea as isTrackAudible/getTrackVolume above, but per drum hit type
  // (bombo/caja/platillo) instead of per track — see drumElementMutedRef's
  // comment. Only ever consulted from the 'percussion' branch of
  // scheduleAuxiliaryTracks below.
  function isDrumElementAudible(type: DrumClickType) {
    if (drumElementSoloRef.current !== null) {
      return type === drumElementSoloRef.current;
    }
    return !drumElementMutedRef.current.has(type);
  }

  function getDrumElementVolume(type: DrumClickType) {
    return drumElementVolumesRef.current.get(type) ?? 1;
  }

  // Reuses playPluckedNote (guitar tracks, same engine/context as the
  // primary track) and guitarAudioEngine.ts's playMetronomeClick/playBassNote
  // (drum and bass tracks). Those two live on their own separate AudioContext
  // (app/lib/guitarAudioEngine.ts has its own module-level singleton, never
  // shared with this component's audioContextRef), so their schedule times
  // must be derived from getAudioCurrentTime() (that engine's own clock)
  // sampled at the same instant as `startTime`, not from `context.currentTime`
  // — see "Multipista" in AlphaTabPlayer.NOTES.md for why.
  function scheduleAuxiliaryTracks(context: AudioContext, eventStartQuarter: number, startTime: number, eventQuarterNotes: number) {
    const schedules = auxiliaryTrackScheduleRef.current;
    if (!schedules.length) return;

    const eventEndQuarter = eventStartQuarter + eventQuarterNotes;
    const secondsPerQuarter = (60 / bpm) / speedRef.current;
    // Shared by drums AND bass — both play through guitarAudioEngine.ts's own
    // AudioContext, sampled once here at the same instant as `startTime`.
    const auxEngineNow = getAudioCurrentTime();

    for (const track of schedules) {
      if (!isTrackAudible(track.index)) continue;

      for (const auxEvent of track.events) {
        if (auxEvent.quarterStart < eventStartQuarter - TIMING_EPSILON) continue;
        if (auxEvent.quarterStart >= eventEndQuarter - TIMING_EPSILON) break;

        const offsetSeconds = Math.max(0, (auxEvent.quarterStart - eventStartQuarter) * secondsPerQuarter);
        const auxDurationSeconds = secondsPerQuarter * auxEvent.quarterNotes;

        if (track.kind === 'guitar' && auxEvent.guitarNotes) {
          const notes = auxEvent.guitarNotes;
          const trackVolume = getTrackVolume(track.index);
          for (const note of notes) {
            const chordDelay = notes.length >= DENSE_CHORD_NOTE_COUNT ? STRUM_OFFSETS[stringArrayIndex(note)] ?? 0 : 0;
            playPluckedNote(context, note, startTime + offsetSeconds + chordDelay, auxDurationSeconds, notes.length, trackVolume);
          }
        } else if (track.kind === 'bass' && auxEvent.bassNotes) {
          const bassStartTime = auxEngineNow + 0.045 + offsetSeconds;
          const trackVolume = getTrackVolume(track.index);
          for (const note of auxEvent.bassNotes) {
            playBassNote(
              bassStartTime,
              bassNoteMidi(note),
              auxDurationSeconds,
              volumeRef.current * BASS_TRACK_VOLUME_MULTIPLIER * trackVolume,
              note.palmMuted
            );
          }
        } else if (track.kind === 'percussion' && auxEvent.percussionHits) {
          const drumStartTime = auxEngineNow + 0.045 + offsetSeconds;
          const trackVolume = getTrackVolume(track.index);
          for (const clickType of auxEvent.percussionHits) {
            if (!isDrumElementAudible(clickType)) continue;
            playDrumClick(
              drumStartTime,
              volumeRef.current * DRUM_TRACK_VOLUME_BOOST * trackVolume * getDrumElementVolume(clickType),
              clickType
            );
          }
        }
      }
    }
  }

  async function startLocalPlayback() {
    if (events.length === 0) {
      return;
    }

    selectKeyboardPlayer();
    if (currentPlayingPlayerId !== null && currentPlayingPlayerId !== playerIdRef.current) {
      stopCurrentPlayingPlayer?.();
    }

    stopLocalPlayback();
    const context = getAudioContext();
    await context.resume();
    await loadGuitarSamples(context);
    if (multiTrack) {
      // Warms up guitarAudioEngine.ts's own AudioContext (used for drum-track
      // hits) inside this same user-gesture call stack, same reason
      // context.resume() above is awaited before playback starts.
      touchAudioContext();
    }

    const firstIndex = Math.min(startEventIndex, events.length - 1);
    isPlayingRef.current = true;
    // Intentional module-singleton reassignment — see "Global singletons" in
    // AlphaTabPlayer.NOTES.md. Same false positive as selectKeyboardPlayer/
    // clearGlobalPlaybackIfCurrent above (react-hooks/globals only started
    // flagging this once this file's total size crossed some internal
    // complexity threshold in the react-compiler ESLint plugin — confirmed
    // by bisection, see "Previsualización de partitura de batería" in
    // AlphaTabPlayer.NOTES.md).
    // eslint-disable-next-line react-hooks/globals
    currentPlayingPlayerId = playerIdRef.current;
    // eslint-disable-next-line react-hooks/globals
    stopCurrentPlayingPlayer = stopLocalPlayback;
    playbackScrollUserOverrideRef.current = false;
    playbackScrollPendingRef.current = true;
    setIsPlaying(true);
    playEvent(firstIndex);
  }

  function playEvent(index: number) {
    if (!isPlayingRef.current) return;

    if (index >= events.length) {
      stopLocalPlayback();
      return;
    }

    const context = getAudioContext();
    const event = events[index];
    const startTime = context.currentTime + 0.045;
    const eventDuration = eventDurationSeconds(event, speedRef.current, bpm);
    const eventStartQuarter = events
      .slice(0, index)
      .reduce((total, previousEvent) => total + previousEvent.quarterNotes, 0);

    placeCursorForEvent(index, playbackScrollPendingRef.current);
    playbackScrollPendingRef.current = false;

    // Percussion notation preview (see "Previsualización de partitura de
    // batería" in AlphaTabPlayer.NOTES.md). While a drum track is being
    // previewed, AlphaTab is rendering that track instead of the primary
    // one, so the placeCursorForEvent call just above — which looks up the
    // PRIMARY track's beat in boundsLookup — silently finds nothing and is a
    // no-op. This repositions the cursor against whichever drum beat falls
    // inside this tick's time window instead, reusing placeCursorForBeat
    // exactly as-is (it only needs a real beat object + boundsLookup, both
    // valid here — no change to that function was needed).
    if (multiTrack && previewedTrackIndexRef.current !== null) {
      const previewMatch = percussionPreviewEventsRef.current.find(
        (candidate) =>
          candidate.quarterStart >= eventStartQuarter - TIMING_EPSILON &&
          candidate.quarterStart < eventStartQuarter + event.quarterNotes - TIMING_EPSILON
      );
      if (previewMatch) {
        placeCursorForBeat(previewMatch.beat, false);
      }
    }

    scheduleMetronomeClicks(context, eventStartQuarter, startTime, eventDuration, event.quarterNotes);

    const primaryTrackAudible = !multiTrack || isTrackAudible(primaryTrackIndexRef.current);
    const audibleNotes = primaryTrackAudible ? event.notes : [];

    // Primary track's own notes: 'bass' (only reachable when multiTrack picks
    // a bass track as primary via selectVisibleTrack) plays through
    // guitarAudioEngine.ts's playBassNote instead of the sample engine — same
    // dispatch playEvent already does for auxiliary tracks in
    // scheduleAuxiliaryTracks below, and same clock-sampling pattern (that
    // engine's own getAudioCurrentTime(), not this context's currentTime; no
    // chordDelay/STRUM_OFFSETS, bass doesn't need guitar-strum compensation).
    // Gated on `multiTrack` so non-multiTrack pages never take this branch
    // regardless of primaryTrackKindRef's value.
    if (multiTrack && primaryTrackKindRef.current === 'bass') {
      const bassEngineNow = getAudioCurrentTime();
      const trackVolume = getTrackVolume(primaryTrackIndexRef.current);
      for (const note of audibleNotes) {
        playBassNote(
          bassEngineNow + 0.045,
          bassNoteMidi(note),
          eventDuration,
          volumeRef.current * BASS_TRACK_VOLUME_MULTIPLIER * trackVolume,
          note.palmMuted
        );
      }
    } else {
      const trackVolume = multiTrack ? getTrackVolume(primaryTrackIndexRef.current) : 1;
      for (const note of audibleNotes) {
        const chordDelay = audibleNotes.length >= DENSE_CHORD_NOTE_COUNT ? STRUM_OFFSETS[stringArrayIndex(note)] ?? 0 : 0;
        playPluckedNote(context, note, startTime + chordDelay, eventDuration, audibleNotes.length, trackVolume);
      }
    }

    if (multiTrack) {
      scheduleAuxiliaryTracks(context, eventStartQuarter, startTime, event.quarterNotes);
    }

    const nextIndex =
      loopStartIndex !== null && loopEndIndex !== null && index >= loopEndIndex
        ? loopStartIndex
        : index + 1;

    playTimerRef.current = window.setTimeout(() => {
      playEvent(nextIndex);
    }, Math.max(10, eventDuration * 1000));
  }

  function playPause() {
    selectKeyboardPlayer();
    if (isPlayingRef.current) {
      stopLocalPlayback();
      return;
    }

    void startLocalPlayback();
  }

  function stop() {
    selectKeyboardPlayer();
    stopLocalPlayback();
  }

  function toggleMetronomeMenu() {
    setMetronomeMenuOpen((isOpen) => !isOpen);
  }

  function disableMetronome() {
    metronomeRef.current = false;
    setMetronome(false);
    setMetronomeMenuOpen(false);
  }

  function selectMetronomeSubdivision(subdivision: MetronomeSubdivision) {
    metronomeSubdivisionRef.current = subdivision;
    metronomeRef.current = true;
    setMetronomeSubdivision(subdivision);
    setMetronome(true);
    setMetronomeMenuOpen(false);
  }

  // Mutually exclusive with the "Batería" dropdown (toggleDrumMenu below):
  // both are ~256px wide and, with "Pistas" now the toolbar's leftmost
  // button (see "Botón Pistas a la izquierda de Play" in
  // AlphaTabPlayer.NOTES.md), there isn't enough horizontal gap between the
  // two trigger buttons for both panels to be open at once without
  // overlapping, regardless of which side either one opens toward or how
  // wide the viewport is (verified at 480-1280px) — opening one now closes
  // the other instead of trying to out-position around it.
  function toggleTrackMenu() {
    setTrackMenuOpen((isOpen) => {
      const next = !isOpen;
      if (next) setDrumMenuOpen(false);
      return next;
    });
  }

  function toggleTrackMute(trackIndex: number) {
    setMutedTrackIndexes((current) => {
      const next = new Set(current);
      if (next.has(trackIndex)) {
        next.delete(trackIndex);
      } else {
        next.add(trackIndex);
      }
      mutedTrackIndexesRef.current = next;
      return next;
    });
  }

  function toggleTrackSolo(trackIndex: number) {
    setSoloTrackIndex((current) => {
      const next = current === trackIndex ? null : trackIndex;
      soloTrackIndexRef.current = next;
      return next;
    });
  }

  // Per-track volume slider in the "Pistas" dropdown — see trackVolumesRef's
  // comment. Clamped to [0, 2]: the stored value is still a plain multiplier
  // on top of already-tuned levels (1 = unchanged from before this slider
  // existed), but the slider's own range was doubled on request so its
  // midpoint (1, "50" displayed) is today's old max and its new max (2,
  // "100" displayed) reaches double that. GUITAR_OUTPUT_LIMITER_THRESHOLD/
  // getGuitarOutputLimiterCurve above is what keeps that doubled range from
  // clipping the guitar's shared output bus — see AlphaTabPlayer.NOTES.md
  // "Volumen por pista... — rango x2" for the measured numbers.
  function updateTrackVolume(trackIndex: number, value: number) {
    const clamped = clamp(value, 0, 2);
    setTrackVolumes((current) => {
      const next = new Map(current);
      next.set(trackIndex, clamped);
      trackVolumesRef.current = next;
      return next;
    });
  }

  // See toggleTrackMenu's comment above — mutually exclusive with it.
  function toggleDrumMenu() {
    setDrumMenuOpen((isOpen) => {
      const next = !isOpen;
      if (next) setTrackMenuOpen(false);
      return next;
    });
  }

  function toggleDrumElementMute(type: DrumClickType) {
    setDrumElementMuted((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      drumElementMutedRef.current = next;
      return next;
    });
  }

  function toggleDrumElementSolo(type: DrumClickType) {
    setDrumElementSolo((current) => {
      const next = current === type ? null : type;
      drumElementSoloRef.current = next;
      return next;
    });
  }

  // Same clamp/range rationale as updateTrackVolume above.
  function updateDrumElementVolume(type: DrumClickType, value: number) {
    const clamped = clamp(value, 0, 2);
    setDrumElementVolumes((current) => {
      const next = new Map(current);
      next.set(type, clamped);
      drumElementVolumesRef.current = next;
      return next;
    });
  }

  function updateVolume(value: number) {
    volumeRef.current = value;
    setVolume(value);
  }

  function updateSpeed(value: number) {
    speedRef.current = value;
    setSpeed(value);
  }

  // Forces every staff in the score to notation-without-tab (Score, i.e.
  // "Only standard music notation") — the only combination this AlphaTab
  // version (1.8.2) can render a standalone percussion staff with, see
  // "Investigación de partitura de batería" > ACTUALIZACIÓN in
  // AlphaTabPlayer.NOTES.md. It's global (every staff, not just the drum
  // one) because AlphaTab silently drops the drum staff from the layout
  // otherwise — verified empirically, not a guess. Captures the real
  // per-staff flags and the real staveProfile before mutating them so
  // restorePercussionPreviewStaveSettings can put back exactly what was
  // there, not an assumed default.
  function applyPercussionPreviewStaveSettings(score: AlphaTabScoreLike) {
    const api = apiRef.current;
    if (!api) {
      return;
    }

    const captured = new Map<string, { showStandardNotation: boolean; showTablature: boolean }>();
    score.tracks.forEach((track, trackIndex) => {
      track.staves.forEach((staff, staffIndex) => {
        captured.set(`${trackIndex}-${staffIndex}`, {
          showStandardNotation: staff.showStandardNotation ?? true,
          showTablature: staff.showTablature ?? true,
        });
        staff.showTablature = false;
        staff.showStandardNotation = true;
      });
    });
    originalStaveVisibilityRef.current = captured;

    originalStaveProfileRef.current = api.settings.display.staveProfile;
    api.settings.display.staveProfile = alphaTab.StaveProfile.Score;
    api.updateSettings();
  }

  // Inverse of applyPercussionPreviewStaveSettings above.
  function restorePercussionPreviewStaveSettings(score: AlphaTabScoreLike) {
    const api = apiRef.current;
    if (!api) {
      return;
    }

    originalStaveVisibilityRef.current.forEach((flags, key) => {
      const [trackIndexText, staffIndexText] = key.split('-');
      const staff = score.tracks[Number(trackIndexText)]?.staves[Number(staffIndexText)];
      if (staff) {
        staff.showStandardNotation = flags.showStandardNotation;
        staff.showTablature = flags.showTablature;
      }
    });
    originalStaveVisibilityRef.current = new Map();

    if (originalStaveProfileRef.current !== null) {
      api.settings.display.staveProfile = originalStaveProfileRef.current;
    }
    originalStaveProfileRef.current = null;
    api.updateSettings();
  }

  // Enters the drum notation preview: a temporary, read-only view that swaps
  // the ENTIRE render to notation-without-tab and shows ONLY the percussion
  // track (this AlphaTab version can't render a percussion staff alongside
  // any other track — see applyPercussionPreviewStaveSettings above). The
  // primary track keeps playing/scheduling audio completely independently
  // the whole time (scheduleAuxiliaryTracks never depended on what's
  // rendered on screen) — only the notation changes, and playEvent's own
  // preview hook repositions the cursor against the drum track's beats
  // instead of the primary track's while this is active. See
  // "Previsualización de partitura de batería" in AlphaTabPlayer.NOTES.md.
  function previewPercussionTrack(trackIndex: number) {
    const score = scoreRef.current;
    const api = apiRef.current;
    if (!multiTrack || !score || !api) {
      return;
    }
    const track = score.tracks[trackIndex];
    if (!track || classifyTrackKind(track) !== 'percussion' || previewedTrackIndexRef.current === trackIndex) {
      return;
    }

    applyPercussionPreviewStaveSettings(score);
    // Set BEFORE calling renderTracks() below: that call re-fires
    // scoreLoaded synchronously-or-not, and this ref is exactly what that
    // handler checks to skip applyPrimaryTrack (see the scoreLoaded handler
    // above) — setting it any later would race that reentrant fire.
    previewedTrackIndexRef.current = trackIndex;
    setPreviewedTrackIndex(trackIndex);
    percussionPreviewEventsRef.current = buildPercussionEventsFromScore(score, trackIndex);
    // loopHighlightBoxes/loopHandleBoxes/stringLabelGroups are deliberately
    // NOT cleared here — their pixel bounds were computed against the
    // primary track's own layout, which is deterministic and doesn't change
    // just because a different track is rendered in between, so they're
    // still correct once exitPercussionPreview brings the primary track
    // back. Instead the JSX gates rendering these three on
    // `previewedTrackIndex === null` (see Fase 5 in
    // AlphaTabPlayer.NOTES.md) — hidden while previewing, reappear
    // untouched afterward.

    api.renderTracks([track as unknown as alphaTab.model.Track]);

    window.setTimeout(() => {
      placeCursorForBeat(percussionPreviewEventsRef.current[0]?.beat);
      bindTabScrollElement();
    }, 0);
  }

  // Restores the normal primary-track view. Calls api.renderTracks()
  // directly instead of going through applyPrimaryTrack: applyPrimaryTrack's
  // reentry guard (renderedTrackIndexRef) still points at the primary track
  // index the whole time (previewPercussionTrack above never touches it), so
  // routing through applyPrimaryTrack here would see "already the rendered
  // track" and no-op, leaving drum notation on screen.
  function exitPercussionPreview() {
    const score = scoreRef.current;
    const api = apiRef.current;
    if (previewedTrackIndexRef.current === null || !score || !api) {
      return;
    }

    restorePercussionPreviewStaveSettings(score);
    previewedTrackIndexRef.current = null;
    setPreviewedTrackIndex(null);
    percussionPreviewEventsRef.current = [];

    const primaryTrack = score.tracks[primaryTrackIndexRef.current];
    if (primaryTrack) {
      api.renderTracks([primaryTrack as unknown as alphaTab.model.Track]);
    }

    window.setTimeout(() => {
      placeCursorForEvent(Math.min(startEventIndex, Math.max(0, events.length - 1)));
      bindTabScrollElement();
      if (!compact) {
        scheduleStringLabelRefresh(events);
      }
    }, 0);
  }

  return (
    <div ref={frameRef} className={`max-w-full overflow-visible border border-zinc-700 bg-zinc-900 shadow-2xl ${compact ? 'p-2' : 'rounded-2xl p-4'}`}>
      <div className={`${compact ? 'flex justify-center px-1 pb-2' : 'sticky top-3 z-[100] flex justify-center px-1 pb-4'}`}>
        <div className={`flex flex-wrap items-center justify-center border border-zinc-700 bg-zinc-950/95 shadow-xl backdrop-blur ${compact ? 'gap-2 px-2 py-2' : 'gap-4 px-4 py-3'}`}>
          <div className="flex items-center justify-center gap-2">
            {multiTrack && scoreTracks.length > 1 && (
              <div className="relative flex items-center gap-2">
                <IconButton label="Pistas" active={trackMenuOpen || soloTrackIndex !== null} onClick={toggleTrackMenu}>
                  <TracksIcon />
                </IconButton>
                {trackMenuOpen && (
                  // Colors here are inline `style` (not Tailwind color classNames) on purpose,
                  // matching IconButton above: this project's compiled CSS never emits
                  // Tailwind's named color-scale utilities (bg-zinc-900, text-zinc-200, etc. —
                  // same root cause as the documented bg-white gotcha), which was previously
                  // masked because every other themed control in this file already used inline
                  // styles. Layout/spacing classNames (flex, gap-1, absolute, z-[130]...) are
                  // unaffected and kept as Tailwind classes. See "Multipista" in
                  // AlphaTabPlayer.NOTES.md.
                  //
                  // `right`/`width` moved into inline `style` (not `right-0`/`w-64`
                  // classNames, which this dropdown used to have): confirmed via
                  // computed style + document.styleSheets that this project's
                  // compiled CSS never emitted `.right-0`/`.left-0`/`.w-64` either
                  // (same "spacing-scale Tailwind utility doesn't compile" gotcha
                  // already documented for `h-5`, just not noticed on THIS
                  // dropdown before) — the classes were silently a no-op and the
                  // browser fell back to `left: 0` "static position" by chance,
                  // which is why moving this button to be leftmost in the toolbar
                  // made it newly overlap the "Batería" dropdown (both were
                  // effectively opening rightward). An inline `right: 0` briefly
                  // made it open LEFTWARD instead — but with "Pistas" now the
                  // toolbar's leftmost button, that pushed the menu off the left
                  // edge of the player/viewport (reported by the user with a
                  // screenshot on a narrower window, spilling over the sidebar).
                  // Switched to inline `left: 0` so it opens RIGHTWARD instead,
                  // like every other dropdown in this toolbar — verified this
                  // still clears "Batería" (there's a real horizontal gap: Play +
                  // Metronome sit between the two buttons). See "Botón Pistas a
                  // la izquierda de Play" in AlphaTabPlayer.NOTES.md for the
                  // measured numbers. Deliberately NOT touching the "Batería"
                  // dropdown below, which keeps its own (equally non-functional)
                  // `right-0` className unchanged, per instruction.
                  <div
                    className="absolute top-[calc(100%+0.5rem)] z-[130] flex flex-col items-stretch gap-1 p-2 shadow-2xl"
                    style={{ background: '#09090b', border: '1px solid #52525b', left: 0, width: 256 }}
                    role="menu"
                    aria-label="Selector de pistas"
                  >
                    {scoreTracks.map((track) => {
                      const isMuted = mutedTrackIndexes.has(track.index);
                      const isSolo = soloTrackIndex === track.index;
                      const isVisible = track.index === primaryTrackIndex && previewedTrackIndex === null;
                      const isPreviewed = track.index === previewedTrackIndex;
                      // 'guitar' and 'bass' tracks can become the rendered/primary track —
                      // both have a standard notation+tab staff AlphaTab can render solo and
                      // a note-extraction pipeline (buildEventsFromScore) that understands
                      // their string/fret model. 'percussion' can't become the PRIMARY track
                      // (AlphaTab's renderTracks() throws internally on a standalone
                      // percussion staff rendered next to nothing else — StaffSystem.addBars
                      // reads undefined.staves, verified live), but it CAN be shown read-only
                      // via previewPercussionTrack, which works around that by also forcing
                      // every staff to notation-without-tab first — see "Previsualización de
                      // partitura de batería" in AlphaTabPlayer.NOTES.md. 'unsupported' has no
                      // note-extraction pipeline at all and no way to render standalone.
                      const canView = track.kind === 'guitar' || track.kind === 'bass';
                      const canPreview = track.kind === 'percussion';
                      return (
                        <div
                          key={track.index}
                          className="flex flex-col gap-1 px-2 py-1.5"
                          style={{
                            background: '#18181b',
                            border: isVisible ? '1px solid #60a5fa' : isPreviewed ? '1px solid #c4b5fd' : '1px solid #3f3f46',
                          }}
                        >
                        <div className="flex items-center gap-2">
                          {canView ? (
                            <button
                              type="button"
                              aria-label={`Mostrar partitura de ${track.name}`}
                              title="Ver la notación de esta pista"
                              className="flex-1 truncate text-left text-sm font-medium"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: isVisible ? '#93c5fd' : '#e4e4e7',
                                cursor: isVisible ? 'default' : 'pointer',
                                padding: 0,
                              }}
                              disabled={isVisible}
                              onClick={() => selectVisibleTrack(track.index)}
                            >
                              {isVisible && <span aria-hidden="true">&#128065; </span>}
                              {track.name}
                            </button>
                          ) : canPreview ? (
                            <button
                              type="button"
                              aria-label={`Mostrar partitura de ${track.name}`}
                              title="Ver la notación de esta pista (modo lectura, sin cursor propio de selección)"
                              className="flex-1 truncate text-left text-sm font-medium"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: isPreviewed ? '#c4b5fd' : '#e4e4e7',
                                cursor: isPreviewed ? 'default' : 'pointer',
                                padding: 0,
                              }}
                              disabled={isPreviewed}
                              onClick={() => previewPercussionTrack(track.index)}
                            >
                              {isPreviewed && <span aria-hidden="true">&#128065; </span>}
                              {track.name}
                            </button>
                          ) : (
                            <span className="flex-1 truncate text-sm font-medium" style={{ color: '#e4e4e7' }}>
                              {track.name}
                              <span className="ml-1 text-xs" style={{ color: '#71717a' }}>
                                (sin sonido)
                              </span>
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label={`Silenciar ${track.name}`}
                            title="Mute"
                            className="px-2 py-1 text-xs font-bold"
                            style={
                              isMuted
                                ? { background: '#f87171', border: '1px solid #f87171', color: '#09090b' }
                                : { background: '#27272a', border: '1px solid #52525b', color: '#e4e4e7' }
                            }
                            onClick={() => toggleTrackMute(track.index)}
                          >
                            M
                          </button>
                          <button
                            type="button"
                            aria-label={`Solo ${track.name}`}
                            title="Solo"
                            className="px-2 py-1 text-xs font-bold"
                            style={
                              isSolo
                                ? { background: '#6ee7b7', border: '1px solid #6ee7b7', color: '#09090b' }
                                : { background: '#27272a', border: '1px solid #52525b', color: '#e4e4e7' }
                            }
                            onClick={() => toggleTrackSolo(track.index)}
                          >
                            S
                          </button>
                        </div>
                          <label
                            className="flex items-center gap-2 text-xs font-medium"
                            style={{ color: '#a1a1aa' }}
                          >
                            <span style={{ textAlign: 'right', width: 28 }}>
                              {Math.round((trackVolumes.get(track.index) ?? 1) * 50)}
                            </span>
                            <input
                              aria-label={`Volumen de ${track.name}`}
                              type="range"
                              min="0"
                              max="2"
                              step="0.1"
                              value={trackVolumes.get(track.index) ?? 1}
                              style={{ accentColor: '#047857', height: 8, width: 112 }}
                              onChange={(event) => updateTrackVolume(track.index, Number(event.target.value))}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <IconButton label={isPlaying ? 'Parar' : 'Reproducir'} active={isPlaying} onClick={isPlaying ? stop : playPause}>
              {isPlaying ? <StopIcon /> : <PlayIcon />}
            </IconButton>
            <div className="relative flex items-center gap-2">
              <IconButton label="Configurar metrónomo" active={metronome || metronomeMenuOpen} onClick={toggleMetronomeMenu}>
                <span className="relative flex h-8 w-8 items-center justify-center">
                  <MetronomeIcon />
                  {metronome && (
                    <span className="absolute -bottom-2 -right-2 flex h-5 w-5 items-center justify-center bg-emerald-300 text-zinc-950">
                      <MetronomeSubdivisionIcon subdivision={metronomeSubdivision} size={18} />
                    </span>
                  )}
                </span>
              </IconButton>
              {metronomeMenuOpen && (
                <div
                  className="absolute right-0 top-[calc(100%+0.5rem)] z-[130] flex w-[52px] flex-col items-stretch gap-1 border border-zinc-600 bg-zinc-950 p-1 shadow-2xl"
                  role="menu"
                  aria-label="Opciones del metrónomo"
                >
                  <button
                    type="button"
                    aria-label="Apagar metrónomo"
                    title="Apagar metrónomo"
                    className={`flex h-11 w-11 items-center justify-center border ${
                      metronome ? 'border-zinc-600 bg-zinc-900 text-zinc-200' : 'border-emerald-300 bg-emerald-300 text-zinc-950'
                    }`}
                    onClick={disableMetronome}
                  >
                    <MutedMetronomeIcon size={35} />
                  </button>
                  <button
                    type="button"
                    aria-label="Metrónomo en negras"
                    title="Metrónomo en negras"
                    className={`flex h-11 w-11 items-center justify-center border ${
                      metronome && metronomeSubdivision === 'quarter'
                        ? 'border-emerald-300 bg-emerald-300 text-zinc-950'
                        : 'border-zinc-600 bg-zinc-900 text-zinc-200'
                    }`}
                    onClick={() => selectMetronomeSubdivision('quarter')}
                  >
                    <QuarterNoteIcon size={37} />
                  </button>
                  <button
                    type="button"
                    aria-label="Metrónomo en corcheas"
                    title="Metrónomo en corcheas"
                    className={`flex h-11 w-11 items-center justify-center border ${
                      metronome && metronomeSubdivision === 'eighth'
                        ? 'border-emerald-300 bg-emerald-300 text-zinc-950'
                        : 'border-zinc-600 bg-zinc-900 text-zinc-200'
                    }`}
                    onClick={() => selectMetronomeSubdivision('eighth')}
                  >
                    <EighthNoteIcon size={37} />
                  </button>
                  <button
                    type="button"
                    aria-label="Metrónomo en semicorcheas"
                    title="Metrónomo en semicorcheas"
                    className={`flex h-11 w-11 items-center justify-center border ${
                      metronome && metronomeSubdivision === 'sixteenth'
                        ? 'border-emerald-300 bg-emerald-300 text-zinc-950'
                        : 'border-zinc-600 bg-zinc-900 text-zinc-200'
                    }`}
                    onClick={() => selectMetronomeSubdivision('sixteenth')}
                  >
                    <SixteenthNoteIcon size={37} />
                  </button>
                </div>
              )}
            </div>
            {multiTrack && scoreTracks.some((track) => track.kind === 'percussion') && (
              // Independent of whether a drum preview is currently being
              // shown (previewedTrackIndex) — these per-hit-type
              // mute/solo/volume controls affect AUDIO, which plays the same
              // whether or not the drum notation happens to be on screen
              // right now, exactly like track mute/solo above. Replaces the
              // old purple "Viendo: Drums (solo lectura)" pill that used to
              // live in this exact spot — exiting a drum preview still works
              // via selectVisibleTrack (picking any guitar/bass track from
              // the "Pistas" dropdown), unchanged.
              <div className="relative flex items-center gap-2">
                <IconButton label="Batería" active={drumMenuOpen || drumElementSolo !== null} onClick={toggleDrumMenu}>
                  <DrumIcon />
                </IconButton>
                {drumMenuOpen && (
                  <div
                    className="absolute right-0 top-[calc(100%+0.5rem)] z-[130] flex w-64 flex-col items-stretch gap-1 p-2 shadow-2xl"
                    style={{ background: '#09090b', border: '1px solid #52525b' }}
                    role="menu"
                    aria-label="Volumen por elemento de batería"
                  >
                    {DRUM_CLICK_TYPES.map((type) => {
                      const isMuted = drumElementMuted.has(type);
                      const isSolo = drumElementSolo === type;
                      const label = DRUM_ELEMENT_LABELS[type];
                      return (
                        <div
                          key={type}
                          className="flex flex-col gap-1 px-2 py-1.5"
                          style={{ background: '#18181b', border: '1px solid #3f3f46' }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex-1 truncate text-sm font-medium" style={{ color: '#e4e4e7' }}>
                              {label}
                            </span>
                            <button
                              type="button"
                              aria-label={`Silenciar ${label}`}
                              title="Mute"
                              className="px-2 py-1 text-xs font-bold"
                              style={
                                isMuted
                                  ? { background: '#f87171', border: '1px solid #f87171', color: '#09090b' }
                                  : { background: '#27272a', border: '1px solid #52525b', color: '#e4e4e7' }
                              }
                              onClick={() => toggleDrumElementMute(type)}
                            >
                              M
                            </button>
                            <button
                              type="button"
                              aria-label={`Solo ${label}`}
                              title="Solo"
                              className="px-2 py-1 text-xs font-bold"
                              style={
                                isSolo
                                  ? { background: '#6ee7b7', border: '1px solid #6ee7b7', color: '#09090b' }
                                  : { background: '#27272a', border: '1px solid #52525b', color: '#e4e4e7' }
                              }
                              onClick={() => toggleDrumElementSolo(type)}
                            >
                              S
                            </button>
                          </div>
                          <label className="flex items-center gap-2 text-xs font-medium" style={{ color: '#a1a1aa' }}>
                            <span style={{ textAlign: 'right', width: 28 }}>
                              {Math.round((drumElementVolumes.get(type) ?? 1) * 50)}
                            </span>
                            <input
                              aria-label={`Volumen de ${label}`}
                              type="range"
                              min="0"
                              max="2"
                              step="0.1"
                              value={drumElementVolumes.get(type) ?? 1}
                              style={{ accentColor: '#047857', height: 8, width: 112 }}
                              onChange={(event) => updateDrumElementVolume(type, Number(event.target.value))}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <span className="w-12 text-right">Vol {Math.round(volume * 100)}</span>
            <input
              aria-label="Volumen"
              className="h-2 w-28 accent-emerald-400"
              min="0"
              max="1"
              step="0.05"
              type="range"
              value={volume}
              onChange={(event) => updateVolume(Number(event.target.value))}
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <span className="w-12 text-right">x{speed.toFixed(2)}</span>
            <input
              aria-label="Velocidad de reproduccion"
              className="h-2 w-32 accent-emerald-400"
              min="0.5"
              max="1.5"
              step="0.05"
              type="range"
              value={speed}
              onChange={(event) => updateSpeed(Number(event.target.value))}
            />
          </label>
        </div>
      </div>
      <div className="alphatab-surface relative overflow-hidden bg-white">
        {shouldShowTabScrollbar && (
          <div
            ref={tabScrollbarRef}
            aria-label="Desplazamiento horizontal de la tablatura"
            className="relative overflow-x-auto overflow-y-hidden"
            style={{
              background: '#ffffff',
              borderBottom: '1px solid #e4e4e7',
              height: 20,
              zIndex: 95,
            }}
            onScroll={syncTabScrollFromScrollbar}
          >
            <div
              style={{
                height: 1,
                width: layout === 'horizontal' ? estimatedHorizontalScrollWidth : tabScrollMetrics.scrollWidth,
              }}
            />
          </div>
        )}
        {previewedTrackIndex === null && loopHighlightBoxes.map((box, index) => (
          <div
            key={`${box.x}-${box.y}-${index}`}
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              background: 'rgba(250, 204, 21, 0.22)',
              border: '1px solid rgba(202, 138, 4, 0.55)',
              height: box.height,
              left: box.x - visualScrollOffset + horizontalExtraVisualOffset,
              top: box.y,
              width: box.width,
              zIndex: 40,
            }}
          />
        ))}
        {previewedTrackIndex === null && loopHandleBoxes.map((handle) => (
          <button
            key={handle.side}
            type="button"
            aria-label={handle.side === 'start' ? 'Mover inicio del loop' : 'Mover final del loop'}
            className="absolute"
            onPointerDown={(event) => beginLoopHandleDrag(handle.side, event)}
            onPointerMove={updateLoopHandleDrag}
            onPointerUp={endLoopHandleDrag}
            onPointerCancel={endLoopHandleDrag}
            style={{
              alignItems: 'center',
              background: handle.side === 'start' ? '#047857' : '#dc2626',
              border: '3px solid #ffffff',
              borderRadius: 999,
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.28)',
              color: '#ffffff',
              cursor: 'grab',
              display: 'flex',
              fontSize: 16,
              fontWeight: 950,
              height: 42,
              justifyContent: 'center',
              left: handle.x - visualScrollOffset + horizontalExtraVisualOffset - 21,
              lineHeight: 1,
              touchAction: 'none',
              top: handle.y - 21,
              width: 42,
              zIndex: 90,
            }}
          >
            {handle.side === 'start' ? '[' : ']'}
          </button>
        ))}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            background: 'rgba(16, 185, 129, 0.85)',
            boxShadow: '0 0 0 1px rgba(6, 78, 59, 0.45), 0 0 10px rgba(16, 185, 129, 0.6)',
            display: cursorBox.visible ? 'block' : 'none',
            height: cursorBox.height,
            left: cursorBox.x - visualScrollOffset + horizontalExtraVisualOffset,
            top: cursorBox.y,
            width: 3,
            zIndex: 50,
          }}
        />
        <div
          ref={containerRef}
          className="alphatab-container cursor-crosshair overflow-x-hidden overflow-y-hidden"
          style={{
            maxWidth: '100%',
            minHeight: minHeight ?? (compact ? 220 : 520),
            overflowX: 'hidden',
            overflowY: 'hidden',
            paddingBottom: compact ? 12 : 24,
            paddingLeft: compact ? 12 : 24,
            paddingRight: compact ? 12 : 24,
            paddingTop: compact ? 12 : 24,
            touchAction: 'pan-y',
            width: '100%',
          }}
          onPointerDown={beginPointerSelection}
          onPointerMove={updatePointerSelection}
          onPointerUp={endPointerSelection}
          onPointerCancel={() => {
            pointerScrollDragRef.current = null;
            pointerStartIndexRef.current = null;
            pointerSuppressUpRef.current = false;
          }}
          onScroll={(event) => {
            setTabScrollLeft(event.currentTarget.scrollLeft);
            syncVisibleScrollbar(event.currentTarget.scrollLeft);
          }}
        />
        {!compact && previewedTrackIndex === null && stringLabelGroups.map((group) =>
          group.labels.map((label, index) => (
            <div
              key={`${group.systemY}-${label.note}-${index}`}
              aria-hidden="true"
              className="pointer-events-none absolute text-[12px] font-semibold leading-none text-zinc-900"
              style={{
                left: label.x - visualScrollOffset + horizontalExtraVisualOffset,
                top: label.y,
                transform: 'translateY(-50%)',
                zIndex: 80,
              }}
            >
              {label.note}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
