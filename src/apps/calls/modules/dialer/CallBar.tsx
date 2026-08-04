import { Button, Tag } from '../../../../components/ui';
import { useDialer } from './DialerProvider';
import type { CallPhase } from './domain/CallState';

/**
 * CallBar (plan Combo lot-11.3 §2.1) — barre d'appel persistante rendue
 * AU-DESSUS des vues quand un appel est actif. Contient :
 * - l'élément <audio data-rtc-remote> monté EN PERMANENCE (fix B2 audit
 *   11.3 : le SDK attache le flux distant ici — sans lui, l'appel part
 *   mais on n'entend rien)
 * - caller ID · numéro · phase · chrono · codec/MOS · bouton Raccrocher
 * - l'erreur éventuelle
 *
 * États : idle (masquée) / dialing / ringing / connected+chrono / wrapping
 * (ACW visible, jamais d'auto-next) / ended / failed + message.
 */

const PHASE_LABEL: Record<CallPhase, string> = {
  idle: 'Prêt',
  dialing: 'Composition…',
  ringing: 'Sonnerie…',
  connected: 'En communication',
  on_hold: 'En attente',
  wrapping: 'Clôture…',
  ended: 'Terminé',
  failed: 'Échec',
};

export function CallBar() {
  const { phase, error, durationSec, destination, hangup, isActive } = useDialer();

  if (!isActive && phase !== 'failed' && phase !== 'wrapping') {
    return null;
  }

  return (
    <div className="calls-callbar" data-testid="calls-callbar">
      {/* Sortie audio distante : monté en permanence ici (fix B2). */}
      <audio data-rtc-remote autoPlay className="calls-dialer__rtc-audio" />

      <div className="calls-callbar__status">
        <Tag variant={isActive ? 'accent' : phase === 'failed' ? 'alert' : 'muted'}>
          {PHASE_LABEL[phase]}
        </Tag>
        {phase === 'connected' && durationSec > 0 && (
          <span className="calls-dialer__duration">{durationSec}s</span>
        )}
      </div>

      {destination && <span className="calls-callbar__dest">{destination}</span>}

      {error && <p className="calls-dialer__error">{error}</p>}

      {isActive && (
        <Button variant="danger" onClick={hangup}>
          Raccrocher
        </Button>
      )}
    </div>
  );
}
