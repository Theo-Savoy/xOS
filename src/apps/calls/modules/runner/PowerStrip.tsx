import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, GlassCard, Select } from '../../../../components/ui';
import { playComboSound } from '../gamification/comboSounds';
import { readSoundsEnabled } from '../gamification/comboKeyboard';
import type { SessionContact } from '../../types';
import { useDialerPool } from '../dialer/application/useDialerPool';
import { fetchDialerConfig, type DialerConfig } from '../dialer/dialerApi';

/** Le serveur refuse tout le lot si un seul numéro n'est pas E.164 (pool.js). */
const E164 = /^\+[1-9]\d{6,14}$/;

/** Durée du sweep lumineux au lancement (miroir de --xos-power-launch en CSS). */
const LAUNCH_MS = 900;

const LINE_LABEL: Record<string, string> = {
  dialing: 'compose',
  ringing: 'sonne',
  connected: 'en ligne',
  ended: 'terminé',
  skipped: 'sans réponse',
  failed: 'échec',
};

/** +33184800001 → +33 1 84 80 00 01 (lisible dans le sélecteur). */
function formatFr(e164: string): string {
  const national = e164.startsWith('+33') ? e164.slice(3) : null;
  if (!national || national.length !== 9) return e164;
  return `+33 ${national[0]} ${national.slice(1).replace(/(\d{2})(?=\d)/g, '$1 ')}`;
}

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
 * ailleurs (état des lignes, réglages de composition, quota restant), et les
 * réglages s'effacent pendant un cycle pour ne laisser que l'essentiel.
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
  const [launching, setLaunching] = useState(false);
  const launchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  useEffect(() => () => {
    if (launchTimer.current) clearTimeout(launchTimer.current);
  }, []);

  const limit = config?.entitlement.calls_day_limit ?? null;
  const used = config?.entitlement.calls_today ?? 0;
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const quotaBlocked = remaining !== null && remaining === 0;
  const activeLines = pool.state.lines.filter((line) => line.phase !== 'idle');
  const hasAttempted = pool.state.lines.some((line) =>
    ['ended', 'skipped', 'failed'].includes(line.phase));

  const launch = () => {
    playComboSound('power-launch', { master: readSoundsEnabled() });
    setLaunching(true);
    if (launchTimer.current) clearTimeout(launchTimer.current);
    launchTimer.current = setTimeout(() => setLaunching(false), LAUNCH_MS);
    void (hasAttempted ? pool.redial() : pool.play());
  };

  return (
    <GlassCard
      className={`calls-power-strip${launching ? ' calls-power-strip--launching' : ''}`}
    >
      <audio
        data-rtc-agent=""
        autoPlay
        muted={!pool.agentConnected}
        className="calls-dialer__rtc-audio"
      />

      <div className="calls-power-strip__bar">
        <div className="calls-power-strip__controls">
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
              className="calls-power-strip__launch"
              onClick={launch}
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

          {/* Pendant un cycle, les réglages s'effacent : on ne change ni le
              nombre de lignes ni le numéro en cours de composition. */}
          {!pool.isRunning && (
            <>
              <Select
                className="calls-power-strip__select calls-power-strip__select--lines"
                label="Lignes"
                aria-label="Appels en parallèle"
                value={String(parallelism)}
                onChange={(value) => setParallelism(Number(value))}
                options={[1, 2, 3, 4, 5].map((count) => ({
                  value: String(count), label: String(count),
                }))}
              />
              {callerNumbers.length > 0 && (
                <Select
                  className="calls-power-strip__select calls-power-strip__select--caller"
                  label="Appeler depuis"
                  aria-label="Numéro sortant"
                  value={callerNumber}
                  onChange={setCallerNumber}
                  options={callerNumbers.map((number) => ({
                    value: number.e164,
                    label: number.label
                      ? `${number.label} · ${formatFr(number.e164)}`
                      : formatFr(number.e164),
                  }))}
                  renderValue={(selected) =>
                    selected[0]
                      ? (callerNumbers.find((n) => n.e164 === selected[0].value)?.label
                        ?? formatFr(selected[0].value))
                      : '—'}
                />
              )}
            </>
          )}
        </div>

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
          <span className="calls-power-strip__hint">
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
              <span className="calls-power-strip__line-phase">
                {LINE_LABEL[line.phase] ?? line.phase}
              </span>
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
