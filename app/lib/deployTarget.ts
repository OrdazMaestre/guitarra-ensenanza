export type DeployTarget = 'render' | 'vercel' | 'local';

// Render always injects RENDER=true itself (docs.render.com/environment-variables),
// so we honor it as a fallback in case the service isn't actually building through
// our Dockerfile's explicit IS_RENDER=1 (e.g. a dashboard-configured native service).
export const DEPLOY_TARGET: DeployTarget =
  process.env.IS_RENDER === '1' || process.env.RENDER === 'true'
    ? 'render'
    : process.env.VERCEL === '1'
      ? 'vercel'
      : 'local';
