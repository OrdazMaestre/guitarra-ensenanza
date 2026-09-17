import type { QuizMode } from '@/app/lib/quiz/types';

const MODE_LABELS: Record<QuizMode, string> = {
  facil: 'Facil',
  dificil: 'Dificil',
  'mini-torneo': 'Mini-torneo',
  campeonato: 'Campeonato',
};

export default function QuizModeSwitcher({ mode, onChange }: { mode: QuizMode; onChange: (mode: QuizMode) => void }) {
  return (
    <div className="quiz-mode-switcher" role="group" aria-label="Elegir modo de test">
      {(Object.keys(MODE_LABELS) as QuizMode[]).map((m) => (
        <button
          key={m}
          type="button"
          className={`quiz-mode-button${m === mode ? ' quiz-mode-button-active' : ''}`}
          aria-pressed={m === mode}
          onClick={() => onChange(m)}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}
