import { useCallback, useMemo, useState } from 'react';
import { Button, GlassCard, Tag } from '../../../../components/ui';
import { useDialerPool } from './application/useDialerPool';
import { POOL_PHASE_LABEL } from './domain/phaseLabels';

/**
 * PowerDialerView (lot 11.6) — l'UI du power dialing 3 lignes.
 *
 * Pattern « Live Parallel Call Status Panel » (recherche power-dialer) :
 * - bouton Play/Pause global (le « play » de Minari/Flunter)
 * - panneau 3 lignes, statut temps réel par ligne
 * - file d'attente visible (les prochains numéros)
 * - compteur live : tentés / connectés / conversations
 *
 * Le commercial reste MAÎTRE du rythme : Play déclenche un cycle, la
 * machine s'arrête après l'appel, il re-clique Play. Jamais d'auto-next.
 */

export type PowerDialerViewProps = {
  token: string;
  onBack: () => void;
};

/** Numéros de démo (dry-run) : 7 contacts factices pour tester l'UI power.
 * Masqués (jamais composables) + le mode simulate garantit qu'aucun réseau
 * n'est touché (G2). */
const DEMO_NUMBERS = [
  '+331****1111',
  '+332****2222',
  '+333****3333',
  '+334****4444',
  '+335****5555',
  '+336****6666',
  '+337****7777',
];

export function PowerDialerView({ token, onBack }: PowerDialerViewProps) {
  const [demo, setDemo] = useState(false);
  const [noAnswer, setNoAnswer] = useState(false);
  // Mode démo : force la simulation — JAMAIS de réseau réel (G2), même si
  // le token est émis (dry_run=false). La file factice ne compose jamais.
  const pool = useDialerPool({ token, size: 3, simulate: demo, simulateNoAnswer: demo && noAnswer });

  // Mode démo : pré-remplit la file avec des numéros factices pour tester
  // l'UI power en dry-run (aucun appel réel — le pool est en simulation).
  const loadDemo = useCallback(() => {
    pool.setQueue(DEMO_NUMBERS);
    setDemo(true);
  }, [pool.setQueue]);

  const counters = useMemo(() => {
    let connected = 0;
    let conversations = 0;
    let attempted = 0;
    for (const line of pool.state.lines) {
      if (line.phase === 'connected') connected += 1;
      if (line.phase === 'ended') conversations += 1;
      if (line.phase !== 'idle') attempted += 1;
    }
    return { attempted, connected, conversations };
  }, [pool.state.lines]);

  return (
    <div className="calls-view">
      <header className="calls-view__header">
        <div>
          <Tag variant="accent">Combo · Power</Tag>
          <h2>Session power dialing</h2>
        </div>
        <div className="calls-view__actions">
          {!demo && (
            <Button variant="secondary" onClick={loadDemo}>
              Remplir démo
            </Button>
          )}
          {demo && (
            <Button
              variant={noAnswer ? 'danger' : 'secondary'}
              onClick={() => setNoAnswer((v) => !v)}
              title="Scénario démo : réponse humaine (défaut) ou aucune réponse (skip par timeout)"
            >
              {noAnswer ? 'Démo : aucune réponse' : 'Démo : réponse humaine'}
            </Button>
          )}
          {pool.isRunning ? (
            <Button variant="danger" onClick={pool.hangupAll}>
              Tout raccrocher
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void pool.play()}
              disabled={pool.state.queue.length === 0 && pool.state.lines.every((l) => l.phase === 'idle')}
            >
              ▶ Play
            </Button>
          )}
          <Button variant="secondary" onClick={onBack}>
            Retour
          </Button>
        </div>
      </header>

      <section className="calls-power">
        {pool.state.error && (
          <p className="calls-dialer__error" role="alert">{pool.state.error}</p>
        )}
        {/* Compteurs live */}
        <GlassCard>
          <div className="calls-power__counters">
            <div className="calls-power__counter">
              <span className="calls-power__counter-value">{counters.attempted}</span>
              <span className="calls-power__counter-label">tentés</span>
            </div>
            <div className="calls-power__counter">
              <span className="calls-power__counter-value">{counters.connected}</span>
              <span className="calls-power__counter-label">connectés</span>
            </div>
            <div className="calls-power__counter">
              <span className="calls-power__counter-value">{counters.conversations}</span>
              <span className="calls-power__counter-label">conversations</span>
            </div>
            <div className="calls-power__counter">
              <span className="calls-power__counter-value">{pool.state.queue.length}</span>
              <span className="calls-power__counter-label">en file</span>
            </div>
          </div>
        </GlassCard>

        {/* 3 lignes en parallèle */}
        <GlassCard>
          <h3>Lignes</h3>
          <div className="calls-power__lines">
            {pool.state.lines.map((line) => (
              <div
                key={line.slot}
                className={`calls-power__line calls-power__line--${line.phase}`}
              >
                <div className="calls-power__line-head">
                  <Tag
                    variant={
                      line.phase === 'connected'
                        ? 'accent'
                        : line.phase === 'failed' || line.phase === 'skipped'
                          ? 'muted'
                          : 'default'
                    }
                  >
                    {POOL_PHASE_LABEL[line.phase]}
                  </Tag>
                  {line.destination && (
                    <span className="calls-power__line-dest">{line.destination}</span>
                  )}
                </div>
                {line.error && <p className="calls-dialer__error">{line.error}</p>}
                {(line.phase === 'dialing' ||
                  line.phase === 'ringing' ||
                  line.phase === 'connected') && (
                  <div className="calls-power__line-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => pool.skip(line.slot)}
                      disabled={line.phase === 'connected'}
                    >
                      Skip
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlassCard>

        {/* File d'attente */}
        {pool.state.queue.length > 0 && (
          <GlassCard>
            <h3>File d'attente ({pool.state.queue.length})</h3>
            <ul className="calls-power__queue">
              {pool.state.queue.slice(0, 10).map((dest, i) => (
                <li key={`${dest}-${i}`} className="calls-power__queue-item">
                  {dest}
                </li>
              ))}
              {pool.state.queue.length > 10 && (
                <li className="calls-power__queue-item calls-power__queue-more">
                  +{pool.state.queue.length - 10} autres
                </li>
              )}
            </ul>
          </GlassCard>
        )}

        {!demo && (
          <p className="calls-power__hint">
            Clique « Remplir démo » pour charger une file factice, puis « Play » :
            le pool compose 3 lignes en parallèle, connecte la première réponse
            humaine, coupe les autres, et s'arrête. En dry-run, aucune ligne ne
            part réellement.
          </p>
        )}
      </section>
    </div>
  );
}
