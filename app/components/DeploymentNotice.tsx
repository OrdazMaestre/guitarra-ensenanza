import { DEPLOY_TARGET } from '../lib/deployTarget';
import { RENDER_FALLBACK_URL } from '../lib/renderFallbackUrl';

const VERCEL_URL = 'https://guitarraesperanza.vercel.app/';

export function RenderTopNotice() {
  if (DEPLOY_TARGET !== 'render') {
    return null;
  }

  return (
    <p className="render-top-notice">
      Nos estamos mudando a{' '}
      <a href={VERCEL_URL} className="render-top-notice-link">
        una versión más rápida
      </a>
      . Esta se queda aquí funcionando, por si acaso.
      Aquí no hay que esperar a que cargue: ya está cargada.
    </p>
  );
}

export function VercelLimitNotice() {
  if (DEPLOY_TARGET !== 'vercel' || process.env.SHOW_LIMIT_WARNING !== '1') {
    return null;
  }

  return (
    <p className="deployment-notice">
      Nos acercamos al límite gratuito de este mes.{' '}
      <a href={RENDER_FALLBACK_URL} className="deployment-notice-link">
        Si esta página no carga bien, prueba aquí
      </a>
      .
    </p>
  );
}
