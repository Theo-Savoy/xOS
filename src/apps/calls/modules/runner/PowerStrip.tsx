import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, GlassCard } from '../../../../components/ui';
import type { SessionContact } from '../../types';
import { useDialerPool } from '../dialer/application/useDialerPool';
import { fetchDialerConfig, type DialerConfig } from '../dialer/dialerApi';

/** Le serveur refuse tout le lot si un seul numéro n'est pas E.164 (pool.js). */
const E164 = /^\+[1-9]\d{6,14}$/;

const LINE_LABEL: Record<string, string> = {
  dialing: 'compose',
  ringing: 'sonne',
  connected: 'en ligne',
  ended: 'terminé',
  skipped: 'sans réponse',
  failed: 'échec',
};

export type PowerStripProps = {
  token: string;
  sessionId: number;
  contacts: SessionContact[];
  currentUserId: string | null;
  /** Bascule la fiche du runner sur le contact décroché : l'ACW existant suit. */
  onFocusContact: (contactId: number) => void;
};

/**
 * Encart power dialing du runner — une barre de contrôle, pas un tableau de
 * bord : la séance a déjà ses KPI. On n'affiche que ce qui n'existe nulle part
 * ailleurs (état des lignes, réglages de composition, quota restant).
 *
 * Le pool compose N contacts pending de la séance ; la fiche bascule seule sur
 * celui qui décroche et la consignation reste celle du mode séquentiel.
 */
export function PowerStrip({
  token,
  sessionId,
  contacts,
  currentUserId,
  onFocusContact,
}: PowerStripProps) {
  const [parallelism, setParallelism] = useState(3);
  const [callerNumber, setCallerNumber] = useState('');
  const [config, setConfig] = useState<DialerConfig | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await fetchDialerConfig(token));
    } catch {
      // Le quota reste masqué : le serveur refuse de toute façon au-delà.
      setConfig(null);
    }
  }, [token]);
  useEffect(() => { void loadConfig(); }, [loadConfig]);

  const callerNumbers = config?.caller_numbers ?? [];
  // Défaut : premier numéro alloué, sans écraser un choix déjà fait.
  useEffect(() => {
    const first = config?.caller_numbers?.[0]?.e164;
    if (first) setCallerNumber((current) => current || first);
  }, [config]);

  const pool = useDialerPool({
    token,
    size: parallelism,
    callSessionId: sessionId,
    callerNumber: callerNumber || null,
  });

  // Même règle d'éligibilité que findNextPending, plus le filtre E.164 et la
  // déduplication par numéro (un standard partagé rendrait l'association
  // numéro↔fiche ambiguë au retour du gagnant).
  const { queue, contactIds, byPhone, unreachable } = useMemo(() => {
    const known = new Map<string, SessionContact>();
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
      if (known.has(phone)) return;
      known.set(phone, contact);
      destinations.push(phone);
      ids.push(contact.id);
    });
    return { queue: destinations, contactIds: ids, byPhone: known, unreachable: skipped };
  }, [contacts, currentUserId]);

  const { setQueue, winnerContactId, isRunning } = pool;
  useEffect(() => { setQueue(queue, contactIds); }, [setQueue, queue, contactIds]);
  useEffect(() => {
    if (winnerContactId != null) onFocusContact(winnerContactId);
  }, [winnerContactId, onFocusContact]);
  // Le quota bouge à chaque composition : on le relit à la fin du cycle.
  useEffect(() => { if (!isRunning) void loadConfig(); }, [isRunning, loadConfig]);

  const limit = config?.entitlement.calls_day_limit ?? null;
  const used = config?.entitlement.calls_today ?? 0;
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const quotaBlocked = remaining !== null && remaining === 0;
  const activeLines = pool.state.lines.filter((line) => line.phase !== 'idle');
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

      <div className="calls-power-strip__bar">
        {pool.isRunning ? (
          <Button variant="danger" onClick={pool.hangupAll}>Raccrocher tout</Button>
        ) : pool.hangupRetryable ? (
          <Button
            variant="danger"
            onClick={pool.hangupAll}
            title="Le raccrochage serveur a échoué — la session est encore active côté Telnyx."
          >Réessayer le raccrochage</Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => void (hasAttempted ? pool.redial() : pool.play())}
            disabled={pool.state.queue.length === 0 || quotaBlocked}
            title={quotaBlocked
              ? 'Limite d’appels du jour atteinte'
              : pool.state.queue.length === 0
                ? 'Aucun contact composable dans cette séance'
                : undefined}
          >
            <span aria-hidden="true">▶ </span>
            {hasAttempted ? 'Relancer' : `Lancer ${parallelism} appels`}
          </Button>
        )}

        <label className="calls-power-strip__field">
          Lignes
          <select
            className="calls-select"
            aria-label="Appels en parallèle"
            value={parallelism}
            disabled={pool.isRunning}
            onChange={(event) => setParallelism(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>

        {callerNumbers.length > 0 && (
          <label className="calls-power-strip__field">
            Appeler depuis
            <select
              className="calls-select"
              aria-label="Numéro sortant"
              value={callerNumber}
              disabled={pool.isRunning}
              onChange={(event) => setCallerNumber(event.target.value)}
            >
              {callerNumbers.map((number) => (
                <option key={number.e164} value={number.e164}>
                  {number.label ? `${number.label} · ${number.e164}` : number.e164}
                </option>
              ))}
            </select>
          </label>
        )}

        <span className="calls-power-strip__spacer" />

        {limit !== null && (
          <span
            className={`calls-power-strip__quota${quotaBlocked ? ' calls-power-strip__quota--blocked' : ''}`}
            title="Compositions décomptées de ton quota quotidien"
          >
            <strong className="xos-numeric">{used}/{limit}</strong> appels aujourd’hui
          </span>
        )}
      </div>

      {pool.state.error && <p className="calls-dialer__error" role="alert">{pool.state.error}</p>}

      <div className="calls-power-strip__lines" role="status" aria-live="polite">
        {activeLines.length === 0 ? (
          <span className="calls-muted">
            {pool.state.queue.length} contact{pool.state.queue.length > 1 ? 's' : ''} joignable
            {pool.state.queue.length > 1 ? 's' : ''}
            {unreachable > 0 && ` · ${unreachable} sans numéro composable`}
          </span>
        ) : (
          activeLines.map((line) => (
            <span
              key={line.slot}
              className={`calls-power-strip__line calls-power-strip__line--${line.phase}`}
            >
              <span className="calls-power-strip__line-name">
                {byPhone.get(line.destination)?.contact_name ?? line.destination}
              </span>
              <span className="calls-muted">{LINE_LABEL[line.phase] ?? line.phase}</span>
              {['dialing', 'ringing'].includes(line.phase) && (
                <Button variant="ghost" size="sm" onClick={() => pool.skip(line.slot)}>
                  Passer
                </Button>
              )}
              {line.phase === 'connected' && (
                <Button variant="danger" size="sm" onClick={pool.hangupAll}>
                  Raccrocher
                </Button>
              )}
            </span>
          ))
        )}
      </div>
    </GlassCard>
  );
}
