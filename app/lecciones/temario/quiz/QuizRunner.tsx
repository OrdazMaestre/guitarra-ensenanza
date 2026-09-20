'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

// "mini-torneo" no tiene foto propia todavia -- comparte la de fondo general (escenario cerrado
// con sillas) hasta que haya una dedicada.
const QUIZ_MODE_BACKGROUNDS: Record<QuizMode, string> = {
  facil: '/images/quiz/facil-bg.webp',
  dificil: '/images/quiz/dificil-bg.webp',
  'mini-torneo': '/images/quiz/no-campeonato-bg.webp',
  campeonato: '/images/quiz/campeonato-bg.webp',
};

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

  // El fondo se pinta con un portal a document.body (ver mas abajo) en vez de dentro de
  // ".quiz-page", asi que necesita saber si ya esta montado en el cliente antes de poder llamar a
  // createPortal (document no existe durante el render de servidor).
  const [mounted, setMounted] = useState(false);
  // Excepcion deliberada: es el patron estandar de React para detectar que ya se hidrato en el
  // cliente antes de llamar a createPortal (document no existe en el render de servidor), no hay
  // forma de leerlo de otra fuente externa a la que "suscribirse".
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Los quiz siempre se ven en modo oscuro (el look "negativo" del resto del sitio pega mejor con
  // el escenario de concierto), independientemente de la preferencia global guardada en
  // localStorage -- por eso se fuerza aqui en vez de tocar ThemeToggle, y se restaura el tema que
  // hubiera al entrar cuando el usuario sale del quiz, en vez de dejarlo forzado en el resto del
  // sitio.
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    // ".site-shell" pinta un fondo blanco opaco (globals.css) que, al estar por encima del portal
    // en el orden de pintado normal, tapa por completo el fondo fijo -- se hace transparente solo
    // mientras el quiz esta montado (ver ".quiz-bg-active .site-shell" en el <style> de abajo) en
    // vez de tocar la regla global, para no afectar al resto de paginas que si dependen de ese
    // fondo blanco (p.ej. el contra-invert de AlphaTab).
    document.body.classList.add('quiz-bg-active');
    return () => {
      if (previousTheme) root.setAttribute('data-theme', previousTheme);
      else root.removeAttribute('data-theme');
      document.body.classList.remove('quiz-bg-active');
    };
  }, []);

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
  const backgroundImage = QUIZ_MODE_BACKGROUNDS[mode];
  const backgroundLayers = [
    'linear-gradient(to bottom, rgba(8, 8, 8, 0.43) 0%, rgba(8, 8, 8, 0.15) 18%, rgba(8, 8, 8, 0.08) 42%, rgba(8, 8, 8, 0.18) 78%, rgba(8, 8, 8, 0.46) 100%)',
    'radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.3) 100%)',
    `url(${backgroundImage})`,
  ].join(', ');

  return (
    <main className="quiz-page">
      {/* Fondo fijo al viewport: se pinta con un portal directamente en <body>, fuera de
          ".site-shell", porque ese contenedor lleva el filtro invert() del modo oscuro del sitio
          -- un elemento position:fixed DENTRO de un ancestro con filter deja de anclarse al
          viewport y pasa a comportarse como si fuera absolute respecto a ese ancestro (asi lo
          especifica CSS), lo que rompía el "fondo fijo" en cuanto el quiz fuerza data-theme=dark.
          Al vivir fuera de ".site-shell" tampoco le afecta esa inversion, así que ademas ya no
          hace falta contra-invertirlo para que la foto conserve sus colores reales. */}
      {mounted
        ? createPortal(
            <div className="quiz-bg-fixed" style={{ backgroundImage: backgroundLayers }} aria-hidden="true" />,
            document.body,
          )
        : null}

      {backHref ? (
        <Link href={backHref} aria-label="Volver a la leccion" className="quiz-back-arrow">
          <span aria-hidden="true">←</span>
        </Link>
      ) : null}

      <article className="quiz-content">
        <header className="quiz-header">
          <h1>Quiz</h1>
        </header>

        <QuizModeSwitcher mode={mode} onChange={handleModeChange} />

        {finished && speedrunDetected ? (
          <QuizSpeedrunScreen onRetry={() => startMode(mode)} score={score} totalSeconds={totalSeconds} />
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
            score={score}
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
        /* Transparentes para que se vea el fondo fijo del portal (".quiz-bg-fixed") por debajo --
           ".site-shell" normalmente pinta un blanco opaco (globals.css) que, sin esto, tapa el
           portal por completo aunque tenga z-index negativo (el z-index solo ordena capas, no
           hace huecos en el fondo opaco de un antecesor). Ambas reglas van detras de la clase que
           el useEffect de arriba pone en <body> mientras el quiz esta montado, asi que el resto
           del sitio conserva su fondo blanco normal. */
        body.quiz-bg-active .site-shell {
          background: transparent;
        }

        .quiz-page {
          background: transparent;
          box-sizing: border-box;
          color: #080808;
          min-height: 100vh;
          overflow-x: clip;
          padding: clamp(28px, 5vw, 72px) clamp(16px, 6vw, 96px);
          position: relative;
          width: 100%;
        }

        /* Vive fuera de ".quiz-page" (portal a <body>, ver JSX de arriba). Fijo al viewport y
           escalado solo por el alto: "auto 100%" fuerza la altura de la imagen a ocupar el 100%
           del alto de este elemento (100vh, por el inset:0 en position:fixed), dejando el ancho
           proporcional aunque eso recorte los lados en pantallas estrechas -- se ve la foto
           entera de arriba a abajo, nunca de lado a lado. */
        .quiz-bg-fixed {
          background-color: #080808;
          background-position: center;
          background-repeat: no-repeat;
          background-size: auto 100%;
          inset: 0;
          pointer-events: none;
          position: fixed;
          z-index: -1;
        }

        /* El quiz fuerza data-theme="dark" (ver useEffect mas arriba), lo que invierte
           ".site-shell" entero -- el resto de la pagina (tarjetas, texto de dentro) SI se deja
           invertir con el resto del sitio a proposito: estan escritos en tonos oscuros sobre
           tarjeta clara (para "modo claro"), y esa misma inversion los convierte automaticamente
           en texto claro sobre tarjeta oscura translucida -- el "modo oscuro" de toda la vida del
           sitio, sin tener que duplicar cada color a mano.
           .quiz-header y .quiz-empty son la excepcion: son texto suelto directamente sobre el
           fondo fijo (sin tarjeta detras) pensado para leerse claro sobre fondo oscuro real, asi
           que se contra-invierten para que no se giren a negro. */
        html[data-theme='dark'] .quiz-header,
        html[data-theme='dark'] .quiz-empty {
          filter: invert(1) hue-rotate(180deg);
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
          color: #ffffff;
          font-size: clamp(36px, 6vw, 64px);
          font-weight: 950;
          letter-spacing: 0;
          line-height: 1;
          margin: 0;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
          text-transform: uppercase;
        }

        .quiz-card-header {
          display: grid;
          gap: 2px;
        }

        .quiz-score-line {
          color: #047857;
          font-size: 32px;
          font-weight: 800;
          margin: 0;
        }

        .quiz-mode-switcher {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          margin: 0 auto clamp(28px, 5vw, 44px);
        }

        .quiz-mode-button {
          background: rgba(255, 255, 255, 0.88);
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
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          background: rgba(255, 255, 255, 0.48);
          border: 3px solid #080808;
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
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
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          background: rgba(255, 255, 255, 0.48);
          border: 3px solid #047857;
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
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
          color: #ffffff;
          text-align: center;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
        }

        .quiz-multijugador-wrap {
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          background: rgba(255, 255, 255, 0.48);
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          margin-top: clamp(48px, 8vw, 80px);
          padding: clamp(28px, 5vw, 44px) clamp(16px, 4vw, 28px);
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
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          background: rgba(255, 255, 255, 0.48);
          border: 3px solid #080808;
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
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

        .quiz-speedrun-score {
          font-size: clamp(40px, 7vw, 64px);
          font-weight: 950;
          margin: 0;
        }

        .quiz-speedrun-time {
          color: #dc2626;
          font-size: clamp(28px, 5vw, 44px);
          font-weight: 950;
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
