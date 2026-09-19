import type { SalaJugadorEstado } from './useSalaEstado';

interface SalaJugadoresLiveProps {
  jugadores: SalaJugadorEstado[];
}

// Debajo de las opciones de cada pregunta, para el anfitrion (que ahora tambien contesta como un
// jugador mas) y para cada jugador por igual: quien no ha contestado sale en rojo, ordenado
// alfabeticamente; en cuanto contesta pasa a verde y se recoloca arriba del todo, por orden real
// de llegada (el primero en contestar, arriba de los verdes; el ultimo, justo encima de los rojos).
export default function SalaJugadoresLive({ jugadores }: SalaJugadoresLiveProps) {
  if (jugadores.length === 0) return null;

  const contestaron = jugadores
    .filter((j) => j.orden !== null)
    .sort((a, b) => (a.orden as number) - (b.orden as number));
  const pendientes = jugadores
    .filter((j) => j.orden === null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <ul className="sala-jugadores-live" aria-label="Quien ha contestado ya">
      {[...contestaron, ...pendientes].map((j) => (
        <li key={j.id} className={j.orden !== null ? 'sala-jugador-live-ok' : 'sala-jugador-live-pendiente'}>
          {j.nombre}
        </li>
      ))}
    </ul>
  );
}

export function SalaJugadoresLiveStyles() {
  return (
    <style>{`
      .sala-jugadores-live {
        display: grid;
        gap: 4px;
        list-style: none;
        margin: 0;
        padding: 0;
        width: 100%;
      }

      .sala-jugadores-live li {
        font-size: 14px;
        font-weight: 750;
        overflow-wrap: anywhere;
        text-align: center;
        transition: color 200ms ease;
      }

      .sala-jugador-live-pendiente {
        color: #dc2626;
      }

      .sala-jugador-live-ok {
        color: #047857;
      }
    `}</style>
  );
}
