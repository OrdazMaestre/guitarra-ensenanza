import SalaAnfitrionScreen from '../../SalaAnfitrionScreen';
import { QuizSharedStyles, SalaStyles } from '../../salaSharedStyles';
import { normalizeRoomCode } from '@/app/lib/quiz/salaCodigo';

export default async function SalaAnfitrionPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const codigoNormalizado = normalizeRoomCode(codigo);

  return (
    <main className="sala-page">
      <div className="sala-content">
        <SalaAnfitrionScreen codigo={codigoNormalizado} />
      </div>
      <QuizSharedStyles />
      <SalaStyles />
    </main>
  );
}
