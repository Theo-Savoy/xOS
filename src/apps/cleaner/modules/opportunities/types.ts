import type { CleanerAnomaly } from '../../contracts';

export type CleanerOpportunity = {
  id: string;
  name?: string;
  account?: string;
  account_owner_id?: string | null;
  account_owner_name?: string | null;
  owner_id?: string | null;
  owner?: string | null;
  owner_active?: boolean | null;
  former_owner?: boolean;
  stage?: string | null;
  close_date?: string | null;
  amount?: number | string | null;
  probability?: number | string | null;
  type_vente?: string | null;
  created_date?: string | null;
  last_activity?: string | null;
  category?: string | null;
  is_closed?: boolean;
};

export type OpportunityRuleContext = {
  today: string;
  meta?: Record<string, unknown>;
  stalledStage?: string;
  formerOwnerIds?: string[];
  formerOwnerNames?: string[];
  thresholds?: Record<string, unknown>;
};

export type OpportunityDiagnostic = CleanerOpportunity & {
  anomalies: CleanerAnomaly[];
  score: number;
};
