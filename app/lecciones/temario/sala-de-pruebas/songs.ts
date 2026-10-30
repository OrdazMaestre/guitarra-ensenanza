import type { SongEntry } from '@/app/lib/songs';

// Canciones de la Sala de pruebas (botón del disco, en el juego del mástil y en la tablatura).
// La primera que se ve en los dos sitios es Black Gilmur (petición del usuario, 2026-10-30).
// Black Gilmur y Electric Warlock están afinadas en Do# e Iron Rain en Mi♭: el juego las lee como
// en afinación estándar y suena en su tono real (ver `soundOffset` en app/lib/riff/chart.ts).
export const TEST_ROOM_SONGS: SongEntry[] = [
  {
    id: 'black-gilmur',
    title: 'Black Gilmur',
    source: '/tabs/black-gilmur.gp',
    initialTrack: 'distorted electric guitar',
    trackOrder: ['distorted electric guitar', 'electric bass', 'drums'],
  },
  {
    id: 'electric-warlock',
    title: 'Electric Warlock',
    source: '/tabs/electric-warlock.gp',
    initialTrack: 'distorted electric guitar',
    trackOrder: ['distorted electric guitar', 'electric bass', 'drums'],
  },
  {
    id: 'iron-rain',
    title: 'Iron Rain',
    source: '/tabs/iron-rain.gp',
    initialTrack: 'MAIkael',
    // MAIkael es siempre la solista (decisión del usuario); Ordaz, la rítmica.
    trackRoles: { MAIkael: 'S', Ordaz: 'R' },
    trackOrder: ['MAIkael', 'Ordaz', 'MAIk bass', 'MAIk drums'],
  },
  {
    id: 'cancion-de-prueba',
    title: 'Canción de prueba',
    source: '/tabs/prueba-master-of-puppets.gp',
    initialTrack: 'Rhythm Guitar (Kirk)',
    // Las dos pistas se llaman "Rhythm Guitar", pero en este trozo (empieza en el solo) Kirk toca
    // la solista: S; James, la rítmica: R.
    trackRoles: { 'Rhythm Guitar (Kirk)': 'S', 'Rhythm Guitar (James)': 'R' },
    trackOrder: ['Rhythm Guitar (Kirk)', 'Rhythm Guitar (James)', 'Bass', 'Drums'],
  },
];
