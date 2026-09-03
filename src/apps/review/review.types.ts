export type Conservation = {
  ok: boolean;
  delta_count: number;
  delta_amount: number;
};

export type OtherBucket = {
  count: number;
  amount: number;
  label: string;
};

export type OverviewYear = {
  fy: string;
  total: number;
  new: number;
  renew: number;
  total_count: number;
  new_count: number;
  renew_count: number;
  detections_new: number;
  closed_new: number;
  signatures_new: number;
  closing_new: number | null;
  other: OtherBucket;
  conservation: Conservation;
};

export type OverviewPayload = {
  resource: 'overview';
  fy: string;
  truncated: boolean;
  truncated_fys: string[];
  conservation: Conservation;
  series: OverviewYear[];
};

export type VolumeTicketStep = {
  amount: number;
  count: number;
  ticket: number;
};

export type VolumeTicketBridge = {
  volume: number;
  ticket: number;
  delta: number;
  prev: VolumeTicketStep;
  curr: VolumeTicketStep;
  conservation: { ok: boolean; delta_amount: number };
};

export type OwnerBridgeGroup = {
  label: string;
  prev: number;
  curr: number;
  delta: number;
};

export type OwnerBridge = {
  active: OwnerBridgeGroup;
  dg: OwnerBridgeGroup;
  departed: OwnerBridgeGroup;
  total: number;
  conservation: { ok: boolean; delta_amount: number };
};

export type BridgePayload = {
  resource: 'bridge';
  fy: string;
  compare: string;
  truncated: boolean;
  truncated_fys: string[];
  conservation: Conservation;
  volume_ticket: VolumeTicketBridge;
  owner: OwnerBridge;
  catalogue?: CatalogueBridge;
};

export type CatalogueBridge = {
  renew: number;
  volume: number;
  ticket: number;
  total: number;
  delta: number;
  share_renew: number;
  share_new: number;
  prev: {
    new: { amount: number; count: number };
    renew: { amount: number; count: number };
  };
  curr: {
    new: { amount: number; count: number };
    renew: { amount: number; count: number };
  };
  conservation: { ok: boolean; delta_amount: number };
};

export type ProductRow = {
  key: string;
  label: string;
  closed: number;
  won: number;
  closing: number | null;
  amountNew: number;
  amountRenew: number;
  amount_total: number;
  new: number;
  renew: number;
  total_signatures: number;
  median: number | null;
  mean: number | null;
  n_cycle: number;
  n_excluded: number;
};

export type ProductYear = {
  fy: string;
  amountNew: number;
  amountRenew: number;
  amountTotal: number;
  conservation: Conservation;
  products: {
    catalogue: ProductRow;
    sur_mesure: ProductRow;
    conseil: ProductRow;
    autre: ProductRow;
  };
};

export type ProductPayload = {
  resource: 'product';
  fy: string;
  truncated: boolean;
  truncated_fys: string[];
  conservation: Conservation;
  series: ProductYear[];
};

export type CycleProductStats = {
  median: number | null;
  mean: number | null;
  n: number;
  n_excluded?: number;
  n_over_365?: number;
  n_over_730?: number;
};

export type CycleYear = {
  fy: string;
  median: number | null;
  mean: number | null;
  n_valid: number;
  n_excluded: number;
  n_over_365: number;
  n_over_730: number;
  by_product: {
    catalogue: CycleProductStats;
    sur_mesure: CycleProductStats;
    conseil: CycleProductStats;
    autre: CycleProductStats;
  };
};

export type CyclesPayload = {
  resource: 'cycles';
  fy: string;
  truncated: boolean;
  truncated_fys: string[];
  conservation: Conservation;
  series: CycleYear[];
};

export type ScopeKind = 'total' | 'new' | 'signatures-new';

export type CommercialPerson = {
  ownerId: string;
  name: string;
  mode: string;
  rdv: number;
  weeks: number;
  rdvPerWeek: number | null;
  detections: number;
  detectionRate: number | null;
  closedNew: number;
  signaturesNew: number;
  closing: number | null;
  ticket: number | null;
  amountNew: number;
};

export type CompanyTotals = {
  amountNew: number;
  signaturesNew: number;
  detections: number;
  closedNew: number;
  closing: number | null;
};

export type DgYear = {
  detections: number;
  closedNew: number;
  signaturesNew: number;
  closing: number | null;
  ticket: number | null;
  amountNew: number;
  rdv: number;
};

export type CapacityYear = {
  fy: string;
  amountNew: number;
  signaturesNew: number;
  detections: number;
};

export type ProductivityRow = {
  fy: string;
  fte: number;
  amountNew: number;
  signatures: number;
  detections: number;
  caPerFte: number | null;
  signaturesPerFte: number | null;
  detectionsPerFte: number | null;
};

export type ProductivityEvolution = {
  caPerFte: number | null;
  signaturesPerFte: number | null;
  detectionsPerFte: number | null;
};

export type CommercialPayload = {
  resource: 'commercial';
  fy: string;
  compare: string;
  truncated: boolean;
  truncated_fys: string[];
  conservation: Conservation;
  sales: CommercialPerson[];
  activity: CommercialPerson[];
  company: CompanyTotals;
  dg: Record<string, DgYear>;
  capacity: CapacityYear[];
  ownerBridge: OwnerBridge;
  productivity: {
    evolution: ProductivityEvolution;
  } & Record<string, ProductivityRow | ProductivityEvolution>;
  attribution_limit: string;
  rdv_limit: string;
};

export function productivityOf(
  payload: CommercialPayload,
  fy: string,
): ProductivityRow | undefined {
  const row = payload.productivity[fy];
  if (!row || !('fte' in row)) return undefined;
  return row;
}
