'use client';
import { useEffect, useRef, useState } from 'react';
import AlphaTabPlayer from '../../../components/guitar/AlphaTabPlayer';
import { playNote, preloadSamples, releaseNote, switchNote } from '@/app/lib/guitarAudioEngine';
import TemarioPager from '../TemarioPager';
import type { LessonPageProps } from './types';

const OPEN_STRING_MIDI: Record<number, number> = {
  1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40,
};

function getSeptimaSvgCoords(
  e: React.PointerEvent<SVGSVGElement>,
  svg: SVGSVGElement,
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const r = pt.matrixTransform(ctm.inverse());
  return { x: r.x, y: r.y };
}

const gMajorNotes = ['G', 'A', 'B', 'C', 'D', 'E', 'F#'];
const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const stringTunings = [
  { label: 'E', open: 4 },
  { label: 'B', open: 11 },
  { label: 'G', open: 7 },
  { label: 'D', open: 2 },
  { label: 'A', open: 9 },
  { label: 'E', open: 4 },
];

type SeventhChord = {
  degree: string;
  displayName?: string;
  firstFret: number;
  formula: string;
  fretCount: number;
  name: string;
  notes: string[];
  quality: string;
  seventh: string;
  voicing: Array<{
    fret: number;
    label: string;
    string: number;
  }>;
  voicingE2: Array<{
    fret: number;
    label: string;
    string: number;
  }>;
};

type CropPos = { chordName: string; fret: number; row: 'e4' | 'e2'; string: number };

const seventhChords: SeventhChord[] = [
  {
    degree: '1',
    firstFret: 1,
    formula: 'Mayor séptima',
    fretCount: 4,
    name: 'GMaj7',
    notes: ['G', 'B', 'D', 'F#'],
    quality: 'Mayor',
    seventh: 'F#',
    voicing: [
      { fret: 3, label: 'G', string: 1 },
      { fret: 3, label: 'D', string: 2 },
      { fret: 4, label: 'B', string: 3 },
      { fret: 3, label: 'F#', string: 4 },
    ],
    voicingE2: [
      { fret: 3, label: 'G', string: 6 },
      { fret: 5, label: 'D', string: 5 },
      { fret: 4, label: 'F#', string: 4 },
      { fret: 4, label: 'B', string: 3 },
    ],
  },
  {
    degree: '2',
    firstFret: 4,
    formula: 'menor séptima',
    fretCount: 5,
    name: 'Am7',
    notes: ['A', 'C', 'E', 'G'],
    quality: 'menor',
    seventh: 'G',
    voicing: [
      { fret: 5, label: 'A', string: 1 },
      { fret: 5, label: 'E', string: 2 },
      { fret: 5, label: 'C', string: 3 },
      { fret: 5, label: 'G', string: 4 },
    ],
    voicingE2: [
      { fret: 5, label: 'A', string: 6 },
      { fret: 7, label: 'E', string: 5 },
      { fret: 5, label: 'G', string: 4 },
      { fret: 5, label: 'C', string: 3 },
    ],
  },
  {
    degree: '3',
    firstFret: 6,
    formula: 'menor séptima',
    fretCount: 3,
    name: 'Bm7',
    notes: ['B', 'D', 'F#', 'A'],
    quality: 'menor',
    seventh: 'A',
    voicing: [
      { fret: 7, label: 'B', string: 1 },
      { fret: 7, label: 'F#', string: 2 },
      { fret: 7, label: 'D', string: 3 },
      { fret: 7, label: 'A', string: 4 },
    ],
    voicingE2: [
      { fret: 7, label: 'B', string: 6 },
      { fret: 9, label: 'F#', string: 5 },
      { fret: 7, label: 'A', string: 4 },
      { fret: 7, label: 'D', string: 3 },
    ],
  },
  {
    degree: '4',
    firstFret: 8,
    formula: 'Mayor séptima',
    fretCount: 4,
    name: 'CMaj7',
    notes: ['C', 'E', 'G', 'B'],
    quality: 'Mayor',
    seventh: 'B',
    voicing: [
      { fret: 8, label: 'C', string: 1 },
      { fret: 8, label: 'G', string: 2 },
      { fret: 9, label: 'E', string: 3 },
      { fret: 8, label: 'B', string: 4 },
    ],
    voicingE2: [
      { fret: 8, label: 'C', string: 6 },
      { fret: 10, label: 'G', string: 5 },
      { fret: 9, label: 'B', string: 4 },
      { fret: 9, label: 'E', string: 3 },
    ],
  },
  {
    degree: '5',
    firstFret: 10,
    formula: 'DOMINANTE séptima',
    fretCount: 4,
    name: 'D7',
    notes: ['D', 'F#', 'A', 'C'],
    quality: 'dominante',
    seventh: 'C',
    voicing: [
      { fret: 10, label: 'D', string: 1 },
      { fret: 11, label: 'A', string: 2 },
      { fret: 10, label: 'F#', string: 3 },
      { fret: 10, label: 'C', string: 4 },
    ],
    voicingE2: [
      { fret: 10, label: 'D', string: 6 },
      { fret: 12, label: 'A', string: 5 },
      { fret: 10, label: 'C', string: 4 },
      { fret: 11, label: 'F#', string: 3 },
    ],
  },
  {
    degree: '6',
    firstFret: 0,
    formula: 'menor séptima',
    fretCount: 3,
    name: 'Em7',
    notes: ['E', 'G', 'B', 'D'],
    quality: 'menor',
    seventh: 'D',
    voicing: [
      { fret: 0, label: 'E', string: 1 },
      { fret: 0, label: 'B', string: 2 },
      { fret: 0, label: 'G', string: 3 },
      { fret: 0, label: 'D', string: 4 },
    ],
    voicingE2: [
      { fret: 0, label: 'E', string: 6 },
      { fret: 2, label: 'B', string: 5 },
      { fret: 0, label: 'D', string: 4 },
      { fret: 0, label: 'G', string: 3 },
    ],
  },
  {
    degree: '7',
    displayName: 'F# semi-disminuido',
    firstFret: 1,
    formula: 'semi-disminuido',
    fretCount: 4,
    name: 'F#m7b5',
    notes: ['F#', 'A', 'C', 'E'],
    quality: 'semi-disminuido',
    seventh: 'E',
    voicing: [
      { fret: 2, label: 'F#', string: 1 },
      { fret: 1, label: 'C', string: 2 },
      { fret: 2, label: 'A', string: 3 },
      { fret: 2, label: 'E', string: 4 },
    ],
    voicingE2: [
      { fret: 2, label: 'F#', string: 6 },
      { fret: 3, label: 'C', string: 5 },
      { fret: 2, label: 'E', string: 4 },
      { fret: 2, label: 'A', string: 3 },
    ],
  },
];

const positionedChordNames = ['Em7', 'F#m7b5', 'GMaj7', 'Am7', 'Bm7', 'CMaj7', 'D7'] as const;
const positionedChords = positionedChordNames.map((name) => seventhChords.find((chord) => chord.name === name)!);
const chordCropRanges: Record<string, { end: number; labelX: number; start: number }> = {
  Em7: { end: 0, labelX: 82, start: 0 },
  'F#m7b5': { end: 2, labelX: 202, start: 1 },
  GMaj7: { end: 4, labelX: 392, start: 3 },
  Am7: { end: 5, labelX: 548, start: 5 },
  Bm7: { end: 7, labelX: 724, start: 7 },
  CMaj7: { end: 9, labelX: 892, start: 8 },
  D7: { end: 11, labelX: 1070, start: 10 },
};

const seventhProgressionTab = `\\title "Acordes con séptima"
\\tempo 68
.
:2
(4.4 4.3 3.2 3.1){ch "GMaj7"} |
(5.4 5.3 5.2 5.1){ch "Am7"} |
(7.4 7.3 7.2 7.1){ch "Bm7"} |
(8.4 9.3 8.2 8.1){ch "CMaj7"} |
(10.4 11.3 10.2 10.1){ch "D7"} |
(0.4 0.3 0.2 0.1){ch "Em7"} |
(2.4 2.3 1.2 2.1){ch "F#m7b5"} |
(4.4 4.3 3.2 3.1){ch "GMaj7"} |`;

const seventhProgressionE2Tab = `\\title "Acordes con séptima E2"
\\tempo 68
.
:2
(3.6 4.4 4.3 3.2){ch "GMaj7"} |
(5.6 5.4 5.3 5.2){ch "Am7"} |
(7.6 7.4 7.3 7.2){ch "Bm7"} |
(8.6 9.4 9.3 8.2){ch "CMaj7"} |
(10.6 10.4 11.3 10.2){ch "D7"} |
(0.6 0.4 0.3 0.2){ch "Em7"} |
(2.6 2.4 2.3 1.2){ch "F#m7b5"} |
(3.6 4.4 4.3 3.2){ch "GMaj7"} |`;

function noteNameForFret(open: number, fret: number) {
  return chromaticNotes[(open + fret) % chromaticNotes.length];
}

function ScaleWithChordPositions() {
  const boardX = 58;
  const boardY = 232;
  const fretWidth = 92;
  const boardWidth = fretWidth * 12;
  const boardHeight = 174;
  const stringGap = boardHeight / 5;
  const e4Row = { label: 'E4', mode: 'chordNotes', top: 44 } as const;
  const e2Row = { label: 'E2', mode: 'lowShape', top: 470 } as const;
  const miniFretWidth = 42;
  const miniStringGap = 22;
  const miniHeight = miniStringGap * 5;
  const viewBoxWidth = boardX + boardWidth + 74;
  const viewBoxHeight = e2Row.top + 26 + miniHeight + 34;
  const stringY = (string: number) => boardY + (string - 1) * stringGap;
  const fretX = (fret: number) => (fret === 0 ? boardX - 28 : boardX + (fret - 0.5) * fretWidth);

  const svgRef = useRef<SVGSVGElement>(null);
  const voiceIdRef = useRef(-1);
  const curPosRef = useRef<{ string: number; fret: number } | null>(null);
  const isHeldRef = useRef(false);
  const [pressedPos, setPressedPos] = useState<{ string: number; fret: number } | null>(null);
  const cropVoiceIdRef = useRef(-1);
  const curCropRef = useRef<CropPos | null>(null);
  const isCropHeldRef = useRef(false);
  const [pressedCrop, setPressedCrop] = useState<CropPos | null>(null);

  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(() => preloadSamples());
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => preloadSamples(), 300);
    return () => window.clearTimeout(id);
  }, []);

  function getPos(e: React.PointerEvent<SVGSVGElement>): { string: number; fret: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const coords = getSeptimaSvgCoords(e, svg);
    if (!coords) return null;
    const { x, y } = coords;
    const halfGap = stringGap / 2;
    // Only main board zone — mini crops are at y≈44-180 and y≈470+, safely outside
    if (y < boardY - halfGap || y > boardY + boardHeight + halfGap) return null;
    const string = Math.max(1, Math.min(6, Math.round((y - boardY) / stringGap) + 1));
    let fret: number;
    if (x < boardX) {
      if (x < boardX - 44) return null;
      fret = 0;
    } else {
      const colIndex = Math.floor((x - boardX) / fretWidth);
      fret = colIndex + 1;
      if (fret > 12) return null;
    }
    return { string, fret };
  }

  function getCropPos(e: React.PointerEvent<SVGSVGElement>): CropPos | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const coords = getSeptimaSvgCoords(e, svg);
    if (!coords) return null;
    const { x, y } = coords;
    let rowKey: 'e4' | 'e2';
    let top: number;
    if (y >= e4Row.top + 26 && y <= e4Row.top + 26 + miniHeight) {
      rowKey = 'e4';
      top = e4Row.top;
    } else if (y >= e2Row.top + 26 && y <= e2Row.top + 26 + miniHeight) {
      rowKey = 'e2';
      top = e2Row.top;
    } else {
      return null;
    }
    for (const chord of positionedChords) {
      const range = chordCropRanges[chord.name];
      const fretCount = range.end - range.start + 1;
      const cropWidth = fretCount * miniFretWidth;
      const cropX = range.labelX - cropWidth / 2;
      const openLeft = range.start === 0 ? cropX - 34 : cropX;
      if (x < openLeft || x > cropX + cropWidth) continue;
      const string = Math.max(1, Math.min(6, Math.round((y - (top + 26)) / miniStringGap) + 1));
      let fret: number;
      if (x < cropX) {
        fret = 0;
      } else {
        const colIndex = Math.floor((x - cropX) / miniFretWidth);
        fret = range.start + colIndex;
        if (fret > range.end) continue;
      }
      return { chordName: chord.name, fret, row: rowKey, string };
    }
    return null;
  }

  async function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const pos = getPos(e);
    if (pos) {
      svg.setPointerCapture(e.pointerId);
      isHeldRef.current = true;
      curPosRef.current = pos;
      setPressedPos(pos);
      const id = await playNote(OPEN_STRING_MIDI[pos.string] + pos.fret, false);
      voiceIdRef.current = id;
      if (!isHeldRef.current) { releaseNote(id); voiceIdRef.current = -1; }
      return;
    }
    const cropPos = getCropPos(e);
    if (!cropPos) return;
    svg.setPointerCapture(e.pointerId);
    isCropHeldRef.current = true;
    curCropRef.current = cropPos;
    setPressedCrop(cropPos);
    const id = await playNote(OPEN_STRING_MIDI[cropPos.string] + cropPos.fret, false);
    cropVoiceIdRef.current = id;
    if (!isCropHeldRef.current) { releaseNote(id); cropVoiceIdRef.current = -1; }
  }

  async function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (isHeldRef.current) {
      const pos = getPos(e);
      if (!pos) return;
      const cur = curPosRef.current;
      if (cur && cur.string === pos.string && cur.fret === pos.fret) return;
      curPosRef.current = pos;
      setPressedPos(pos);
      const id = await switchNote(voiceIdRef.current, OPEN_STRING_MIDI[pos.string] + pos.fret, false);
      voiceIdRef.current = id;
      if (!isHeldRef.current) { releaseNote(id); voiceIdRef.current = -1; }
    } else if (isCropHeldRef.current) {
      const cropPos = getCropPos(e);
      if (!cropPos) return;
      const cur = curCropRef.current;
      if (cur && cur.chordName === cropPos.chordName && cur.string === cropPos.string && cur.fret === cropPos.fret) return;
      curCropRef.current = cropPos;
      setPressedCrop(cropPos);
      const id = await switchNote(cropVoiceIdRef.current, OPEN_STRING_MIDI[cropPos.string] + cropPos.fret, false);
      cropVoiceIdRef.current = id;
      if (!isCropHeldRef.current) { releaseNote(id); cropVoiceIdRef.current = -1; }
    }
  }

  function onPointerUp() {
    if (isHeldRef.current) {
      isHeldRef.current = false;
      curPosRef.current = null;
      setPressedPos(null);
      if (voiceIdRef.current >= 0) { releaseNote(voiceIdRef.current); voiceIdRef.current = -1; }
    }
    if (isCropHeldRef.current) {
      isCropHeldRef.current = false;
      curCropRef.current = null;
      setPressedCrop(null);
      if (cropVoiceIdRef.current >= 0) { releaseNote(cropVoiceIdRef.current); cropVoiceIdRef.current = -1; }
    }
  }

  function interactionOverlay() {
    if (!pressedPos) return null;
    const { string, fret } = pressedPos;
    const markerX = fretX(fret);
    const sy = stringY(string);
    const noteIsMarked = scaleNotes.some(n => n.string === string && n.fret === fret);
    return (
      <g
        pointerEvents="none"
        style={{ animation: 'fretboard-string-vibrate 80ms linear infinite' }}
      >
        <line
          x1={markerX}
          x2={boardX + boardWidth}
          y1={sy}
          y2={sy}
          stroke="#fbbf24"
          strokeLinecap="round"
          strokeWidth="3"
          opacity="0.85"
        />
        <circle
          cx={markerX}
          cy={sy}
          fill="#fbbf24"
          opacity={noteIsMarked ? 0.5 : 0.9}
          r="15"
        />
      </g>
    );
  }

  function cropOverlay() {
    if (!pressedCrop) return null;
    const { chordName, fret, row, string } = pressedCrop;
    const range = chordCropRanges[chordName];
    const fretCount = range.end - range.start + 1;
    const cropWidth = fretCount * miniFretWidth;
    const cropX = range.labelX - cropWidth / 2;
    const top = row === 'e4' ? e4Row.top : e2Row.top;
    const markerX = fret === 0 ? cropX - 17 : cropX + (fret - range.start + 0.5) * miniFretWidth;
    const markerY = top + 26 + (string - 1) * miniStringGap;
    const noteIsMarked = scaleNotes.some(n => n.string === string && n.fret === fret);
    return (
      <g pointerEvents="none" style={{ animation: 'fretboard-string-vibrate 80ms linear infinite' }}>
        <line
          x1={markerX} x2={cropX + cropWidth} y1={markerY} y2={markerY}
          stroke="#fbbf24" strokeLinecap="round" strokeWidth="2" opacity="0.85"
        />
        <circle cx={markerX} cy={markerY} fill="#fbbf24" opacity={noteIsMarked ? 0.5 : 0.9} r="12" />
      </g>
    );
  }

  const scaleNotes = stringTunings.flatMap((string, stringIndex) =>
    Array.from({ length: 13 }, (_, fret) => {
      const note = noteNameForFret(string.open, fret);

      return gMajorNotes.includes(note)
        ? {
            fret,
            note,
            string: stringIndex + 1,
          }
        : null;
    }).filter((item): item is { fret: number; note: string; string: number } => item !== null),
  );

  function MiniCrop({ chord, mode, top }: { chord: SeventhChord; mode: 'chordNotes' | 'lowShape'; top: number }) {
    const range = chordCropRanges[chord.name];
    const fretCount = range.end - range.start + 1;
    const cropWidth = fretCount * miniFretWidth;
    const cropX = range.labelX - cropWidth / 2;
    const cropStringY = (string: number) => top + 26 + (string - 1) * miniStringGap;
    const cropFretX = (fret: number) => (fret === 0 ? cropX - 17 : cropX + (fret - range.start + 0.5) * miniFretWidth);
    const lowShapeKeys = new Set(chord.voicingE2.map((note) => `${note.string}-${note.fret}`));
    const cropNotes = scaleNotes
      .filter((item) => item.fret >= range.start && item.fret <= range.end)
      .map((item) => ({
        ...item,
        inShape:
          mode === 'chordNotes'
            ? chord.notes.includes(item.note) && item.string !== 6
            : lowShapeKeys.has(`${item.string}-${item.fret}`) || (item.string === 2 && chord.notes.includes(item.note)),
      }));

    return (
      <g>
        <text className="mini-title" x={range.labelX} y={top - 12}>
          <tspan className="mini-degree">{chord.degree}</tspan>
          <tspan> {chord.name}</tspan>
        </text>
        <rect className="mini-bg" x={cropX} y={top + 26} width={cropWidth} height={miniHeight} />
        {[1, 2, 3, 4, 5, 6].map((string) => (
          <line className="mini-string" key={`mini-string-${chord.name}-${string}`} x1={cropX} x2={cropX + cropWidth} y1={cropStringY(string)} y2={cropStringY(string)} />
        ))}
        {Array.from({ length: fretCount + 1 }, (_, index) => (
          <line
            className={range.start === 0 && index === 0 ? 'mini-nut' : 'mini-fret'}
            key={`mini-fret-${chord.name}-${index}`}
            x1={cropX + index * miniFretWidth}
            x2={cropX + index * miniFretWidth}
            y1={top + 26}
            y2={top + 26 + miniHeight}
          />
        ))}
        {[3, 5, 7, 9, 12].filter((fret) => fret >= range.start && fret <= range.end).map((fret) => (
          <circle className="mini-guide-dot" cx={cropX + (fret - range.start + 0.5) * miniFretWidth} cy={cropStringY(3.5)} key={`mini-guide-${chord.name}-${fret}`} r="6" />
        ))}
        {cropNotes.map((note) => (
          <g key={`mini-${chord.name}-${note.string}-${note.fret}`}>
            <circle className={note.inShape ? 'mini-note mini-note-shape' : note.note === 'G' ? 'mini-note mini-note-tonic' : 'mini-note'} cx={cropFretX(note.fret)} cy={cropStringY(note.string)} r="12" />
            <text className={note.note === 'G' ? 'mini-note-label mini-tonic-label' : 'mini-note-label'} x={cropFretX(note.fret)} y={cropStringY(note.string) + 4}>
              {note.note}
            </text>
          </g>
        ))}
      </g>
    );
  }

  function MiniRow({ row }: { row: { label: string; mode: 'chordNotes' | 'lowShape'; top: number } }) {
    return (
      <g>
        <text className="mini-row-label" x="8" y={row.top + 88}>
          {row.label}
        </text>
        {positionedChords.map((chord) => (
          <MiniCrop chord={chord} key={`${row.label}-${chord.name}`} mode={row.mode} top={row.top} />
        ))}
      </g>
    );
  }

  return (
    <figure className="position-map" aria-label="Acordes con séptima colocados sobre el mástil de Sol Mayor">
      <svg
        ref={svgRef}
        className="position-board"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <MiniRow row={e4Row} />

        {Array.from({ length: 12 }, (_, fret) => (
          <text className="fret-number" key={`number-${fret + 1}`} x={boardX + fret * fretWidth + fretWidth / 2} y={boardY - 18}>
            {fret + 1}
          </text>
        ))}
        <rect className="board-bg" x={boardX} y={boardY} width={boardWidth} height={boardHeight} />
        {stringTunings.map((string, index) => (
          <g key={`${string.label}-${index}`}>
            <text className="string-label" x="22" y={stringY(index + 1) + 5}>
              {string.label}
            </text>
            <line className="string-line" x1={boardX} x2={boardX + boardWidth} y1={stringY(index + 1)} y2={stringY(index + 1)} />
          </g>
        ))}
        {Array.from({ length: 13 }, (_, fret) => (
          <line
            className={fret === 0 ? 'nut-line' : 'fret-line'}
            key={`fret-${fret}`}
            x1={boardX + fret * fretWidth}
            x2={boardX + fret * fretWidth}
            y1={boardY}
            y2={boardY + boardHeight}
          />
        ))}
        {[3, 5, 7, 9].map((fret) => (
          <circle className="guide-dot" cx={boardX + (fret - 0.5) * fretWidth} cy={stringY(3.5)} key={`guide-${fret}`} r="8" />
        ))}
        <circle className="guide-dot" cx={boardX + 11.5 * fretWidth} cy={stringY(2)} key="guide-12-top" r="8" />
        <circle className="guide-dot" cx={boardX + 11.5 * fretWidth} cy={stringY(5)} key="guide-12-bottom" r="8" />
        {([3, 5, 7, 9, 12] as const).map((fret) => (
          <text className="roman-fret" key={`roman-${fret}`} x={boardX + (fret - 0.5) * fretWidth} y={boardY + boardHeight + 22}>
            {({ 3: 'III', 5: 'V', 7: 'VII', 9: 'IX', 12: 'XII' } as Record<number, string>)[fret]}
          </text>
        ))}
        {scaleNotes.map((item) => {
          return (
            <g key={`${item.string}-${item.fret}-${item.note}`}>
              <circle
                className={item.note === 'G' ? 'note-dot note-g' : 'note-dot'}
                cx={fretX(item.fret)}
                cy={stringY(item.string)}
                r="15"
              />
              <text className={item.note === 'G' ? 'note-label note-tonic-label' : 'note-label'} x={fretX(item.fret)} y={stringY(item.string) + 5}>
                {item.note}
              </text>
            </g>
          );
        })}

        <MiniRow row={e2Row} />
        {interactionOverlay()}
        {cropOverlay()}
      </svg>
    </figure>
  );
}

export default function AcordesSeptimaPage({ previous, next }: LessonPageProps) {
  return (
    <main className="seventh-chords-page">
      <article className="seventh-chords-content">
        <header className="seventh-header">
          <p className="lesson-kicker">Ampliacion acordes</p>
          <h1>Acordes con séptima: cuatriadas</h1>
          <div className="short-copy">
            <p>La escala tiene 7 notas y 7 acordes.</p>
            <p>Cada nota y acorde tienen un número: 1, 2, 3, 4, 5, 6 y 7.</p>
            <p>Un acorde triada usa las notas 1, 3 y 5.</p>
            <p>Un acorde con séptima usa las notas 1, 3, 5 y 7.</p>
          </div>
        </header>

        <section className="position-section" aria-labelledby="position-title">
          <header className="section-header">
            <h2 id="position-title">Acordes con séptima de la escala de Sol Mayor</h2>
          </header>
          <div className="position-scroll">
            <ScaleWithChordPositions />
          </div>
        </section>

        <section className="rule-box" aria-label="Acordes triada y cuatriada">
          <p>
            <strong>acorde Sol Mayor triada (G):</strong> G, B y D.
          </p>
          <p>
            <strong>Sol Mayor cuatriada (GMaj7):</strong> G, B, D y F#.
          </p>
        </section>

        <section className="sequence-box" aria-label="Secuencia de acordes con séptima">
          <p>
            <strong>Escala de Sol Mayor</strong>
          </p>
          <p>
            <strong>Acordes Triada:</strong>{' '}G &rarr; Am &rarr; Bm &rarr; C &rarr; D &rarr; Em &rarr; F# disminuido &rarr; G.
          </p>
          <p>
            <strong>Cuatríadas:</strong>{' '}GMaj7 &rarr; Am7 &rarr; Bm7 &rarr; CMaj7 &rarr; D7 &rarr; Em7 &rarr; F# semi-disminuido &rarr; GMaj7.
          </p>
        </section>

        <section className="exercise-section" aria-labelledby="exercise-title">
          <header className="section-header">
            <p className="lesson-kicker">Ejercicios</p>
            <h2 id="exercise-title">Usando cuerda Mi agudo (E4)</h2>
          </header>
          <div className="seventh-alphatab-frame seventh-alphatab-frame-top">
            <AlphaTabPlayer compact horizontalBarWidth={82} layout="horizontal" minHeight={230} tab={seventhProgressionTab} title="Acordes con séptima" />
          </div>
          <div className="exercise-subhead">
            <h3>Usando cuerda Mi grave (E2)</h3>
          </div>
          <div className="seventh-alphatab-frame">
            <AlphaTabPlayer compact horizontalBarWidth={82} layout="horizontal" minHeight={230} tab={seventhProgressionE2Tab} title="Acordes con séptima E2" />
          </div>
        </section>
      </article>

      <div className="lesson-pager-wrap">
        <TemarioPager previous={previous} next={next} />
      </div>

      <style>{`
        .seventh-chords-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(34px, 5vw, 76px) clamp(16px, 5vw, 84px);
          width: 100%;
        }

        .seventh-chords-content,
        .lesson-pager-wrap {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 1220px;
          min-width: 0;
          width: 100%;
        }

        .seventh-chords-content {
          display: grid;
          gap: clamp(34px, 6vw, 72px);
          padding-bottom: clamp(34px, 6vw, 72px);
        }

        .lesson-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.22em;
          margin: 0;
          text-transform: uppercase;
        }

        .seventh-header,
        .section-header {
          margin: 0 auto;
          max-width: 940px;
          text-align: center;
        }

        .seventh-header h1,
        .section-header h2 {
          font-weight: 950;
          letter-spacing: 0;
          line-height: 0.96;
          margin: 12px 0 0;
          overflow-wrap: break-word;
          text-transform: uppercase;
        }

        .seventh-header h1 {
          font-size: clamp(38px, 7vw, 88px);
          text-decoration: underline;
          text-decoration-thickness: 0.06em;
          text-underline-offset: 0.12em;
        }

        .section-header h2 {
          font-size: clamp(28px, 4.6vw, 56px);
        }

        .short-copy,
        .section-header,
        .rule-box,
        .sequence-box {
          display: grid;
          gap: 10px;
        }

        .short-copy {
          margin: clamp(20px, 4vw, 32px) auto 0;
          max-width: 720px;
        }

        .short-copy p,
        .rule-box p,
        .sequence-box p,
        .section-header p {
          color: #303030;
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .rule-box,
        .sequence-box {
          border: 4px solid #2f65ad;
          border-radius: 10px;
          margin: 0 auto;
          max-width: 980px;
          padding: clamp(18px, 3vw, 28px);
          text-align: center;
          width: 100%;
        }

        .sequence-box {
          border-color: #047857;
        }

        .rule-box strong,
        .sequence-box strong {
          color: #080808;
          font-weight: 950;
        }

        .exercise-section,
        .position-section {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: clamp(20px, 4vw, 36px);
          min-width: 0;
          padding-top: clamp(24px, 4vw, 42px);
        }

        .exercise-section {
          overscroll-behavior-x: contain;
        }

        .seventh-alphatab-frame {
          border: 4px solid #2f65ad;
          border-radius: 10px 10px 56px 56px;
          margin: 0;
          min-width: 0;
          padding: clamp(10px, 2vw, 18px);
          width: 100%;
        }

        .exercise-subhead {
          display: grid;
          gap: 8px;
          margin: clamp(8px, 2vw, 16px) auto 0;
          max-width: 940px;
          text-align: center;
        }

        .exercise-subhead h3 {
          font-size: clamp(24px, 3.4vw, 42px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          text-transform: uppercase;
        }

        .position-scroll {
          min-width: 0;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          width: 100%;
        }

        .position-map {
          margin: 0 auto;
          min-width: 1236px;
          width: 1236px;
        }

        .position-board {
          display: block;
          height: auto;
          width: 100%;
        }

        .large-board {
          display: block;
          height: auto;
          max-width: none;
          width: 100%;
        }

        .mini-title,
        .mini-name,
        .mini-row-label {
          fill: #080808;
          font-size: 18px;
          font-weight: 650;
          text-anchor: middle;
        }

        .mini-degree {
          font-size: 20px;
          font-weight: 950;
        }

        .mini-row-label {
          font-size: 18px;
          font-weight: 950;
          text-anchor: start;
        }

        .mini-name {
          font-size: 14px;
          font-weight: 950;
        }

        .mini-title {
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 3px;
        }

        .mini-bg,
        .board-bg {
          fill: #27313d;
        }

        .mini-string,
        .string-line {
          stroke: #aab3bf;
          stroke-width: 3;
        }

        .mini-fret,
        .fret-line {
          stroke: #d6dce4;
          stroke-width: 4;
        }

        .mini-nut,
        .nut-line {
          stroke: #edf1f5;
          stroke-width: 8;
        }

        .mini-position,
        .fret-number,
        .string-label {
          fill: #080808;
          font-size: 16px;
          font-weight: 950;
          text-anchor: middle;
        }

        .mini-position {
          font-size: 12px;
          text-anchor: start;
        }

        .mini-note,
        .note-voiced {
          fill: #f8fafc;
          stroke: #a1a1aa;
          stroke-width: 3;
        }

        .mini-note-shape,
        .note-voiced {
          fill: #f6c453;
          stroke: #9a6b00;
          stroke-width: 4;
        }

        .mini-note-tonic {
          fill: #f8fafc;
          stroke: #2563eb;
          stroke-width: 4;
        }

        .mini-guide-dot {
          fill: #cad2dc;
          opacity: 0.78;
        }

        .mini-seventh,
        .note-seventh {
          fill: #fecaca;
          stroke: #dc2626;
          stroke-width: 5;
        }

        .mini-note-label,
        .note-label {
          fill: #080808;
          font-size: 15px;
          font-weight: 950;
          text-anchor: middle;
        }

        .fret-number,
        .string-label {
          font-size: 16px;
        }

        .guide-dot {
          fill: #cad2dc;
          opacity: 0.78;
        }

        .roman-fret {
          fill: #080808;
          font-size: 15px;
          font-weight: 950;
          text-anchor: middle;
        }

        .note-dot {
          fill: #f8fafc;
          stroke: #a1a1aa;
          stroke-width: 3;
        }

        .note-e {
          stroke: #059669;
          stroke-width: 6;
        }

        .note-g {
          stroke: #2563eb;
          stroke-width: 6;
        }

        .note-label {
          font-size: 17px;
        }

        @media (max-width: 760px) {
          .seventh-header,
          .section-header,
          .exercise-subhead,
          .rule-box,
          .sequence-box {
            text-align: left;
          }
        }

        @media (max-width: 520px) {
          .seventh-chords-content,
          .lesson-pager-wrap {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
