import { RunnerView } from '../RunnerView';
import { useSessionRunnerVersion } from './featureFlag';
import { SessionWorkspaceV2 } from './SessionWorkspaceV2';
import type { SessionWorkspaceProps } from './types';

/**
 * Façade de migration unique pour le runner Combo (Issue #119).
 *
 * Règles impératives (Plan §5) :
 * 1. Une seule surface montée à la fois : ne jamais monter legacy et V2 simultanément
 *    pour éviter tout conflit ou double écouteur clavier / timers / WebRTC.
 * 2. Flag figé à l'ouverture de la session : aucun basculement dynamique pendant une
 *    session ou une vague Power active.
 * 3. Parité stricte du contrat : reçoit SessionWorkspaceProps (isomorphe à RunnerViewProps).
 */
export function SessionWorkspace(props: SessionWorkspaceProps) {
  const version = useSessionRunnerVersion(
    props.session.id,
    props.runnerVersion,
  );

  // La file de rappels n'est pas paritaire en V2 : forcer le legacy (Grok note a)
  if (props.variant === 'recalls') {
    return <RunnerView {...props} />;
  }

  if (version === 'v2') {
    return <SessionWorkspaceV2 {...props} />;
  }

  return <RunnerView {...props} />;
}
