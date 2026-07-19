'use client';
import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import { getAudioCurrentTime, playMetronomeClick, touchAudioContext } from '@/app/lib/guitarAudioEngine';

export type MetronomeSubdivision = 'quarter' | 'eighth' | 'sixteenth';

export interface MetronomeAPI {
  bpm: number;
  setBpm: (v: number) => void;
  on: boolean;
  subdivision: MetronomeSubdivision;
  turnOn: (sub?: MetronomeSubdivision) => void;
  turnOff: () => void;
  selectSubdivision: (sub: MetronomeSubdivision) => void;
}

const SUBDIV_FACTORS: Record<MetronomeSubdivision, number> = {
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
};

export function useMetronome(volumeRef: MutableRefObject<number>): MetronomeAPI {
  const [bpm, setBpm] = useState(60);
  const [on, setOn] = useState(false);
  const [subdivision, setSubdivision] = useState<MetronomeSubdivision>('quarter');

  const bpmRef = useRef(bpm);
  const subdivRef = useRef<MetronomeSubdivision>('quarter');

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  useEffect(() => {
    if (!on) return;
    const LOOKAHEAD = 0.1;
    let nextClickTime = getAudioCurrentTime() + 0.05;
    const id = setInterval(() => {
      const now = getAudioCurrentTime();
      const secsPerClick = (60 / bpmRef.current) * SUBDIV_FACTORS[subdivRef.current];
      while (nextClickTime < now + LOOKAHEAD) {
        if (nextClickTime >= now - 0.01) playMetronomeClick(nextClickTime, volumeRef.current);
        nextClickTime += secsPerClick;
      }
    }, 25);
    return () => clearInterval(id);
  // volumeRef is a stable ref — intentionally excluded from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return { bpm, setBpm, on, subdivision, turnOn, turnOff, selectSubdivision };
}
