import { Button } from '../../../../components/ui';
import type { CleanerCapabilities } from '../../contracts';
import type { CommandAction } from './CommandPreviewPanel.types';

type BulkActionBarProps = {
  selectedCount: number;
  filteredCount: number;
  currentPageCount: number;
  currentPageSelectedCount?: number;
  allFilteredSelected: boolean;
  capabilities: CleanerCapabilities;
  onSelectAll: () => void;
  onClear: () => void;
  onStartAction: (action: CommandAction) => void;
};

export function BulkActionBar({
  selectedCount,
  filteredCount,
  currentPageCount,
  currentPageSelectedCount = 0,
  allFilteredSelected,
  capabilities,
  onSelectAll,
  onClear,
  onStartAction,
}: BulkActionBarProps) {
  if (selectedCount < 1) return null;

  return (
    <aside
      className="cleaner-opportunities__bulk-bar"
      aria-label="Actions groupées"
    >
      <div className="cleaner-opportunities__bulk-summary">
        <strong>
          {selectedCount} sélectionnée{selectedCount > 1 ? 's' : ''}
        </strong>
        <span>
          Page courante : {currentPageSelectedCount}/{currentPageCount}
        </span>
        <span>
          {allFilteredSelected
            ? `Tous les ${filteredCount} résultats filtrés sont sélectionnés`
            : `${filteredCount} résultats filtrés disponibles`}
        </span>
      </div>
      <div className="cleaner-opportunities__bulk-selection">
        {!allFilteredSelected && selectedCount < filteredCount ? (
          <Button variant="secondary" onClick={onSelectAll}>
            Sélectionner les {filteredCount} résultats filtrés
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onClear}>
          Désélectionner
        </Button>
      </div>
      <div
        className="cleaner-opportunities__bulk-actions"
        aria-label="Commandes disponibles"
      >
        {capabilities.canReassign ? (
          <Button variant="secondary" onClick={() => onStartAction('reassign-owner')}>
            Réassigner le propriétaire
          </Button>
        ) : null}
        {capabilities.canBulkEdit ? (
          <>
            <Button variant="secondary" onClick={() => onStartAction('close-date')}>
              Modifier la date de clôture
            </Button>
            <Button variant="secondary" onClick={() => onStartAction('sale-type')}>
              Modifier le type de vente
            </Button>
          </>
        ) : null}
        {capabilities.canBulkClose ? (
          <Button onClick={() => onStartAction('close-lost')}>
            Clore en perdue
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
