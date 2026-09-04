import type {
  ContactContext,
  SessionContact,
  SessionDetail,
  SessionSummary,
  TeamMember,
} from '../../../types';
import type { DeferPayload, LogPayload } from '../RunnerView.types';

export type { DeferPayload, LogPayload };

/** Mode d'affichage interne du runner historique */
export type RunnerLegacyMode = 'list' | 'detail';

/** Version du runner sélectionnée pour la session */
export type RunnerVersion = 'legacy' | 'v2';

/**
 * Machine d'états UI pure du mode Power (discriminée)
 * Dérivée des booléens du pool sans altérer useDialerPool ni pool.js.
 */
export type PowerUiState =
  | 'off' // powerOn=false — CTA primaire : Appeler séquentiel
  | 'ready' // powerOn, idle, pas de retry — CTA : Lancer N / Relancer
  | 'wave' // running, AUCUNE ligne connected — CTA : Raccrocher tout (panel uniquement)
  | 'conversation' // ≥1 ligne connected — CTA : Consigner & suivant
  | 'acw' // after-call work — CTA : Consigner & suivant
  | 'hangupRetry'; // hangupRetryable — CTA unique : Réessayer le raccrochage

/** Entrées booléennes brutes pour la projection du PowerUiState */
export interface PowerStateInputs {
  /** Mode Power disponible pour la session (entitlement + jeton API + session standard) */
  powerAvailable?: boolean;
  /** Interrupteur Power activé par l'utilisateur */
  powerOn: boolean;
  /** Le pool compose ou possède des lignes actives (hors idle/ended/skipped/failed) */
  isRunning?: boolean;
  /** Au moins une ligne est connectée avec un interlocuteur */
  hasConnectedLine?: boolean;
  /** L'utilisateur est en phase de consignation post-appel (after-call work) */
  isAcw?: boolean;
  /** Le raccrochage a échoué et nécessite une nouvelle tentative bloquante */
  hangupRetryable?: boolean;
}

/** CTA primaire unique associé à l'état Power courant */
export interface PowerPrimaryCta {
  id:
    | 'call-sequential'
    | 'launch-wave'
    | 'relaunch-wave'
    | 'hangup-all'
    | 'log-and-next'
    | 'retry-hangup';
  label: string;
  variant: 'primary' | 'danger' | 'warning' | 'default';
  location: 'header' | 'panel' | 'contact-acw';
}

/** Vue modèle projetée complète du mode Power */
export interface PowerViewModel {
  /** État discriminé courant */
  state: PowerUiState;
  /** CTA primaire déduit selon les règles d'arbitrage */
  primaryCta: PowerPrimaryCta;
  /** Indique si le mode Power est actif (allumé et disponible) */
  isPowerActive: boolean;
  /** Verrouillage des réglages (autorisés seulement en ready, masqués/verrouillés en wave/conversation/retry) */
  isSettingsLocked: boolean;
  /** Masquage de l'action d'appel séquentiel / CallBar */
  isCallBarHidden: boolean;
  /** Indique si la vague peut être relancée */
  canRelaunch: boolean;
  /** Indique si le bouton Raccrocher tout (panel uniquement) est actif */
  canHangupAll: boolean;
  /** Indique si le bouton de retry raccrochage est actif */
  canRetryHangup: boolean;
  /** En conversation Power ou en acw, le rail de file se replie pour libérer l'espace (D6 + Grok note b) */
  isQueueCollapsed: boolean;
}

/** Résultat de la projection unique de la file de contacts pour le mode Power */
export interface ProjectedPowerQueue {
  /** Numéros E.164 uniques prêts à composer dans l'ordre FIFO */
  queue: string[];
  /** IDs des contacts associés aux numéros uniques (premier contact retenu pour chaque numéro) */
  contactIds: number[];
  /** Association numéro normalisé -> fiche contact représentative */
  byPhone: Map<string, SessionContact>;
  /** Nombre de destinations prêtes dédupliquées (strictement égal à queue.length) */
  readyCount: number;
  /** Nombre de contacts éligibles pending mais sans numéro E.164 valide */
  unreachableCount: number;
  /** Nombre total de contacts pending éligibles (hors claims actifs d'autres agents) */
  totalEligiblePendingCount: number;
  /** Nombre de contacts en doublon de numéro écartés de la composition */
  duplicateCount: number;
}

/** État minimal remonté au shell pour arbitrer le focus et la surface bulk. */
export interface QueueToolState {
  hasSelection: boolean;
  isDirty: boolean;
}

/** Contrat d'entrée complet partagé entre la façade SessionWorkspace, RunnerView et V2 */
export interface RunnerSessionProps {
  session: SessionDetail;
  contacts: SessionContact[];
  hubSessions: SessionSummary[];
  currentContact: SessionContact | null;
  focusedContactId?: number | null;
  variant?: 'session' | 'recalls';
  loading: boolean;
  error: string | null;
  awaitingEvent: SessionContact | null;
  contactContext: ContactContext | null;
  contextContactId: number | null;
  contextTargetContactId?: number | null;
  onBack: () => void;
  onPin?: () => Promise<void>;
  onShareSession?: (memberUserIds: string[]) => Promise<void>;
  onFocusContact: (contactId: number) => void;
  onLogAndNext: (contactId: number, payload: LogPayload) => void;
  onLogRdvAndNext: (
    contactId: number,
    payload: LogPayload,
    event: {
      start: string;
      durationMin: number;
      subject: string;
      ownerSfUserId: string | null;
    },
  ) => void;
  onLogMany: (contactIds: number[], payload: LogPayload) => void;
  onLogEvent: (
    start: string,
    durationMin: number,
    meta: { subject: string; ownerSfUserId: string | null },
  ) => void;
  onDeferContacts: (contactIds: number[], payload: DeferPayload) => void;
  onRemoveContacts: (contactIds: number[]) => void;
  onUpdateRecall: (contactIds: number[], recallAt: string | null) => void;
  onCelebrateGoal?: (payload: { goal: number; count: number }) => void;
  team?: TeamMember[];
  currentSfUserId?: string | null;
  currentUserId?: string | null;
  token?: string | null;
  canPowerDialer?: boolean;
  /** État initial d'activation Power (optionnel, principalement utile aux tests) */
  initialPowerOn?: boolean;
  /**
   * Indique si la surface runner est active pour les interactions clavier/effets.
   * Lorsqu'elle est sous le pré-session (underlay flouté), active=false désactive le listener clavier.
   */
  active?: boolean;

  /** Surcharge optionnelle de la version du runner (pour tests ou rollout contrôlé) */
  runnerVersion?: RunnerVersion;
}

export type SessionWorkspaceProps = RunnerSessionProps;
