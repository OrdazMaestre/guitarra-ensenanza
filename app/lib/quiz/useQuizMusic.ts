'use client';
import { useEffect, useRef, useState } from 'react';
import type { QuizMode } from './types';

// Un archivo por modalidad, mismo patron que QUIZ_MODE_BACKGROUNDS en QuizRunner.tsx. Los 4
// archivos todavia no existen (el usuario esta componiendo las canciones) -- esto es solo la
// infraestructura: en cuanto se coloquen los .mp3 con estos nombres exactos en public/audio/quiz/,
// empiezan a sonar sin tocar mas codigo. Mientras tanto el <audio> simplemente falla al cargar
// (evento 'error', silencioso) y el quiz sigue funcionando en silencio.
const QUIZ_MODE_MUSIC: Record<QuizMode, string> = {
  facil: '/audio/quiz/facil-loop.mp3',
  dificil: '/audio/quiz/dificil-loop.mp3',
  'mini-torneo': '/audio/quiz/mini-torneo-loop.mp3',
  campeonato: '/audio/quiz/campeonato-loop.mp3',
};

const VOLUME_STORAGE_KEY = 'quiz:musicVolume';
const DEFAULT_VOLUME = 1.0;

export interface QuizMusicAPI {
  volume: number;
  setVolume: (value: number) => void;
}

function readStoredVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_VOLUME;
  try {
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function useQuizMusic(mode: QuizMode): QuizMusicAPI {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeRef = useRef(DEFAULT_VOLUME);
  // Excepcion deliberada: localStorage no es una fuente pura de la que leer durante el render (SSR
  // no tiene window), asi que el valor real se recupera en el efecto de montaje de abajo, igual
  // que el resto de flags cliente-only de este proyecto (ver `mounted` en QuizRunner.tsx).
  /* eslint-disable react-hooks/set-state-in-effect */
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  useEffect(() => {
    setVolumeState(readStoredVolume());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Un solo <audio> reutilizado para las 4 modalidades durante toda la vida del quiz: cambiar de
  // modo solo cambia `src` (ver efecto de abajo), nunca crea un elemento nuevo -- asi no se
  // acumulan streams a medio cargar ni listeners huerfanos al cambiar de modo repetidamente.
  // Sigue sonando (a cualquier volumen, incluido 0) en vez de pausarse -- asi subir el volumen
  // desde 0 nunca dispara de nuevo el bloqueo de autoplay del navegador.
  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = volumeRef.current;
    audioRef.current = audio;

    // El autoplay puede estar bloqueado por la politica del navegador si todavia no hubo un
    // gesto del usuario dentro de esta pagina (el click que navego aqui puede no contar, al ser
    // una navegacion cliente-a-cliente de Next.js). Si play() es rechazado, se reintenta una sola
    // vez en cuanto llegue cualquier interaccion (click/tecla/touch) en el documento.
    function retryOnGesture() {
      audio.play().catch(() => {});
      window.removeEventListener('pointerdown', retryOnGesture);
      window.removeEventListener('keydown', retryOnGesture);
    }
    window.addEventListener('pointerdown', retryOnGesture);
    window.addEventListener('keydown', retryOnGesture);

    return () => {
      window.removeEventListener('pointerdown', retryOnGesture);
      window.removeEventListener('keydown', retryOnGesture);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const src = QUIZ_MODE_MUSIC[mode];
    const resolved = new URL(src, window.location.origin).href;
    if (audio.src !== resolved) {
      audio.src = src;
    }
    audio.play().catch(() => {});
  }, [mode]);

  function setVolume(value: number) {
    const clamped = Math.min(1, Math.max(0, value));
    setVolumeState(clamped);
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
    } catch {
      // localStorage puede fallar (modo privado, cuota, etc.) -- el slider sigue funcionando
      // para la sesion actual, simplemente no se recuerda para la proxima visita.
    }
  }

  return { volume, setVolume };
}
