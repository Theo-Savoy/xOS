import { useMemo, useState, type ReactNode } from 'react';
import { Button, Checkbox, GlassCard, Select, Tag } from '../../components/ui';
import {
  CONTACT_LIMIT_OPTIONS,
  CONTACT_LIST_UNLIMITED,
  EFFECTIF_TRANCHES,
  FONCTION_PRESETS,
  MAX_PER_COMPANY_OPTIONS,
  RESULTAT_CALL_VALUES,
  SECTEUR_VALUES,
  SECTEUR_FAMILIES,
  TIER_VALUES,
  TYPE_CLIENT_VALUES,
  type CallTargetPreset,
  type ContactLimit,
  type FilterTree,
  type MaxPerCompany,
} from '../../crm';
import { getOpportunityFilterGuidance } from '../../crm/opportunityFilters';
import { isAccountOwnerFilterCandidate } from './accountOwners';
import { ChipGroup, PicklistMultiSelect, TriState } from './filterControls';
import { asOptions } from './filterControls.helpers';
import type { TeamMember } from './types';
import {
  countContactFilters,
  countEntrepriseFilters,
  countRelanceFilters,
} from './filterCounts';

type FilterBuilderProps = {
  filters: FilterTree;
  onChange: (next: FilterTree) => void;
  previewCount: number | null;
  previewLoading: boolean;
  matchCount: number | null;
  matchCountCapped: boolean;
  matchCountLoading: boolean;
  matchCountError: string | null;
  contactLimit: ContactLimit;
  onContactLimitChange: (limit: ContactLimit) => void;
  maxPerCompany: MaxPerCompany | null;
  onMaxPerCompanyChange: (value: MaxPerCompany | null) => void;
  presets: CallTargetPreset[];
  presetsLoading: boolean;
  savingPreset: boolean;
  currentUserId: string;
  onLoadPreset: (preset: CallTargetPreset) => void;
  onSavePreset: (name: string, shared: boolean) => void;
  onDeletePreset: (id: number) => void;
  team?: TeamMember[];
};

function limitLabel(limit: ContactLimit): string {
  return limit === CONTACT_LIST_UNLIMITED
    ? 'Pas de limite (max 2000)'
    : String(limit);
}

function SectionSummary({ title, count }: { title: string; count: number }) {
  return (
    <summary>
      <span className="calls-fb-section__title">
        {title}
        {count > 0 && (
          <span
            className="calls-fb-section__badge"
            aria-label={`${count} filtre${count > 1 ? 's' : ''} actif${count > 1 ? 's' : ''}`}
          >
            {count}
          </span>
        )}
      </span>
    </summary>
  );
}

function UserIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function TargetIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function BookmarkIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function FilterBuilder({
  filters,
  onChange,
  previewCount,
  previewLoading,
  matchCount,
  matchCountCapped,
  matchCountLoading,
  matchCountError,
  contactLimit,
  onContactLimitChange,
  maxPerCompany,
  onMaxPerCompanyChange,
  presets,
  presetsLoading,
  savingPreset,
  currentUserId,
  onLoadPreset,
  onSavePreset,
  onDeletePreset,
  team = [],
}: FilterBuilderProps) {
  const [presetName, setPresetName] = useState('');
  const [presetShared, setPresetShared] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState('');

  const setEntreprise = (patch: Partial<FilterTree['entreprise']>) =>
    onChange({ ...filters, entreprise: { ...filters.entreprise, ...patch } });
  const setContact = (patch: Partial<FilterTree['contact']>) =>
    onChange({ ...filters, contact: { ...filters.contact, ...patch } });
  const setRelance = (patch: Partial<FilterTree['relance']>) =>
    onChange({ ...filters, relance: { ...filters.relance, ...patch } });

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    onSavePreset(name, presetShared);
    setPresetName('');
    setPresetShared(false);
  };

  const selectedPreset = presets.find(
    (preset) => String(preset.id) === selectedPresetId,
  );
  const entrepriseCount = countEntrepriseFilters(filters.entreprise);
  const contactCount = countContactFilters(filters.contact);
  const relanceCount = countRelanceFilters(filters.relance);
  const oppGuidance = getOpportunityFilterGuidance(filters.entreprise);

  const ownerOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [];
    for (const member of team) {
      if (
        !member.sf_user_id ||
        !isAccountOwnerFilterCandidate(member.sf_user_id)
      )
        continue;
      if (seen.has(member.sf_user_id)) continue;
      seen.add(member.sf_user_id);
      options.push({ value: member.sf_user_id, label: member.label });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }, [team]);

  const userMember = team.find((m) => m.user_id === currentUserId);
  const userSfId = userMember?.sf_user_id;
  const myOwnerCandidate = userSfId
    ? ownerOptions.find((o) => o.value === userSfId)
    : ownerOptions[0];

  const isMyAccountsActive = Boolean(
    myOwnerCandidate &&
      filters.entreprise.proprietaires.includes(myOwnerCandidate.value),
  );

  const isTierABActive =
    filters.entreprise.tiers.includes('A') &&
    filters.entreprise.tiers.includes('B');

  const handleToggleMyAccounts = () => {
    if (!myOwnerCandidate) return;
    if (isMyAccountsActive) {
      setEntreprise({
        proprietaires: filters.entreprise.proprietaires.filter(
          (id) => id !== myOwnerCandidate.value,
        ),
      });
    } else {
      setEntreprise({ proprietaires: [myOwnerCandidate.value] });
    }
  };

  const handleToggleTierAB = () => {
    if (isTierABActive) {
      setEntreprise({
        tiers: filters.entreprise.tiers.filter((t) => t !== 'A' && t !== 'B'),
      });
    } else {
      const currentTiers = filters.entreprise.tiers;
      const nextTiers: FilterTree['entreprise']['tiers'] = currentTiers.includes('A')
        ? currentTiers.includes('B')
          ? currentTiers
          : [...currentTiers, 'B']
        : currentTiers.includes('B')
          ? [...currentTiers, 'A']
          : [...currentTiers, 'A', 'B'];
      setEntreprise({ tiers: nextTiers });
    }
  };

  return (
    <GlassCard className="calls-filterbuilder">
      {/* 1. Cartes de démarrage rapide (presets en cartes) */}
      <div
        className="calls-fb-starter-cards"
        role="region"
        aria-label="Démarrage rapide"
      >
        <div className="calls-fb-starter-cards__header">
          <span className="calls-fb-starter-cards__title">Démarrage rapide</span>
        </div>
        <div className="calls-fb-starter-cards__grid">
          {myOwnerCandidate && (
            <Button
              variant="secondary"
              size="sm"
              className={`calls-fb-starter-card${isMyAccountsActive ? ' calls-fb-starter-card--active' : ''}`}
              onClick={handleToggleMyAccounts}
              aria-pressed={isMyAccountsActive}
            >
              <span className="calls-fb-starter-card__icon">
                <UserIcon />
              </span>
              <span className="calls-fb-starter-card__body">
                <strong>Mes comptes</strong>
                <small>{myOwnerCandidate.label}</small>
              </span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            className={`calls-fb-starter-card${isTierABActive ? ' calls-fb-starter-card--active' : ''}`}
            onClick={handleToggleTierAB}
            aria-pressed={isTierABActive}
          >
            <span className="calls-fb-starter-card__icon">
              <TargetIcon />
            </span>
            <span className="calls-fb-starter-card__body">
              <strong>Tier A &amp; B</strong>
              <small>Comptes prioritaires</small>
            </span>
          </Button>

          {presets.slice(0, 3).map((p) => {
            const isPresetActive = String(p.id) === selectedPresetId;
            return (
              <Button
                key={p.id}
                variant="secondary"
                size="sm"
                className={`calls-fb-starter-card${isPresetActive ? ' calls-fb-starter-card--active' : ''}`}
                onClick={() => {
                  setSelectedPresetId(String(p.id));
                  onLoadPreset(p);
                }}
                aria-pressed={isPresetActive}
              >
                <span className="calls-fb-starter-card__icon">
                  <BookmarkIcon />
                </span>
                <span className="calls-fb-starter-card__body">
                  <strong>{p.name}</strong>
                  <small>{p.shared ? 'Partagé équipe' : 'Mon preset'}</small>
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* 2. Menu discret de gestion des presets */}
      <details className="calls-fb-preset-manage">
        <summary>
          <span>Gérer les presets ({presets.length})</span>
        </summary>
        <div className="calls-fb-preset-manage__body">
          <div className="calls-fb-presets">
            <Select
              label="Preset enregistré"
              options={[
                {
                  value: '',
                  label: presetsLoading
                    ? 'Chargement…'
                    : '— Choisir un preset —',
                },
                ...presets.map((p) => ({
                  value: String(p.id),
                  label: `${p.name}${p.shared ? ' (partagé)' : ''}`,
                })),
              ]}
              value={selectedPresetId}
              onChange={(val) => {
                setSelectedPresetId(val);
                const preset = presets.find((p) => String(p.id) === val);
                if (preset) onLoadPreset(preset);
              }}
              aria-label="Preset"
            />
            {selectedPreset?.owner === currentUserId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onDeletePreset(Number(selectedPresetId));
                  setSelectedPresetId('');
                }}
              >
                Supprimer
              </Button>
            )}
          </div>

          <div className="calls-fb-save">
            <input
              type="text"
              className="calls-input"
              placeholder="Nom du preset à sauver"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <Checkbox
              checked={presetShared}
              onChange={setPresetShared}
              label="Partager à l'équipe"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSavePreset}
              disabled={savingPreset || !presetName.trim()}
            >
              {savingPreset
                ? 'Sauvegarde…'
                : 'Garder ce filtre pour plus tard'}
            </Button>
          </div>
        </div>
      </details>

      {/* 3. Groupe Entreprise — replié par défaut */}
      <details className="calls-fb-section">
        <SectionSummary title="Entreprise" count={entrepriseCount} />
        <div className="calls-fb-section__body">
          <PicklistMultiSelect
            label="Secteurs d'activité"
            options={asOptions(SECTEUR_VALUES)}
            groups={SECTEUR_FAMILIES.map((family) => ({
              id: family.id,
              label: family.label,
              values: family.secteurs,
            }))}
            value={filters.entreprise.secteurs}
            onChange={(secteurs) => setEntreprise({ secteurs })}
            searchPlaceholder="Filtrer les secteurs…"
          />
          <ChipGroup
            label="Effectifs"
            options={asOptions(EFFECTIF_TRANCHES)}
            value={filters.entreprise.effectifs}
            onChange={(effectifs) => setEntreprise({ effectifs })}
          />
          <ChipGroup
            label="Type de client"
            options={asOptions(TYPE_CLIENT_VALUES)}
            value={filters.entreprise.type_client}
            onChange={(type_client) => setEntreprise({ type_client })}
          />
          <ChipGroup
            label="Tier"
            options={asOptions(TIER_VALUES)}
            value={filters.entreprise.tiers}
            onChange={(tiers) => setEntreprise({ tiers })}
          />
          {ownerOptions.length > 0 ? (
            <ChipGroup
              label="Propriétaire du compte"
              hint="Commercial propriétaire du compte Salesforce"
              options={ownerOptions}
              value={filters.entreprise.proprietaires}
              onChange={(proprietaires) => setEntreprise({ proprietaires })}
            />
          ) : team.length === 0 ? (
            <p className="calls-muted calls-fb-hint">
              Propriétaire du compte — chargement de l&apos;équipe…
            </p>
          ) : (
            <p className="calls-muted calls-fb-hint">
              Propriétaire du compte — aucun identifiant Salesforce disponible
              pour l&apos;équipe.
            </p>
          )}
          <div className="calls-fb-row">
            <TriState
              label="Opportunité ouverte"
              value={filters.entreprise.opp_ouverte}
              onChange={(opp_ouverte) => setEntreprise({ opp_ouverte })}
              disabledValues={oppGuidance.disabled.opp_ouverte}
              disabledReasons={oppGuidance.disabledReasons.opp_ouverte}
            />
            <TriState
              label="Opportunité perdue"
              value={filters.entreprise.opp_perdue}
              onChange={(opp_perdue) => setEntreprise({ opp_perdue })}
              disabledValues={oppGuidance.disabled.opp_perdue}
              disabledReasons={oppGuidance.disabledReasons.opp_perdue}
            />
          </div>
          {(oppGuidance.hint || oppGuidance.note) && (
            <div className="calls-fb-opp-guidance" role="note">
              {oppGuidance.hint && <p>{oppGuidance.hint}</p>}
              {oppGuidance.note && (
                <p className="calls-fb-opp-guidance__note">
                  {oppGuidance.note}
                </p>
              )}
            </div>
          )}
        </div>
      </details>

      {/* 4. Groupe Contact — replié par défaut */}
      <details className="calls-fb-section">
        <SectionSummary title="Contact" count={contactCount} />
        <div className="calls-fb-section__body">
          <Checkbox
            checked={filters.contact.a_telephone}
            onChange={(checked) => setContact({ a_telephone: checked })}
            label="A un numéro de mobile"
          />
          <ChipGroup
            label="Fonction"
            hint="Presets sur le poste (OR entre les cases cochées)"
            options={FONCTION_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.label,
            }))}
            value={filters.contact.fonctions}
            onChange={(fonctions) => setContact({ fonctions })}
          />
          <Checkbox
            checked={filters.contact.exclure_npa}
            onChange={(checked) => setContact({ exclure_npa: checked })}
            label="Exclure les « ne pas appeler »"
          />
        </div>
      </details>

      {/* 5. Groupe Relance — replié par défaut */}
      <details className="calls-fb-section">
        <SectionSummary title="Relance" count={relanceCount} />
        <div className="calls-fb-section__body">
          <p className="calls-fb-hint">
            Filtres d&apos;historique d&apos;appel appliqués après la requête
            CRM (limite Salesforce sur les tâches).
          </p>
          <Checkbox
            checked={!!filters.relance.jamais_appele}
            onChange={(checked) =>
              setRelance({ jamais_appele: checked ? true : null })
            }
            label="Jamais appelé"
          />
          <div className="calls-fb-row">
            <label className="calls-field">
              <span>Dernier appel il y a plus de (jours)</span>
              <input
                type="number"
                min={0}
                className="calls-input"
                value={filters.relance.dernier_appel_avant_jours ?? ''}
                onChange={(e) =>
                  setRelance({
                    dernier_appel_avant_jours: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </label>
            <label className="calls-field">
              <span>Appelé dans les (jours)</span>
              <input
                type="number"
                min={0}
                className="calls-input"
                value={filters.relance.dernier_appel_dans_jours ?? ''}
                onChange={(e) =>
                  setRelance({
                    dernier_appel_dans_jours: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </label>
          </div>
          <ChipGroup
            label="Dernier résultat"
            options={asOptions(RESULTAT_CALL_VALUES)}
            value={filters.relance.dernier_resultat}
            onChange={(dernier_resultat) => setRelance({ dernier_resultat })}
          />
          <div className="calls-fb-row">
            <label className="calls-field">
              <span>Exclure si plus de X appels…</span>
              <input
                type="number"
                min={0}
                className="calls-input"
                value={filters.relance.exclure_si_plus_de?.appels ?? ''}
                onChange={(e) => {
                  const appels = e.target.value ? Number(e.target.value) : null;
                  setRelance({
                    exclure_si_plus_de: appels
                      ? {
                          appels,
                          sur_jours:
                            filters.relance.exclure_si_plus_de?.sur_jours ?? 30,
                        }
                      : null,
                  });
                }}
              />
            </label>
            <label className="calls-field">
              <span>…sur X jours</span>
              <input
                type="number"
                min={0}
                className="calls-input"
                disabled={!filters.relance.exclure_si_plus_de}
                value={filters.relance.exclure_si_plus_de?.sur_jours ?? ''}
                onChange={(e) =>
                  setRelance({
                    exclure_si_plus_de: filters.relance.exclure_si_plus_de
                      ? {
                          ...filters.relance.exclure_si_plus_de,
                          sur_jours: Number(e.target.value) || 0,
                        }
                      : null,
                  })
                }
              />
            </label>
          </div>
        </div>
      </details>

      {/* 6. Options avancées (Plafonds & compte principal) — replié par défaut */}
      <details className="calls-fb-section calls-fb-advanced">
        <SectionSummary title="Options avancées (plafonds & exclusions)" count={filters.entreprise.compte_principal ? 1 : 0} />
        <div className="calls-fb-section__body">
          <div className="calls-fb-row">
            <Select
              label="Contacts max"
              options={CONTACT_LIMIT_OPTIONS.map((limit) => ({
                value: String(limit),
                label: limitLabel(limit),
              }))}
              value={String(contactLimit)}
              onChange={(val) =>
                onContactLimitChange(Number(val) as ContactLimit)
              }
              aria-label="Contacts max"
            />
            <Select
              label="Max / entreprise"
              options={[
                { value: '', label: 'Pas de limite' },
                ...MAX_PER_COMPANY_OPTIONS.map((limit) => ({
                  value: String(limit),
                  label: `${limit} par entreprise`,
                })),
              ]}
              value={maxPerCompany ? String(maxPerCompany) : ''}
              onChange={(val) =>
                onMaxPerCompanyChange(
                  val ? (Number(val) as MaxPerCompany) : null,
                )
              }
              aria-label="Maximum de contacts par entreprise"
            />
          </div>
          <label className="calls-field">
            <span>Compte principal (ID CRM, cible le groupe)</span>
            <input
              type="text"
              className="calls-input"
              value={filters.entreprise.compte_principal ?? ''}
              onChange={(e) =>
                setEntreprise({
                  compte_principal: e.target.value.trim() || null,
                })
              }
              placeholder="001…"
            />
          </label>
        </div>
      </details>

      {/* 7. Footer simplifié : comptage uniquement */}
      <footer className="calls-fb-footer">
        <div className="calls-fb-match" role="status" aria-live="polite">
          {matchCountLoading ? (
            <Tag>Comptage…</Tag>
          ) : matchCountError ? (
            <Tag variant="alert" title={matchCountError}>
              Comptage impossible
            </Tag>
          ) : matchCount !== null ? (
            <Tag variant="accent">
              {matchCountCapped ? '≥ ' : ''}
              {matchCount} contact{matchCount > 1 ? 's' : ''} dans les filtres
            </Tag>
          ) : (
            <Tag>Ajustez les filtres</Tag>
          )}
        </div>
        {previewLoading ? (
          <Tag role="status" aria-live="polite">
            Mise à jour de la liste…
          </Tag>
        ) : (
          previewCount !== null && (
            <Tag variant="accent">
              Aperçu : {previewCount} contact{previewCount > 1 ? 's' : ''}
            </Tag>
          )
        )}
      </footer>
    </GlassCard>
  );
}
