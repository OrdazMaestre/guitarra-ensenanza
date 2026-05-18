// app/components/guitar/AlphaTabPlayer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as alphaTab from '@coderline/alphatab';

interface AlphaTabPlayerProps {
  tab: string;
  title?: string;
}

const DEFAULT_AUTO_SCROLL = true;
const DEFAULT_LOOPING = false;
const DEFAULT_METRONOME = false;
const DEFAULT_VOLUME = 0.8;
const DEFAULT_SPEED = 1;
const DEFAULT_BPM = 96;
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
  stringNumber: number;
}

interface TabEvent {
  duration: number;
  notes: TabNote[];
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

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="32" height="32" fill="currentColor">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
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

function LoopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </svg>
  );
}

function ScrollIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v18" />
      <path d="M7 8l5-5 5 5" />
      <path d="M7 16l5 5 5-5" />
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

function parseAlphaTexEvents(tab: string): TabEvent[] {
  const body = tab.includes('.') ? tab.slice(tab.indexOf('.') + 1) : tab;
  const tokens = body.match(/:\d+|\([^)]+\)(?:\*\d+)?|\d+\.\d+(?:\*\d+)?|r(?:\*\d+)?|\|/g) ?? [];
  let currentDuration = 4;
  const events: TabEvent[] = [];

  for (const token of tokens) {
    if (token.startsWith(':')) {
      currentDuration = Number(token.slice(1)) || currentDuration;
      continue;
    }

    if (token === '|') {
      continue;
    }

    if (token.startsWith('r')) {
      events.push({ duration: currentDuration, notes: [] });
      continue;
    }

    const notes: TabNote[] = [];
    const noteMatches = token.matchAll(/(\d+)\.(\d+)/g);
    for (const match of noteMatches) {
      const fret = Number(match[1]);
      const stringNumber = Number(match[2]);
      if (OPEN_STRING_MIDI_BY_STRING[stringNumber] !== undefined && fret >= 0 && fret <= 24) {
        notes.push({ fret, stringNumber });
      }
    }

    if (notes.length > 0) {
      events.push({ duration: currentDuration, notes });
    }
  }

  return events;
}

function noteFrequency(note: TabNote) {
  const midi = OPEN_STRING_MIDI_BY_STRING[note.stringNumber] + note.fret;
  return 440 * 2 ** ((midi - 69) / 12);
}

function eventDurationSeconds(duration: number, speed: number) {
  return ((60 / DEFAULT_BPM) * (4 / duration)) / speed;
}

export default function AlphaTabPlayer({ tab, title = "Tablatura" }: AlphaTabPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const autoScrollRef = useRef(DEFAULT_AUTO_SCROLL);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const finishTimerRef = useRef<number | null>(null);
  const stepTimerRefs = useRef<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(DEFAULT_LOOPING);
  const [autoScroll, setAutoScroll] = useState(DEFAULT_AUTO_SCROLL);
  const [metronome, setMetronome] = useState(DEFAULT_METRONOME);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [startEventIndex, setStartEventIndex] = useState(0);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [audioStatus, setAudioStatus] = useState('Sintetizador local listo');
  const events = parseAlphaTexEvents(tab);

  useEffect(() => {
    if (!containerRef.current) return;

    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    for (const timer of stepTimerRefs.current) {
      window.clearTimeout(timer);
    }
    stepTimerRefs.current = [];
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // The source may have already finished naturally.
      }
    }
    activeSourcesRef.current = [];

    setIsPlaying(false);
    setIsLooping(DEFAULT_LOOPING);
    setAutoScroll(DEFAULT_AUTO_SCROLL);
    autoScrollRef.current = DEFAULT_AUTO_SCROLL;
    setMetronome(DEFAULT_METRONOME);
    setVolume(DEFAULT_VOLUME);
    setSpeed(DEFAULT_SPEED);
    setStartEventIndex(0);
    setCurrentEventIndex(0);
    setAudioStatus('Sintetizador local listo');
    containerRef.current.textContent = tab;

    const api = new alphaTab.AlphaTabApi(containerRef.current, {
      core: {
        fontDirectory: '/alphatab-fonts/', // Next sirve public/ desde la raiz
        tex: true,
        useWorkers: false,
        enableLazyLoading: false,
      },
      player: {
        enablePlayer: false,
        scrollMode: alphaTab.ScrollMode.Off,
        scrollSpeed: 350,
      },
      display: {
        layoutMode: alphaTab.LayoutMode.Page,
        startBar: 1,
      }
    });

    apiRef.current = api;

    return () => {
      if (finishTimerRef.current !== null) {
        window.clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
      for (const timer of stepTimerRefs.current) {
        window.clearTimeout(timer);
      }
      stepTimerRefs.current = [];
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
  }, [tab]);

  function getAudioContext() {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }

  function clearPlaybackTimers() {
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }

    for (const timer of stepTimerRefs.current) {
      window.clearTimeout(timer);
    }
    stepTimerRefs.current = [];
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
    setIsPlaying(false);
  }

  function playPluckedNote(context: AudioContext, note: TabNote, startTime: number, duration: number) {
    const output = context.createGain();
    const filter = context.createBiquadFilter();
    const body = context.createOscillator();
    const brightness = context.createOscillator();
    const frequency = noteFrequency(note);
    const level = Math.max(0.001, volume / Math.max(1, 3));

    body.type = 'triangle';
    body.frequency.setValueAtTime(frequency, startTime);

    brightness.type = 'sawtooth';
    brightness.frequency.setValueAtTime(frequency * 2, startTime);
    brightness.detune.setValueAtTime(-6, startTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, startTime);
    filter.frequency.exponentialRampToValueAtTime(900, startTime + Math.min(duration, 0.45));

    output.gain.setValueAtTime(0.0001, startTime);
    output.gain.exponentialRampToValueAtTime(level, startTime + 0.012);
    output.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.max(0.08, duration * 0.92));

    body.connect(filter);
    brightness.connect(filter);
    filter.connect(output);
    output.connect(context.destination);

    body.start(startTime);
    brightness.start(startTime);
    body.stop(startTime + duration);
    brightness.stop(startTime + duration);
    activeSourcesRef.current.push(body, brightness);
  }

  function playMetronomeClick(context: AudioContext, startTime: number) {
    if (!metronome) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(1200, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume * 0.2, startTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.055);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.06);
    activeSourcesRef.current.push(oscillator);
  }

  async function startLocalPlayback() {
    if (events.length === 0) {
      setAudioStatus('No hay notas reconocibles para reproducir');
      return;
    }

    stopLocalPlayback();
    const context = getAudioContext();
    await context.resume();

    const firstIndex = Math.min(startEventIndex, events.length - 1);
    let offset = 0;
    const startTime = context.currentTime + 0.04;
    const scheduledEvents = events.slice(firstIndex);

    setCurrentEventIndex(firstIndex);
    setIsPlaying(true);
    setAudioStatus('Reproduciendo con sintetizador local');

    scheduledEvents.forEach((event, index) => {
      const eventStartTime = startTime + offset;
      const eventDuration = eventDurationSeconds(event.duration, speed);
      const absoluteIndex = firstIndex + index;

      playMetronomeClick(context, eventStartTime);
      for (const note of event.notes) {
        playPluckedNote(context, note, eventStartTime, eventDuration);
      }

      const stepTimer = window.setTimeout(() => {
        setCurrentEventIndex(absoluteIndex);
      }, Math.max(0, (eventStartTime - context.currentTime) * 1000));
      stepTimerRefs.current.push(stepTimer);
      offset += eventDuration;
    });

    finishTimerRef.current = window.setTimeout(() => {
      setIsPlaying(false);
      setCurrentEventIndex(firstIndex);
      setAudioStatus('Sintetizador local listo');
      stopActiveSources();
    }, Math.max(0, (startTime + offset - context.currentTime) * 1000));
  }

  function playPause() {
    if (isPlaying) {
      stopLocalPlayback();
      setAudioStatus('Pausado');
      return;
    }

    void startLocalPlayback();
  }

  function stop() {
    stopLocalPlayback();
    setCurrentEventIndex(startEventIndex);
    setAudioStatus('Sintetizador local listo');
  }

  function toggleLoop() {
    const next = !isLooping;
    setIsLooping(next);
  }

  function toggleAutoScroll() {
    const next = !autoScroll;
    setAutoScroll(next);
    autoScrollRef.current = next;
  }

  function toggleMetronome() {
    const next = !metronome;
    setMetronome(next);
  }

  function updateVolume(value: number) {
    setVolume(value);
  }

  function updateSpeed(value: number) {
    setSpeed(value);
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-900 shadow-2xl">
      {title && (
        <div className="bg-zinc-800 px-6 py-4 border-b border-zinc-700 font-semibold text-xl text-white">
          {title}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-700 bg-zinc-950 px-4 py-3">
        <div className="flex items-center gap-2">
          <IconButton label={isPlaying ? 'Pausar' : 'Reproducir'} active={isPlaying} onClick={playPause}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </IconButton>
          <IconButton label="Parar" disabled={!isPlaying} onClick={stop}>
            <StopIcon />
          </IconButton>
          <IconButton label="Scroll durante playback" active={autoScroll} onClick={toggleAutoScroll}>
            <ScrollIcon />
          </IconButton>
          <IconButton label="Loop pendiente" active={isLooping} disabled onClick={toggleLoop}>
            <LoopIcon />
          </IconButton>
          <IconButton label="Metronomo" active={metronome} onClick={toggleMetronome}>
            <MetronomeIcon />
          </IconButton>
        </div>

        <div className="flex min-w-44 items-center gap-3 text-sm font-medium text-zinc-200">
          <span className="w-12">Vol</span>
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
        </div>

        <div className="flex min-w-52 items-center gap-3 text-sm font-medium text-zinc-200">
          <span className="w-14">{speed.toFixed(2)}x</span>
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
        </div>

        <div className="flex min-w-56 items-center gap-3 text-sm font-medium text-zinc-200">
          <span className="w-16">Inicio {events.length > 0 ? startEventIndex + 1 : 0}</span>
          <input
            aria-label="Nota o acorde inicial"
            className="h-2 w-32 accent-emerald-400"
            disabled={events.length <= 1 || isPlaying}
            min="0"
            max={Math.max(0, events.length - 1)}
            step="1"
            type="range"
            value={startEventIndex}
            onChange={(event) => {
              const next = Number(event.target.value);
              setStartEventIndex(next);
              setCurrentEventIndex(next);
            }}
          />
        </div>

        <span className="text-sm font-medium text-emerald-300">
          {audioStatus}
          {events.length > 0 ? ` (${currentEventIndex + 1}/${events.length})` : ''}
        </span>
      </div>
      <div 
        ref={containerRef} 
        className="alphatab-container min-h-[520px] bg-white p-6"
      />
    </div>
  );
}
