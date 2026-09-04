import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  EmptyState,
  Tag,
} from '../../../../../components/ui';
import {
  RECALL_ELIGIBLE_RESULTATS,
  RELANCE_DEFAULT_RESULTATS,
  type ResultatCall,
} from '../../../../../crm';
import type { SessionContact, SessionSummary } from '../../../types';
import { ResultButtons } from '../../../ResultButtons';
import { RecallFields } from '../../rdv/RecallFields';
import {
  addDaysIso,
  listStatusDisplay,
  readDefaultRecallDays,
} from '../runnerFormatters';
import { nextContinuationName } from '../../sessions/sessionNaming';
import type { DeferPayload, LogPayload } from '../RunnerView.types';
import type { QueueToolState } from './types';

type QueueStatusFilter = 'all' | 'pending' | 'called' | 'skipped';

const DEFAULT_RESULT = 'Appel non décroché' as ResultatCall;

export interface QueueToolOverlayProps {
  open: boolean;
  contacts: SessionContact[];
  sessionId: number;
  sessionName: string;
  hubSessions: SessionSummary[];
  currentUserId?: string | null;
  loading?: boolean;
  error?: string | null;
  isPowerConversation?: boolean;
  onClose: () => void;
  onRequestFocus: (contactId: number) => void;
  onStateChange: (state: QueueToolState) => void;
  onLogMany: (contactIds: number[], payload: LogPayload) => void;
  onDeferContacts: (contactIds: number[], payload: DeferPayload) => void;
  onRemoveContacts: (contactIds: number[]) => void;
  onUpdateRecall: (contactIds: number[], recallAt: string | null) => void;
}

function isClaimedByOther(
  contact: SessionContact,
  currentUserId: string | null | undefined,
): boolean {
  return Boolean(
    contact.claim_active &&
      contact.claimed_by &&
      contact.claimed_by !== currentUserId,
  );
}

function isSelectable(contact: SessionContact): boolean {
  return (
    contact.status === 'pending' ||
    (contact.status === 'called' && Boolean(contact.recall_at))
  );
}

export function QueueToolOverlay({
  open,
  contacts,
  sessionId,
  sessionName,
  hubSessions,
  currentUserId = null,
  loading = false,
  error = null,
  isPowerConversation = false,
  onClose,
  onRequestFocus,
  onStateChange,
  onLogMany,
  onDeferContacts,
  onRemoveContacts,
  onUpdateRecall,
}: QueueToolOverlayProps) {
  const defaultRecallAt = useMemo(
    () => addDaysIso(readDefaultRecallDays()),
    [],
  );
  const defaultScheduleRecall = RELANCE_DEFAULT_RESULTATS.includes(DEFAULT_RESULT);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkResultat, setBulkResultat] = useState<ResultatCall>(DEFAULT_RESULT);
  const [bulkComments, setBulkComments] = useState('');
  const [bulkRecallAt, setBulkRecallAt] = useState(defaultRecallAt);
  const [bulkScheduleRecall, setBulkScheduleRecall] = useState(
    defaultScheduleRecall,
  );
  const [bulkDoNotCall, setBulkDoNotCall] = useState(false);
  const [isDeferOpen, setIsDeferOpen] = useState(false);
  const [deferDate, setDeferDate] = useState(defaultRecallAt);
  const [deferTargetId, setDeferTargetId] = useState<number | null>(null);
  const [recallDate, setRecallDate] = useState(defaultRecallAt);

  const isDirty =
    bulkResultat !== DEFAULT_RESULT ||
    bulkComments.trim().length > 0 ||
    bulkRecallAt !== defaultRecallAt ||
    bulkScheduleRecall !== defaultScheduleRecall ||
    bulkDoNotCall;

  const filteredContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr-FR');
    return contacts.filter((contact) => {
      if (statusFilter !== 'all' && contact.status !== statusFilter)
        return false;
      if (!normalizedQuery) return true;
      return [
        contact.contact_name,
        contact.account_name,
        contact.title,
        contact.phone,
        contact.email,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase('fr-FR').includes(normalizedQuery),
        );
    });
  }, [contacts, query, statusFilter]);

  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedIds.includes(contact.id)),
    [contacts, selectedIds],
  );
  const pendingSelected = useMemo(
    () => selectedContacts.filter((contact) => contact.status === 'pending'),
    [selectedContacts],
  );
  const recallManageSelected = useMemo(
    () =>
      selectedContacts.filter(
        (contact) => contact.status === 'called' && Boolean(contact.recall_at),
      ),
    [selectedContacts],
  );
  const removableSelectedIds = useMemo(
    () =>
      selectedContacts
        .filter((contact) => !isClaimedByOther(contact, currentUserId))
        .map((contact) => contact.id),
    [currentUserId, selectedContacts],
  );
  const recallSeed =
    recallManageSelected[0]?.recall_at || recallDate || defaultRecallAt;
  const deferCandidates = useMemo(
    () =>
      hubSessions.filter(
        (candidate) =>
          candidate.id !== sessionId &&
          candidate.status === 'active' &&
          candidate.scheduled_for === deferDate,
      ),
    [deferDate, hubSessions, sessionId],
  );

  useEffect(() => {
    onStateChange({
      hasSelection: selectedIds.length > 0,
      isDirty,
    });
  }, [isDirty, onStateChange, selectedIds.length]);

  useEffect(() => {
    if (open) return;
    setQuery('');
    setStatusFilter('all');
    setSelectedIds([]);
    setBulkResultat(DEFAULT_RESULT);
    setBulkComments('');
    setBulkRecallAt(defaultRecallAt);
    setBulkScheduleRecall(defaultScheduleRecall);
    setBulkDoNotCall(false);
    setIsDeferOpen(false);
    setDeferDate(defaultRecallAt);
    setDeferTargetId(null);
    setRecallDate(defaultRecallAt);
  }, [defaultRecallAt, defaultScheduleRecall, open]);

  useEffect(() => {
    if (!open) return;
    const selectableIds = new Set(
      contacts
        .filter(
          (contact) =>
            isSelectable(contact) &&
            !isClaimedByOther(contact, currentUserId),
        )
        .map((contact) => contact.id),
    );
    setSelectedIds((current) => {
      const next = current.filter((id) => selectableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [contacts, currentUserId, open]);

  useEffect(() => {
    setBulkScheduleRecall(RELANCE_DEFAULT_RESULTATS.includes(bulkResultat));
  }, [bulkResultat]);

  const resetBulkForm = () => {
    setBulkResultat(DEFAULT_RESULT);
    setBulkComments('');
    setBulkRecallAt(defaultRecallAt);
    setBulkScheduleRecall(defaultScheduleRecall);
    setBulkDoNotCall(false);
  };

  const toggleSelected = (contact: SessionContact, checked: boolean) => {
    if (
      !isSelectable(contact) ||
      isClaimedByOther(contact, currentUserId)
    ) {
      return;
    }
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(contact.id)
          ? current
          : [...current, contact.id];
      }
      return current.filter((id) => id !== contact.id);
    });
  };

  const handleBulkLog = () => {
    if (pendingSelected.length === 0 || bulkResultat === 'RDV planifié') return;
    onLogMany(
      pendingSelected.map((contact) => contact.id),
      {
        resultat: bulkResultat,
        comments: bulkComments.trim(),
        recallAt:
          RECALL_ELIGIBLE_RESULTATS.includes(bulkResultat) &&
          bulkScheduleRecall &&
          !bulkDoNotCall
            ? bulkRecallAt
            : null,
        doNotCall: bulkDoNotCall,
      },
    );
    setSelectedIds([]);
    resetBulkForm();
  };

  const handleDefer = () => {
    if (pendingSelected.length === 0) return;
    onDeferContacts(
      pendingSelected.map((contact) => contact.id),
      {
        scheduledFor: deferDate,
        targetSessionId: deferTargetId,
        name: deferTargetId ? null : nextContinuationName(sessionName),
      },
    );
    setSelectedIds([]);
    resetBulkForm();
    setIsDeferOpen(false);
    setDeferTargetId(null);
  };

  const handleRecallDate = (next: string) => {
    if (recallManageSelected.length === 0) return;
    onUpdateRecall(
      recallManageSelected.map((contact) => contact.id),
      next,
    );
    setRecallDate(next);
    setSelectedIds([]);
  };

  const handleRecallQuickPick = (days: number) => {
    handleRecallDate(addDaysIso(days));
  };

  const handleRemove = () => {
    if (removableSelectedIds.length === 0) return;
    onRemoveContacts(removableSelectedIds);
    setSelectedIds([]);
    resetBulkForm();
  };

  // C3 Opus : comportement du kit Modal (Échap + focus trap + restauration du focus)
  // appliqué à la surface outil, sans casser le layout custom.
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open || isPowerConversation) return null;

  return (
    <div
      className="calls-workspace__queue-tool-backdrop"
      onClick={onClose}
      data-testid="queue-tool-overlay"
    >
      <section
        ref={panelRef}
        className="calls-workspace__queue-tool"
        role="dialog"
        aria-modal="true"
        aria-label="File étendue"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="calls-workspace__queue-tool-header">
          <div>
            <p className="calls-workspace__eyebrow">Surface outil de la file</p>
            <h2>File étendue</h2>
            <p className="calls-muted">
              Recherchez, sélectionnez et agissez sans basculer vers un second
              mode de liste.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Fermer la file étendue"
          >
            ✕
          </Button>
        </header>

        <div className="calls-workspace__queue-tool-toolbar">
          <label className="calls-workspace__queue-tool-search">
            <span>Rechercher</span>
            <input
              type="search"
              className="calls-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Rechercher dans la file"
              placeholder="Nom, compte, téléphone…"
            />
          </label>
          <div
            className="calls-workspace__queue-tool-filters"
            role="group"
            aria-label="Filtrer la file"
          >
            {(
              [
                ['all', 'Tous'],
                ['pending', 'À faire'],
                ['called', 'Appelés'],
                ['skipped', 'Non contactés'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                className={
                  statusFilter === value
                    ? 'calls-workspace__queue-tool-filter--active'
                    : undefined
                }
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {error && (
          <p
            className="calls-workspace__queue-tool-error calls-error"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </p>
        )}

        <div className="calls-workspace__queue-tool-content">
          {filteredContacts.length === 0 ? (
            <EmptyState
              title="Aucun contact trouvé"
              description="Modifiez la recherche ou le filtre de la file."
            />
          ) : (
            <ul
              className="calls-workspace__queue-tool-list"
              role="list"
              aria-label="Contacts de la file étendue"
            >
              {filteredContacts.map((contact) => {
                const statusInfo = listStatusDisplay(contact);
                const claimedByOther = isClaimedByOther(
                  contact,
                  currentUserId,
                );
                const selectable = isSelectable(contact) && !claimedByOther;
                const selected = selectedIds.includes(contact.id);

                return (
                  <li
                    key={contact.id}
                    className={`calls-workspace__queue-tool-row${selected ? ' calls-workspace__queue-tool-row--selected' : ''}`}
                  >
                    <Checkbox
                      checked={selected}
                      disabled={!selectable}
                      onChange={(checked) => toggleSelected(contact, checked)}
                      aria-label={`Sélectionner ${contact.contact_name}`}
                    />
                    <div className="calls-workspace__queue-tool-contact">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="calls-workspace__queue-tool-contact-link"
                        onClick={() => onRequestFocus(contact.id)}
                        aria-label={`Ouvrir ${contact.contact_name}`}
                      >
                        {contact.contact_name}
                      </Button>
                      <span className="calls-workspace__queue-tool-account">
                        {contact.account_name || 'Compte inconnu'}
                      </span>
                    </div>
                    <div className="calls-workspace__queue-tool-meta">
                      {claimedByOther ? (
                        <Tag variant="alert">
                          Pris par {contact.claimed_by_label || 'un autre agent'}
                        </Tag>
                      ) : (
                        <Tag variant={statusInfo.variant}>{statusInfo.label}</Tag>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <section
            className="calls-workspace__queue-tool-bulk"
            aria-label="Actions groupées"
          >
            <div className="calls-workspace__queue-tool-bulk-head">
              <h3>Actions groupées</h3>
              <span className="calls-muted">
                {selectedIds.length} sélectionné
                {selectedIds.length > 1 ? 's' : ''}
              </span>
            </div>
            {selectedIds.length === 0 ? (
              <p className="calls-muted">
                Sélectionnez un ou plusieurs contacts pour afficher les actions.
              </p>
            ) : (
              <>
                {pendingSelected.length > 0 && (
                  <div className="calls-workspace__queue-tool-form">
                    <div className="calls-fb-control">
                      <div className="calls-fb-control__label">
                        <span>Résultat</span>
                      </div>
                      <ResultButtons
                        value={bulkResultat}
                        onChange={setBulkResultat}
                        disabledValues={['RDV planifié']}
                      />
                    </div>

                    {RECALL_ELIGIBLE_RESULTATS.includes(bulkResultat) &&
                      !bulkDoNotCall && (
                        <RecallFields
                          resultat={bulkResultat}
                          scheduleRecall={bulkScheduleRecall}
                          onScheduleRecallChange={setBulkScheduleRecall}
                          recallAt={bulkRecallAt}
                          onRecallAtChange={setBulkRecallAt}
                          onDefaultRecallDaysChange={(days) =>
                            setBulkRecallAt(addDaysIso(days))
                          }
                        />
                      )}

                    <Checkbox
                      checked={bulkDoNotCall}
                      onChange={setBulkDoNotCall}
                      aria-label="Ne pas rappeler (NPA)"
                      label="Ne pas rappeler (NPA) — définitif"
                      className="calls-checkbox"
                    />
                    <label className="calls-workspace__queue-tool-comment">
                      <span>Commentaire groupé</span>
                      <textarea
                        className="calls-textarea"
                        rows={3}
                        value={bulkComments}
                        onChange={(event) => setBulkComments(event.target.value)}
                        aria-label="Commentaire groupé"
                        placeholder="Note commune pour la sélection…"
                      />
                    </label>
                    <p className="calls-muted calls-workspace__queue-tool-wave-hint">
                      Les consignations sont exécutées par CallManagerApp en
                      vagues de 4.
                    </p>
                    <div className="calls-runner-actions">
                      <Button
                        onClick={handleBulkLog}
                        disabled={loading || bulkResultat === 'RDV planifié'}
                      >
                        {loading
                          ? 'Enregistrement…'
                          : `Consigner pour ${pendingSelected.length}`}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setIsDeferOpen((current) => !current);
                          setDeferDate(defaultRecallAt);
                          setDeferTargetId(null);
                        }}
                        disabled={loading}
                      >
                        Reporter
                      </Button>
                    </div>
                  </div>
                )}

                {recallManageSelected.length > 0 && (
                  <div
                    className="calls-workspace__queue-tool-recalls"
                    role="group"
                    aria-label="Gestion des rappels"
                  >
                    <strong>Rappels existants</strong>
                    <div className="calls-recall__presets">
                      {([
                        [0, "Rappel aujourd'hui"],
                        [1, 'Rappel +1 j'],
                        [3, 'Rappel +3 j'],
                        [7, 'Rappel +7 j'],
                        [14, 'Rappel +14 j'],
                      ] as const).map(([days, label]) => (
                        <Button
                          key={days}
                          variant="ghost"
                          size="sm"
                          aria-label={label}
                          onClick={() => handleRecallQuickPick(Number(days))}
                          disabled={loading}
                        >
                          {label}
                        </Button>
                      ))}
                      <DatePicker
                        compact
                        label="Date du rappel groupé"
                        triggerLabel={`Choisir une date (${recallManageSelected.length})`}
                        value={recallSeed}
                        onChange={handleRecallDate}
                        triggerClassName="calls-workspace__queue-tool-date"
                      />
                    </div>
                  </div>
                )}

                <div className="calls-runner-actions">
                  <Button
                    variant="secondary"
                    onClick={handleRemove}
                    disabled={loading || removableSelectedIds.length === 0}
                  >
                    Retirer la sélection
                  </Button>
                </div>

                {isDeferOpen && pendingSelected.length > 0 && (
                  <section
                    className="calls-workspace__queue-tool-defer"
                    role="region"
                    aria-label="Reporter les contacts"
                  >
                    <strong>Reporter → {nextContinuationName(sessionName)}</strong>
                    <DatePicker
                      label="Date de la séance de report"
                      value={deferDate}
                      onChange={(next) => {
                        setDeferDate(next);
                        setDeferTargetId(null);
                      }}
                    />
                    {deferCandidates.length > 0 ? (
                      <ul className="calls-workspace__queue-tool-candidates">
                        {deferCandidates.map((candidate) => (
                          <li key={candidate.id}>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-pressed={deferTargetId === candidate.id}
                              onClick={() => setDeferTargetId(candidate.id)}
                            >
                              {candidate.name} · {candidate.pending} restants
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="calls-muted">
                        Nouvelle séance « {nextContinuationName(sessionName)} ».
                      </p>
                    )}
                    <div className="calls-runner-actions">
                      <Button onClick={handleDefer} disabled={loading}>
                        {deferTargetId
                          ? 'Associer à la séance'
                          : `Créer ${nextContinuationName(sessionName)}`}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setIsDeferOpen(false)}
                        disabled={loading}
                      >
                        Annuler
                      </Button>
                    </div>
                  </section>
                )}
              </>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
