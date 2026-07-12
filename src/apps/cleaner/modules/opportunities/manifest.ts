import { lazy, type FC, type LazyExoticComponent } from 'react';
import type { AppRole } from '../../../../os/registry';
import type { CleanerModuleProps } from '../../shell/moduleRegistry';

export type CleanerModuleManifest = {
  id: 'opportunities';
  label: 'Nettoyage';
  criticality: 'critical';
  roles: readonly AppRole[];
  component: LazyExoticComponent<FC<CleanerModuleProps>>;
};

const lazyOpportunitiesModule = lazy(() =>
  import('./OpportunitiesModule').then(({ OpportunitiesModule }) => ({
    default: OpportunitiesModule,
  })),
);

export const opportunitiesManifest = {
  id: 'opportunities',
  label: 'Nettoyage',
  criticality: 'critical',
  roles: ['commercial', 'manager', 'admin'],
  component: lazyOpportunitiesModule,
} satisfies CleanerModuleManifest;
