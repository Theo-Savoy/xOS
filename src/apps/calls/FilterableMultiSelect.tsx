import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Checkbox, Tag } from '../../components/ui';
import type { PicklistGroup } from './filterControls.helpers';

export type FilterableMultiSelectProps<T extends string = string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  groups?: readonly PicklistGroup<T>[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  searchPlaceholder?: string;
  className?: string;
  'aria-label'?: string;
};

/**
 * Multi-select searchable en popover glass (pattern Linear / Notion).
 * Conçu pour picklists volumineuses (50+ options) ou filtres compacts.
 */
export function FilterableMultiSelect<T extends string = string>({
  label,
  options,
  groups,
  value,
  onChange,
  searchPlaceholder = 'Rechercher…',
  className = '',
  'aria-label': ariaLabel,
}: FilterableMultiSelectProps<T>): ReactNode {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    if (!groups?.length) return new Set();
    const active = new Set<string>();
    for (const g of groups) {
      if (g.values.some((v) => value.includes(v))) {
        active.add(g.id);
      }
    }
    // Si aucun groupe n'a de sélection, ouvrir le premier par défaut
    if (active.size === 0 && groups[0]) {
      active.add(groups[0].id);
    }
    return active;
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selectedCount = value.length;
  const normalizedSearch = search.trim().toLowerCase();

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearch('');
    }
  }, [open]);

  // Click outside and Escape handler
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleOption = (optValue: T) => {
    if (value.includes(optValue)) {
      onChange(value.filter((v) => v !== optValue));
    } else {
      onChange([...value, optValue]);
    }
  };

  const toggleGroup = (groupValues: readonly T[]) => {
    const allSelected = groupValues.every((v) => value.includes(v));
    if (allSelected) {
      onChange(value.filter((v) => !groupValues.includes(v)));
    } else {
      const next = new Set(value);
      for (const v of groupValues) next.add(v);
      onChange([...next]);
    }
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const optionByValue = useMemo(() => {
    const map = new Map<T, { value: T; label: string }>();
    for (const opt of options) {
      map.set(opt.value, opt);
    }
    return map;
  }, [options]);

  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) return options;
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(normalizedSearch),
    );
  }, [options, normalizedSearch]);

  const clearAll = () => {
    onChange([]);
  };

  const hasGroups = Boolean(groups && groups.length > 0);

  return (
    <div
      ref={rootRef}
      className={`calls-filterable-select ${open ? 'calls-filterable-select--open' : ''} ${className}`.trim()}
    >
      <Button
        variant="ghost"
        type="button"
        className={`calls-filterable-select__trigger ${selectedCount > 0 ? 'calls-filterable-select__trigger--active' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={
          ariaLabel ||
          `${label} (${selectedCount} sélectionné${selectedCount > 1 ? 's' : ''})`
        }
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="calls-filterable-select__trigger-label">{label}</span>
        {selectedCount > 0 && (
          <Tag variant="accent" className="calls-filterable-select__badge">
            {selectedCount}
          </Tag>
        )}
        <span className="calls-filterable-select__chevron" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </Button>

      {open && (
        <div
          id={listId}
          className="calls-filterable-select__popover"
          role="dialog"
          aria-label={label}
        >
          <div className="calls-filterable-select__header">
            <div className="calls-filterable-select__search-box">
              <span
                className="calls-filterable-select__search-icon"
                aria-hidden="true"
              >
                🔍
              </span>
              <input
                ref={searchInputRef}
                type="search"
                className="calls-filterable-select__search-input"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={`Rechercher dans ${label}`}
              />
              {search && (
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className="calls-filterable-select__search-clear"
                  onClick={() => setSearch('')}
                  aria-label="Effacer la recherche"
                >
                  ×
                </Button>
              )}
            </div>
            {selectedCount > 0 && (
              <div className="calls-filterable-select__actions">
                <span className="calls-text-sm calls-muted">
                  {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  aria-label="Tout effacer"
                >
                  Effacer
                </Button>
              </div>
            )}
          </div>

          <div
            className="calls-filterable-select__list"
            role="listbox"
            aria-multiselectable="true"
          >
            {hasGroups && groups
              ? groups.map((group) => {
                  const groupOptions = group.values
                    .map((v) => optionByValue.get(v))
                    .filter((opt): opt is { value: T; label: string } =>
                      Boolean(opt),
                    );

                  const visibleOptions = normalizedSearch
                    ? groupOptions.filter((opt) =>
                        opt.label.toLowerCase().includes(normalizedSearch),
                      )
                    : groupOptions;

                  if (visibleOptions.length === 0) return null;

                  const selectedInGroup = group.values.filter((v) =>
                    value.includes(v),
                  ).length;
                  const allSelected =
                    group.values.length > 0 &&
                    selectedInGroup === group.values.length;
                  // Some selected in group check
                  const isExpanded = normalizedSearch
                    ? true
                    : expandedGroups.has(group.id);

                  return (
                    <div
                      key={group.id}
                      className="calls-filterable-select__group"
                    >
                      <div className="calls-filterable-select__group-head">
                        <Checkbox
                          checked={allSelected}
                          onChange={() => toggleGroup(group.values)}
                          aria-label={`Sélectionner toute la catégorie ${group.label}`}
                          className="calls-filterable-select__group-check"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          className="calls-filterable-select__group-toggle"
                          onClick={() => toggleGroupExpand(group.id)}
                          aria-expanded={isExpanded}
                        >
                          <span className="calls-filterable-select__group-chevron">
                            {isExpanded ? '▾' : '▸'}
                          </span>
                          <span className="calls-filterable-select__group-title">
                            {group.label}
                          </span>
                          <span className="calls-filterable-select__group-count">
                            {selectedInGroup > 0 ? `${selectedInGroup}/` : ''}
                            {group.values.length}
                          </span>
                        </Button>
                      </div>

                      {isExpanded && (
                        <div className="calls-filterable-select__group-items">
                          {visibleOptions.map((opt) => {
                            const checked = value.includes(opt.value);
                            return (
                              <label
                                key={opt.value}
                                className={`calls-filterable-select__option ${checked ? 'calls-filterable-select__option--selected' : ''}`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onChange={() => toggleOption(opt.value)}
                                  label={opt.label}
                                  className="calls-filterable-select__option-check"
                                />
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              : filteredOptions.map((opt) => {
                  const checked = value.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`calls-filterable-select__option ${checked ? 'calls-filterable-select__option--selected' : ''}`}
                    >
                      <Checkbox
                        checked={checked}
                        onChange={() => toggleOption(opt.value)}
                        label={opt.label}
                        className="calls-filterable-select__option-check"
                      />
                    </label>
                  );
                })}

            {(hasGroups
              ? !groups?.some((g) =>
                  g.values.some((v) =>
                    (optionByValue.get(v)?.label || v)
                      .toLowerCase()
                      .includes(normalizedSearch),
                  ),
                )
              : filteredOptions.length === 0) && (
              <div className="calls-filterable-select__empty">
                Aucun résultat pour « {search} »
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
