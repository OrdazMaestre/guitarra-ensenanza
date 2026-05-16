// app/components/guitar/AlphaTabPlayer.tsx
'use client';

import { useEffect, useRef } from 'react';
import * as alphaTab from '@coderline/alphatab';

interface AlphaTabPlayerProps {
  tab: string;           // Contenido de la tablatura en formato alphaTab
  title?: string;
  className?: string;
}

export default function AlphaTabPlayer({ tab, title = "Tablatura", className = "" }: AlphaTabPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const settings = {
      file: null,
      core: {
        fontDirectory: '/alphatab-fonts', // Se configurará más adelante
      },
      player: {
        enablePlayer: true,
        soundFont: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@1/dist/soundfont/sonivox.sf2',
      },
      display: {
        layoutMode: alphaTab.LayoutMode.Page,
        startBar: 1,
      }
    };

    const api = new alphaTab.AlphaTabApi(containerRef.current, settings);
    apiRef.current = api;

    // Cargar la tablatura
    api.load(tab);

    return () => {
      if (apiRef.current) {
        apiRef.current.destroy();
      }
    };
  }, [tab]);

  return (
    <div className={`tab-container rounded-xl overflow-hidden border border-zinc-700 ${className}`}>
      {title && (
        <div className="bg-zinc-900 px-6 py-3 border-b border-zinc-700 font-semibold text-lg">
          {title}
        </div>
      )}
      <div ref={containerRef} className="alphatab-container" />
    </div>
  );
}