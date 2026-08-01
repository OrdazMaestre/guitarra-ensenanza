'use client';

import { useEffect, useRef, useState } from 'react';
import { playNote, preloadSamples, releaseNote, switchNote } from '@/app/lib/guitarAudioEngine';
import { useMetronome } from '@/app/lib/useMetronome';
import MetronomeControls from './MetronomeControls';
import MidiInstrumentChrome from './MidiInstrumentChrome';

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

// Physical key codes → MIDI for keyboard input mode (`kbMode`). Two rows,
// like two hands on a piano — both playable at once, neither shown on the
// visible SVG octave (they're an extension of the existing invisible-note
// pattern below: B(59) and C#-E(73-76) already aren't drawn either).
//
// GRAVE (bass) — bottom row (naturals) + home row (sharps), same layout as
// before. Visible octave: C(60)-C(72). Extended down to B(59) and up through
// E(76); RightShift/Enter add one more natural+sharp pair (F/F#, 77-78),
// mirroring how the fretboard's keymap uses ShiftRight/Enter to extend a
// string by one extra fret (see FRETBOARD_KEYMAP in fretboardKeymap.ts).
//
// AGUDO (treble) — Q-row (Q..Backslash/"ç") for naturals, deliberately
// overlapping grave's top 4 naturals: Q=Comma, W=Period, E=Slash("guión"),
// R=ShiftRight (all the same MIDI note, just reachable from either row) so
// the two rows read as one continuous scale instead of jumping an extra
// octave. From T onward it keeps climbing (T=G, Y=A, U=B, I=C6, ... up to
// Backslash=A6). Digit row for sharps, physically positioned between the two
// naturals they sit above/below (Digit2 between Q/W, etc.), skipping
// Digit1/Digit4/Digit8/Minus (no black key between E-F or B-C) exactly like
// FRETBOARD_KEYMAP's row-1 digits skip nothing since frets are chromatic —
// here the skips are what make the row read as a real piano octave-and-a-half
// instead of a chromatic run. Digit2/Digit3/Digit5 likewise overlap grave's
// KeyL/Semicolon/Enter sharps for the same reason. Backspace fills the last
// natural pair's sharp (G#) since there's no digit-row key past Equal to
// align with Backslash.
const KB_KEYMAP: Record<string, number> = {
  // Grave: naturals
  'IntlBackslash': 59,
  'KeyZ': 60, 'KeyX': 62, 'KeyC': 64, 'KeyV': 65, 'KeyB': 67,
  'KeyN': 69, 'KeyM': 71, 'Comma': 72, 'KeyL': 73, 'Period': 74, 'Semicolon': 75, 'Slash': 76,
  'ShiftRight': 77,
  // Grave: sharps/flats
  'KeyS': 61, 'KeyD': 63, 'KeyG': 66, 'KeyH': 68, 'KeyJ': 70,
  'Enter': 78,
  // Agudo: naturals (C5..A6, first 4 overlap grave's Comma/Period/Slash/ShiftRight)
  'KeyQ': 72, 'KeyW': 74, 'KeyE': 76, 'KeyR': 77, 'KeyT': 79, 'KeyY': 81, 'KeyU': 83,
  'KeyI': 84, 'KeyO': 86, 'KeyP': 88, 'BracketLeft': 89, 'BracketRight': 91, 'Backslash': 93,
  // Agudo: sharps/flats (Digit2/3/5 overlap grave's KeyL/Semicolon/Enter)
  'Digit2': 73, 'Digit3': 75, 'Digit5': 78, 'Digit6': 80, 'Digit7': 82,
  'Digit9': 85, 'Digit0': 87, 'Equal': 90, 'Backspace': 92,
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

const MAX_TOUCH_VOICES = 3;

// Physical-keyboard note highlighting: a played note's octave rarely matches
// the single visible SVG key for its note name (that key is always drawn at
// one specific octave — two, for C, at each end of the octave), so instead
// of a full-key fill swap we light a slice of the key indicating which
// octave was actually played, relative to the "home" octave 4-5 span drawn
// on the keyboard. Mouse/touch input keeps the simple full-key fill
// (ptPressedMidis) — EXCEPT for the one key drawn twice (C, at both ends of
// the octave): whichever C is played, by any input method, the *other* C
// also lights up at its own fixed height (bottom-half for the left/lower
// one, top-half for the right/higher one) as a sympathetic reminder that
// both represent the same note name.
type KbZone = 'bottom-edge' | 'bottom-half' | 'top-half' | 'top-edge';

const C_LEFT_MIDI = 60;
const C_RIGHT_MIDI = 72;

function noteOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

function kbZoneForOctave(oct: number): KbZone {
  if (oct <= 3) return 'bottom-edge';
  if (oct === 4) return 'bottom-half';
  if (oct === 5) return 'top-half';
  return 'top-edge';
}

// Finds which drawn key (white or black) represents the same note name as
// `midi`, picking the nearest one when a note name is drawn twice (only C,
// at both ends of the octave).
function nearestRectMidi(midi: number): number | undefined {
  const pitchClass = ((midi % 12) + 12) % 12;
  let best: number | undefined;
  for (const k of [...WHITE_KEYS, ...BLACK_KEYS]) {
    if (k.midi % 12 !== pitchClass) continue;
    if (best === undefined || Math.abs(k.midi - midi) < Math.abs(best - midi)) best = k.midi;
  }
  return best;
}

// Given a drawn key's midi, returns the OTHER drawn C key + its fixed zone,
// only when `rectMidi` is one of the two C keys — undefined otherwise.
function cSibling(rectMidi: number): { rectMidi: number; zone: KbZone } | undefined {
  if (rectMidi === C_LEFT_MIDI) return { rectMidi: C_RIGHT_MIDI, zone: 'top-half' };
  if (rectMidi === C_RIGHT_MIDI) return { rectMidi: C_LEFT_MIDI, zone: 'bottom-half' };
  return undefined;
}

export default function MiniKeyboard({ className, showEnharmonics, showScaleArrows }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const ptVoicesRef = useRef(new Map<number, { midi: number; voiceId: number }>());
  const [ptPressedMidis, setPtPressedMidis] = useState<Set<number>>(new Set());
  const [kbZones, setKbZones] = useState<Map<number, Set<KbZone>>>(new Map());
  const [volume, setVolume] = useState(1.0);
  const [kbMode, setKbMode] = useState(false);
  const [kbGhostWarn, setKbGhostWarn] = useState(false);
  const kbVoiceMapRef = useRef(new Map<string, number>());
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  const metr = useMetronome();

  const viewH = showScaleArrows ? 220 : 160;

  function syncPressedMidis() {
    const pt = new Set<number>();
    for (const { midi } of ptVoicesRef.current.values()) pt.add(midi);
    setPtPressedMidis(pt);

    const zones = new Map<number, Set<KbZone>>();
    function addZone(rectMidi: number, zone: KbZone) {
      if (!zones.has(rectMidi)) zones.set(rectMidi, new Set());
      zones.get(rectMidi)!.add(zone);
    }

    // Keyboard-driven: full octave-zone system.
    for (const code of kbVoiceMapRef.current.keys()) {
      const midi = KB_KEYMAP[code];
      if (midi === undefined) continue;
      const rectMidi = nearestRectMidi(midi);
      if (rectMidi === undefined) continue;
      addZone(rectMidi, kbZoneForOctave(noteOctave(midi)));
      const sibling = cSibling(rectMidi);
      if (sibling) addZone(sibling.rectMidi, sibling.zone);
    }

    // Pointer/touch-driven: every other note keeps the plain full-key fill
    // (ptPressedMidis, unchanged) — only C's sympathetic sibling highlight
    // is added here.
    for (const midi of pt) {
      const sibling = cSibling(midi);
      if (sibling) addZone(sibling.rectMidi, sibling.zone);
    }

    setKbZones(zones);
  }

  useEffect(() => {
    return () => {
      ptVoicesRef.current.forEach(({ voiceId }) => { if (voiceId >= 0) releaseNote(voiceId); });
      ptVoicesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(() => preloadSamples());
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => preloadSamples(), 300);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!kbMode && !metr.on) return;
    function handleArrow(e: KeyboardEvent) {
      if (e.code === 'ArrowLeft') { e.preventDefault(); metr.setBpm(b => Math.max(30, b - 5)); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); metr.setBpm(b => Math.min(100, b + 5)); }
    }
    window.addEventListener('keydown', handleArrow);
    return () => window.removeEventListener('keydown', handleArrow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbMode, metr.on]);

  useEffect(() => {
    if (!kbMode) return;
    function down(e: KeyboardEvent) {
      e.preventDefault();
      if (e.repeat || kbVoiceMapRef.current.has(e.code)) return;
      const midi = KB_KEYMAP[e.code];
      if (midi === undefined) return;
      kbVoiceMapRef.current.set(e.code, -1);
      syncPressedMidis();
      setKbGhostWarn(kbVoiceMapRef.current.size >= 2);
      playNote(midi, true, volumeRef.current).then(id => {
        if (kbVoiceMapRef.current.has(e.code)) kbVoiceMapRef.current.set(e.code, id);
        else releaseNote(id);
      });
    }
    function up(e: KeyboardEvent) {
      e.preventDefault();
      const id = kbVoiceMapRef.current.get(e.code) ?? -1;
      kbVoiceMapRef.current.delete(e.code);
      if (id >= 0) releaseNote(id);
      syncPressedMidis();
      setKbGhostWarn(kbVoiceMapRef.current.size >= 2);
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      kbVoiceMapRef.current.forEach(id => { if (id >= 0) releaseNote(id); });
      kbVoiceMapRef.current.clear();
      syncPressedMidis();
      setKbGhostWarn(false);
    };
  }, [kbMode]);

  async function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const coords = getSvgCoords(e, svg);
    if (!coords) return;
    const key = keyAtCoords(coords.x, coords.y);
    if (!key) return;
    if (ptVoicesRef.current.has(e.pointerId)) return;
    if (ptVoicesRef.current.size >= MAX_TOUCH_VOICES) return;

    // Capture synchronously so drag works across key boundaries
    svg.setPointerCapture(e.pointerId);
    ptVoicesRef.current.set(e.pointerId, { midi: key.midi, voiceId: -1 });
    syncPressedMidis();

    const id = await playNote(key.midi, true, volumeRef.current);
    const cur = ptVoicesRef.current.get(e.pointerId);
    if (cur && cur.voiceId === -1) {
      ptVoicesRef.current.set(e.pointerId, { midi: cur.midi, voiceId: id });
    } else {
      releaseNote(id);
    }
  }

  async function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const cur = ptVoicesRef.current.get(e.pointerId);
    if (!cur) return;
    const svg = svgRef.current;
    if (!svg) return;
    const coords = getSvgCoords(e, svg);
    if (!coords) return;
    const key = keyAtCoords(coords.x, coords.y);
    if (!key || key.midi === cur.midi) return;

    ptVoicesRef.current.set(e.pointerId, { midi: key.midi, voiceId: -1 });
    syncPressedMidis();
    const id = await switchNote(cur.voiceId, key.midi, true, volumeRef.current);
    const cur2 = ptVoicesRef.current.get(e.pointerId);
    if (cur2 && cur2.voiceId === -1 && cur2.midi === key.midi) {
      ptVoicesRef.current.set(e.pointerId, { midi: key.midi, voiceId: id });
    } else {
      releaseNote(id);
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const cur = ptVoicesRef.current.get(e.pointerId);
    if (!cur) return;
    ptVoicesRef.current.delete(e.pointerId);
    syncPressedMidis();
    if (cur.voiceId >= 0) releaseNote(cur.voiceId);
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setVolume(Number(e.target.value));
  }

  return (
    <div className={className} style={{ display: 'block' }}>
    <div className="midi-instrument-host">
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
            fill={ptPressedMidis.has(k.midi) ? '#b8e8c4' : '#f7f8fb'}
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
            fill={ptPressedMidis.has(k.midi) ? '#5a9e6a' : '#d1d5db'}
          />
        ))}
      </g>

      {/* Keyboard-input octave zones — bottom/top half or edge slice per key, never used for mouse/touch */}
      <g data-testid="kb-zones" pointerEvents="none">
        {[...WHITE_KEYS, ...BLACK_KEYS].flatMap((k) => {
          const zones = kbZones.get(k.midi);
          if (!zones || zones.size === 0) return [];
          const halfH = k.h / 2;
          const edgeH = Math.max(10, k.h * 0.14);
          const elems: React.ReactNode[] = [];
          if (zones.has('bottom-half')) {
            elems.push(<rect key={`${k.midi}-bh`} x={k.x} y={KEY_Y + k.h - halfH} width={k.w} height={halfH} rx="8" fill="#b8e8c4" opacity={0.9} />);
          }
          if (zones.has('top-half')) {
            elems.push(<rect key={`${k.midi}-th`} x={k.x} y={KEY_Y} width={k.w} height={halfH} rx="8" fill="#b8e8c4" opacity={0.9} />);
          }
          if (zones.has('bottom-edge')) {
            elems.push(<rect key={`${k.midi}-be`} x={k.x} y={KEY_Y + k.h - edgeH} width={k.w} height={edgeH} rx="6" fill="#fbbf24" />);
          }
          if (zones.has('top-edge')) {
            elems.push(<rect key={`${k.midi}-te`} x={k.x} y={KEY_Y} width={k.w} height={edgeH} rx="6" fill="#fbbf24" />);
          }
          return elems;
        })}
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
      <MidiInstrumentChrome
        warning={kbMode && kbGhostWarn && (
          <span style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
            ⚠ Necesitas teclado gaming para tocar ciertos acordes
          </span>
        )}
      >
        <button
          onClick={() => setKbMode(m => !m)}
          style={{ background: kbMode ? '#047857' : 'transparent', border: `1.5px solid ${kbMode ? '#047857' : '#9ca3af'}`, borderRadius: '5px', color: kbMode ? '#fff' : '#6b7280', cursor: 'pointer', fontSize: '12px', fontWeight: 700, lineHeight: 1.4, padding: '3px 8px' }}
        >
          KEYBOARD
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
      </MidiInstrumentChrome>
    </div>
    </div>
  );
}
