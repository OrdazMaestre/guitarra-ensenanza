'use client';

import { useEffect, useRef, useState } from 'react';
import { playNote, preloadSamples, releaseNote, switchNote } from '@/app/lib/guitarAudioEngine';
import { useMetronome } from '@/app/lib/useMetronome';
import MetronomeControls from './MetronomeControls';

// Key geometry copied exactly from doce-notas-teclado.svg / patron-tonos-semitonos.svg
const WHITE_KEYS = [
  { midi: 60, label: 'C', x: 25,  w: 75,  h: 140, textX: 50  },
  { midi: 62, label: 'D', x: 100, w: 100, h: 140, textX: 150 },
  { midi: 64, label: 'E', x: 200, w: 75,  h: 140, textX: 250 },
  { midi: 65, label: 'F', x: 275, w: 75,  h: 140, textX: 300 },
  { midi: 67, label: 'G', x: 350, w: 100, h: 140, textX: 400 },
  { midi: 69, label: 'A', x: 450, w: 100, h: 140, textX: 500 },
  { midi: 71, label: 'B', x: 550, w: 75,  h: 140, textX: 600 },
  { midi: 72, label: 'C', x: 625, w: 50,  h: 140, textX: 650 },
];

const BLACK_KEYS = [
  { midi: 61, x: 75,  w: 50, h: 115, cx: 100, sharp: 'C#', flat: 'Db' },
  { midi: 63, x: 175, w: 50, h: 115, cx: 200, sharp: 'D#', flat: 'Eb' },
  { midi: 66, x: 325, w: 50, h: 115, cx: 350, sharp: 'F#', flat: 'Gb' },
  { midi: 68, x: 425, w: 50, h: 115, cx: 450, sharp: 'G#', flat: 'Ab' },
  { midi: 70, x: 525, w: 50, h: 115, cx: 550, sharp: 'A#', flat: 'Bb' },
];

// Arrows for the patron-tonos-semitonos.svg variant (EscalasPage)
const SCALE_ARROWS = [
  { d: 'M50 162 Q100 182 150 162',  tx: 100, label: '1 TONO',   half: false },
  { d: 'M150 162 Q200 182 250 162', tx: 200, label: '1 TONO',   half: false },
  { d: 'M250 162 Q275 172 300 162', tx: 275, label: '1/2 TONO', half: true  },
  { d: 'M300 162 Q350 182 400 162', tx: 350, label: '1 TONO',   half: false },
  { d: 'M400 162 Q450 182 500 162', tx: 450, label: '1 TONO',   half: false },
  { d: 'M500 162 Q550 182 600 162', tx: 550, label: '1 TONO',   half: false },
  { d: 'M600 162 Q625 172 650 162', tx: 625, label: '1/2 TONO', half: true  },
];

const KEY_Y = 10;

// Physical key codes → MIDI for keyboard input mode.
// Visible octave: C(60)–C(72). Extra invisible notes: B(59) on the left, C#–E(73-76) on the right.
const KB_KEYMAP: Record<string, number> = {
  'IntlBackslash': 59,
  'KeyZ': 60, 'KeyS': 61, 'KeyX': 62, 'KeyD': 63, 'KeyC': 64,
  'KeyV': 65, 'KeyG': 66, 'KeyB': 67, 'KeyH': 68, 'KeyN': 69,
  'KeyJ': 70, 'KeyM': 71, 'Comma': 72,
  'KeyL': 73, 'Period': 74, 'Semicolon': 75, 'Slash': 76,
};

interface Props {
  className?: string;
  showEnharmonics?: boolean; // true → shows # and b names on black keys (Escalas)
  showScaleArrows?: boolean; // true → shows tone/semitone arrows below (Escalas)
}

function getSvgCoords(
  e: React.PointerEvent<SVGSVGElement>,
  svg: SVGSVGElement
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const r = pt.matrixTransform(ctm.inverse());
  return { x: r.x, y: r.y };
}

function keyAtCoords(x: number, y: number): { midi: number } | null {
  // Black keys are visually on top → check them first
  const black = BLACK_KEYS.find(
    (k) => x >= k.x && x <= k.x + k.w && y >= KEY_Y && y <= KEY_Y + k.h
  );
  if (black) return black;
  return (
    WHITE_KEYS.find(
      (k) => x >= k.x && x <= k.x + k.w && y >= KEY_Y && y <= KEY_Y + k.h
    ) ?? null
  );
}

export default function MiniKeyboard({ className, showEnharmonics, showScaleArrows }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const voiceIdRef = useRef<number>(-1);
  const currentMidiRef = useRef<number>(-1);
  const isHeldRef = useRef(false);
  const [pressedMidi, setPressedMidi] = useState<number>(-1);
  const [volume, setVolume] = useState(1.0);
  const [kbMode, setKbMode] = useState(false);
  const kbVoiceMapRef = useRef(new Map<string, number>());
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  const metr = useMetronome(volumeRef);

  const viewH = showScaleArrows ? 220 : 160;

  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(() => preloadSamples());
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => preloadSamples(), 300);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!kbMode) return;
    function down(e: KeyboardEvent) {
      if (e.repeat || kbVoiceMapRef.current.has(e.code)) return;
      const midi = KB_KEYMAP[e.code];
      if (midi === undefined) return;
      e.preventDefault();
      kbVoiceMapRef.current.set(e.code, -1);
      if (midi >= 60 && midi <= 72) setPressedMidi(midi);
      playNote(midi, true, volumeRef.current).then(id => {
        if (kbVoiceMapRef.current.has(e.code)) kbVoiceMapRef.current.set(e.code, id);
        else releaseNote(id);
      });
    }
    function up(e: KeyboardEvent) {
      const id = kbVoiceMapRef.current.get(e.code) ?? -1;
      kbVoiceMapRef.current.delete(e.code);
      if (id >= 0) releaseNote(id);
      if (kbVoiceMapRef.current.size === 0) setPressedMidi(-1);
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      kbVoiceMapRef.current.forEach(id => { if (id >= 0) releaseNote(id); });
      kbVoiceMapRef.current.clear();
      setPressedMidi(-1);
    };
  }, [kbMode]);

  async function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const coords = getSvgCoords(e, svg);
    if (!coords) return;
    const key = keyAtCoords(coords.x, coords.y);
    if (!key) return;

    // Capture synchronously so drag works across key boundaries
    svg.setPointerCapture(e.pointerId);
    isHeldRef.current = true;
    currentMidiRef.current = key.midi;
    setPressedMidi(key.midi);

    const id = await playNote(key.midi, true, volume);
    voiceIdRef.current = id;
  }

  async function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!isHeldRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const coords = getSvgCoords(e, svg);
    if (!coords) return;
    const key = keyAtCoords(coords.x, coords.y);
    if (!key || key.midi === currentMidiRef.current) return;

    currentMidiRef.current = key.midi;
    setPressedMidi(key.midi);
    const id = await switchNote(voiceIdRef.current, key.midi, true, volume);
    voiceIdRef.current = id;
  }

  function onPointerUp() {
    if (!isHeldRef.current) return;
    isHeldRef.current = false;
    setPressedMidi(-1);
    currentMidiRef.current = -1;
    if (voiceIdRef.current >= 0) {
      releaseNote(voiceIdRef.current);
      voiceIdRef.current = -1;
    }
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setVolume(Number(e.target.value));
  }

  return (
    <div className={className} style={{ display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', paddingBottom: '8px' }}>
        <button
          onClick={() => setKbMode(m => !m)}
          style={{ background: kbMode ? '#047857' : 'transparent', border: `1.5px solid ${kbMode ? '#047857' : '#9ca3af'}`, borderRadius: '5px', color: kbMode ? '#fff' : '#6b7280', cursor: 'pointer', fontSize: '12px', fontWeight: 700, lineHeight: 1.4, padding: '3px 8px' }}
        >
          {kbMode ? 'KB: ON' : 'KB'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#080808', minWidth: '46px', textAlign: 'right' }}>
            Vol {Math.round(volume * 100)}
          </span>
          <input
            aria-label="Volumen del teclado"
            max="1"
            min="0"
            step="0.05"
            style={{ accentColor: '#047857', cursor: 'pointer', width: '112px' }}
            type="range"
            value={volume}
            onChange={handleVolumeChange}
          />
        </label>
        <MetronomeControls {...metr} />
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 700 ${viewH}`}
      role="img"
      aria-label={
        showScaleArrows
          ? 'Patrón de tonos y semitonos en Do Mayor. Pulsa las teclas para escuchar.'
          : 'Las doce notas en forma de teclado. Pulsa las teclas para escuchar.'
      }
      style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', userSelect: 'none', cursor: 'pointer' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <rect width="700" height={viewH} fill="#ffffff" />

      {/* White keys */}
      <g stroke="#7c8798" strokeWidth="1.4">
        {WHITE_KEYS.map((k) => (
          <rect
            key={k.midi}
            x={k.x}
            y={KEY_Y}
            width={k.w}
            height={k.h}
            rx="8"
            fill={pressedMidi === k.midi ? '#b8e8c4' : '#f7f8fb'}
          />
        ))}
      </g>

      {/* Black keys — rendered after white so they appear on top */}
      <g stroke="#7c8798" strokeWidth="1.4">
        {BLACK_KEYS.map((k) => (
          <rect
            key={k.midi}
            x={k.x}
            y={KEY_Y}
            width={k.w}
            height={k.h}
            rx="8"
            fill={pressedMidi === k.midi ? '#5a9e6a' : '#d1d5db'}
          />
        ))}
      </g>

      {/* White key labels */}
      <g
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="800"
        fill="#14213d"
        textAnchor="middle"
        pointerEvents="none"
      >
        {WHITE_KEYS.map((k) => (
          <text key={k.midi} x={k.textX} y="72" fontSize="26">
            {k.label}
          </text>
        ))}
      </g>

      {/* Black key labels */}
      <g
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fill="#14213d"
        textAnchor="middle"
        pointerEvents="none"
      >
        {showEnharmonics
          ? BLACK_KEYS.map((k) => (
              <g key={k.midi}>
                <text x={k.cx} y="50" fontSize="20">{k.sharp}</text>
                <text x={k.cx} y="95" fontSize="20">{k.flat}</text>
              </g>
            ))
          : BLACK_KEYS.map((k) => (
              <text key={k.midi} x={k.cx} y="75" fontSize="20">
                {k.sharp}
              </text>
            ))}
      </g>

      {/* Tone/semitone arrows — only in Escalas variant */}
      {showScaleArrows && (
        <>
          <defs>
            <marker
              id="mini-kb-arrow"
              markerHeight="10"
              markerWidth="10"
              orient="auto"
              refX="8"
              refY="5"
            >
              <path
                d="M1,1 L8,5 L1,9"
                fill="none"
                stroke="#17213a"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </marker>
          </defs>
          <g
            fill="none"
            markerEnd="url(#mini-kb-arrow)"
            stroke="#17213a"
            strokeLinecap="round"
            strokeWidth="1.8"
          >
            {SCALE_ARROWS.map((a, i) => (
              <path key={i} d={a.d} />
            ))}
          </g>
          <g
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="16"
            textAnchor="middle"
          >
            {SCALE_ARROWS.map((a, i) => (
              <text key={i} x={a.tx} y="212" fill={a.half ? '#dc2626' : '#17213a'}>
                {a.label}
              </text>
            ))}
          </g>
        </>
      )}
    </svg>
    </div>
  );
}
