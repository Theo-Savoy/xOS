import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, GlassCard, Tag } from '../../../../components/ui';
import {
  DialerApiError,
  dialCall,
  fetchDialerConfig,
  type DialCallResult,
  type DialerConfig,
} from './dialerApi';

export type DialerViewProps = {
  token: string;
  onBack: () => void;
  /** Surcharge pour les tests : webhook par défaut. */
  defaultWebhookUrl?: string;
};

const WEBHOOK_HINT =
  'webhook du dial : en dev c\u2019est le tunnel cloudflared, en prod l\u2019URL Vercel.';

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

export function DialerView({
  token,
  onBack,
  defaultWebhookUrl,
}: DialerViewProps) {
  const [config, setConfig] = useState<DialerConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState(
    () =>
      defaultWebhookUrl ??
      (typeof window !== 'undefined'
        ? `${window.location.origin}/api/dialer?resource=webhooks`
        : ''),
  );
  const [dialing, setDialing] = useState(false);
  // Garde synchrone anti-double-clic (P0 codex) : disabled={dialing} ne suffit
  // pas car setState est asynchrone — deux clics rapprochés = deux vrais appels.
  const dialingRef = useRef(false);
  const [result, setResult] = useState<DialCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const onDial = useCallback(async () => {
    // Garde synchrone : un appel déjà en vol bloque les clics suivants.
    if (dialingRef.current) return;
    setError(null);
    setResult(null);
    if (!to.trim()) {
      setError('Numéro requis (format E.164, ex : +331****6789).');
      return;
    }
    if (!connectionId.trim()) {
      setError('Connection ID requis (Application ID Telnyx).');
      return;
    }
    if (!webhookUrl.trim()) {
      setError('Webhook URL requise.');
      return;
    }
    dialingRef.current = true;
    setDialing(true);
    try {
      setResult(
        await dialCall(token, {
          to: to.trim(),
          connectionId: connectionId.trim(),
          webhookUrl: webhookUrl.trim(),
        }),
      );
    } catch (err) {
      setError(formatError(err));
    } finally {
      dialingRef.current = false;
      setDialing(false);
    }
  }, [token, to, connectionId, webhookUrl]);

  const dryRunActive = config?.is_dry_run === true || config?.flags.dry_run === true;
  const enabled = config?.flags.enabled === true;

  return (
    <div className="calls-view">
      <header className="calls-view__header">
        <div>
          <Tag variant="accent">Combo</Tag>
          <h2>Dialer Telnyx</h2>
        </div>
        <div className="calls-view__actions">
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
          <div className="calls-dialer__form">
            <label>
              Numéro (E.164)
              <input
                type="tel"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="+33123456789"
                autoComplete="off"
              />
            </label>
            <label>
              Connection ID (Application ID Telnyx)
              <input
                type="text"
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
                placeholder="1a2b3c4d-…"
                autoComplete="off"
              />
            </label>
            <label>
              Webhook URL
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://…/api/dialer?resource=webhooks"
                autoComplete="off"
              />
              <span className="calls-dialer__hint">{WEBHOOK_HINT}</span>
            </label>
            <Button
              onClick={() => void onDial()}
              disabled={dialing}
              variant={dryRunActive ? 'secondary' : 'primary'}
            >
              {dialing ? 'Appel en cours…' : dryRunActive ? 'Dial dry-run' : 'Appeler'}
            </Button>
          </div>

          {error && <p className="calls-dialer__error">{error}</p>}

          {result && (
            <div className="calls-dialer__result">
              <h4>Résultat</h4>
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
