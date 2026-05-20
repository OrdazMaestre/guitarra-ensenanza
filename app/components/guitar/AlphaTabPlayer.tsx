// app/components/guitar/AlphaTabPlayer.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import * as alphaTab from '@coderline/alphatab';

interface AlphaTabPlayerProps {
  tab: string;
  title?: string;
}

const DEFAULT_AUTO_SCROLL = true;
const DEFAULT_METRONOME = false;
const DEFAULT_VOLUME = 0.8;
const DEFAULT_SPEED = 1;
const DEFAULT_BPM = 96;
const MIN_AUDIBLE_NOTE_LEVEL = 0.028;
const MAX_NOTE_LEVEL = 0.145;
const ACOUSTIC_HARMONICS = [1, 0.56, 0.34, 0.22, 0.15, 0.1, 0.07, 0.045, 0.03, 0.02];
const PALM_MUTE_HARMONICS = [1, 0.32, 0.14, 0.065, 0.03, 0.015, 0.008, 0.004];
const STRING_LABELS_TOP_TO_BOTTOM = ['E', 'B', 'G', 'D', 'A', 'E'];
const TAB_LINE_SPACING = 12.45;
const LOOP_VISUAL_X_OFFSET = -31;
const POINTER_SELECTION_EVENT_OFFSET = 1;
const CURSOR_VISUAL_EVENT_OFFSET = -1;
const FIRST_BAR_BEAT_CURSOR_X_OFFSET = 15;
const OPEN_STRING_MIDI_BY_STRING: Record<number, number> = {
  1: 40, // E2
  2: 45, // A2
  3: 50, // D3
  4: 55, // G3
  5: 59, // B3
  6: 64, // E4
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

interface HighlightBox {
  height: number;
  width: number;
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
  notes: AlphaTabNoteLike[];
  tupletDenominator: number;
  tupletNumerator: number;
}

interface AlphaTabScoreLike {
  tracks: Array<{
    staves: Array<{
      bars: Array<{
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
          .filter((note) => !note.isDead && OPEN_STRING_MIDI_BY_STRING[note.string] !== undefined)
          .map((note) => ({ fret: note.fret, palmMuted: beat.isPalmMute, stringNumber: note.string })),
    quarterNotes: beatQuarterNotes(beat),
  }));
}

function parseTempo(tab: string) {
  return Number(tab.match(/\\tempo\s*\(\s*(\d+)/)?.[1]) || DEFAULT_BPM;
}

function noteFrequency(note: TabNote) {
  const midi = OPEN_STRING_MIDI_BY_STRING[note.stringNumber] + note.fret;
  return 440 * 2 ** ((midi - 69) / 12);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createSoftLimiterCurve() {
  const samples = 2048;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.65) / Math.tanh(1.65);
  }
  return curve;
}

function createGuitarWave(context: AudioContext, palmMuted: boolean) {
  const harmonics = palmMuted ? PALM_MUTE_HARMONICS : ACOUSTIC_HARMONICS;
  const real = new Float32Array(harmonics.length + 1);
  const imag = new Float32Array(harmonics.length + 1);

  for (let index = 0; index < harmonics.length; index++) {
    imag[index + 1] = harmonics[index];
  }

  return context.createPeriodicWave(real, imag, { disableNormalization: false });
}

function eventDurationSeconds(event: TabEvent, speed: number, bpm: number) {
  return ((60 / bpm) * event.quarterNotes) / speed;
}

export default function AlphaTabPlayer({ tab }: AlphaTabPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const autoScrollRef = useRef(DEFAULT_AUTO_SCROLL);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioOutputRef = useRef<AudioOutputChain | null>(null);
  const activeSourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const beatToEventIndexRef = useRef(new Map<number, number>());
  const finishTimerRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const keyboardActionRef = useRef<() => void>(() => {});
  const metronomeRef = useRef(DEFAULT_METRONOME);
  const pointerStartIndexRef = useRef<number | null>(null);
  const playTimerRef = useRef<number | null>(null);
  const speedRef = useRef(DEFAULT_SPEED);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const fallbackEvents = useMemo(() => parseAlphaTexEvents(tab), [tab]);
  const bpm = useMemo(() => parseTempo(tab), [tab]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [metronome, setMetronome] = useState(DEFAULT_METRONOME);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [startEventIndex, setStartEventIndex] = useState(0);
  const [loopEndIndex, setLoopEndIndex] = useState<number | null>(null);
  const [loopStartIndex, setLoopStartIndex] = useState<number | null>(null);
  const [cursorBox, setCursorBox] = useState<CursorBox>({ height: 0, visible: false, x: 0, y: 0 });
  const [events, setEvents] = useState<TabEvent[]>(fallbackEvents);
  const [loopHighlightBoxes, setLoopHighlightBoxes] = useState<HighlightBox[]>([]);
  const [stringLabelGroups, setStringLabelGroups] = useState<StringLabelGroup[]>([]);

  function placeCursorForBeat(beat: AlphaTabBeatLike | undefined, xOffset = 0) {
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
    const padding = 24;
    const nextBox = {
      height: Math.max(40, barBounds.h),
      visible: true,
      x: Math.max(0, beatBounds.onNotesX || beatBounds.realBounds.x) + padding + xOffset,
      y: Math.max(0, barBounds.y) + padding,
    };
    setCursorBox({
      height: nextBox.height,
      visible: nextBox.visible,
      x: nextBox.x,
      y: nextBox.y,
    });

    if (autoScrollRef.current && containerRef.current) {
      const viewportY = containerRef.current.getBoundingClientRect().top + nextBox.y - 140;
      window.scrollBy({ behavior: 'smooth', top: viewportY });
    }
  }

  useEffect(() => {
    if (!containerRef.current) return;

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

    setIsPlaying(false);
    isPlayingRef.current = false;
    autoScrollRef.current = DEFAULT_AUTO_SCROLL;
    setMetronome(DEFAULT_METRONOME);
    metronomeRef.current = DEFAULT_METRONOME;
    setVolume(DEFAULT_VOLUME);
    volumeRef.current = DEFAULT_VOLUME;
    setSpeed(DEFAULT_SPEED);
    speedRef.current = DEFAULT_SPEED;
    setStartEventIndex(0);
    setLoopEndIndex(null);
    setLoopStartIndex(null);
    setLoopHighlightBoxes([]);
    setStringLabelGroups([]);
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
        tex: true,
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
        layoutMode: alphaTab.LayoutMode.Page,
        padding: [56, 35],
        startBar: 1,
        staveProfile: alphaTab.StaveProfile.Tab,
        systemPaddingBottom: 40,
        systemPaddingTop: 40,
      },
      notation: {
        elements: new Map([
          [alphaTab.NotationElement.EffectTempo, false],
          [alphaTab.NotationElement.GuitarTuning, false],
          [alphaTab.NotationElement.TrackNames, false],
        ]),
        rhythmHeight: 32,
        rhythmMode: alphaTab.TabRhythmMode.ShowWithBars,
      }
    });

    apiRef.current = api;
    const offScoreLoaded = api.scoreLoaded.on((score) => {
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
      window.setTimeout(() => {
        placeCursorForBeat(scoreEvents[0]?.beat);
      }, 0);
      scheduleStringLabelRefresh(scoreEvents);
    });
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
      if (apiRef.current) {
        apiRef.current.destroy();
      }
    };
  // AlphaTab must be recreated only when the tab content changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackEvents, tab]);

  useEffect(() => {
    const handleSpace = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
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
    const compressor = context.createDynamicsCompressor();
    const limiter = context.createWaveShaper();
    const master = context.createGain();

    input.gain.setValueAtTime(0.82, context.currentTime);
    compressor.threshold.setValueAtTime(-25, context.currentTime);
    compressor.knee.setValueAtTime(18, context.currentTime);
    compressor.ratio.setValueAtTime(7, context.currentTime);
    compressor.attack.setValueAtTime(0.004, context.currentTime);
    compressor.release.setValueAtTime(0.16, context.currentTime);
    limiter.curve = createSoftLimiterCurve();
    limiter.oversample = '4x';
    master.gain.setValueAtTime(2.04, context.currentTime);

    input.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(master);
    master.connect(context.destination);

    audioOutputRef.current = { input, master };
    return audioOutputRef.current;
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
  }

  function placeCursorForEvent(index: number) {
    const visualIndex = Math.min(events.length - 1, Math.max(0, index + CURSOR_VISUAL_EVENT_OFFSET));
    const event = events[visualIndex];
    const selectedEvent = events[index];
    placeCursorForBeat(event?.beat, selectedEvent?.isFirstPlayableBeatOfBar ? FIRST_BAR_BEAT_CURSOR_X_OFFSET : 0);
  }

  function getBeatBox(index: number) {
    const beat = events[index]?.beat;
    const boundsLookup = apiRef.current?.boundsLookup;
    if (!beat || !boundsLookup) {
      return undefined;
    }

    const beatBounds =
      boundsLookup.findBeat(beat as unknown as alphaTab.model.Beat) ??
      boundsLookup.findBeats(beat as unknown as alphaTab.model.Beat)?.[0];
    if (!beatBounds) {
      return undefined;
    }

    const padding = 24;
    const barBounds = beatBounds.barBounds.masterBarBounds.realBounds;
    return {
      height: Math.max(40, barBounds.h),
      width: Math.max(10, beatBounds.realBounds.w || 14),
      x: Math.max(0, beatBounds.onNotesX || beatBounds.realBounds.x) + padding,
      y: Math.max(0, barBounds.y) + padding,
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

  function getEventIndexFromPointer(event: MouseEvent<HTMLDivElement>, offset = 0) {
    if (!containerRef.current) return undefined;

    const boundsLookup = apiRef.current?.boundsLookup;
    if (!boundsLookup) return undefined;

    const rect = containerRef.current.getBoundingClientRect();
    const padding = 24;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const beat =
      boundsLookup.getBeatAtPos(x - padding, y - padding) ??
      boundsLookup.getBeatAtPos(x, y);

    const eventIndex = beat ? beatToEventIndexRef.current.get(beat.id) : undefined;
    if (eventIndex === undefined) {
      return undefined;
    }

    if (eventIndex === 0 && offset > 0) {
      return 0;
    }

    return Math.min(events.length - 1, Math.max(0, eventIndex + offset));
  }

  function selectStartFromPointer(event: MouseEvent<HTMLDivElement>) {
    if (isPlayingRef.current) return;
    event.preventDefault();

    const eventIndex = getEventIndexFromPointer(event);
    if (eventIndex !== undefined) {
      setStartEventIndex(eventIndex);
      setLoopEndIndex(null);
      setLoopStartIndex(null);
      setLoopHighlightBoxes([]);
      placeCursorForEvent(eventIndex);
    }
  }

  function beginPointerSelection(event: MouseEvent<HTMLDivElement>) {
    if (isPlayingRef.current) return;
    event.preventDefault();
    pointerStartIndexRef.current = getEventIndexFromPointer(event, POINTER_SELECTION_EVENT_OFFSET) ?? null;
  }

  function endPointerSelection(event: MouseEvent<HTMLDivElement>) {
    if (isPlayingRef.current) return;
    event.preventDefault();

    const pointerStartIndex = pointerStartIndexRef.current;
    const pointerEndIndex = getEventIndexFromPointer(event, POINTER_SELECTION_EVENT_OFFSET);
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
      return;
    }

    setLoopStartIndex(nextStart);
    setLoopEndIndex(nextEnd);
    setLoopHighlightBoxes(buildLoopHighlightBoxes(nextStart, nextEnd));
  }

  function updatePointerSelection(event: MouseEvent<HTMLDivElement>) {
    if (isPlayingRef.current || pointerStartIndexRef.current === null) return;
    event.preventDefault();

    const pointerEndIndex = getEventIndexFromPointer(event, POINTER_SELECTION_EVENT_OFFSET);
    if (pointerEndIndex !== undefined) {
      setLoopHighlightBoxes(buildLoopHighlightBoxes(pointerStartIndexRef.current, pointerEndIndex));
    }
  }

  function playPluckedNote(
    context: AudioContext,
    note: TabNote,
    startTime: number,
    duration: number,
    eventNoteCount: number
  ) {
    const frequency = noteFrequency(note);
    const isPalmMuted = note.palmMuted ?? false;
    const isLowString = note.stringNumber <= 2;
    const isHighString = note.stringNumber >= 5;
    const sustain = isPalmMuted ? Math.min(0.24, duration * 0.9) : Math.max(0.34, duration * 2.25);
    const chordCompensation = 1 / Math.sqrt(Math.max(1, eventNoteCount));
    const stringBalance = isLowString ? (isPalmMuted ? 1.38 : 1.08) : isHighString ? 0.84 : 0.96;
    const articulationLevel = isPalmMuted ? 0.11 : 0.13;
    const currentVolume = volumeRef.current;
    const targetLevel = currentVolume * articulationLevel * stringBalance * chordCompensation;
    const level =
      currentVolume <= 0
        ? 0
        : clamp(targetLevel, MIN_AUDIBLE_NOTE_LEVEL * currentVolume, MAX_NOTE_LEVEL * currentVolume);
    const noteEndTime = startTime + sustain;
    const wave = createGuitarWave(context, isPalmMuted);
    const output = context.createGain();
    const toneEnvelope = context.createGain();
    const doubleEnvelope = context.createGain();
    const pickEnvelope = context.createGain();
    const bodyEnvelope = context.createGain();
    const mainOscillator = context.createOscillator();
    const doubleOscillator = context.createOscillator();
    const bodyThump = context.createOscillator();
    const pickSource = context.createBufferSource();
    const pickFilter = context.createBiquadFilter();
    const toneFilter = context.createBiquadFilter();
    const stringNotch = context.createBiquadFilter();
    const bodyLow = context.createBiquadFilter();
    const bodyWood = context.createBiquadFilter();
    const bodyPresence = context.createBiquadFilter();
    const bodyAir = context.createBiquadFilter();
    const palmMuteRoomDelay = context.createDelay(0.12);
    const palmMuteRoomFeedback = context.createGain();
    const palmMuteRoomFilter = context.createBiquadFilter();
    const palmMuteRoomWet = context.createGain();
    const noiseLength = Math.max(1, Math.floor(context.sampleRate * (isPalmMuted ? 0.009 : 0.018)));
    const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
    const noise = noiseBuffer.getChannelData(0);

    for (let i = 0; i < noiseLength; i++) {
      const progress = i / noiseLength;
      const fade = (1 - progress) ** (isPalmMuted ? 3.4 : 1.75);
      const pickClick = Math.sin(progress * Math.PI * 18) * Math.exp(-progress * 26);
      noise[i] = ((Math.random() * 2 - 1) * 0.58 + pickClick * 0.42) * fade;
    }

    mainOscillator.setPeriodicWave(wave);
    mainOscillator.frequency.setValueAtTime(frequency, startTime);
    mainOscillator.detune.setValueAtTime(isLowString ? -4 : -1.5, startTime);

    doubleOscillator.setPeriodicWave(wave);
    doubleOscillator.frequency.setValueAtTime(frequency, startTime);
    doubleOscillator.detune.setValueAtTime(isLowString ? 5 : 3, startTime);

    bodyThump.type = 'sine';
    bodyThump.frequency.setValueAtTime(isLowString ? 96 : 142, startTime);

    pickSource.buffer = noiseBuffer;

    toneEnvelope.gain.setValueAtTime(0.0001, startTime);
    toneEnvelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), startTime + 0.006);
    toneEnvelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * (isPalmMuted ? 0.22 : 0.42)), startTime + Math.min(0.09, sustain * 0.32));
    toneEnvelope.gain.exponentialRampToValueAtTime(0.0001, noteEndTime);

    doubleEnvelope.gain.setValueAtTime(0.0001, startTime);
    doubleEnvelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * 0.42), startTime + 0.011);
    doubleEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + sustain * (isPalmMuted ? 0.55 : 0.86));

    pickEnvelope.gain.setValueAtTime(0.0001, startTime);
    pickEnvelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * (isPalmMuted ? 0.9 : 0.72)), startTime + 0.001);
    pickEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + (isPalmMuted ? 0.026 : 0.045));

    bodyEnvelope.gain.setValueAtTime(0.0001, startTime);
    bodyEnvelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, level * (isPalmMuted ? (isLowString ? 1.35 : 0.72) : isLowString ? 0.7 : 0.36)),
      startTime + 0.004
    );
    bodyEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + (isPalmMuted ? 0.16 : 0.18));

    toneFilter.type = 'lowpass';
    toneFilter.frequency.setValueAtTime(isPalmMuted ? 1150 : 6200, startTime);
    toneFilter.frequency.exponentialRampToValueAtTime(isPalmMuted ? 430 : 1750, startTime + sustain);
    toneFilter.Q.setValueAtTime(isPalmMuted ? 0.6 : 0.9, startTime);

    stringNotch.type = 'notch';
    stringNotch.frequency.setValueAtTime(isPalmMuted ? 1600 : 3100, startTime);
    stringNotch.Q.setValueAtTime(isPalmMuted ? 1.2 : 0.8, startTime);

    pickFilter.type = 'bandpass';
    pickFilter.frequency.setValueAtTime(isPalmMuted ? 720 : 2850, startTime);
    pickFilter.Q.setValueAtTime(isPalmMuted ? 1.8 : 1.15, startTime);

    bodyLow.type = 'peaking';
    bodyLow.frequency.setValueAtTime(isLowString ? 110 : 185, startTime);
    bodyLow.gain.setValueAtTime(isPalmMuted ? 7.2 : 2.8, startTime);
    bodyLow.Q.setValueAtTime(0.62, startTime);

    bodyWood.type = 'peaking';
    bodyWood.frequency.setValueAtTime(isLowString ? 245 : 330, startTime);
    bodyWood.gain.setValueAtTime(isPalmMuted ? 4.4 : 3.6, startTime);
    bodyWood.Q.setValueAtTime(0.74, startTime);

    bodyPresence.type = 'peaking';
    bodyPresence.frequency.setValueAtTime(isPalmMuted ? 980 : 2200, startTime);
    bodyPresence.gain.setValueAtTime(isPalmMuted ? -2.6 : 1.6, startTime);
    bodyPresence.Q.setValueAtTime(isPalmMuted ? 1.15 : 0.95, startTime);

    bodyAir.type = 'lowpass';
    bodyAir.frequency.setValueAtTime(isPalmMuted ? 1800 : 7600, startTime);
    bodyAir.Q.setValueAtTime(0.62, startTime);

    palmMuteRoomDelay.delayTime.setValueAtTime(0.032, startTime);
    palmMuteRoomFeedback.gain.setValueAtTime(isPalmMuted ? 0.2 : 0.04, startTime);
    palmMuteRoomFilter.type = 'lowpass';
    palmMuteRoomFilter.frequency.setValueAtTime(isPalmMuted ? 520 : 900, startTime);
    palmMuteRoomFilter.Q.setValueAtTime(0.8, startTime);
    palmMuteRoomWet.gain.setValueAtTime(isPalmMuted ? 0.24 : 0.04, startTime);

    output.gain.setValueAtTime(0.92, startTime);

    mainOscillator.connect(toneEnvelope);
    doubleOscillator.connect(doubleEnvelope);
    pickSource.connect(pickFilter);
    pickFilter.connect(pickEnvelope);
    bodyThump.connect(bodyEnvelope);
    toneEnvelope.connect(toneFilter);
    doubleEnvelope.connect(toneFilter);
    pickEnvelope.connect(toneFilter);
    bodyEnvelope.connect(bodyLow);
    toneFilter.connect(stringNotch);
    stringNotch.connect(bodyLow);
    bodyLow.connect(bodyWood);
    bodyWood.connect(bodyPresence);
    bodyPresence.connect(bodyAir);
    bodyAir.connect(output);
    bodyAir.connect(palmMuteRoomDelay);
    palmMuteRoomDelay.connect(palmMuteRoomFeedback);
    palmMuteRoomFeedback.connect(palmMuteRoomDelay);
    palmMuteRoomDelay.connect(palmMuteRoomFilter);
    palmMuteRoomFilter.connect(palmMuteRoomWet);
    palmMuteRoomWet.connect(output);
    output.connect(getAudioOutput(context).input);

    mainOscillator.start(startTime);
    doubleOscillator.start(startTime);
    bodyThump.start(startTime);
    pickSource.start(startTime);
    mainOscillator.stop(noteEndTime);
    doubleOscillator.stop(startTime + sustain * (isPalmMuted ? 0.62 : 0.92));
    bodyThump.stop(startTime + (isPalmMuted ? 0.1 : 0.22));
    pickSource.stop(startTime + noiseLength / context.sampleRate);
    activeSourcesRef.current.push(mainOscillator, doubleOscillator, bodyThump, pickSource);
  }

  function playMetronomeClick(context: AudioContext, startTime: number) {
    if (!metronomeRef.current) return;

    const currentVolume = volumeRef.current;

    const noiseSource = context.createBufferSource();
    const snap = context.createOscillator();
    const body = context.createOscillator();
    const noiseGain = context.createGain();
    const snapGain = context.createGain();
    const bodyGain = context.createGain();
    const noiseFilter = context.createBiquadFilter();
    const snapFilter = context.createBiquadFilter();
    const highPass = context.createBiquadFilter();
    const output = context.createGain();

    const noiseLength = Math.max(1, Math.floor(context.sampleRate * 0.07));
    const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseLength; index++) {
      const progress = index / noiseLength;
      noise[index] = (Math.random() * 2 - 1) * (1 - progress) ** 2.1;
    }

    noiseSource.buffer = noiseBuffer;
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1850, startTime);
    noiseFilter.Q.setValueAtTime(0.75, startTime);
    noiseGain.gain.setValueAtTime(0.0001, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(currentVolume * 0.18, startTime + 0.002);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.065);

    snap.type = 'square';
    snap.frequency.setValueAtTime(2400, startTime);
    snap.frequency.exponentialRampToValueAtTime(1450, startTime + 0.018);
    snapFilter.type = 'bandpass';
    snapFilter.frequency.setValueAtTime(2200, startTime);
    snapFilter.Q.setValueAtTime(1.1, startTime);
    snapGain.gain.setValueAtTime(0.0001, startTime);
    snapGain.gain.exponentialRampToValueAtTime(currentVolume * 0.08, startTime + 0.001);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.022);

    body.type = 'sine';
    body.frequency.setValueAtTime(220, startTime);
    body.frequency.exponentialRampToValueAtTime(165, startTime + 0.045);
    bodyGain.gain.setValueAtTime(0.0001, startTime);
    bodyGain.gain.exponentialRampToValueAtTime(currentVolume * 0.055, startTime + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.05);

    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(420, startTime);
    highPass.Q.setValueAtTime(0.7, startTime);
    output.gain.setValueAtTime(1.05, startTime);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    snap.connect(snapFilter);
    snapFilter.connect(snapGain);
    body.connect(bodyGain);
    noiseGain.connect(highPass);
    snapGain.connect(highPass);
    bodyGain.connect(output);
    highPass.connect(output);
    output.connect(getAudioOutput(context).input);

    noiseSource.start(startTime);
    snap.start(startTime);
    body.start(startTime);
    noiseSource.stop(startTime + noiseLength / context.sampleRate);
    snap.stop(startTime + 0.025);
    body.stop(startTime + 0.055);
    activeSourcesRef.current.push(noiseSource, snap, body);
  }

  async function startLocalPlayback() {
    if (events.length === 0) {
      return;
    }

    stopLocalPlayback();
    const context = getAudioContext();
    await context.resume();

    const firstIndex = Math.min(startEventIndex, events.length - 1);
    isPlayingRef.current = true;
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
    const startTime = context.currentTime + 0.01;
    const eventDuration = eventDurationSeconds(event, speedRef.current, bpm);
    const eventStartQuarter = events
      .slice(0, index)
      .reduce((total, previousEvent) => total + previousEvent.quarterNotes, 0);

    placeCursorForEvent(index);

    if (metronomeRef.current && Math.abs(eventStartQuarter - Math.round(eventStartQuarter)) < 0.001) {
      playMetronomeClick(context, startTime);
    }

    for (const note of event.notes) {
      playPluckedNote(context, note, startTime, eventDuration, event.notes.length);
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
    if (isPlayingRef.current) {
      stopLocalPlayback();
      return;
    }

    void startLocalPlayback();
  }

  function stop() {
    stopLocalPlayback();
  }

  function toggleMetronome() {
    const next = !metronomeRef.current;
    metronomeRef.current = next;
    setMetronome(next);
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
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 pt-24 shadow-2xl">
      <div className="fixed left-0 right-0 top-3 z-[100] flex justify-center px-4">
        <div className="flex flex-wrap items-center justify-center gap-4 border border-zinc-700 bg-zinc-950/95 px-4 py-3 shadow-xl backdrop-blur">
          <div className="flex items-center justify-center gap-2">
          <IconButton label={isPlaying ? 'Parar' : 'Reproducir'} active={isPlaying} onClick={isPlaying ? stop : playPause}>
            {isPlaying ? <StopIcon /> : <PlayIcon />}
          </IconButton>
          <IconButton label="Metronomo" active={metronome} onClick={toggleMetronome}>
            <MetronomeIcon />
          </IconButton>
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
      <div className="relative bg-white">
        {loopHighlightBoxes.map((box, index) => (
          <div
            key={`${box.x}-${box.y}-${index}`}
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              background: 'rgba(250, 204, 21, 0.22)',
              border: '1px solid rgba(202, 138, 4, 0.55)',
              height: box.height,
              left: box.x,
              top: box.y,
              width: box.width,
              zIndex: 40,
            }}
          />
        ))}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            background: 'rgba(16, 185, 129, 0.85)',
            boxShadow: '0 0 0 1px rgba(6, 78, 59, 0.45), 0 0 10px rgba(16, 185, 129, 0.6)',
            display: cursorBox.visible ? 'block' : 'none',
            height: cursorBox.height,
            left: cursorBox.x,
            top: cursorBox.y,
            width: 3,
            zIndex: 50,
          }}
        />
        <div
          ref={containerRef}
          className="alphatab-container min-h-[520px] cursor-crosshair p-6"
          onMouseDown={beginPointerSelection}
          onMouseMove={updatePointerSelection}
          onMouseUp={endPointerSelection}
        />
        {stringLabelGroups.map((group) =>
          group.labels.map((label, index) => (
            <div
              key={`${group.systemY}-${label.note}-${index}`}
              aria-hidden="true"
              className="pointer-events-none absolute text-[12px] font-semibold leading-none text-zinc-900"
              style={{
                left: label.x,
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
