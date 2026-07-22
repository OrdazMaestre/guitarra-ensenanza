'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

export default function RenderColdStartScreen() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-xl">
        <Image
          src="/images/loading-piratas.png"
          alt=""
          width={1536}
          height={1268}
          priority
          className="h-auto w-full rounded-lg"
        />
        <div className="absolute left-[7%] right-[7.5%] top-[84%] bottom-[4%] flex flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-black leading-tight text-zinc-900 sm:text-lg">
            ¿Llevas más de 15 minutos parado?
          </p>
          <p className="text-sm font-black leading-tight text-zinc-900 sm:text-lg">
            Recarga la página.
          </p>
        </div>
      </div>
    </div>
  );
}
