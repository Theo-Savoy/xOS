import { useCallback, useEffect, useState } from 'react';
import { Button, GlassCard, Tag } from '../../../../components/ui';
import {
  DialerApiError,
  fetchDialerConfig,
  type DialerConfig,
} from './dialerApi';
import { useRtcCall, type RtcCallStatus } from './application/useRtcCall';

export type DialerViewProps = {
  token: string;
  onBack: () => void;
};

function formatError(err: unknown): string {
  if (err instanceof DialerApiError) {
    switch (err.code) {
      case 'dialer_disabled':
        return 'Dialer désactivé : flags.dialer_enabled est false en base.';
      case 'dialer_entitlement_denied':
        return "Entitlement refusé : ton compte n'est pas autorisé pour ce dial (dry-run off).";
      case 'budget_exceeded_org_month':
        return 'Budget mensuel de l\u2019org dépassé.';
      case 'budget_exceeded_session':
        return 'Budget de session dépassé.';
      case 'budget_exceeded_user_day':
        return 'Budget journalier dépassé.';
      case 'calls_day_limit':
        return 'Limite d\u2019appels journalière atteinte.';
      case 'calls_month_limit':
        return 'Limite d\u2019appels mensuelle atteinte.';
      case 'dial_failed':
        return `Échec du dial côté Telnyx : ${err.message}`;
      case 'unauthenticated':
        return 'Session expirée : reconnecte-toi puis réessaie.';
      default:
        return `${err.code} (${err.status}) — ${err.message}`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

const PHASE_LABEL: Record<RtcCallStatus['phase'], string> = {
  idle: 'Prêt',
  dialing: 'Composition…',
  ringing: 'Sonnerie…',
  connected: 'En communication',
  on_hold: 'En attente',
  wrapping: 'Fermeture…',
  ended: 'Terminé',
  failed: 'Échec',
};

export function DialerView({ token, onBack }: DialerViewProps) {
  const [config, setConfig] = useState<DialerConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [callerNumber, setCallerNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ dry_run: boolean } | null>(null);

  const loadConfig = useCallback(async () => {
    setConfigError(null);
    try {
      setConfig(await fetchDialerConfig(token));
    } catch (err) {
      setConfigError(formatError(err));
    }
  }, [token]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // Sélection par défaut : premier numéro actif (le sélecteur s'alimente dès
  // que la config est chargée).
  useEffect(() => {
    if (!callerNumber && config?.caller_numbers?.length) {
      setCallerNumber(config.caller_numbers[0].e164);
    }
  }, [config, callerNumber]);

  // Trois niveaux, comme le serveur (fix codex lot-11.2 : entitlement oublié).
  const dryRunActive =
    config?.is_dry_run === true ||
    config?.flags.dry_run === true ||
    config?.entitlement?.dry_run === true;
  const enabled = config?.flags.enabled === true;

  const { phase, error, durationSec, startCall, hangup, isActive } = useRtcCall({
    token,
    dryRun: dryRunActive,
  });

  const onDial = useCallback(async () => {
    setResult(null);
    setFormError(null);
    if (!to.trim()) {
      setFormError('Numéro requis (format E.164, ex : +331****6789).');
      return;
    }
    const started = await startCall(to.trim(), callerNumber.trim() || undefined);
    if (started) {
      setResult({ dry_run: dryRunActive });
    }
  }, [to, callerNumber, startCall, dryRunActive]);

  return (
    <div className="calls-view">
      <header className="calls-view__header">
        <div>
          <Tag variant="accent">Combo</Tag>
          <h2>Dialer Telnyx</h2>
        </div>
        <div className="calls-view__actions">
          {isActive && (
            <Button variant="danger" onClick={hangup}>
              Raccrocher
            </Button>
          )}
          <Button variant="secondary" onClick={onBack}>
            Retour
          </Button>
        </div>
      </header>

      <section className="calls-dialer">
        <GlassCard>
          <div className="calls-dialer__config">
            <h3>État</h3>
            {configError ? (
              <p className="calls-dialer__error">{configError}</p>
            ) : !config ? (
              <p>Chargement de la config…</p>
            ) : (
              <ul className="calls-dialer__config-list">
                <li>
                  Environnement : <Tag variant={config.env === 'dryrun' ? 'muted' : 'accent'}>{config.env}</Tag>
                </li>
                <li>
                  Dry-run :{' '}
                  <Tag variant={dryRunActive ? 'accent' : 'alert'}>
                    {dryRunActive ? 'oui (aucun appel réel)' : 'non'}
                  </Tag>
                </li>
                <li>
                  Dialer :{' '}
                  <Tag variant={enabled ? 'accent' : 'alert'}>
                    {enabled ? 'activé' : 'désactivé (flag base)'}
                  </Tag>
                </li>
                <li>
                  Caller ID :{' '}
                  {config.has_caller_id ? (
                    <Tag variant="accent">configuré</Tag>
                  ) : (
                    <Tag variant="alert">absent</Tag>
                  )}
                </li>
                <li>
                  Webhook key :{' '}
                  {config.has_webhook_public_key ? (
                    <Tag variant="accent">configurée</Tag>
                  ) : (
                    <Tag variant="muted">absente (trial)</Tag>
                  )}
                </li>
                <li>Budget session : {config.flags.budget_session_cents}¢</li>
                <li>Budget org/mois : {config.flags.budget_org_month_cents}¢</li>
              </ul>
            )}
            <Button variant="ghost" size="sm" onClick={() => void loadConfig()}>
              Actualiser
            </Button>
          </div>
        </GlassCard>

        <GlassCard>
          <h3>Appeler (click-to-call, un appel à la fois)</h3>
          <div className="calls-dialer__call-status">
            <Tag variant={isActive ? 'accent' : 'muted'}>{PHASE_LABEL[phase]}</Tag>
            {phase === 'connected' && durationSec > 0 && (
              <span className="calls-dialer__duration">{durationSec}s</span>
            )}
            {phase === 'connected' && (
              <span className="calls-dialer__hint">
                — raccroche avec le bouton Raccrocher ou en fermant l'appel
              </span>
            )}
          </div>
          <div className="calls-dialer__form">
            <label>
              Numéro (E.164)
              <input
                type="tel"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="+331****6789"
                autoComplete="off"
                disabled={isActive}
              />
            </label>
            <label>
              Appeler en tant que (caller ID)
              {config?.caller_numbers?.length ? (
                <select
                  value={callerNumber}
                  onChange={(e) => setCallerNumber(e.target.value)}
                  disabled={isActive}
                >
                  {config.caller_numbers.map((n) => (
                    <option key={n.e164} value={n.e164}>
                      {n.label ? `${n.label} — ` : ''}
                      {n.e164}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="tel"
                  value={callerNumber}
                  onChange={(e) => setCallerNumber(e.target.value)}
                  placeholder="+331****6789 (fallback config)"
                  autoComplete="off"
                  disabled={isActive}
                />
              )}
              <span className="calls-dialer__hint">
                Numéro affiché au prospect (allocation par utilisateur).
              </span>
            </label>
            <Button
              onClick={() => void onDial()}
              disabled={isActive}
              variant={dryRunActive ? 'secondary' : 'primary'}
            >
              {dryRunActive ? 'Dial dry-run' : 'Appeler'}
            </Button>
          </div>

          {formError && <p className="calls-dialer__error">{formError}</p>}
          {error && <p className="calls-dialer__error">{error}</p>}

          {result && phase === 'ended' && (
            <div className="calls-dialer__result">
              <h4>Appel terminé</h4>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </GlassCard>

        <p className="calls-dialer__note">
          Démarchage B2B — click-to-call humain, sans parallélisation (conforme
          plan de numérotation ARCEP, cf. docs/compliance/demarchage-b2b-france.md).
        </p>
      </section>
    </div>
  );
}
