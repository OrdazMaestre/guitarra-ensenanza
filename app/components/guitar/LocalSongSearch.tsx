'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { forgetScore, isPlayableScore } from '@/app/lib/riff/chart';
import {
  addLocalFileList,
  createLocalOpener,
  getLocalSongs,
  getServerLocalSongs,
  LOCAL_SONG_ACCEPT,
  localSearchMode,
  pickLocalFolder,
  rescanRememberedFolder,
  searchRememberedFolder,
  subscribeLocalSongs,
} from '@/app/lib/localSongs';
import { findSong, type SongEntry } from '@/app/lib/songs';
import { getDifficulties, getServerDifficulties, requestDifficulties, subscribeDifficulties } from '@/app/lib/songDifficulty';

// Canciones del propio dispositivo (app/lib/localSongs.ts) en los discos del juego y de la
// tablatura: la lista compartida, la elección de canción de cada disco y la tarjeta "Buscar mis
// canciones" con sus selectores.

export function useLocalSongs() {
  return useSyncExternalStore(subscribeLocalSongs, getLocalSongs, getServerLocalSongs);
}

// Canción elegida en UN disco: las de la web + las encontradas en el dispositivo. Una local se
// comprueba antes de cambiar (si no tiene guitarra de 6 cuerdas, aviso y se queda la que había) y se
// lee en memoria; al cambiar a otra, la anterior se borra de la memoria.
// Dificultad medida de cada canción (la carita del disco), por id.
export function useSongDifficulties() {
  return useSyncExternalStore(subscribeDifficulties, getDifficulties, getServerDifficulties);
}

export function useSongChoice(webSongs: SongEntry[], initialSong?: string) {
  const { songs: localSongs } = useLocalSongs();
  const difficulties = useSongDifficulties();
  const [songId, setSongId] = useState(initialSong);
  const [local, setLocal] = useState<{ id: string; url: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opener] = useState(() => createLocalOpener(forgetScore));
  useEffect(() => () => opener.release(), [opener]);

  // Todas con su carita de dificultad (cuando ya está medida). Las de la web, en su orden; las del
  // dispositivo, de más fácil a más difícil (empate: por título) y las aún sin medir al final.
  const unsorted = useMemo<SongEntry[]>(
    () => [...webSongs, ...localSongs.map((song) => ({ id: song.id, title: song.title, source: '', local: true }))],
    [webSongs, localSongs],
  );
  useEffect(() => requestDifficulties(unsorted), [unsorted]);
  const songs = useMemo<SongEntry[]>(() => {
    const withDifficulty = unsorted.map((song) => {
      const info = difficulties[song.id];
      return {
        ...song,
        difficulty: info?.difficulty,
        // Solo en las del dispositivo (las de la web las tienen todas).
        ...(song.local && info && !info.hasDrums ? { noDrums: true } : {}),
        ...(song.local && info && !info.hasGuitar ? { noGuitar: true } : {}),
      };
    });
    const scoreOf = (song: SongEntry) => difficulties[song.id]?.score ?? Number.POSITIVE_INFINITY;
    const local = withDifficulty.filter((song) => song.local)
      .sort((a, b) => scoreOf(a) - scoreOf(b) || a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
    return [...withDifficulty.filter((song) => !song.local), ...local];
  }, [unsorted, difficulties]);
  const current = songs.find((song) => song.id === songId);
  // Una local solo es la actual cuando ya está leída en memoria (`local`).
  const song: SongEntry = current?.local
    ? (local?.id === current.id ? { ...current, source: local.url } : findSong(webSongs, undefined))
    : findSong(webSongs, songId);

  async function pick(id: string) {
    setNotice(null);
    const localSong = localSongs.find((entry) => entry.id === id);
    if (!localSong) {
      opener.release();
      setLocal(null);
      setSongId(id);
      return;
    }
    const url = await opener.open(localSong, isPlayableScore);
    if (!url) {
      setNotice(`«${localSong.title}» no tiene guitarra para jugar.`);
      return;
    }
    setLocal({ id, url });
    setSongId(id);
  }

  return { songs, song, pick, notice };
}

const LINES = {
  computer: [
    '¿Tienes canciones en tu ordenador?',
    'Elige la carpeta donde las guardas.',
    'Yo busco dentro las que se pueden tocar.',
    'Consejo: guarda todas tus canciones juntas en una carpeta fácil de encontrar.',
    'Tus archivos no salen de tu ordenador.',
  ],
  mobile: [
    '¿Tienes canciones en tu móvil?',
    'Elige las que quieras tocar. Puedes marcar varias.',
    'Consejo: guárdalas todas juntas en una carpeta fácil, como «Descargas».',
    'Tus archivos no salen de tu móvil.',
  ],
};

const PALETTES = {
  light: { card: '#ecfdf5', border: '#a7f3d0', text: '#064e3b', button: '#047857', buttonText: '#ffffff', ghost: '#ffffff' },
  dark: { card: '#18181b', border: '#3f3f46', text: '#ffffff', button: '#34d399', buttonText: '#09090b', ghost: '#27272a' },
};

// Botón "Buscar mis canciones" y, al pulsarlo, la tarjeta con el mensaje y el selector adecuado
// para este dispositivo (localSearchMode). Montarlo (= abrir el menú del disco) vuelve a buscar sola
// en la carpeta recordada si el navegador ya da permiso.
// `onOpenChange`: el menú que la contiene se ensancha a dos columnas mientras la tarjeta está
// abierta (petición del usuario: ver "Elegir carpeta" sin hacer scroll).
export function LocalSongSearch({ onOpenChange, variant }: { onOpenChange?: (open: boolean) => void; variant: 'light' | 'dark' }) {
  const { scanning, lastFound, rememberedFolder, folderScanned } = useLocalSongs();
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [mode] = useState(localSearchMode);
  const colors = PALETTES[variant];

  useEffect(() => {
    void rescanRememberedFolder();
  }, []);
  // Al cerrar el menú (se desmonta) la tarjeta queda cerrada: el menú vuelve a una columna.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  useEffect(() => () => onOpenChangeRef.current?.(false), []);

  const buttonStyle = (primary: boolean) => ({
    background: primary ? colors.button : colors.ghost,
    border: `1px solid ${primary ? colors.button : colors.border}`,
    borderRadius: 999,
    color: primary ? colors.buttonText : colors.text,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
    padding: '6px 12px',
  });

  function choose() {
    if (mode === 'directory-api') void pickLocalFolder();
    else if (mode === 'directory-input') folderRef.current?.click();
    else filesRef.current?.click();
  }

  return (
    <div className="local-song-search" style={{ display: 'grid', gap: 6 }}>
      {/* Carpeta recordada pero aún sin buscar en esta visita (el navegador pide permiso tras
          recargar): un clic, bien a la vista. */}
      {rememberedFolder && !folderScanned && mode === 'directory-api' && (
        <button disabled={scanning} onClick={() => void searchRememberedFolder()} style={buttonStyle(true)} type="button">
          {scanning ? 'Buscando…' : `Buscar en «${rememberedFolder}»`}
        </button>
      )}
      <button aria-expanded={open} onClick={() => setOpen(!open)} style={buttonStyle(false)} type="button">
        Buscar mis canciones
      </button>
      {open && (
        <div
          className="local-song-card"
          role="group"
          aria-label="Buscar mis canciones"
          style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12, color: colors.text, display: 'grid', fontSize: 13, fontWeight: 600, gap: 4, lineHeight: 1.35, maxWidth: 280, padding: 10, textAlign: 'left', whiteSpace: 'normal' }}
        >
          {(mode === 'files' ? LINES.mobile : LINES.computer).map((line) => <p key={line} style={{ margin: 0 }}>{line}</p>)}
          {rememberedFolder && <p style={{ fontWeight: 800, margin: 0 }}>Ya me acuerdo de tu carpeta «{rememberedFolder}».</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            <button disabled={scanning} onClick={choose} style={buttonStyle(true)} type="button">
              {mode === 'files' ? 'Elegir canciones' : 'Elegir carpeta'}
            </button>
            {rememberedFolder && mode === 'directory-api' && (
              <button disabled={scanning} onClick={() => void searchRememberedFolder()} style={buttonStyle(false)} type="button">
                Buscar otra vez en «{rememberedFolder}»
              </button>
            )}
          </div>
          <p aria-live="polite" role="status" style={{ fontWeight: 800, margin: 0 }}>
            {scanning
              ? 'Buscando…'
              : lastFound === null
                ? ''
                : lastFound > 0
                  ? `He encontrado ${lastFound} ${lastFound === 1 ? 'canción nueva' : 'canciones nuevas'}.`
                  : 'No he encontrado canciones nuevas que se puedan tocar.'}
          </p>
          {/* Selectores del propio dispositivo (ocultos: los abren los botones de arriba). */}
          <input
            accept={LOCAL_SONG_ACCEPT}
            aria-label="Elegir canciones del dispositivo"
            data-testid="local-song-files"
            hidden
            multiple
            onChange={(e) => {
              if (e.target.files) void addLocalFileList(e.target.files);
              e.target.value = '';
            }}
            ref={filesRef}
            type="file"
          />
          <input
            aria-label="Elegir carpeta de canciones"
            data-testid="local-song-folder"
            hidden
            onChange={(e) => {
              if (e.target.files) void addLocalFileList(e.target.files);
              e.target.value = '';
            }}
            ref={(el) => {
              folderRef.current = el;
              if (el) el.webkitdirectory = true;
            }}
            type="file"
          />
        </div>
      )}
    </div>
  );
}
