// Papel de cada pista de guitarra en el juego: S = solista, R = rítmica. Lo dice `trackRoles` (por
// nombre de pista) y, si no, el nombre ("Lead"/"Solo" = solista). Sin React, para poder probarlo.

export type TrackRole = 'S' | 'R';

export function trackRole(name: string, roles?: Record<string, TrackRole>): TrackRole {
  return roles?.[name] ?? (/lead|solo/i.test(name) ? 'S' : 'R');
}

// Guitarra que MANDA en los riffs compartidos (petición del usuario, 2026-10-27): si la pista
// elegida no es rítmica, la primera otra pista rítmica (en Master of Puppets, James al tocar Kirk).
// null si la elegida ya es la rítmica o no hay otra.
export function leaderTrack(tracks: Array<{ index: number; name: string }>, selected: number, roles?: Record<string, TrackRole>): number | null {
  const current = tracks.find((track) => track.index === selected);
  if (!current || trackRole(current.name, roles) === 'R') return null;
  return tracks.find((track) => track.index !== selected && trackRole(track.name, roles) === 'R')?.index ?? null;
}
