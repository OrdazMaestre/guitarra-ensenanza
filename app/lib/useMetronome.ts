'use client';
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';
import { getAudioCurrentTime, playMetronomeClick, touchAudioContext } from '@/app/lib/guitarAudioEngine';

export type MetronomeSubdivision = 'quarter' | 'eighth' | 'triplet' | 'sixteenth';

export interface MetronomeAPI {
  bpm: number;
  setBpm: Dispatch<SetStateAction<number>>;
  on: boolean;
  subdivision: MetronomeSubdivision;
  turnOn: (sub?: MetronomeSubdivision) => void;
  turnOff: () => void;
  selectSubdivision: (sub: MetronomeSubdivision) => void;
  metroVolume: number;
  setMetroVolume: Dispatch<SetStateAction<number>>;
}

const SUBDIV_FACTORS: Record<MetronomeSubdivision, number> = {
  quarter: 1,
  eighth: 0.5,
  triplet: 1 / 3,
  sixteenth: 0.25,
};

// Independent of the instrument's own volume slider. 0.5 (default) reproduces
// the click's historical loudness; 1.0 doubles it (see the `* 2` below and
// the metronome limiter in guitarAudioEngine.ts, which keeps that doubled
// level from clipping on the "kick" click type).
const DEFAULT_METRO_VOLUME = 0.5;

export function useMetronome(): MetronomeAPI {
  const [bpm, setBpm] = useState(60);
  const [on, setOn] = useState(false);
  const [subdivision, setSubdivision] = useState<MetronomeSubdivision>('quarter');
  const [metroVolume, setMetroVolume] = useState(DEFAULT_METRO_VOLUME);

  const bpmRef = useRef(bpm);
  const subdivRef = useRef<MetronomeSubdivision>('quarter');
  const clickIndexRef = useRef(0);
  const metroVolumeRef = useRef(metroVolume);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { metroVolumeRef.current = metroVolume; }, [metroVolume]);

  useEffect(() => {
    if (!on) return;
    const LOOKAHEAD = 0.1;
    let nextClickTime = getAudioCurrentTime() + 0.05;
    clickIndexRef.current = 0;
    const id = setInterval(() => {
      const now = getAudioCurrentTime();
      const secsPerClick = (60 / bpmRef.current) * SUBDIV_FACTORS[subdivRef.current];
      while (nextClickTime < now + LOOKAHEAD) {
        if (nextClickTime >= now - 0.01) {
          const idx = clickIndexRef.current;
          const sub = subdivRef.current;
          let type: 'snare' | 'kick' | 'cymbal' = 'snare';
          let accent = 1;
          if (sub === 'eighth') {
            type = idx % 2 === 0 ? 'snare' : 'kick';
          } else if (sub === 'triplet') {
            type = idx % 3 === 0 ? 'kick' : 'snare';
            // The two off-beat snares are quieter so the kick keeps lead.
            if (type === 'snare') accent = 0.6;
          } else if (sub === 'sixteenth') {
            const pos = idx % 4;
            if (pos === 1 || pos === 3) { type = 'cymbal'; accent = 0.3; }
            else if (pos === 2) type = 'kick';
          }
          playMetronomeClick(nextClickTime, metroVolumeRef.current * 2 * accent, type);
        }
        clickIndexRef.current++;
        nextClickTime += secsPerClick;
      }
    }, 25);
    return () => clearInterval(id);
  }, [on, subdivision]);

  function turnOn(sub: MetronomeSubdivision = 'quarter') {
    touchAudioContext();
    subdivRef.current = sub;
    setSubdivision(sub);
    setOn(true);
  }

  function turnOff() {
    setOn(false);
  }

  function selectSubdivision(sub: MetronomeSubdivision) {
    subdivRef.current = sub;
    setSubdivision(sub);
  }

  return { bpm, setBpm, on, subdivision, turnOn, turnOff, selectSubdivision, metroVolume, setMetroVolume };
}
