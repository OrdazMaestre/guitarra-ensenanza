export type DeployTarget = 'render' | 'vercel' | 'local';

export const DEPLOY_TARGET: DeployTarget =
  process.env.IS_RENDER === '1'
    ? 'render'
    : process.env.VERCEL === '1'
      ? 'vercel'
      : 'local';
