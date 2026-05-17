// app/(site)/lecciones/prueba/page.tsx
'use client';

import AlphaTabPlayer from '../../components/guitar/AlphaTabPlayer';

const pruebaTab = String.raw`\title "Prueba AlphaTab" . 3.3*4 4.3*4 5.3*4 6.3*4 | 3.2*4 4.2*4 5.2*4 6.2*4`;

export default function PruebaPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold text-center mb-10 text-emerald-400">
        Prueba AlphaTab
      </h1>

      <AlphaTabPlayer
        tab={pruebaTab}
        title="Prueba AlphaTab"
      />

      <p className="text-center text-zinc-400 mt-10">
        Si ves la tablatura arriba, todo esta funcionando.
      </p>
    </div>
  );
}
