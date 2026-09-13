'use client';

import { useCallback, useState } from 'react';

export type NoteMarks = Record<string, string>;

// One fixed, readable color per possible pitch class — picking from the
// colors not already in use (instead of pure random RGB) guarantees every
// simultaneously-marked note gets its own distinct, legible color, and that
// "same color" always means "same note" (so toggling a marked note off by
// pressing it again never has to guess which other notes shared its color).
const MARK_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e',
  '#84cc16', '#a855f7',
];

export function useNoteMarks() {
  const [marks, setMarks] = useState<NoteMarks>({});

  const toggleMark = useCallback((noteName: string) => {
    setMarks((prev) => {
      if (prev[noteName]) {
        const next = { ...prev };
        delete next[noteName];
        return next;
      }
      const used = new Set(Object.values(prev));
      const available = MARK_COLORS.filter((c) => !used.has(c));
      const pool = available.length > 0 ? available : MARK_COLORS;
      const color = pool[Math.floor(Math.random() * pool.length)];
      return { ...prev, [noteName]: color };
    });
  }, []);

  return { marks, toggleMark };
}
