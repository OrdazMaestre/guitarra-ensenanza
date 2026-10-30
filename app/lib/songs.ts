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
}

export function findSong(songs: SongEntry[], id: string | undefined): SongEntry {
  return songs.find((song) => song.id === id) ?? songs[0];
}
