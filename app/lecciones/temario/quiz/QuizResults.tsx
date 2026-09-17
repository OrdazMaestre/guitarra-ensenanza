'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { tierFor, type RankingTier } from '@/app/lib/quiz/rankingTiers';
import type { QuizMode } from '@/app/lib/quiz/types';
import type { QuizTopic } from '../quizTemarioMap';

interface RankingEntry {
  id: string;
  nombre: string;
  puntos: number;
  tiempoSeg: number;
  totalQuestions: number;
}

const TIER_LABEL: Record<Exclude<RankingTier, null>, string> = {
  bronce: 'Bronce',
  plata: 'Plata',
  oro: 'Oro',
};

interface QuizResultsProps {
  backHref?: string;
  correctCount: number;
  mode: QuizMode;
  onRetry: () => void;
  score: number;
  topic?: QuizTopic;
  totalQuestions: number;
  totalSeconds: number;
}

function needsTopic(mode: QuizMode): boolean {
  return mode === 'facil' || mode === 'dificil';
}

function formatSeconds(seconds: number): string {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}

export default function QuizResults({ backHref, correctCount, mode, onRetry, score, topic, totalQuestions, totalSeconds }: QuizResultsProps) {
  const [ranking, setRanking] = useState<RankingEntry[] | null>(null);
  const [nombre, setNombre] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadRanking() {
    const params = new URLSearchParams({ mode });
    if (needsTopic(mode) && topic) params.set('topic', topic);
    const res = await fetch(`/api/quiz/ranking?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    setRanking(Array.isArray(data?.entries) ? data.entries : []);
  }

  // Patrón estándar "fetch al montar" (suscripción a un sistema externo, uno de los dos usos
  // legítimos de efectos según la propia doc de React) -- loadRanking() actualiza el estado dentro
  // de un callback async tras el `await fetch`, no de forma síncrona en el cuerpo del efecto, pero
  // el linter igual lo marca por seguir la llamada hasta el setState final.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    loadRanking();
  }, [mode, topic]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nombre.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/quiz/ranking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        topic: needsTopic(mode) ? topic : undefined,
        nombre: trimmed,
        puntos: score,
        tiempoSeg: Math.round(totalSeconds),
        totalQuestions,
      }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo guardar el resultado.');
      return;
    }
    setSubmittedId(data?.entry?.id ?? null);
    await loadRanking();
  }

  return (
    <section className="quiz-results" aria-live="polite">
      <p className="quiz-results-kicker">Test terminado</p>
      <p className="quiz-results-score">{score} puntos</p>
      <p className="quiz-results-detail">
        {correctCount} de {totalQuestions} preguntas bien.
      </p>
      <p className="quiz-results-detail">Tiempo total: {formatSeconds(totalSeconds)}.</p>

      <div className="quiz-results-actions">
        <button type="button" className="quiz-next-button" onClick={onRetry}>
          Repetir este modo
        </button>
        {backHref ? (
          <Link href={backHref} className="quiz-back-link">
            Volver a la leccion
          </Link>
        ) : null}
      </div>

      {submittedId === null ? (
        <form className="quiz-name-form" onSubmit={handleSubmit}>
          <label className="quiz-name-label" htmlFor="quiz-name-input">
            Tu nombre para el ranking
          </label>
          <div className="quiz-name-row">
            <input
              id="quiz-name-input"
              className="quiz-name-input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={20}
              placeholder="Ej: Kael"
            />
            <button type="submit" className="quiz-name-submit" disabled={submitting}>
              Guardar
            </button>
          </div>
          {error ? <p className="quiz-name-error">{error}</p> : null}
        </form>
      ) : (
        <p className="quiz-name-saved">Guardado en el ranking.</p>
      )}

      <div className="quiz-ranking">
        <p className="quiz-ranking-title">Ranking</p>
        {ranking === null ? (
          <p className="quiz-ranking-empty">Cargando...</p>
        ) : ranking.length === 0 ? (
          <p className="quiz-ranking-empty">Todavia no hay resultados aqui.</p>
        ) : (
          <ol className="quiz-ranking-list">
            {ranking.map((entry, index) => {
              const tier = tierFor(entry.puntos, entry.totalQuestions);
              return (
                <li key={entry.id} className={entry.id === submittedId ? 'quiz-ranking-mine' : undefined}>
                  <span className="quiz-ranking-pos">{index + 1}</span>
                  <span className="quiz-ranking-name">
                    {entry.nombre}
                    {tier ? <span className={`quiz-ranking-badge quiz-ranking-badge-${tier}`} title={TIER_LABEL[tier]} aria-label={TIER_LABEL[tier]} /> : null}
                  </span>
                  <span className="quiz-ranking-points">
                    {entry.puntos} pts
                    <span className="quiz-ranking-time"> · {formatSeconds(entry.tiempoSeg)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
