import { DEPLOY_TARGET } from '../lib/deployTarget';

const RENDER_FALLBACK_URL = 'https://guitarraesperanza.onrender.com/';

export default function DeploymentNotice() {
  if (DEPLOY_TARGET === 'render') {
    return (
      <p className="deployment-notice">
        Esta web se está mudando a una versión más rápida.
        Esta versión se queda aquí funcionando, por si acaso.
      </p>
    );
  }

  if (DEPLOY_TARGET === 'vercel' && process.env.SHOW_LIMIT_WARNING === '1') {
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

  return null;
}
