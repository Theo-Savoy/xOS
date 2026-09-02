import { useEffect, useState } from 'react';
import { Button, GlassCard, Tag } from '../../components/ui';
import { DialerProvider } from '../calls/modules/dialer/DialerProvider';
import { DialerView } from '../calls/modules/dialer/DialerView';
import { PowerDialerView } from '../calls/modules/dialer/PowerDialerView';
import {
  fetchDialerConfig,
  type DialerConfig,
} from '../calls/modules/dialer/dialerApi';
import '../calls/calls.css';
import '../calls/calls-dialer.css';

type Tool = 'dialer' | 'power';

/**
 * Bancs d'essai Telnyx (composition unitaire, pool de lignes). Ce sont des
 * outils de diagnostic : ils vivent aux Coulisses, pas sur l'accueil de Combo
 * où les commerciaux travaillent — le power dialing de production est intégré
 * au runner de séance.
 */
export function DialerTools({ token }: { token: string }) {
  const [config, setConfig] = useState<DialerConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDialerConfig(token)
      .then((next) => { if (!cancelled) setConfig(next); })
      .catch(() => { if (!cancelled) setConfig(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [token]);

  // Mêmes conditions que l'ancien gating de Combo : entitlement + flag serveur
  // + caller ID, plus connection/webhook pour le pool.
  const dialerReady = Boolean(
    config?.entitlement?.enabled && config.flags?.enabled && config.has_caller_id,
  );
  const powerReady = Boolean(
    dialerReady && config?.has_connection_id && config?.has_webhook_public_key,
  );

  if (tool) {
    return (
      <GlassCard className="hub-panel hub-dialer-tools hub-dialer-tools--open">
        <DialerProvider
          token={token}
          dryRun={config?.is_dry_run !== false || config?.entitlement?.dry_run !== false}
        >
          {tool === 'dialer' ? (
            <DialerView token={token} onBack={() => setTool(null)} />
          ) : (
            <PowerDialerView token={token} onBack={() => setTool(null)} />
          )}
        </DialerProvider>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="hub-panel hub-dialer-tools">
      <p className="hub-eyebrow">Telnyx</p>
      <h3>Bancs d’essai dialer</h3>
      <p className="hub-dialer-tools__hint">
        Diagnostic de la téléphonie : composition unitaire et pool de lignes en
        mode démo. Le power dialing de production se lance depuis une séance
        Combo.
      </p>
      {loaded && !dialerReady ? (
        <p className="hub-dialer-tools__hint">
          <Tag variant="warning">Indisponible</Tag> Dialer non activé pour ce
          compte (entitlement, flag serveur ou caller ID manquant).
        </p>
      ) : (
        <div className="hub-dialer-tools__actions">
          <Button
            variant="secondary"
            disabled={!dialerReady}
            onClick={() => setTool('dialer')}
          >
            Dialer
          </Button>
          <Button
            variant="secondary"
            disabled={!powerReady}
            title={dialerReady && !powerReady
              ? 'Connection ID ou clé webhook Telnyx manquants'
              : undefined}
            onClick={() => setTool('power')}
          >
            Power dialer
          </Button>
        </div>
      )}
    </GlassCard>
  );
}
