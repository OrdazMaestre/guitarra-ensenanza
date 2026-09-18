import { tierFor } from '@/app/lib/quiz/rankingTiers';
import type { SalaMarcadorEntry } from './useSalaEstado';

interface SalaMarcadorProps {
  marcador: SalaMarcadorEntry[];
  totalPreguntas: number;
}

// Mismo lenguaje visual que el ranking de QuizResults.tsx (insignia bronce/plata/oro con tierFor),
// compartido entre la pantalla del anfitrión y la del jugador.
export default function SalaMarcador({ marcador, totalPreguntas }: SalaMarcadorProps) {
  if (marcador.length === 0) {
    return <p className="sala-marcador-empty">Todavia no hay nadie en el marcador.</p>;
  }

  return (
    <ol className="sala-marcador-list">
      {marcador.map((entry, index) => {
        const tier = tierFor(entry.puntos, totalPreguntas);
        return (
          <li key={entry.id}>
            <span className="sala-marcador-pos">{index + 1}</span>
            <span className="sala-marcador-name">
              {entry.nombre}
              {tier ? <span className={`sala-marcador-badge sala-marcador-badge-${tier}`} title={tier} aria-label={tier} /> : null}
            </span>
            <span className="sala-marcador-points">{entry.puntos} pts</span>
          </li>
        );
      })}
    </ol>
  );
}

export function SalaMarcadorStyles() {
  return (
    <style>{`
      .sala-marcador-empty {
        color: #6b7280;
        font-size: 14px;
        margin: 0;
        text-align: center;
      }

      .sala-marcador-list {
        display: grid;
        gap: 6px;
        list-style: none;
        margin: 0;
        padding: 0;
        width: 100%;
      }

      .sala-marcador-list li {
        display: grid;
        gap: 8px;
        grid-template-columns: 24px 1fr auto;
        font-size: 15px;
        font-weight: 650;
        min-width: 0;
        padding: 4px 8px;
        text-align: left;
      }

      .sala-marcador-pos {
        color: #6b7280;
      }

      .sala-marcador-name {
        align-items: center;
        display: inline-flex;
        gap: 6px;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .sala-marcador-badge {
        border-radius: 50%;
        display: inline-block;
        flex: 0 0 auto;
        height: 12px;
        width: 12px;
      }

      .sala-marcador-badge-bronce { background: #a9642f; }
      .sala-marcador-badge-plata { background: #b6bcc4; }
      .sala-marcador-badge-oro { background: #eab308; }

      .sala-marcador-points {
        color: #047857;
        text-align: right;
        white-space: nowrap;
      }
    `}</style>
  );
}
