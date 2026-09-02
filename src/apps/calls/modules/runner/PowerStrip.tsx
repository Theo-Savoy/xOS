import { useEffect, useMemo, useState } from 'react';
import { Button, GlassCard, Tag } from '../../../../components/ui';
import type { SessionContact } from '../../types';
import { useDialerPool } from '../dialer/application/useDialerPool';
import { POOL_PHASE_LABEL } from '../dialer/domain/phaseLabels';

/** Le serveur refuse tout le lot si un seul numéro n'est pas E.164 (pool.js). */
const E164 = /^\+[1-9]\d{6,14}$/;

export type PowerStripProps = {
  token: string;
  sessionId: number;
  contacts: SessionContact[];
  currentUserId: string | null;
  /** Bascule la fiche du runner sur le contact décroché : l'ACW existant suit. */
  onFocusContact: (contactId: number) => void;
};

/**
 * Encart power dialing du runner : le pool compose N contacts pending de la
 * séance, et la fiche bascule seule sur celui qui décroche. La consignation
 * reste celle du mode séquentiel (ResultButtons → onLogAndNext).
 */
export function PowerStrip({
  token,
  sessionId,
  contacts,
  currentUserId,
  onFocusContact,
}: PowerStripProps) {
  const [parallelism, setParallelism] = useState(3);
  const pool = useDialerPool({ token, size: parallelism, callSessionId: sessionId });

  // Même règle d'éligibilité que findNextPending, plus le filtre E.164 et la
  // déduplication par numéro (un standard partagé rendrait l'association
  // numéro↔fiche ambiguë au retour du gagnant).
  const { queue, contactIds, unreachable } = useMemo(() => {
    const seen = new Set<string>();
    const destinations: string[] = [];
    const ids: number[] = [];
    let skipped = 0;
    contacts.forEach((contact) => {
      if (contact.status !== 'pending') return;
      if (
        contact.claim_active && contact.claimed_by && currentUserId
        && contact.claimed_by !== currentUserId
      ) return;
      const phone = contact.phone?.replace(/\s/g, '') ?? '';
      if (!E164.test(phone)) { skipped += 1; return; }
      if (seen.has(phone)) return;
      seen.add(phone);
      destinations.push(phone);
      ids.push(contact.id);
    });
    return { queue: destinations, contactIds: ids, unreachable: skipped };
  }, [contacts, currentUserId]);

  const { setQueue, winnerContactId } = pool;
  useEffect(() => { setQueue(queue, contactIds); }, [setQueue, queue, contactIds]);

  useEffect(() => {
    if (winnerContactId != null) onFocusContact(winnerContactId);
  }, [winnerContactId, onFocusContact]);

  const counters = {
    attempted: pool.state.lines.filter((line) => line.phase !== 'idle').length,
    connected: pool.state.lines.filter((line) => line.phase === 'connected').length,
    queued: pool.state.queue.length,
  };
  const hasAttempted = pool.state.lines.some((line) =>
    ['ended', 'skipped', 'failed'].includes(line.phase));

  return (
    <GlassCard className="calls-power-strip">
      <audio
        data-rtc-agent=""
        autoPlay
        muted={!pool.agentConnected}
        className="calls-dialer__rtc-audio"
      />
      <div className="calls-power__counters" role="status" aria-live="polite" aria-label="Indicateurs power">
        {[
          [counters.attempted, 'tentés'], [counters.connected, 'connectés'],
          [counters.queued, 'en file'], [unreachable, 'sans numéro'],
        ].map(([value, label]) => (
          <div className="calls-power__counter" key={label}>
            <span className="calls-power__counter-value">{value}</span>
            <span className="calls-power__counter-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="calls-power-strip__actions">
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
            disabled={counters.queued === 0}
            title={counters.queued === 0
              ? 'Aucun contact composable dans cette séance'
              : `Compose ${parallelism} appel(s) en parallèle`}
          ><span aria-hidden="true">▶ </span>Play</Button>
        )}
      </div>

      {pool.state.error && <p className="calls-dialer__error" role="alert">{pool.state.error}</p>}

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
  );
}
