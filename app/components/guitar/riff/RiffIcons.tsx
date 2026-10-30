import { type ReactNode, useId } from 'react';
import type { RiffLevel } from '@/app/lib/riff/levels';
import type { RiffBacking, RiffMode } from '@/app/lib/riff/session';

// Iconos del panel de partida (petición del usuario: en el panel solo se ven iconos; en los menús,
// icono + nombre). 24×24, trazo fino que hereda el color (`currentColor`).

function Icon({ children, className = 'riff-icon', size = 22 }: { children: ReactNode; className?: string; size?: number }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size}>
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

// Canción: un disco de vinilo (surcos y etiqueta central). Exportado con tamaño variable para
// el reproductor de tablatura (SongPicker), que le quita la clase `riff-icon` (`className`) para que
// tome el color de su botón en vez del verde fijo del panel del juego.
export function DiscIcon({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <Icon className={className} size={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 5.5a6.5 6.5 0 0 0-6.5 6.5M12 18.5a6.5 6.5 0 0 0 6.5-6.5" strokeWidth="1.3" />
      {/* Etiqueta: un anillo grueso, con el agujero del color de fondo. */}
      <circle cx="12" cy="12" r="2.2" strokeWidth="2.2" />
    </Icon>
  );
}

// Pista: el logo de la web (el clavijero con 3+3 clavijas, sin las baquetas) en pequeño, con la
// letra de su papel recortada en blanco: S = solista, R = rítmica.
import type { TrackRole } from '@/app/lib/riff/roles';

export type { TrackRole };

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

// Niveles: una carita por nivel, de menos a más miedo (petición del usuario, a partir de sus emojis
// 😛 😁 😈 😳 😯 😵‍💫 😱 ☠️, dibujados aquí para que se vean igual en todos los equipos): modo trastes
// Principiante, Fácil, Medio, Avanzado; modo cuerdas Medio, Avanzado, Difícil y Experto. A color (no
// heredan `currentColor`); en el modo oscuro de la web se contra-invierten (ver RiffStyles).
// De los dos Medio en adelante (petición del usuario, 2026-10-30) son DIABLILLOS: el morado del 😈 de
// Medio trastes (menos Experto, que sigue siendo calavera) y cuernos en todos, Experto incluido.
const FACE = '#fcc93a';
const FACE_EDGE = '#d99a06';
const INK = '#5b3a00';
const DEVIL = '#8b5cf6';
const DEVIL_EDGE = '#5b21b6';
const DEVIL_INK = '#2e1065';
// Cuernos cortos y gruesos que SOBRESALEN de la cabeza sin tocar el borde de la caja (petición del
// usuario): se dibujan detrás, con la base tapada por la cara. Para que quepan, la cara de los
// diablillos se encoge un poco y baja (DEVIL_HEAD: centro 12,13 y radio 9,5 en vez de 12,12 y 10,5).
const DEVIL_HORNS = 'M5.6 7.6Q3.6 5.4 4.2 2Q7 3 9.4 4.8ZM18.4 7.6Q20.4 5.4 19.8 2Q17 3 14.6 4.8Z';
const DEVIL_HEAD = 'translate(1.143 2.143) scale(0.905)';
// Los de la calavera, los de siempre a los lados del cráneo, un poco más arriba.
const SKULL_HORNS = 'M3.6 1.4Q3.4 6.2 7.4 7.8L5 10Q2.4 6.6 3.6 1.4ZM20.4 1.4Q20.6 6.2 16.6 7.8L19 10Q21.6 6.6 20.4 1.4Z';

function Horns({ d = DEVIL_HORNS }: { d?: string }) {
  return <path d={d} fill="#6d28d9" stroke={DEVIL_EDGE} strokeLinejoin="round" strokeWidth="0.7" />;
}

function Face({ children, devil = false }: { children: ReactNode; devil?: boolean }) {
  return (
    <svg aria-hidden="true" className="riff-icon riff-level-face" height={22} viewBox="0 0 24 24" width={22}>
      {devil && <Horns />}
      <g transform={devil ? DEVIL_HEAD : undefined}>
        <circle cx="12" cy="12" fill={devil ? DEVIL : FACE} r="10.5" stroke={devil ? DEVIL_EDGE : FACE_EDGE} strokeWidth="0.9" />
        {children}
      </g>
    </svg>
  );
}

export function LevelIcon({ level }: { level: RiffLevel }) {
  switch (level) {
    case 'practica': // 😛
      return (
        <Face>
          <ellipse cx="8.5" cy="9.6" fill={INK} rx="1.2" ry="1.6" />
          <ellipse cx="15.5" cy="9.6" fill={INK} rx="1.2" ry="1.6" />
          <path d="M6.6 13.2Q12 18.6 17.4 13.2Z" fill={INK} />
          <path d="M10.4 15.4h4.8v2.2a2.4 2.4 0 0 1-4.8 0z" fill="#f05a7a" stroke="#c23558" strokeWidth="0.5" />
        </Face>
      );
    case 'facil': // 😁
      return (
        <Face>
          <path d="M6.6 10.4Q8.4 7.6 10.2 10.4M13.8 10.4Q15.6 7.6 17.4 10.4" fill="none" stroke={INK} strokeLinecap="round" strokeWidth="1.5" />
          <path d="M6.2 13H17.8Q17.4 19 12 19Q6.6 19 6.2 13Z" fill={INK} />
          <path d="M7 13.6H17Q16.8 15.6 16.2 15.8H7.8Q7.2 15.6 7 13.6Z" fill="#ffffff" />
        </Face>
      );
    case 'medio': // 😈
      return (
        <Face devil>
          <path d="M6.6 10L10.2 11.4M17.4 10L13.8 11.4" stroke="#2e1065" strokeLinecap="round" strokeWidth="1.4" />
          <ellipse cx="8.8" cy="13" fill="#2e1065" rx="1.1" ry="1.3" />
          <ellipse cx="15.2" cy="13" fill="#2e1065" rx="1.1" ry="1.3" />
          <path d="M7.8 15.8Q12 20 16.2 15.8" fill="none" stroke="#2e1065" strokeLinecap="round" strokeWidth="1.5" />
        </Face>
      );
    case 'avanzado': // 😳
      return (
        <Face devil>
          <path d="M5.8 6.8Q8 5.6 10.2 6.6M13.8 6.6Q16 5.6 18.2 6.8" fill="none" stroke={DEVIL_INK} strokeLinecap="round" strokeWidth="1.1" />
          <circle cx="8.3" cy="10.4" fill="#ffffff" r="2.5" stroke={DEVIL_INK} strokeWidth="0.6" />
          <circle cx="15.7" cy="10.4" fill="#ffffff" r="2.5" stroke={DEVIL_INK} strokeWidth="0.6" />
          <circle cx="8.3" cy="10.6" fill={DEVIL_INK} r="1.2" />
          <circle cx="15.7" cy="10.6" fill={DEVIL_INK} r="1.2" />
          <ellipse cx="5.9" cy="14.6" fill="#f87171" opacity="0.75" rx="2" ry="1.2" />
          <ellipse cx="18.1" cy="14.6" fill="#f87171" opacity="0.75" rx="2" ry="1.2" />
          <path d="M10 17H14" stroke={DEVIL_INK} strokeLinecap="round" strokeWidth="1.4" />
        </Face>
      );
    case 'medio-cuerdas': // 😯
      return (
        <Face devil>
          <path d="M6.4 6.9Q8.4 5.5 10.4 6.5M13.6 6.5Q15.6 5.5 17.6 6.9" fill="none" stroke={DEVIL_INK} strokeLinecap="round" strokeWidth="1.1" />
          <ellipse cx="8.6" cy="10.2" fill={DEVIL_INK} rx="1.2" ry="1.7" />
          <ellipse cx="15.4" cy="10.2" fill={DEVIL_INK} rx="1.2" ry="1.7" />
          <ellipse cx="12" cy="16.2" fill={DEVIL_INK} rx="1.9" ry="2.2" />
        </Face>
      );
    case 'avanzado-cuerdas': // 😵‍💫
      return (
        <Face devil>
          {[8.4, 15.6].map((cx) => (
            <path
              d={`M${cx} 10a0.6 0.6 0 1 1 0.6 0.6a1.3 1.3 0 1 1 -1.3 -1.3a2 2 0 1 1 2 2`}
              fill="none"
              key={cx}
              stroke={DEVIL_INK}
              strokeLinecap="round"
              strokeWidth="0.95"
            />
          ))}
          <ellipse cx="12" cy="16.6" fill={DEVIL_INK} rx="2.3" ry="1.7" />
        </Face>
      );
    case 'dificil': // 😱
      return <ScreamFace />;
    case 'experto': // ☠️
    default:
      return (
        <svg aria-hidden="true" className="riff-icon riff-level-face" height={22} viewBox="0 0 24 24" width={22}>
          <Horns d={SKULL_HORNS} />
          {/* Tibias cruzadas detrás de la calavera. */}
          <path d="M4 14.5L20 22M20 14.5L4 22" stroke="#9ca3af" strokeLinecap="round" strokeWidth="3.4" />
          <path d="M4 14.5L20 22M20 14.5L4 22" stroke="#f3f4f6" strokeLinecap="round" strokeWidth="2" />
          <path d="M12 2.2C7.6 2.2 4.8 5.2 4.8 9.2c0 2.4 1.1 4 2.7 4.9V17h9v-2.9c1.6-.9 2.7-2.5 2.7-4.9 0-4-2.8-7-7.2-7z" fill="#f3f4f6" stroke="#6b7280" strokeWidth="0.9" />
          <circle cx="9.3" cy="9.6" fill="#1f2937" r="1.9" />
          <circle cx="14.7" cy="9.6" fill="#1f2937" r="1.9" />
          <path d="M12 11.6l-1 1.8h2z" fill="#1f2937" />
          <path d="M10 15v2M12 15v2M14 15v2" stroke="#6b7280" strokeWidth="0.8" />
        </svg>
      );
  }
}

// 😱: diablillo que se pone azul por arriba (degradado con id único por icono) y se tapa las mejillas.
function ScreamFace() {
  const id = useId();
  return (
    <svg aria-hidden="true" className="riff-icon riff-level-face" height={22} viewBox="0 0 24 24" width={22}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7aa7e8" />
          <stop offset="0.55" stopColor={DEVIL} />
        </linearGradient>
      </defs>
      <Horns />
      <g transform={DEVIL_HEAD}>
        <circle cx="12" cy="12" fill={`url(#${id})`} r="10.5" stroke={DEVIL_EDGE} strokeWidth="0.9" />
        <circle cx="8.6" cy="9.8" fill="#ffffff" r="2" stroke={DEVIL_INK} strokeWidth="0.5" />
        <circle cx="15.4" cy="9.8" fill="#ffffff" r="2" stroke={DEVIL_INK} strokeWidth="0.5" />
        <circle cx="8.6" cy="9.8" fill={DEVIL_INK} r="0.7" />
        <circle cx="15.4" cy="9.8" fill={DEVIL_INK} r="0.7" />
        <ellipse cx="12" cy="16.4" fill={DEVIL_INK} rx="1.9" ry="3.3" />
        <ellipse cx="3.9" cy="16.4" fill={DEVIL} rx="2.3" ry="3.4" stroke={DEVIL_EDGE} strokeWidth="0.8" />
        <ellipse cx="20.1" cy="16.4" fill={DEVIL} rx="2.3" ry="3.4" stroke={DEVIL_EDGE} strokeWidth="0.8" />
      </g>
    </svg>
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
