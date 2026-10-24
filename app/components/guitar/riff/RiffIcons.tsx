import type { ReactNode } from 'react';
import type { RiffLevel } from '@/app/lib/riff/levels';
import type { RiffBacking, RiffMode } from '@/app/lib/riff/session';

// Iconos del panel de partida (petición del usuario: en el panel solo se ven iconos; en los menús,
// icono + nombre). 24×24, trazo fino que hereda el color (`currentColor`).

function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg aria-hidden="true" className="riff-icon" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size}>
      {children}
    </svg>
  );
}

// Tachado: una raya blanca gruesa (corta el dibujo) y encima la raya del color del icono.
function Strike() {
  return (
    <>
      <path d="M3 3l18 18" stroke="#ffffff" strokeWidth="5" />
      <path d="M3 3l18 18" />
    </>
  );
}

// Pista: el logo de la web (el clavijero con 3+3 clavijas, sin las baquetas) en pequeño, con la
// letra de su papel recortada en blanco: S = solista, R = rítmica.
export type TrackRole = 'S' | 'R';

export function TrackIcon({ role }: { role: TrackRole }) {
  return (
    <Icon>
      {[7, 11, 15].map((y) => (
        <g fill="currentColor" key={y} stroke="none">
          <rect height="2.8" rx="1.3" width="4.4" x="3" y={y} />
          <rect height="2.8" rx="1.3" width="4.4" x="16.6" y={y} />
        </g>
      ))}
      <path d="M7 5.2C8.5 2.6 15.5 2.6 17 5.2L16.6 18.5C15.2 19.3 14.6 20.6 14.6 22.5H9.4C9.4 20.6 8.8 19.3 7.4 18.5Z" fill="currentColor" stroke="none" />
      <text className="riff-track-letter" fontFamily="system-ui, sans-serif" fontSize="10" fontWeight="900" stroke="none" textAnchor="middle" x="12" y="15.2">{role}</text>
    </Icon>
  );
}

// Niveles: el dibujo dice el MODO y cuánto se llena dice el nivel.
// - Modo trastes: 4 barras verticales (como trastes) que crecen; se llenan de 1 a 4.
// - Modo cuerdas: 6 líneas horizontales (las cuerdas); se marcan en grueso las que usa el nivel,
//   desde la 6.ª: Medio 2, Difícil 4, Experto 6.
const FRET_BARS: Partial<Record<RiffLevel, number>> = { practica: 1, neofito: 2, principiante: 3, facil: 4 };
const STRING_LINES: Partial<Record<RiffLevel, number>> = { medio: 2, dificil: 4, experto: 6 };

export function LevelIcon({ level }: { level: RiffLevel }) {
  const filled = FRET_BARS[level];
  if (filled !== undefined) {
    return (
      <Icon>
        {[0, 1, 2, 3].map((i) => {
          const h = 5 + i * 4.5;
          return <rect fill={i < filled ? 'currentColor' : 'none'} height={h} key={i} opacity={i < filled ? 1 : 0.4} rx="0.7" strokeWidth="1.4" width="3.2" x={2.6 + i * 5} y={21.5 - h} />;
        })}
      </Icon>
    );
  }
  const used = STRING_LINES[level] ?? 6;
  return (
    <Icon>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        // i = 0 es la cuerda 1 (arriba); se marcan las `used` de abajo.
        const on = i >= 6 - used;
        return <path d={`M2.5 ${3.5 + i * 3.4}H21.5`} key={i} opacity={on ? 1 : 0.35} strokeWidth={on ? 2.4 : 1.2} />;
      })}
    </Icon>
  );
}

// Velocímetro: solo cambia el ángulo de la aguja (50 % a la izquierda, 75 % arriba, 100 % a la
// derecha).
export function SpeedIcon({ speed }: { speed: number }) {
  const cx = 12;
  const cy = 15.2;
  const angle = speed <= 0.5 ? 150 : speed < 1 ? 90 : 30;
  const rad = (angle * Math.PI) / 180;
  return (
    <Icon>
      <path d="M4.5 18a8 8 0 1 1 15 0" />
      <path d={`M${cx} ${cy}L${(cx + 6 * Math.cos(rad)).toFixed(2)} ${(cy - 6 * Math.sin(rad)).toFixed(2)}`} strokeWidth="2.4" />
      <circle cx={cx} cy={cy} fill="currentColor" r="1.6" />
    </Icon>
  );
}

// Ritmo: dos corcheas unidas por la barra; "Paso a paso", tachadas (sin ritmo: la canción te espera).
export function ModeIcon({ mode }: { mode: RiffMode }) {
  return (
    <Icon>
      <ellipse cx="6.5" cy="18" fill="currentColor" rx="3" ry="2.3" stroke="none" transform="rotate(-20 6.5 18)" />
      <ellipse cx="16.5" cy="16" fill="currentColor" rx="3" ry="2.3" stroke="none" transform="rotate(-20 16.5 16)" />
      <path d="M9.2 17.4V5.5M19.2 15.4V3.5" />
      <path d="M9.2 5.5L19.2 3.5" strokeWidth="3" />
      {mode === 'paso' && <Strike />}
    </Icon>
  );
}

// Bucle: flechas en círculo; tachado si no se repite.
export function LoopIcon({ loop }: { loop: boolean }) {
  return (
    <Icon>
      <path d="M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" />
      {!loop && <Strike />}
    </Icon>
  );
}

// Acompañamiento: tambor (batería), metrónomo, o tambor tachado (sin nada).
export function BackingIcon({ backing }: { backing: RiffBacking }) {
  if (backing === 'metronomo') {
    return (
      <Icon>
        <path d="M6.5 21L10 3h4l3.5 18zM5 21h14M12 17l5.5-9" />
      </Icon>
    );
  }
  return (
    <Icon>
      <path d="M4 9c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v7c0 1.7 3.6 3 8 3s8-1.3 8-3V9M8 2l3 5M16 2l-3 5" />
      {backing === 'nada' && <Strike />}
    </Icon>
  );
}
