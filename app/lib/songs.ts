import type { SongDifficulty } from '@/app/lib/riff/difficulty';
import type { TrackRole } from '@/app/lib/riff/roles';

// Una canción que se puede elegir con el botón del disco (juego del mástil y reproductor de
// tablatura). Datos planos: la página (componente de servidor) los pasa tal cual a los clientes.
export interface SongEntry {
  id: string;
  title: string;
  // Ruta del .gp en /public.
  source: string;
  // Pista que se ve/juega primero (nombre exacto de la pista en el .gp).
  initialTrack?: string;
  // Papel de cada guitarra en el juego (S solista / R rítmica) cuando el nombre no lo dice.
  trackRoles?: Record<string, TrackRole>;
  // Orden del menú "Pistas" del reproductor de tablatura.
  trackOrder?: string[];
  // Canción del propio dispositivo (localSongs.ts): `source` es una URL `blob:` en memoria.
  local?: boolean;
  // Dificultad medida (songDifficulty.ts) para la carita del disco; sin ella, aún no se ha medido.
  difficulty?: SongDifficulty;
}

export function findSong(songs: SongEntry[], id: string | undefined): SongEntry {
  return songs.find((song) => song.id === id) ?? songs[0];
}
