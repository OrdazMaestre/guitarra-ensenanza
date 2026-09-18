'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { selectQuestions } from '@/app/lib/quiz/engine';
import { tierFor } from '@/app/lib/quiz/rankingTiers';
import { bonusFor } from '@/app/lib/quiz/scoring';
import { createRng } from '@/app/lib/quiz/shuffle';
import type { QuizMode, RuntimeQuestion } from '@/app/lib/quiz/types';
import { isKnownLessonSlug, resolveQuizTopicForSlug, topicsUpToSlug } from '../quizTemarioMap';
import QuestionCard from './QuestionCard';
import { QuizDiagramStyles } from './QuizDiagramView';
import QuizModeSwitcher from './QuizModeSwitcher';
import QuizResults from './QuizResults';
import QuizSpeedrunScreen from './QuizSpeedrunScreen';

// Detección de "a boleo": si la mitad o más de las preguntas se contestan en <=1s (tiempo humano
// mínimo real de leer+decidir, ni de lejos suficiente para pensar una respuesta) y el resultado
// IGUAL llega a bronce (>=1 punto/pregunta), lo más probable es que haya sido pura suerte
// clicando rápido, no juego real -- no debe puntuar ni entrar en el ranking (ver
// QuizSpeedrunScreen, que sustituye a QuizResults sin más lógica de bloqueo: QuizResults es quien
// manda el POST al ranking, así que simplemente no renderizarlo ya evita el envío).
const QUICK_ANSWER_THRESHOLD_SECONDS = 1;

function isSpeedrun(quickAnswerCount: number, totalQuestions: number, score: number): boolean {
  if (totalQuestions === 0) return false;
  const halfOrMore = quickAnswerCount >= totalQuestions / 2;
  const reachesBronze = tierFor(score, totalQuestions) !== null;
  return halfOrMore && reachesBronze;
}

interface Answered {
  correcta: boolean;
  texto: string;
}

export default function QuizRunner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromSlug = searchParams.get('from') ?? '';
  const backHref = isKnownLessonSlug(fromSlug) ? `/lecciones/temario/${fromSlug}` : undefined;

  const [mode, setMode] = useState<QuizMode>('facil');
  const [creandoSala, setCreandoSala] = useState(false);
  const [errorSala, setErrorSala] = useState<string | null>(null);
  // Arranca vacío a propósito: selectQuestions() usa Math.random() (sin seed), así que generarlo
  // durante el render produciría un set de preguntas DISTINTO en el render de servidor y en la
  // hidratación del cliente -> mismatch de hidratación de React (confirmado con Playwright: el
  // enunciado #1 no coincidía entre SSR y cliente). Se rellena en el efecto de montaje de abajo,
  // que solo corre en el cliente.
  const [questions, setQuestions] = useState<RuntimeQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [quickAnswerCount, setQuickAnswerCount] = useState(0);
  const [speedrunDetected, setSpeedrunDetected] = useState(false);

  const testStartRef = useRef(0);
  const questionStartRef = useRef(0);
  // Excepción deliberada a ambas reglas: no hay forma pura de generar el primer test (usa
  // Math.random()/Date.now(), ambos impuros) sin que SSR y la hidratación del cliente calculen
  // valores distintos -- por eso se difiere a un efecto que solo corre en el cliente, en vez de en
  // el render o en el inicializador de useState(); y debe correr solo una vez al montar, no en
  // cada cambio de `topics` (eso ya lo cubre handleModeChange/startMode cuando el usuario actúa).
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    setQuestions(selectQuestions('facil', topicsUpToSlug(fromSlug, 'facil'), createRng()));
    testStartRef.current = Date.now();
    questionStartRef.current = Date.now();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  function startMode(newMode: QuizMode) {
    setMode(newMode);
    setQuestions(selectQuestions(newMode, topicsUpToSlug(fromSlug, newMode), createRng()));
    setIndex(0);
    setScore(0);
    setCorrectCount(0);
    setFinished(false);
    setAnswered(null);
    setTotalSeconds(0);
    setQuickAnswerCount(0);
    setSpeedrunDetected(false);
    testStartRef.current = Date.now();
    questionStartRef.current = Date.now();
  }

  function handleModeChange(newMode: QuizMode) {
    const midTest = !finished && (index > 0 || answered !== null);
    if (midTest && !window.confirm('Vas a perder el progreso de este test. ¿Cambiar de modo?')) return;
    startMode(newMode);
  }

  function handleAnswer(optionIndex: number) {
    if (answered) return;
    const question = questions[index];
    const option = question.opciones[optionIndex];
    const elapsedSeconds = (Date.now() - questionStartRef.current) / 1000;
    if (elapsedSeconds <= QUICK_ANSWER_THRESHOLD_SECONDS) setQuickAnswerCount((c) => c + 1);
    let points = 0;
    if (option.correcta) {
      points = 1 + bonusFor(elapsedSeconds);
      setCorrectCount((c) => c + 1);
    }
    setScore((s) => s + points);
    setAnswered({ correcta: option.correcta, texto: option.texto });
  }

  // MULTIJUGADOR captura la modalidad activa EN ESE MOMENTO (el `mode` ya seleccionado en el
  // switcher de arriba) -- no hay pantalla intermedia de "elegir modo", la sala se crea con la que
  // ya tienes puesta, para cualquier modo/tema. El anfitrionToken se guarda en sessionStorage
  // (nunca en la URL) para poder compartir el enlace de la sala sin regalar el control de esta.
  async function handleMultijugador() {
    if (creandoSala) return;
    setCreandoSala(true);
    setErrorSala(null);
    try {
      const res = await fetch('/api/quiz/sala/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: mode, from: fromSlug }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrorSala(data?.error ?? 'No se pudo crear la sala');
        setCreandoSala(false);
        return;
      }
      sessionStorage.setItem(`sala:${data.codigo}:anfitrionToken`, data.anfitrionToken);
      router.push(`/sala/anfitrion/${data.codigo}`);
    } catch {
      setErrorSala('No se pudo crear la sala');
      setCreandoSala(false);
    }
  }

  function handleNext() {
    if (index + 1 >= questions.length) {
      setTotalSeconds((Date.now() - testStartRef.current) / 1000);
      setSpeedrunDetected(isSpeedrun(quickAnswerCount, questions.length, score));
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setAnswered(null);
    questionStartRef.current = Date.now();
  }

  const currentQuestion = questions[index];

  return (
    <main className="quiz-page">
      {backHref ? (
        <Link href={backHref} aria-label="Volver a la leccion" className="quiz-back-arrow">
          <span aria-hidden="true">←</span>
        </Link>
      ) : null}

      <article className="quiz-content">
        <header className="quiz-header">
          <h1>Quiz</h1>
          <p className="quiz-score-line">Puntos: {score}</p>
        </header>

        <QuizModeSwitcher mode={mode} onChange={handleModeChange} />

        {finished && speedrunDetected ? (
          <QuizSpeedrunScreen backHref={backHref} onRetry={() => startMode(mode)} />
        ) : finished ? (
          <QuizResults
            backHref={backHref}
            correctCount={correctCount}
            mode={mode}
            onRetry={() => startMode(mode)}
            score={score}
            topic={resolveQuizTopicForSlug(fromSlug)}
            totalQuestions={questions.length}
            totalSeconds={totalSeconds}
          />
        ) : !currentQuestion && index === 0 && questions.length === 0 ? (
          <p className="quiz-empty">Cargando preguntas...</p>
        ) : currentQuestion ? (
          <QuestionCard
            answered={answered}
            onAnswer={handleAnswer}
            onNext={handleNext}
            question={currentQuestion}
            questionNumber={index + 1}
            totalQuestions={questions.length}
          />
        ) : (
          <p className="quiz-empty">No hay preguntas todavia para este tema.</p>
        )}

        <div className="quiz-multijugador-wrap">
          <button type="button" className="quiz-multijugador-button" onClick={handleMultijugador} disabled={creandoSala}>
            {creandoSala ? 'Creando sala...' : 'MULTIJUGADOR'}
          </button>
          {errorSala ? <p className="quiz-name-error">{errorSala}</p> : null}
        </div>
      </article>

      <QuizDiagramStyles />
      <style>{`
        .quiz-page {
          background: #ffffff;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 6vw, 96px);
          position: relative;
          width: 100%;
        }

        .quiz-back-arrow {
          align-items: center;
          background: rgba(255, 255, 255, 0.9);
          border: 2px solid #080808;
          border-radius: 6px;
          color: #080808;
          display: inline-flex;
          font-size: clamp(28px, 4vw, 38px);
          font-weight: 950;
          height: clamp(48px, 8vw, 58px);
          justify-content: center;
          left: clamp(10px, 3vw, 28px);
          line-height: 1;
          position: absolute;
          text-decoration: none;
          top: clamp(10px, 2vw, 22px);
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
          width: clamp(48px, 8vw, 58px);
          z-index: 80;
        }

        .quiz-back-arrow:hover,
        .quiz-back-arrow:focus-visible {
          background: #ffffff;
          border-color: #047857;
          color: #047857;
        }

        .quiz-back-arrow:focus-visible {
          outline: 3px solid #047857;
          outline-offset: 4px;
        }

        .quiz-content {
          box-sizing: border-box;
          margin: 0 auto;
          max-width: 720px;
          min-width: 0;
          width: 100%;
        }

        .quiz-header {
          margin-bottom: clamp(20px, 4vw, 32px);
          text-align: center;
        }

        .quiz-header h1 {
          font-size: clamp(36px, 6vw, 64px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          text-transform: uppercase;
        }

        .quiz-score-line {
          color: #047857;
          font-size: 20px;
          font-weight: 800;
          margin: 8px 0 0;
        }

        .quiz-mode-switcher {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          margin: 0 auto clamp(28px, 5vw, 44px);
        }

        .quiz-mode-button {
          background: transparent;
          border: 2px solid #080808;
          border-radius: 999px;
          color: #080808;
          cursor: pointer;
          font-size: 14px;
          font-weight: 800;
          padding: 8px 16px;
        }

        .quiz-mode-button-active {
          background: #047857;
          border-color: #047857;
          color: #ffffff;
        }

        .quiz-question-card {
          border: 3px solid #080808;
          border-radius: 12px;
          box-sizing: border-box;
          display: grid;
          gap: clamp(16px, 3vw, 24px);
          min-width: 0;
          padding: clamp(20px, 4vw, 34px);
          text-align: center;
        }

        .quiz-progress {
          color: #6b7280;
          font-size: 14px;
          font-weight: 700;
          margin: 0;
        }

        .quiz-enunciado {
          font-size: clamp(20px, 3vw, 30px);
          font-weight: 800;
          line-height: 1.35;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .quiz-diagram-wrap {
          min-width: 0;
        }

        .quiz-options {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
          min-width: 0;
        }

        .quiz-option {
          background: #ffffff;
          border: 2px solid #d4d4d8;
          border-radius: 8px;
          color: #080808;
          cursor: pointer;
          font-size: 16px;
          font-weight: 700;
          min-width: 0;
          overflow-wrap: anywhere;
          padding: 12px 14px;
          white-space: pre-line;
        }

        .quiz-option:not(:disabled):hover {
          border-color: #047857;
        }

        .quiz-option:disabled {
          cursor: default;
        }

        .quiz-option-correct {
          background: rgba(4, 120, 87, 0.12);
          border-color: #047857;
        }

        .quiz-option-wrong {
          background: rgba(220, 38, 38, 0.1);
          border-color: #dc2626;
        }

        .quiz-feedback {
          display: grid;
          gap: 10px;
          justify-items: center;
        }

        .quiz-feedback-ok {
          color: #047857;
          font-weight: 900;
          margin: 0;
        }

        .quiz-feedback-bad {
          color: #b45309;
          font-weight: 900;
          margin: 0;
        }

        .quiz-next-button {
          background: #047857;
          border: none;
          border-radius: 8px;
          color: #ffffff;
          cursor: pointer;
          font-size: 16px;
          font-weight: 800;
          padding: 12px 24px;
        }

        .quiz-results {
          border: 3px solid #047857;
          border-radius: 12px;
          box-sizing: border-box;
          display: grid;
          gap: 10px;
          justify-items: center;
          padding: clamp(24px, 4vw, 40px);
          text-align: center;
        }

        .quiz-results-kicker {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.2em;
          margin: 0;
          text-transform: uppercase;
        }

        .quiz-results-score {
          font-size: clamp(40px, 7vw, 64px);
          font-weight: 950;
          margin: 0;
        }

        .quiz-results-detail {
          color: #303030;
          font-size: 18px;
          font-weight: 650;
          margin: 0;
        }

        .quiz-results-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
          margin-top: 14px;
        }

        .quiz-back-link {
          align-items: center;
          border: 2px solid #080808;
          border-radius: 8px;
          color: #080808;
          display: inline-flex;
          font-size: 16px;
          font-weight: 800;
          padding: 12px 24px;
          text-decoration: none;
        }

        .quiz-back-link:hover,
        .quiz-back-link:focus-visible {
          border-color: #047857;
          color: #047857;
        }

        .quiz-empty {
          text-align: center;
        }

        .quiz-multijugador-wrap {
          border-top: 1px solid #d4d4d8;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          margin-top: clamp(48px, 8vw, 80px);
          padding-top: clamp(28px, 5vw, 44px);
        }

        .quiz-multijugador-button {
          background: #047857;
          border: 2px solid #047857;
          border-radius: 8px;
          color: #ffffff;
          cursor: pointer;
          font-size: clamp(18px, 2.4vw, 24px);
          font-weight: 950;
          letter-spacing: 0.08em;
          padding: 14px 40px;
        }

        .quiz-multijugador-button:hover,
        .quiz-multijugador-button:focus-visible {
          background: #065f46;
          border-color: #065f46;
        }

        .quiz-multijugador-button:disabled {
          cursor: default;
          opacity: 0.6;
        }

        .quiz-speedrun {
          border: 3px solid #080808;
          border-radius: 12px;
          box-sizing: border-box;
          display: grid;
          gap: 18px;
          justify-items: center;
          padding: clamp(24px, 4vw, 40px);
          text-align: center;
        }

        .quiz-speedrun-message {
          font-size: clamp(24px, 4vw, 36px);
          font-weight: 900;
          margin: 0;
        }

        .quiz-name-form {
          border-top: 1px solid #d4d4d8;
          display: grid;
          gap: 8px;
          margin-top: 18px;
          padding-top: 18px;
          width: 100%;
        }

        .quiz-name-label {
          color: #303030;
          font-size: 14px;
          font-weight: 700;
        }

        .quiz-name-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
        }

        .quiz-name-input {
          border: 2px solid #d4d4d8;
          border-radius: 8px;
          box-sizing: border-box;
          flex: 1 1 160px;
          font-size: 16px;
          min-width: 0;
          padding: 10px 12px;
        }

        .quiz-name-input:focus-visible {
          border-color: #047857;
          outline: none;
        }

        .quiz-name-submit {
          background: #047857;
          border: none;
          border-radius: 8px;
          color: #ffffff;
          cursor: pointer;
          flex: 0 0 auto;
          font-size: 15px;
          font-weight: 800;
          padding: 10px 18px;
        }

        .quiz-name-submit:disabled {
          opacity: 0.6;
        }

        .quiz-name-error {
          color: #b45309;
          font-size: 14px;
          font-weight: 700;
          margin: 0;
        }

        .quiz-name-saved {
          border-top: 1px solid #d4d4d8;
          color: #047857;
          font-size: 15px;
          font-weight: 800;
          margin: 18px 0 0;
          padding-top: 18px;
          width: 100%;
        }

        .quiz-ranking {
          border-top: 1px solid #d4d4d8;
          margin-top: 18px;
          padding-top: 18px;
          width: 100%;
        }

        .quiz-ranking-title {
          color: #047857;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.2em;
          margin: 0 0 10px;
          text-transform: uppercase;
        }

        .quiz-ranking-empty {
          color: #6b7280;
          font-size: 14px;
          margin: 0;
        }

        .quiz-ranking-list {
          display: grid;
          gap: 6px;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .quiz-ranking-list li {
          display: grid;
          gap: 8px;
          grid-template-columns: 24px 1fr auto;
          font-size: 15px;
          font-weight: 650;
          min-width: 0;
          padding: 4px 8px;
          text-align: left;
        }

        .quiz-ranking-mine {
          background: rgba(4, 120, 87, 0.1);
          border-radius: 6px;
          font-weight: 900;
        }

        .quiz-ranking-pos {
          color: #6b7280;
        }

        .quiz-ranking-name {
          align-items: center;
          display: inline-flex;
          gap: 6px;
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .quiz-ranking-badge {
          border-radius: 50%;
          display: inline-block;
          flex: 0 0 auto;
          height: 12px;
          width: 12px;
        }

        .quiz-ranking-badge-bronce {
          background: #a9642f;
        }

        .quiz-ranking-badge-plata {
          background: #b6bcc4;
        }

        .quiz-ranking-badge-oro {
          background: #eab308;
        }

        .quiz-ranking-points {
          color: #047857;
          text-align: right;
          white-space: nowrap;
        }

        .quiz-ranking-time {
          color: #6b7280;
          font-weight: 600;
        }

        @media (max-width: 520px) {
          .quiz-content {
            max-width: 320px;
          }
        }
      `}</style>
    </main>
  );
}
