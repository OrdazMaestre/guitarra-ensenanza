// app/components/guitar/AlphaTabPlayer.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import * as alphaTab from '@coderline/alphatab';

interface AlphaTabPlayerProps {
  compact?: boolean;
  initialSpeed?: number;
  layout?: 'page' | 'horizontal';
  minHeight?: number;
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
const STRING_LABELS_TOP_TO_BOTTOM = ['E', 'B', 'G', 'D', 'A', 'E'];
const TAB_LINE_SPACING = 12.45;
const LOOP_VISUAL_X_OFFSET = -31;
const CURSOR_LINE_WIDTH = 3;
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
  masterBars?: Array<{
    displayWidth?: number;
    section?: {
      marker?: string;
      text?: string;
    } | null;
  }>;
  tracks: Array<{
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

function buildEventsFromScore(score: AlphaTabScoreLike) {
  const beatEntries = score.tracks[0]?.staves[0]?.bars
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
    notes: beat.isRest
      ? []
      : beat.notes
          .map((note) => ({ ...note, normalizedString: normalizeAlphaTabStringNumber(note.string) }))
          .filter((note) => !note.isDead && OPEN_STRING_MIDI_BY_STRING[note.normalizedString] !== undefined)
          .map((note) => ({ fret: note.fret, palmMuted: beat.isPalmMute, stringNumber: note.normalizedString })),
    quarterNotes: beatQuarterNotes(beat),
  }));
}

function parseTempo(tab: string) {
  return Number(tab.match(/\\tempo\s*\(\s*(\d+)/)?.[1]) || DEFAULT_BPM;
}

function noteMidi(note: TabNote) {
  return OPEN_STRING_MIDI_BY_STRING[note.stringNumber] + note.fret;
}

function stringArrayIndex(note: TabNote) {
  return clamp(6 - note.stringNumber, 0, GUITAR_SAMPLE_CUTOFFS.length - 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

export default function AlphaTabPlayer({
  compact = false,
  initialSpeed = DEFAULT_SPEED,
  layout = 'page',
  minHeight,
  source,
  tab = '',
}: AlphaTabPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerIdRef = useRef(Symbol('AlphaTabPlayer'));
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioOutputRef = useRef<AudioOutputChain | null>(null);
  const activeSourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const activeVoicesRef = useRef<GuitarSampleVoice[]>([]);
  const beatToEventIndexRef = useRef(new Map<number, number>());
  const finishTimerRef = useRef<number | null>(null);
  const guitarSamplesLoadingRef = useRef<Promise<LoadedGuitarSample[]> | null>(null);
  const guitarSamplesRef = useRef<LoadedGuitarSample[] | null>(null);
  const isPlayingRef = useRef(false);
  const keyboardActionRef = useRef<() => void>(() => {});
  const metronomeSubdivisionRef = useRef<MetronomeSubdivision>(DEFAULT_METRONOME_SUBDIVISION);
  const metronomeRef = useRef(DEFAULT_METRONOME);
  const playbackScrollPendingRef = useRef(false);
  const pointerDragHandleRef = useRef<'end' | 'start' | null>(null);
  const pointerStartIndexRef = useRef<number | null>(null);
  const pointerSuppressUpRef = useRef(false);
  const pointerTapRef = useRef<{ index: number; time: number; x: number; y: number } | null>(null);
  const playTimerRef = useRef<number | null>(null);
  const removeTabScrollListenerRef = useRef<() => void>(() => {});
  const speedRef = useRef(initialSpeed);
  const tabScrollElementRef = useRef<HTMLElement | null>(null);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const voiceIdRef = useRef(0);
  const fallbackEvents = useMemo(() => (tab ? parseAlphaTexEvents(tab) : []), [tab]);
  const bpm = useMemo(() => (tab ? parseTempo(tab) : DEFAULT_BPM), [tab]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [metronome, setMetronome] = useState(DEFAULT_METRONOME);
  const [metronomeMenuOpen, setMetronomeMenuOpen] = useState(false);
  const [metronomeSubdivision, setMetronomeSubdivision] = useState<MetronomeSubdivision>(DEFAULT_METRONOME_SUBDIVISION);
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
  const [tabScrollLeft, setTabScrollLeft] = useState(0);

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

    if (isPlayingRef.current) {
      keepCursorVisibleHorizontally(nextBox.x);
    }

    if (shouldScroll && containerRef.current) {
      const viewportY = containerRef.current.getBoundingClientRect().top + nextBox.y - 140;
      window.scrollBy({ behavior: 'smooth', top: viewportY });
    }
  }

  function selectKeyboardPlayer() {
    selectedKeyboardPlayerId = playerIdRef.current;
  }

  function clearGlobalPlaybackIfCurrent(playerId = playerIdRef.current) {
    if (currentPlayingPlayerId === playerId) {
      currentPlayingPlayerId = null;
      stopCurrentPlayingPlayer = null;
    }
  }

  function findTabScrollElement() {
    const root = containerRef.current;
    if (!root) {
      return null;
    }

    const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    return (
      candidates
        .filter((element) => element.scrollWidth > element.clientWidth + 2)
        .sort((a, b) => b.scrollWidth - b.clientWidth - (a.scrollWidth - a.clientWidth))[0] ?? null
    );
  }

  function bindTabScrollElement() {
    const nextElement = findTabScrollElement();
    if (nextElement === tabScrollElementRef.current) {
      return nextElement;
    }

    removeTabScrollListenerRef.current();
    tabScrollElementRef.current = nextElement;

    if (!nextElement) {
      setTabScrollLeft(0);
      removeTabScrollListenerRef.current = () => {};
      return null;
    }

    const handleScroll = () => setTabScrollLeft(nextElement.scrollLeft);
    nextElement.addEventListener('scroll', handleScroll, { passive: true });
    setTabScrollLeft(nextElement.scrollLeft);
    removeTabScrollListenerRef.current = () => nextElement.removeEventListener('scroll', handleScroll);
    return nextElement;
  }

  function getTabScrollPosition() {
    const scrollFrame = bindTabScrollElement();
    const left = scrollFrame?.scrollLeft ?? containerRef.current?.scrollLeft ?? 0;
    const top = scrollFrame?.scrollTop ?? containerRef.current?.scrollTop ?? 0;

    if (left !== tabScrollLeft) {
      setTabScrollLeft(left);
    }

    return { left, top };
  }

  function keepCursorVisibleHorizontally(cursorX: number) {
    const scrollFrame = bindTabScrollElement();
    if (!scrollFrame || scrollFrame.scrollWidth <= scrollFrame.clientWidth) {
      return;
    }

    const visibleLeft = scrollFrame.scrollLeft;
    const visibleRight = visibleLeft + scrollFrame.clientWidth;
    const comfortMargin = Math.min(180, Math.max(72, scrollFrame.clientWidth * 0.22));
    const maxScrollLeft = scrollFrame.scrollWidth - scrollFrame.clientWidth;

    if (cursorX > visibleRight - comfortMargin) {
      scrollFrame.scrollTo({
        behavior: 'smooth',
        left: Math.min(maxScrollLeft, Math.max(0, cursorX - scrollFrame.clientWidth * 0.45)),
      });
      return;
    }

    if (cursorX < visibleLeft + comfortMargin) {
      scrollFrame.scrollTo({
        behavior: 'smooth',
        left: Math.max(0, cursorX - comfortMargin),
      });
    }
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
    setCursorBox({ height: 0, visible: false, x: 0, y: 0 });
    setEvents(fallbackEvents);
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
      if (layout === 'horizontal') {
        applyAnnotatedHorizontalBarWidths(score as AlphaTabScoreLike);
      }

      const scoreEvents = buildEventsFromScore(score as AlphaTabScoreLike);
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
  }, [fallbackEvents, initialSpeed, source, tab]);

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
    keyboardActionRef.current = () => {
      if (isPlayingRef.current) {
        stopLocalPlayback();
        return;
      }

      void startLocalPlayback();
    };
  });

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

    input.gain.setValueAtTime(0.85, context.currentTime);
    master.gain.setValueAtTime(1.35, context.currentTime);

    input.connect(master);
    master.connect(context.destination);

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
        x: Math.max(0, startBox.x + LOOP_VISUAL_X_OFFSET),
        y: startBox.y + startBox.height / 2,
      },
      {
        side: 'end' as const,
        x: Math.max(0, endBox.x + LOOP_VISUAL_X_OFFSET + endBox.width),
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

  function getEventIndexFromPointer(event: PointerEvent<HTMLElement>) {
    if (!containerRef.current) return undefined;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollPosition = getTabScrollPosition();
    const padding = getTabContainerPadding();
    const x = event.clientX - rect.left + scrollPosition.left - padding.left;
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
    if (isPlayingRef.current) return;
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
    if (isPlayingRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

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
    if (isPlayingRef.current) return;
    event.preventDefault();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }

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
    eventNoteCount: number
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
    const stringBalance = GUITAR_STRING_GAINS[note.stringNumber] ?? 1;
    const articulationLevel = isPalmMuted ? 0.34 : 0.58;
    const currentVolume = volumeRef.current;
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
    for (let index = 0; index < noiseLength; index++) {
      const progress = index / noiseLength;
      noise[index] = (Math.random() * 2 - 1) * (1 - progress) ** 2.4;
    }
    for (let index = 0; index < bodyLength; index++) {
      const progress = index / bodyLength;
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

    const firstIndex = Math.min(startEventIndex, events.length - 1);
    isPlayingRef.current = true;
    currentPlayingPlayerId = playerIdRef.current;
    stopCurrentPlayingPlayer = stopLocalPlayback;
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

    scheduleMetronomeClicks(context, eventStartQuarter, startTime, eventDuration, event.quarterNotes);

    const audibleNotes = event.notes;

    for (const note of audibleNotes) {
      const chordDelay = audibleNotes.length >= DENSE_CHORD_NOTE_COUNT ? STRUM_OFFSETS[stringArrayIndex(note)] ?? 0 : 0;
      playPluckedNote(context, note, startTime + chordDelay, eventDuration, audibleNotes.length);
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

  function updateVolume(value: number) {
    volumeRef.current = value;
    setVolume(value);
  }

  function updateSpeed(value: number) {
    speedRef.current = value;
    setSpeed(value);
  }

  return (
    <div className={`max-w-full overflow-visible border border-zinc-700 bg-zinc-900 shadow-2xl ${compact ? 'p-2' : 'rounded-2xl p-4'}`}>
      <div className={`${compact ? 'flex justify-center px-1 pb-2' : 'sticky top-3 z-[100] flex justify-center px-1 pb-4'}`}>
        <div className={`flex flex-wrap items-center justify-center border border-zinc-700 bg-zinc-950/95 shadow-xl backdrop-blur ${compact ? 'gap-2 px-2 py-2' : 'gap-4 px-4 py-3'}`}>
          <div className="flex items-center justify-center gap-2">
            <IconButton label={isPlaying ? 'Parar' : 'Reproducir'} active={isPlaying} onClick={isPlaying ? stop : playPause}>
              {isPlaying ? <StopIcon /> : <PlayIcon />}
            </IconButton>
            <div className="relative flex items-center gap-2">
              <IconButton label="Configurar metronomo" active={metronome || metronomeMenuOpen} onClick={toggleMetronomeMenu}>
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
                  aria-label="Opciones del metronomo"
                >
                  <button
                    type="button"
                    aria-label="Apagar metronomo"
                    title="Apagar metronomo"
                    className={`flex h-11 w-11 items-center justify-center border ${
                      metronome ? 'border-zinc-600 bg-zinc-900 text-zinc-200' : 'border-emerald-300 bg-emerald-300 text-zinc-950'
                    }`}
                    onClick={disableMetronome}
                  >
                    <MutedMetronomeIcon size={35} />
                  </button>
                  <button
                    type="button"
                    aria-label="Metronomo en negras"
                    title="Metronomo en negras"
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
                    aria-label="Metronomo en corcheas"
                    title="Metronomo en corcheas"
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
                    aria-label="Metronomo en semicorcheas"
                    title="Metronomo en semicorcheas"
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
      <div className="relative overflow-hidden bg-white">
        {loopHighlightBoxes.map((box, index) => (
          <div
            key={`${box.x}-${box.y}-${index}`}
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              background: 'rgba(250, 204, 21, 0.22)',
              border: '1px solid rgba(202, 138, 4, 0.55)',
              height: box.height,
              left: box.x - tabScrollLeft,
              top: box.y,
              width: box.width,
              zIndex: 40,
            }}
          />
        ))}
        {loopHandleBoxes.map((handle) => (
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
              left: handle.x - tabScrollLeft - 21,
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
            left: cursorBox.x - tabScrollLeft,
            top: cursorBox.y,
            width: 3,
            zIndex: 50,
          }}
        />
        <div
          ref={containerRef}
          className={`alphatab-container cursor-crosshair ${compact ? 'p-3' : 'p-6'}`}
          style={{ minHeight: minHeight ?? (compact ? 220 : 520), touchAction: 'manipulation' }}
          onPointerDown={beginPointerSelection}
          onPointerMove={updatePointerSelection}
          onPointerUp={endPointerSelection}
          onPointerCancel={() => {
            pointerStartIndexRef.current = null;
            pointerSuppressUpRef.current = false;
          }}
          onScroll={(event) => setTabScrollLeft(event.currentTarget.scrollLeft)}
        />
        {!compact && stringLabelGroups.map((group) =>
          group.labels.map((label, index) => (
            <div
              key={`${group.systemY}-${label.note}-${index}`}
              aria-hidden="true"
              className="pointer-events-none absolute text-[12px] font-semibold leading-none text-zinc-900"
              style={{
                left: label.x - tabScrollLeft,
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
