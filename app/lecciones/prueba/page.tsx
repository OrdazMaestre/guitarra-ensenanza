// app/(site)/lecciones/prueba/page.tsx
'use client';

import AlphaTabPlayer from '../../components/guitar/AlphaTabPlayer';

const cumpleanosTab = `
\\title "Cumpleaños Feliz"
\\subtitle "Ejercicio 1 - Una cuerda"
.
:4 0-0-2-0 | 5-4-0-0 | 0-12-9-5-7-5 | 10-10-9-5-7-5
`;

export default function PruebaPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold text-center mb-10 text-emerald-400">
        Prueba AlphaTab
      </h1>

      <AlphaTabPlayer 
        tab={cumpleanosTab} 
        title="Cumpleaños Feliz - Ejercicio 1" 
      />

      <p className="text-center text-zinc-400 mt-10">
        Si ves la tablatura arriba, ¡todo está funcionando!
      </p>
    </div>
  );
}