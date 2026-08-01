'use client';

import { useRouter } from 'next/navigation';
import type { DeployTarget } from '../lib/deployTarget';
import { useIdleWarning } from '../lib/useIdleWarning';
import IdleWarningPanel from './IdleWarningPanel';

const IDLE_THRESHOLD_MS = 10 * 60 * 1000;

interface RenderIdleWarningProps {
  deployTarget: DeployTarget;
}

export default function RenderIdleWarning({ deployTarget }: RenderIdleWarningProps) {
  const router = useRouter();
  const active = deployTarget === 'render';
  const { visible, dismiss, dismissPermanently } = useIdleWarning(active, IDLE_THRESHOLD_MS);

  if (!active || !visible) {
    return null;
  }

  const handleReturnClick = () => {
    router.refresh();
    dismiss();
  };

  return (
    <IdleWarningPanel
      primaryLabel="Intenta volver ahora mismo haciendo clic aquí"
      onPrimaryClick={handleReturnClick}
      onSecondaryClick={dismissPermanently}
    />
  );
}
