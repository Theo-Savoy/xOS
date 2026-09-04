import { useEffect } from 'react';
import type { ResultatCall } from '../../../../../crm';
import {
  digitFromKeyboardCode,
  isModKey,
  isTypingTarget,
  resultatFromDigit,
} from '../../gamification/comboKeyboard';

export interface SessionWorkspaceShortcutOptions {
  /** false sous le pré-session : le legacy reste l’unique listener actif. */
  active: boolean;
  /** La surface outil bulk capture le clavier tant qu'elle est ouverte. */
  bulkOpen: boolean;
  /** Permet à F de quitter proprement la surface outil pour revenir au contact. */
  queueOpen: boolean;
  /** Toutes les commandes V2 sont gelées en conversation Power. */
  isPowerConversation: boolean;
  onOpenQueue: () => void;
  onOpenContact: () => void;
  onPickResult: (resultat: ResultatCall) => boolean;
  onSubmit: () => boolean;
}

function isBlockedSurface(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('.calls-event-panel, [role="dialog"], [aria-modal="true"]'),
  );
}

function hasBlockingModal(allowQueueContactShortcut: boolean): boolean {
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(
    (dialog) =>
      !(
        allowQueueContactShortcut &&
        dialog.closest('[data-testid="queue-tool-overlay"]')
      ),
  );
}

/** Listener clavier unique du shell V2 (I11–I15). */
export function useSessionWorkspaceShortcuts({
  active,
  bulkOpen,
  queueOpen,
  isPowerConversation,
  onOpenQueue,
  onOpenContact,
  onPickResult,
  onSubmit,
}: SessionWorkspaceShortcutOptions): void {
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isPowerConversation) return;
      const modified = isModKey(event);
      const isOpenContactShortcut =
        !modified &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'f';
      if (bulkOpen && !isOpenContactShortcut) return;
      if (isTypingTarget(event.target)) return;
      if (
        isBlockedSurface(event.target) ||
        hasBlockingModal(queueOpen && isOpenContactShortcut)
      )
        return;

      if (
        modified &&
        event.key === 'Enter' &&
        !event.altKey &&
        !event.shiftKey
      ) {
        if (onSubmit()) event.preventDefault();
        return;
      }
      if (modified || event.altKey || event.shiftKey) return;

      const key = event.key.toLowerCase();
      if (key === 'l') {
        event.preventDefault();
        onOpenQueue();
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        onOpenContact();
        return;
      }

      const digit = digitFromKeyboardCode(event.code);
      if (!digit) return;
      const resultat = resultatFromDigit(digit);
      if (resultat && onPickResult(resultat)) event.preventDefault();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [
    active,
    bulkOpen,
    queueOpen,
    isPowerConversation,
    onOpenContact,
    onOpenQueue,
    onPickResult,
    onSubmit,
  ]);
}
