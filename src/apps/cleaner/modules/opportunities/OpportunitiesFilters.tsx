import type { OpportunityWorkspaceItem } from './api';
import { reasonFamilyForRule, type OpportunityFilters } from './filterState';

type OpportunitiesFiltersProps = {
  items: OpportunityWorkspaceItem[];
  filters: OpportunityFilters;
  onChange: (filters: OpportunityFilters) => void;
  onReset: () => void;
};

function options(
  items: OpportunityWorkspaceItem[],
  key: 'owner' | 'category' | 'type_vente',
): string[] {
  return [
    ...new Set(
      items
        .map((item) => item[key])
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((a, b) => a.localeCompare(b, 'fr-FR'));
}

export function OpportunitiesFilters({
  items,
  filters,
  onChange,
  onReset,
}: OpportunitiesFiltersProps) {
  const reasons = new Map<string, Map<string, string>>();
  items.forEach((item) =>
    item.anomalies.forEach((anomaly) => {
      const family = reasonFamilyForRule(anomaly.ruleId);
      if (!reasons.has(family)) reasons.set(family, new Map());
      reasons.get(family)?.set(anomaly.ruleId, anomaly.label);
    }),
  );

  const selectSingle = (
    key: 'owners' | 'categories' | 'saleTypes',
    value: string,
  ) => onChange({ ...filters, [key]: value ? [value] : [] });
  const toggleReason = (family: string, ruleId: string) => {
    const current = filters.reasonFamilies[family] || [];
    const next = current.includes(ruleId)
      ? current.filter((value) => value !== ruleId)
      : [...current, ruleId];
    const reasonFamilies = { ...filters.reasonFamilies };
    if (next.length) reasonFamilies[family] = next;
    else delete reasonFamilies[family];
    onChange({ ...filters, reasonFamilies });
  };

  return (
    <section
      className="cleaner-opportunities__filters"
      aria-label="Filtres des opportunités"
    >
      <label className="cleaner-opportunities__search">
        Rechercher
        <input
          aria-label="Rechercher"
          type="search"
          role="searchbox"
          value={filters.search}
          onChange={(event) =>
            onChange({ ...filters, search: event.target.value })
          }
          placeholder="Nom, compte, owner…"
        />
      </label>
      <label>
        Owner
        <select
          aria-label="Owner"
          value={filters.owners[0] || ''}
          onChange={(event) => selectSingle('owners', event.target.value)}
        >
          <option value="">Tous les owners</option>
          {options(items, 'owner').map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Catégorie
        <select
          aria-label="Catégorie"
          value={filters.categories[0] || ''}
          onChange={(event) => selectSingle('categories', event.target.value)}
        >
          <option value="">Toutes les catégories</option>
          {options(items, 'category').map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Type de vente
        <select
          aria-label="Type de vente"
          value={filters.saleTypes[0] || ''}
          onChange={(event) => selectSingle('saleTypes', event.target.value)}
        >
          <option value="">Tous les types</option>
          {options(items, 'type_vente').map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {[...reasons.entries()].map(([family, familyReasons]) => (
        <fieldset key={family} className="cleaner-opportunities__reason-group">
          <legend>Raisons · {family}</legend>
          {[...familyReasons.entries()].map(([ruleId, label]) => (
            <label key={ruleId}>
              <input
                type="checkbox"
                checked={
                  filters.reasonFamilies[family]?.includes(ruleId) || false
                }
                onChange={() => toggleReason(family, ruleId)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ))}
      <button
        className="xos-btn xos-btn--secondary"
        type="button"
        onClick={onReset}
      >
        Réinitialiser les filtres
      </button>
    </section>
  );
}
