'use client';
import { useEffect, useRef, useState } from 'react';
import AlphaTabPlayer from './AlphaTabPlayer';
import { DiscIcon, SongDifficultyIcon, SongDifficultyLegend, SongLacksIcons } from './riff/RiffIcons';
import { DIFFICULTY_LABEL } from '@/app/lib/riff/difficulty';
import { LocalSongSearch, useSongChoice } from './LocalSongSearch';
import type { SongEntry } from '@/app/lib/songs';

// Reproductor de tablatura con selector de canción: un botón con un disco a la izquierda del
// todo de la barra del reproductor (prop `toolbarStart` de AlphaTabPlayer). Al elegir otra canción
// el reproductor se monta DE NUEVO (`key`), así que por dentro no cambia nada: es como abrir la
// página con otra tablatura. También lista las canciones del propio dispositivo y "Buscar mis
// canciones" (LocalSongSearch.tsx, la misma lista que el disco del juego).
interface Props {
  songs: SongEntry[];
  initialSong?: string;
  minHeight?: number;
}

export default function SongTabPlayer({ songs, initialSong, minHeight }: Props) {
  const choice = useSongChoice(songs, initialSong);
  const song = choice.song;
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
      toolbarStart={<SongPicker notice={choice.notice} onPick={(id) => void choice.pick(id)} song={song} songs={choice.songs} />}
      trackOrder={song.trackOrder}
    />
  );
}

// Mismo aspecto que los botones de la barra del reproductor (IconButton en AlphaTabPlayer: 52×52,
// colores en `style` porque esas clases de color de Tailwind no se compilan en este proyecto) y un
// menú que se abre hacia la derecha, como "Pistas".
function SongPicker({ notice, onPick, song, songs }: { notice: string | null; onPick: (id: string) => void; song: SongEntry; songs: SongEntry[] }) {
  const [open, setOpen] = useState(false);
  // Tarjeta "Buscar mis canciones" abierta: lista y tarjeta en dos columnas (sin scroll).
  const [searching, setSearching] = useState(false);
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
          className="absolute top-[calc(100%+0.5rem)] z-[130] p-2 shadow-2xl"
          role="menu"
          style={{ alignItems: searching ? 'flex-start' : 'stretch', background: '#09090b', border: '1px solid #52525b', display: 'flex', flexDirection: searching ? 'row' : 'column', flexWrap: 'wrap', gap: searching ? 10 : 4, left: 0, maxHeight: 'min(60vh, 420px)', maxWidth: 'calc(100vw - 32px)', overflowY: 'auto', width: searching ? 'max-content' : 260 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: searching ? 240 : '100%' }}>
          {/* Una sola lista: las de la web y, a continuación, las del dispositivo. */}
          {songs.map((entry) => {
            const current = entry.id === song.id;
            // Delante del título, la carita de su dificultad (difficulty.ts); el disco mientras se mide.
            const lacks = [entry.noGuitar ? 'sin guitarra' : '', entry.noDrums ? 'sin batería' : ''].filter(Boolean).join(', ');
            const name = [entry.title, entry.difficulty ? `(canción ${DIFFICULTY_LABEL[entry.difficulty]})` : '', lacks ? `(${lacks})` : ''].filter(Boolean).join(' ');
            return (
              <button
                aria-checked={current}
                data-difficulty={entry.difficulty}
                key={entry.id}
                onClick={() => {
                  setOpen(false);
                  if (!current) onPick(entry.id);
                }}
                role="menuitemradio"
                title={name}
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
                <SongDifficultyIcon difficulty={entry.difficulty} pending={<DiscIcon className="song-disc-icon" size={20} />} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title}</span>
                <SongLacksIcons noDrums={entry.noDrums} noGuitar={entry.noGuitar} />
              </button>
            );
          })}
          <SongDifficultyLegend style={{ alignItems: 'center', color: '#d4d4d8', display: 'flex', flexWrap: 'wrap', fontSize: 12, fontWeight: 700, gap: 10, margin: '4px 0 0' }} />
          </div>
          <LocalSongSearch onOpenChange={setSearching} variant="dark" />
        </div>
      )}
      {/* Una canción del dispositivo que no se puede usar: aviso corto bajo el disco. */}
      {notice && !open && (
        <p
          role="status"
          className="absolute top-[calc(100%+0.5rem)] z-[130]"
          style={{ background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e', fontSize: 12, fontWeight: 700, left: 0, margin: 0, padding: '6px 8px', width: 220 }}
        >
          {notice}
        </p>
      )}
    </div>
  );
}
