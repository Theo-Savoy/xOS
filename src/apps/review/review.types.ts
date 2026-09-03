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
};

export type ScopeKind = 'total' | 'new' | 'signatures-new';
