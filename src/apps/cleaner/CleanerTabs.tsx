import type { AppRole } from '../../os/registry';
import {
  getVisibleModules,
  type CleanerModuleDefinition,
} from './shell/moduleRegistry';
import type { CleanerModuleId, CleanerTabState } from './shell/shellState';

type CleanerTabsProps = {
  role: AppRole;
  state: CleanerTabState;
  onActivate: (active: CleanerTabState['active']) => void;
  onClose: (moduleId: CleanerModuleId) => void;
  visibleModules?: readonly CleanerModuleDefinition[];
};

export function CleanerTabs({
  role,
  state,
  onActivate,
  onClose,
  visibleModules = getVisibleModules(role),
}: CleanerTabsProps) {
  const visibleIds = new Set(visibleModules.map((module) => module.id));
  return (
    <nav className="cleaner-tabs" aria-label="Navigation du Labo">
      <div
        className="cleaner-tabs__list"
        role="tablist"
        aria-label="Onglets du Labo"
      >
        <button
          className={`cleaner-tab${state.active === 'home' ? ' cleaner-tab--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={state.active === 'home'}
          onClick={() => onActivate('home')}
        >
          Accueil
        </button>
        {state.open
          .filter((moduleId) => visibleIds.has(moduleId))
          .map((moduleId) => {
            const module = visibleModules.find(
              (candidate) => candidate.id === moduleId,
            );
            if (!module) return null;
            return (
              <div className="cleaner-tab-group" key={module.id}>
                <button
                  className={`cleaner-tab${state.active === module.id ? ' cleaner-tab--active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={state.active === module.id}
                  onClick={() => onActivate(module.id)}
                >
                  {module.label}
                </button>
                <button
                  className="cleaner-tab__close"
                  type="button"
                  aria-label={`Fermer ${module.label}`}
                  onClick={() => onClose(module.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
      </div>
    </nav>
  );
}
