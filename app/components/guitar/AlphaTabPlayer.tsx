// app/components/guitar/AlphaTabPlayer.tsx
'use client';

import { useEffect, useRef } from 'react';
import * as alphaTab from '@coderline/alphatab';

interface AlphaTabPlayerProps {
  tab: string;
  title?: string;
}

export default function AlphaTabPlayer({ tab, title = "Tablatura" }: AlphaTabPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

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
      },
      display: {
        layoutMode: alphaTab.LayoutMode.Page,
        startBar: 1,
      }
    });

    apiRef.current = api;

    return () => {
      if (apiRef.current) {
        apiRef.current.destroy();
      }
    };
  }, [tab]);

  return (
    <div className="rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-900 shadow-2xl">
      {title && (
        <div className="bg-zinc-800 px-6 py-4 border-b border-zinc-700 font-semibold text-xl text-white">
          {title}
        </div>
      )}
      <div 
        ref={containerRef} 
        className="alphatab-container min-h-[520px] bg-white p-6"
      />
    </div>
  );
}
