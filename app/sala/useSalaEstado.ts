'use client';
import { useEffect, useRef, useState } from 'react';

export interface SalaJugadorInfo {
  id: string;
  nombre: string;
}

export interface SalaJugadorEstado {
  id: string;
  nombre: string;
  /** Orden de llegada de su respuesta a la pregunta actual, o null si todavia no ha contestado. */
  orden: number | null;
}

export interface SalaMarcadorEntry {
  id: string;
  nombre: string;
  puntos: number;
}

export interface SalaEstadoResponse {
  esAnfitrion: boolean;
  estado: 'lobby' | 'jugando' | 'terminada';
  indice: number;
  jugadores: SalaJugadorInfo[];
  /** Solo relevante mientras hay una pregunta activa -- lista vacia en el lobby/al terminar. */
  jugadoresEstado: SalaJugadorEstado[];
  marcador: SalaMarcadorEntry[];
  miRespuesta: { correcta: boolean; opcionIndex: number; puntos: number } | null;
  modo: string;
  pregunta: import('@/app/lib/quiz/types').RuntimeQuestion | null;
  /** true cuando el anfitrion ya puede pulsar "Revelar respuesta": contestaron todos O pasaron
   * 25s, lo que llegue antes. */
  puedeRevelar: boolean;
  respondieron: number;
  revelada: boolean;
  totalJugadores: number;
  totalPreguntas: number;
}

const POLL_INTERVAL_MS = 1800;

interface UseSalaEstadoParams {
  activo: boolean;
  anfitrionToken?: string;
  codigo: string;
  jugadorId?: string;
}

/** Sondeo compartido por la pantalla del anfitrión y la del jugador: pide el estado cada ~1.8s,
 * nunca apila una petición nueva encima de otra que todavía no ha respondido (red lenta), se
 * pausa cuando la pestaña está oculta (y hace un fetch inmediato al volver a estar visible, para
 * no perderse un "revelar"/"siguiente" que pasó mientras tanto), y se detiene solo al desmontar o
 * en cuanto la sala llega a 'terminada'. */
export function useSalaEstado({ activo, anfitrionToken, codigo, jugadorId }: UseSalaEstadoParams) {
  const [estado, setEstado] = useState<SalaEstadoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enVueloRef = useRef(false);

  useEffect(() => {
    if (!activo || !codigo) return undefined;

    let detenido = false;

    async function poll() {
      if (enVueloRef.current || detenido) return;
      enVueloRef.current = true;
      try {
        const params = new URLSearchParams({ codigo });
        if (anfitrionToken) params.set('anfitrionToken', anfitrionToken);
        if (jugadorId) params.set('jugadorId', jugadorId);
        const res = await fetch(`/api/quiz/sala/estado?${params.toString()}`, { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (detenido) return;
        if (!res.ok) {
          setError(data?.error ?? 'No se pudo conectar con la sala');
        } else {
          setError(null);
          setEstado(data as SalaEstadoResponse);
          if (data?.estado === 'terminada') stop();
        }
      } catch {
        // Fallo de red puntual (wifi de aula): se ignora, se reintenta en el siguiente tick.
      } finally {
        enVueloRef.current = false;
      }
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (intervalId) return;
      intervalId = setInterval(poll, POLL_INTERVAL_MS);
    }
    function stop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    }

    function handleVisibility() {
      if (document.hidden) {
        stop();
      } else {
        poll();
        start();
      }
    }

    poll();
    start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      detenido = true;
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activo, codigo, anfitrionToken, jugadorId]);

  return { error, estado };
}
