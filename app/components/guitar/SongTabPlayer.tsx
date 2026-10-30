'use client';
import { useEffect, useRef, useState } from 'react';
import AlphaTabPlayer from './AlphaTabPlayer';
import { DiscIcon } from './riff/RiffIcons';
import { findSong, type SongEntry } from '@/app/lib/songs';

// Reproductor de tablatura con selector de canción: un botón con un disco a la izquierda del
// todo de la barra del reproductor (prop `toolbarStart` de AlphaTabPlayer). Al elegir otra canción
// el reproductor se monta DE NUEVO (`key`), así que por dentro no cambia nada: es como abrir la
// página con otra tablatura.
interface Props {
  songs: SongEntry[];
  initialSong?: string;
  minHeight?: number;
}

export default function SongTabPlayer({ songs, initialSong, minHeight }: Props) {
  const [songId, setSongId] = useState(initialSong);
  const song = findSong(songs, songId);
  return (
    <AlphaTabPlayer
      // Overdrive en las guitarras de la tablatura (petición del usuario: oírlo con una canción real).
      allowOverdrive
      initialTrack={song.initialTrack}
      key={song.id}
      layout="horizontal"
      minHeight={minHeight}
      multiTrack
      source={song.source}
      toolbarStart={<SongPicker onPick={setSongId} song={song} songs={songs} />}
      trackOrder={song.trackOrder}
    />
  );
}

// Mismo aspecto que los botones de la barra del reproductor (IconButton en AlphaTabPlayer: 52×52,
// colores en `style` porque esas clases de color de Tailwind no se compilan en este proyecto) y un
// menú que se abre hacia la derecha, como "Pistas".
function SongPicker({ onPick, song, songs }: { onPick: (id: string) => void; song: SongEntry; songs: SongEntry[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative flex items-center" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label={`Canción: ${song.title}`}
        data-active={open ? 'true' : 'false'}
        onClick={() => setOpen((value) => !value)}
        style={{
          alignItems: 'center',
          background: open ? '#34d399' : '#27272a',
          border: `1px solid ${open ? '#6ee7b7' : '#52525b'}`,
          color: open ? '#09090b' : '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          height: 52,
          justifyContent: 'center',
          width: 52,
        }}
        title={`Canción: ${song.title}`}
        type="button"
      >
        <DiscIcon className="song-disc-icon" size={32} />
      </button>
      {open && (
        <div
          aria-label="Selector de canción"
          className="absolute top-[calc(100%+0.5rem)] z-[130] flex flex-col items-stretch gap-1 p-2 shadow-2xl"
          role="menu"
          style={{ background: '#09090b', border: '1px solid #52525b', left: 0, width: 220 }}
        >
          {songs.map((entry) => {
            const current = entry.id === song.id;
            return (
              <button
                aria-checked={current}
                key={entry.id}
                onClick={() => {
                  setOpen(false);
                  if (!current) onPick(entry.id);
                }}
                role="menuitemradio"
                style={{
                  alignItems: 'center',
                  background: current ? '#34d399' : '#18181b',
                  border: `1px solid ${current ? '#6ee7b7' : '#3f3f46'}`,
                  color: current ? '#09090b' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  fontSize: 14,
                  fontWeight: 800,
                  gap: 8,
                  padding: '8px 10px',
                  textAlign: 'left',
                }}
                type="button"
              >
                <DiscIcon className="song-disc-icon" size={20} />
                {entry.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
