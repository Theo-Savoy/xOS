import { useState } from 'react';
import { Button, EmptyState, GlassCard, Tag } from '../../../../components/ui';
import { useDialerPool } from './application/useDialerPool';
import { POOL_PHASE_LABEL } from './domain/phaseLabels';

export type PowerDialerViewProps = { token: string; onBack: () => void };

const DEMO_NUMBERS = [
  '+331****1111', '+332****2222', '+333****3333', '+334****4444',
  '+335****5555', '+336****6666', '+337****7777',
];

export function PowerDialerView({ token, onBack }: PowerDialerViewProps) {
  const [demo, setDemo] = useState(false);
  const [noAnswer, setNoAnswer] = useState(false);
  const [parallelism, setParallelism] = useState(3);
  const pool = useDialerPool({
    token, size: parallelism, simulate: demo, simulateNoAnswer: demo && noAnswer,
  });

  const loadDemo = () => { pool.setQueue(DEMO_NUMBERS); setDemo(true); };
  const counters = {
    attempted: pool.state.lines.filter((line) => line.phase !== 'idle').length,
    connected: pool.state.lines.filter((line) => line.phase === 'connected').length,
    conversations: pool.state.lines.filter((line) => line.phase === 'ended').length,
  };
  const hasAttempted = pool.state.lines.some((line) => ['ended', 'skipped', 'failed'].includes(line.phase));

  return (
    <div className="calls-view">
      <audio
        data-rtc-agent=""
        autoPlay
        muted={!pool.agentConnected}
        className="calls-dialer__rtc-audio"
      />
      <header className="calls-view__header">
        <div><Tag variant="accent">Combo · Power</Tag><h2>Session power dialing</h2></div>
        <div className="calls-view__actions">
          <label>
            Appels en parallèle{' '}
            <select
              aria-label="Appels en parallèle"
              value={parallelism}
              disabled={pool.isRunning}
              onChange={(event) => setParallelism(Number(event.target.value))}
            >
              {[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>
          {!demo && <Button variant="secondary" onClick={loadDemo}>Remplir démo</Button>}
          {demo && (
            <Button
              variant={noAnswer ? 'danger' : 'secondary'}
              onClick={() => setNoAnswer((value) => !value)}
              title="Scénario démo : réponse humaine ou aucune réponse"
            >
              {noAnswer ? 'Démo : aucune réponse' : 'Démo : réponse humaine'}
            </Button>
          )}
          {pool.isRunning ? (
            <Button variant="danger" onClick={pool.hangupAll}>Tout raccrocher</Button>
          ) : pool.hangupRetryable ? (
            <Button
              variant="danger"
              onClick={pool.hangupAll}
              title="Le raccrochage serveur a échoué — la session est encore active côté Telnyx."
            >Réessayer le raccrochage</Button>
          ) : hasAttempted ? (
            <Button variant="primary" onClick={() => void pool.redial()}>Relancer</Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void pool.play()}
              disabled={pool.state.queue.length === 0 && pool.state.lines.every((line) => line.phase === 'idle')}
              title={pool.state.queue.length === 0 ? 'Charge une file avant de lancer' : `Compose ${parallelism} appel(s) en parallèle`}
            ><span aria-hidden="true">▶ </span>Play</Button>
          )}
          <Button variant="secondary" onClick={onBack}>Retour</Button>
        </div>
      </header>

      <section className="calls-power" aria-label="Session power dialing">
        {pool.state.error && <p className="calls-dialer__error" role="alert">{pool.state.error}</p>}
        <GlassCard>
          <div className="calls-power__counters" role="status" aria-live="polite" aria-label="Indicateurs session">
            {[
              [counters.attempted, 'tentés'], [counters.connected, 'connectés'],
              [counters.conversations, 'conversations'], [pool.state.queue.length, 'en file'],
            ].map(([value, label]) => (
              <div className="calls-power__counter" key={label}>
                <span className="calls-power__counter-value">{value}</span>
                <span className="calls-power__counter-label">{label}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <h3>Lignes</h3>
          <div className="calls-power__lines">
            {pool.state.lines.map((line) => (
              <div key={line.slot} className={`calls-power__line calls-power__line--${line.phase}`}>
                <div className="calls-power__line-head">
                  <Tag variant={line.phase === 'connected' ? 'accent' : ['failed', 'skipped'].includes(line.phase) ? 'muted' : 'default'}>
                    {POOL_PHASE_LABEL[line.phase]}
                  </Tag>
                  {line.destination && <span className="calls-power__line-dest">{line.destination}</span>}
                </div>
                {line.error && <p className="calls-dialer__error">{line.error}</p>}
                {['dialing', 'ringing', 'connected'].includes(line.phase) && (
                  <div className="calls-power__line-actions">
                    <Button
                      variant={line.phase === 'connected' ? 'danger' : 'secondary'}
                      size="sm"
                      onClick={line.phase === 'connected' ? pool.hangupAll : () => pool.skip(line.slot)}
                    >
                      {line.phase === 'connected' ? 'Raccrocher' : 'Raccrocher la ligne'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlassCard>

        {pool.state.queue.length > 0 ? (
          <GlassCard>
            <h3>File d'attente ({pool.state.queue.length})</h3>
            <ul className="calls-power__queue">
              {pool.state.queue.slice(0, 10).map((destination, index) => (
                <li key={`${destination}-${index}`} className="calls-power__queue-item">{destination}</li>
              ))}
              {pool.state.queue.length > 10 && <li className="calls-power__queue-item calls-power__queue-more">+{pool.state.queue.length - 10} autres</li>}
            </ul>
          </GlassCard>
        ) : (
          <EmptyState
            title="Aucun numéro en file"
            description={demo ? 'Toutes les lignes ont été composées. Relance un cycle.' : 'Charge une liste de numéros pour lancer le power dialing.'}
          />
        )}
        {!demo && (
          <p className="calls-power__hint">
            Les appels sont composés côté Telnyx sans audio dans le navigateur. Le son ne s’active qu’après détection d’une réponse humaine ; les autres lignes sont alors raccrochées.
          </p>
        )}
      </section>
    </div>
  );
}
