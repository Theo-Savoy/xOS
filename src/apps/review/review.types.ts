export type Conservation = {
  ok: boolean;
  delta_count: number;
  delta_amount: number;
};

export type ReviewPayloadPeriod = {
  granularity: 'year' | 'semester';
  semester: 'S1' | 'S2' | null;
  label: string;
  compare_label: string;
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
  period?: ReviewPayloadPeriod;
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
  period?: ReviewPayloadPeriod;
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
  period?: ReviewPayloadPeriod;
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
  period?: ReviewPayloadPeriod;
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
  period?: ReviewPayloadPeriod;
};

export function productivityOf(
  payload: CommercialPayload,
  fy: string,
): ProductivityRow | undefined {
  const row = payload.productivity[fy];
  if (!row || !('fte' in row)) return undefined;
  return row;
}

export type ReasonRow = {
  label: string;
  count: number;
  pct: number;
};

export type ReasonTable = {
  items: ReasonRow[];
  n_displayed: number;
  n_total: number;
  truncated?: boolean;
};

export type MarketShareYear = {
  fy: string;
  n_marche: number;
  n_lost: number;
  share: number;
  pct: number;
};

export type MarketMixRow = {
  n: number;
  marche: number;
  produit: number;
  prix: number;
  marche_pct: number;
  produit_pct: number;
  prix_pct: number;
};

export type MarketTest = {
  z: number | null;
  p: number | null;
  fy_from: string | null;
  fy_to: string | null;
  x1?: number;
  n1?: number;
  x2?: number;
  n2?: number;
};

export type MarketPayload = {
  resource: 'market';
  fy: string;
  compare: string;
  truncated: boolean;
  truncated_fys: string[];
  conservation: Conservation;
  conclusion: string;
  share: MarketShareYear[];
  mix: {
    global: MarketMixRow;
    catalogue: MarketMixRow;
    sur_mesure: MarketMixRow;
  };
  test: MarketTest;
  loss_reasons: ReasonTable;
  win_reasons: ReasonTable;
  win_by_offer: {
    catalogue: ReasonTable;
    sur_mesure: ReasonTable;
  };
  period?: ReviewPayloadPeriod;
};

export type PortfolioStatus = {
  key: string;
  label: string;
  kind: 'flux' | 'stock';
  count: number;
  amount: number;
};

export type PortfolioPayload = {
  resource: 'portfolio';
  fy: string;
  truncated: boolean;
  truncated_fys: string[];
  period?: ReviewPayloadPeriod;
  conservation: Conservation & {
    signed?: {
      ok: boolean;
      delta_amount: number;
      actual: number;
      expected: number;
    };
    lost_share?: { ok: boolean; ratio: number; expected: number };
  };
  statuses: {
    gagnes: PortfolioStatus;
    fidelises: PortfolioStatus;
    engages: PortfolioStatus;
    perdus: PortfolioStatus;
    n_accounts: number;
  };
  cohort: {
    n_accounts: number;
    arr: number;
    retained: { count: number; pct: number };
    lost: { count: number; pct: number };
  };
};

export type ChannelRow = {
  label: string;
  closed: number;
  won: number;
  amount: number;
  closing: number | null;
  closing_pct: number;
};

export type ConcentrationRow = {
  rank: number;
  name: string;
  amount: number;
  pct: number;
};

export type ChannelsPayload = {
  resource: 'channels';
  fy: string;
  truncated: boolean;
  truncated_fys: string[];
  conservation: Conservation;
  channels: {
    items: ChannelRow[];
    n_displayed: number;
    n_total: number;
    truncated: boolean;
  };
  concentration: {
    items: ConcentrationRow[];
    top1_pct: number;
    top5_pct: number;
    n_displayed: number;
    n_total: number;
    truncated: boolean;
    total: number;
  };
  sdr_limit: string;
  period?: ReviewPayloadPeriod;
};

export type DiagnosisFactor = {
  id: string;
  facteur: string;
  impact: string;
  fiabilite_mesure: string;
  fiabilite_attribution: string;
  manque: string;
};

export type DiagnosisPayload = {
  resource: 'diagnosis';
  fy: string;
  compare: string;
  truncated: boolean;
  truncated_fys: string[];
  conservation: Conservation;
  factors: DiagnosisFactor[];
  attribution_limit: string;
  period?: ReviewPayloadPeriod;
};

export type SynthesisCard = {
  key: string;
  label: string;
  display: string;
  value: number;
  scope: ScopeKind;
  hint?: string;
};

export type SynthesisPattern = {
  id: string;
  title: string;
  body: string;
};

export type SynthesisPayload = {
  resource: 'synthesis';
  fy: string;
  compare: string;
  truncated: boolean;
  truncated_fys: string[];
  conservation: Conservation;
  cards: SynthesisCard[];
  patterns: SynthesisPattern[];
  verdict: string;
  key_point: string;
  period?: ReviewPayloadPeriod;
};

export type QualityPayload = {
  resource: 'quality';
  fy: string;
  truncated: boolean;
  truncated_fys: string[];
  conservation: Conservation;
  tag_mismatch: number;
  negative_cycles: number;
  over_365: number;
  over_730: number;
  missing_amount: number;
  won_total: number;
  created_rows: number;
  closed_rows: number;
  n_valid: number;
  n_won_new: number;
  limits: string[];
  period?: ReviewPayloadPeriod;
};

export type DefinitionItem = {
  id: string;
  title: string;
  body: string;
};

export type DefinitionsPayload = {
  resource: 'definitions';
  conservation: Conservation;
  items: DefinitionItem[];
};
