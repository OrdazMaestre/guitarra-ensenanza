'use client';

import type { DeployTarget } from '../lib/deployTarget';
import { RENDER_FALLBACK_URL } from '../lib/renderFallbackUrl';
import { useIdleWarning } from '../lib/useIdleWarning';
import IdleWarningPanel from './IdleWarningPanel';

const IDLE_THRESHOLD_MS = 10 * 60 * 1000;

interface VercelLimitWarningProps {
  deployTarget: DeployTarget;
  enabled: boolean;
}

export default function VercelLimitWarning({ deployTarget, enabled }: VercelLimitWarningProps) {
  const active = deployTarget === 'vercel' && enabled;
  const { visible, dismissPermanently } = useIdleWarning(active, IDLE_THRESHOLD_MS);

  if (!active || !visible) {
    return null;
  }

  return (
    <IdleWarningPanel
      title="Nos acercamos al límite gratuito de este mes"
      primaryLabel="Prueba en la otra web haciendo clic aquí"
      primaryHref={RENDER_FALLBACK_URL}
      onSecondaryClick={dismissPermanently}
    />
  );
}
