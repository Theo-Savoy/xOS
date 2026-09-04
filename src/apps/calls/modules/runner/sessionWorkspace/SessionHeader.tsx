import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../../../components/ui';
import type { SessionContact, SessionDetail, TeamMember } from '../../../types';
import { ShortcutHelp } from '../../../CommandBar';
import { countSessionRdvs } from '../../gamification/rdvCelebrate';
import { ShareSessionPanel } from '../../sessions/ShareSessionPanel';

export interface SessionHeaderProps {
  session: SessionDetail;
  contacts: SessionContact[];
  onBack: () => void;
  onPin?: () => Promise<void>;
  onShareSession?: (memberUserIds: string[]) => Promise<void>;
  team?: TeamMember[];
  currentUserId?: string | null;
  onOpenCommandBar?: () => void;
  /** Déclencheur optionnel pour la sheet Contexte CRM en responsive (<900px) */
  onToggleInspectorSheet?: () => void;
  isInspectorSheetOpen?: boolean;
  /** Déclencheur optionnel pour la sheet File d'attente en responsive (<720px) */
  onToggleQueueSheet?: () => void;
  isQueueSheetOpen?: boolean;
  /** Droits Power Dialer disponibles */
  canPowerDialer?: boolean;
  /** État d'activation du mode Power */
  isPowerActive?: boolean;
  /** Bascule l'activation du mode Power */
  onTogglePower?: () => void;
  /** Déclencheur pour ouvrir la sheet Power en affichage mobile (<720px) */
  onTogglePowerSheet?: () => void;
  isPowerSheetOpen?: boolean;
}

export function SessionHeader({
  session,
  contacts,
  onBack,
  onPin,
  onShareSession,
  team = [],
  currentUserId = null,
  onOpenCommandBar,
  onToggleInspectorSheet,
  isInspectorSheetOpen,
  onToggleQueueSheet,
  isQueueSheetOpen,
  canPowerDialer = false,
  isPowerActive = false,
  onTogglePower,
  onTogglePowerSheet,
  isPowerSheetOpen = false,
}: SessionHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Fermer le menu lors d'un clic en dehors
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Progression condensée une ligne (Plan §1.3 & D7) : « 18/42 · 2/4 RDV »
  const totalCount = contacts.length;
  const treatedCount = contacts.filter((c) => c.status !== 'pending').length;
  const rdvCount = countSessionRdvs(contacts);
  const rdvGoal = session.rdv_goal ?? null;
  const progressText = `${treatedCount}/${totalCount} · ${
    rdvGoal != null ? `${rdvCount}/${rdvGoal} RDV` : `${rdvCount} RDV`
  }`;

  const handlePin = async () => {
    if (!onPin || isPinning || isPinned) return;
    setIsPinning(true);
    try {
      await onPin();
      setIsPinned(true);
      setIsMenuOpen(false);
    } catch {
      // ignore
    } finally {
      setIsPinning(false);
    }
  };

  const handleShareSave = async (memberUserIds: string[]) => {
    if (!onShareSession) return;
    setShareSaving(true);
    try {
      await onShareSession(memberUserIds);
      setShareOpen(false);
      setIsMenuOpen(false);
    } finally {
      setShareSaving(false);
    }
  };

  return (
    <header
      className="calls-workspace__header"
      role="banner"
      aria-label="En-tête de séance"
    >
      <div className="calls-workspace__header-left">
        <Button
          variant="secondary"
          size="md"
          className="calls-workspace__back-btn"
          onClick={onBack}
          aria-label="Retour aux séances"
        >
          Quitter
        </Button>
        <div className="calls-workspace__title-group">
          <h2 className="calls-workspace__title">{session.name}</h2>
          <span
            className="calls-workspace__progress-badge xos-numeric"
            aria-label={`Progression : ${progressText}`}
          >
            {progressText}
          </span>
        </div>
      </div>

      <div className="calls-workspace__header-right">
        {/* Toggles responsive pour sheets (<900px et <720px) */}
        {onToggleQueueSheet && (
          <Button
            variant="ghost"
            size="md"
            className="calls-workspace__sheet-toggle calls-workspace__sheet-toggle--queue"
            onClick={onToggleQueueSheet}
            aria-expanded={isQueueSheetOpen}
            aria-label="Ouvrir la file d'attente"
          >
            File ({contacts.length})
          </Button>
        )}

        {onToggleInspectorSheet && (
          <Button
            variant="ghost"
            size="md"
            className="calls-workspace__sheet-toggle calls-workspace__sheet-toggle--inspector"
            onClick={onToggleInspectorSheet}
            aria-expanded={isInspectorSheetOpen}
            aria-label="Ouvrir le contexte CRM"
          >
            Contexte CRM
          </Button>
        )}

        {/* Toggle Power : activation desktop et ouverture sheet mobile */}
        {canPowerDialer && onTogglePower && (
          <Button
            variant={isPowerActive ? 'primary' : 'ghost'}
            size="md"
            className="calls-workspace__power-toggle-btn"
            onClick={onTogglePower}
            aria-pressed={isPowerActive}
            aria-label={isPowerActive ? 'Désactiver le mode Power' : 'Activer le mode Power'}
          >
            ⚡ Power
          </Button>
        )}

        {canPowerDialer && onTogglePowerSheet && (
          <Button
            variant={isPowerActive ? 'primary' : 'ghost'}
            size="md"
            className="calls-workspace__sheet-toggle calls-workspace__sheet-toggle--power"
            onClick={onTogglePowerSheet}
            aria-expanded={isPowerSheetOpen}
            aria-label="Ouvrir la console Power"
          >
            ⚡ Power
          </Button>
        )}
        {/* Menu utilitaires de la séance (partage, épinglage, aide, commandes AU MENU uniquement) */}
        <div className="calls-workspace__menu-container" ref={menuRef}>
          <Button
            variant="ghost"
            size="md"
            className="calls-workspace__menu-btn"
            aria-label="Menu utilitaires de la séance"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            …
          </Button>

          {isMenuOpen && (
            <div
              className="calls-workspace__menu-dropdown"
              role="menu"
              aria-label="Options de la séance"
            >
              {onShareSession && currentUserId && (
                <Button
                  variant="ghost"
                  className="calls-workspace__menu-item"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setShareOpen(true);
                  }}
                >
                  Partager la séance
                </Button>
              )}

              {onPin && (
                <Button
                  variant="ghost"
                  className="calls-workspace__menu-item"
                  role="menuitem"
                  disabled={isPinned || isPinning}
                  onClick={handlePin}
                >
                  {isPinned ? 'Séance épinglée' : 'Épingler la séance'}
                </Button>
              )}

              <Button
                variant="ghost"
                className="calls-workspace__menu-item"
                role="menuitem"
                onClick={() => {
                  setIsMenuOpen(false);
                  setHelpOpen(true);
                }}
              >
                Aide & raccourcis clavier
              </Button>

              {onOpenCommandBar && (
                <Button
                  variant="ghost"
                  className="calls-workspace__menu-item"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenCommandBar();
                  }}
                >
                  Palette de commandes (⌘K)
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {shareOpen && onShareSession && currentUserId && (
        <ShareSessionPanel
          members={session.members ?? []}
          team={team}
          currentUserId={currentUserId}
          saving={shareSaving}
          onSave={handleShareSave}
          onClose={() => setShareOpen(false)}
        />
      )}

      <ShortcutHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onOpenCommandBar={onOpenCommandBar ?? (() => {})}
      />
    </header>
  );
}
