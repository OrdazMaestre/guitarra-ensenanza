import { DEPLOY_TARGET } from './lib/deployTarget';
import RenderColdStartScreen from './components/RenderColdStartScreen';

export default function Loading() {
  if (DEPLOY_TARGET !== 'render') {
    return null;
  }

  return <RenderColdStartScreen />;
}
