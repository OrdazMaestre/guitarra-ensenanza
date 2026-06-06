// app/(site)/lecciones/prueba/page.tsx
'use client';

import AlphaTabPlayer from '../../components/guitar/AlphaTabPlayer';
import { sadisticMagicianTrack1 } from '../../data/sadisticMagicianTrack1';

export default function PruebaPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold text-center mb-10 text-emerald-400">
        Prueba AlphaTab
      </h1>

      <AlphaTabPlayer
        tab={sadisticMagicianTrack1}
        title="Municipal Waste - Sadistic Magician (Guitarra 1)"
      />

      <p className="text-center text-zinc-400 mt-10">
        Si ves la tablatura arriba, todo está funcionando. Con esta canción hice todas las pruebas de sonido. Enhorabuena por encontrarla.
      </p>
    </div>
  );
}
