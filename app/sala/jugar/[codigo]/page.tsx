import SalaJugadorScreen from '../../SalaJugadorScreen';
import { QuizSharedStyles, SalaStyles } from '../../salaSharedStyles';
import { normalizeRoomCode } from '@/app/lib/quiz/salaCodigo';

export default async function SalaJugarPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const codigoNormalizado = normalizeRoomCode(codigo);

  return (
    <main className="sala-page">
      <div className="sala-content">
        <SalaJugadorScreen codigo={codigoNormalizado} />
      </div>
      <QuizSharedStyles />
      <SalaStyles />
    </main>
  );
}
