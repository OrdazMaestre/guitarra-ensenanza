'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import IdleWarningPanel from '../components/IdleWarningPanel';

export default function DevPreviewIdleWarning() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return (
      <p className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-center text-zinc-100">
        Cerrado. Refresca esta página para volver a ver el aviso.
      </p>
    );
  }

  return (
    <IdleWarningPanel
      onReturnClick={() => {
        router.refresh();
        setDismissed(true);
      }}
      onPortadaClick={() => setDismissed(true)}
    />
  );
}
