export type CleanerSeverity = 'warning' | 'critical';

export type CleanerEvidence = {
  field: string;
  actual: string | number | null;
  expected: string;
};

export type CleanerAnomaly = {
  ruleId: string;
  severity: CleanerSeverity;
  score: number;
  label: string;
  evidence: CleanerEvidence[];
};

export type CleanerCapabilities = {
  canViewTeam: boolean;
  canReassign: boolean;
  canBulkEdit: boolean;
  canBulkClose: boolean;
  canManageRules: boolean;
};

export type CleanerModuleSummary = {
  moduleId: string;
  health: 'healthy' | 'warning' | 'critical';
  anomalyCount: number;
  affectedRecordCount: number;
  criticalCount: number;
  resolvedPeriodCount: number;
  previousPeriodDelta: number | null;
  lastRefreshedAt: string;
};

export type CleanerSettingsWarning = {
  code: string;
  key: string;
  index: number | null;
  message: string;
};
