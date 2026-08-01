import { useRef } from 'react';
import { Button, GlassCard } from '../../../../components/ui';
import { useComboOverlay } from './comboOverlay';
import {
  badgeLabel,
  currentPalier,
  summarizeComboBadges,
  summarizeComboStreaks,
  useComboXp,
} from './comboXp';
import type { BadgeId } from './comboBadges';

type MyTrophiesProps = {
  open: boolean;
  onClose: () => void;
  userId: string;
};

const ALL_BADGE_IDS: BadgeId[] = [
  'premier_pas',
  'eclair',
  'trois_banderilles',
  'leve_tot',
  'marathon',
  'sang_froid',
  'relais',
  'mur_reussites',
];

const BADGE_CRITERIA: Record<BadgeId, string> = {
  premier_pas: '1re séance complétée',
  eclair: '50 raccourcis clavier utilisés dans la journée',
  trois_banderilles: '3 RDV dans une même séance',
  leve_tot: 'Séance démarrée avant 9h',
  marathon: '50 contacts terminés dans une séance',
  sang_froid: '10 NPA posées, cumul tous temps',
  relais: 'Décerné par le moteur Arena',
  mur_reussites: 'Réussite épinglée par un manager, signée',
};

/** Mur local "Mes réussites" (spec §5) — réussites personnelles, jamais d'équipe. */
export function MyTrophies({ open, onClose, userId }: MyTrophiesProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useComboOverlay(open, rootRef, onClose);

  const xp = useComboXp(userId);
  const badges = summarizeComboBadges(userId);
  const streaks = summarizeComboStreaks(userId);
  const unlockedBadgeIds = new Set(badges.map((badge) => badge.id));
  const remainingBadges = ALL_BADGE_IDS.filter(
    (id) => !unlockedBadgeIds.has(id),
  );

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className="calls-trophies"
      role="dialog"
      aria-modal="true"
      aria-label="Mes réussites"
    >
      <button
        type="button"
        className="calls-trophies__backdrop"
        tabIndex={-1}
        aria-label="Fermer"
        onClick={onClose}
      />
      <GlassCard className="calls-trophies__panel">
        <div className="calls-trophies__head">
          <h2>Mes réussites</h2>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>

        <section
          className="calls-trophies__section"
          aria-label="Ma progression"
        >
          <h3>Ma progression</h3>
          <ul>
            {xp.axes.map((axis) => {
              const palierId = currentPalier(axis.id, axis.count);
              return (
                <li key={axis.id}>
                  {axis.label} · {axis.count}
                  {axis.palier && (
                    <span className={`calls-palier calls-palier--${palierId}`}>
                      {' '}
                      · {axis.palier}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="calls-trophies__section" aria-label="Mes badges">
          <h3>Mes badges</h3>
          {badges.length === 0 ? (
            <p className="calls-muted">
              Aucun badge débloqué pour l&apos;instant.
            </p>
          ) : (
            <ul>
              {badges.map((badge) => (
                <li key={badge.id}>Badge débloqué : {badge.label}</li>
              ))}
            </ul>
          )}
          {remainingBadges.length > 0 && (
            <ul>
              {remainingBadges.map((id) => (
                <li key={id} className="calls-muted">
                  {badgeLabel(id)} — {BADGE_CRITERIA[id]}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="calls-trophies__section" aria-label="Mes streaks">
          <h3>Mes streaks</h3>
          <ul>
            {streaks.map((streak) => (
              <li key={streak.id}>
                {streak.label} · {streak.days} jour{streak.days > 1 ? 's' : ''}
                {streak.palier && ` · ${streak.palier}`}
              </li>
            ))}
          </ul>
        </section>
      </GlassCard>
    </div>
  );
}
