// Subconjunto de clases copiado del <style> de QuizRunner.tsx (mismo aspecto visual entre el quiz
// individual y la sala) -- copiado a propósito, no movido/importado desde QuizRunner.tsx, para no
// arriesgar el CSS ya probado del quiz individual con un refactor a media partida. Si en el futuro
// se quiere una única fuente, hay que extraerlo de los dos sitios a la vez con cuidado.
export function QuizSharedStyles() {
  return (
    <style>{`
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

      .quiz-next-button:disabled {
        cursor: default;
        opacity: 0.6;
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

      .quiz-name-form {
        display: grid;
        gap: 8px;
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
    `}</style>
  );
}

export function SalaStyles() {
  return (
    <style>{`
      .sala-page {
        background: #ffffff;
        box-sizing: border-box;
        color: #080808;
        min-height: 100vh;
        overflow-x: clip;
        padding: clamp(28px, 5vw, 72px) clamp(16px, 6vw, 96px);
        width: 100%;
      }

      .sala-content {
        box-sizing: border-box;
        margin: 0 auto;
        max-width: 720px;
        min-width: 0;
        width: 100%;
      }

      .sala-panel {
        border: 3px solid #080808;
        border-radius: 12px;
        box-sizing: border-box;
        display: grid;
        gap: clamp(16px, 3vw, 24px);
        justify-items: center;
        min-width: 0;
        padding: clamp(20px, 4vw, 34px);
        text-align: center;
        width: 100%;
      }

      .sala-kicker {
        color: #047857;
        font-size: 13px;
        font-weight: 950;
        letter-spacing: 0.2em;
        margin: 0;
        text-transform: uppercase;
      }

      .sala-codigo-grande {
        font-size: clamp(40px, 8vw, 64px);
        font-weight: 950;
        letter-spacing: 0.12em;
        margin: 0;
      }

      .sala-codigo-input {
        flex: 0 1 100px;
        text-transform: uppercase;
      }

      .sala-unirse-otra {
        border-top: 1px solid #d4d4d8;
        display: grid;
        gap: 8px;
        padding-top: clamp(16px, 3vw, 24px);
        width: 100%;
      }

      .sala-jugadores-box {
        border-top: 1px solid #d4d4d8;
        display: grid;
        gap: 8px;
        padding-top: clamp(16px, 3vw, 24px);
        width: 100%;
      }

      .sala-jugadores-list {
        display: grid;
        gap: 4px;
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .sala-jugadores-list li {
        font-size: 16px;
        font-weight: 700;
      }

      .sala-waiting {
        color: #6b7280;
        font-size: 15px;
        font-weight: 700;
        margin: 0;
      }

      .sala-option-selected {
        border-color: #047857;
      }

      .sala-controles {
        display: flex;
        justify-content: center;
        width: 100%;
      }

      @media (max-width: 520px) {
        .sala-content {
          max-width: 320px;
        }
      }
    `}</style>
  );
}
