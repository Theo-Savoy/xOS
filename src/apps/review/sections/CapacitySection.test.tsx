// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommercialPayload } from '../review.types';
import { CapacitySection } from './CapacitySection';

afterEach(cleanup);

const payload: CommercialPayload = {
  resource: 'commercial',
  fy: 'FY26',
  compare: 'FY25',
  truncated: false,
  truncated_fys: [],
  conservation: { ok: true, delta_count: 0, delta_amount: 0 },
  sales: [
    {
      ownerId: '005AZ000000fLYkYAM',
      name: 'Paul Rathouin',
      mode: 'commercial',
      rdv: 243,
      weeks: 45,
      rdvPerWeek: 5.4,
      detections: 65,
      detectionRate: 0.267,
      closedNew: 81,
      signaturesNew: 21,
      closing: 0.259,
      ticket: 25_162,
      amountNew: 528_400,
    },
    {
      ownerId: '0055I000002lY9QQAU',
      name: 'Christophe Hirtz',
      mode: 'commercial',
      rdv: 174,
      weeks: 41,
      rdvPerWeek: 4.24,
      detections: 119,
      detectionRate: 0.684,
      closedNew: 98,
      signaturesNew: 29,
      closing: 0.296,
      ticket: 10_966,
      amountNew: 318_000,
    },
  ],
  activity: [],
  company: {
    amountNew: 904_000,
    signaturesNew: 56,
    detections: 197,
    closedNew: 186,
    closing: 56 / 186,
  },
  dg: {
    FY25: {
      detections: 14,
      closedNew: 22,
      signaturesNew: 14,
      closing: 0.636,
      ticket: 23_900,
      amountNew: 334_100,
      rdv: 0,
    },
    FY26: {
      detections: 11,
      closedNew: 7,
      signaturesNew: 6,
      closing: 0.857,
      ticket: 9_600,
      amountNew: 57_600,
      rdv: 101,
    },
  },
  capacity: [
    { fy: 'FY24', amountNew: 1_200_000, signaturesNew: 60, detections: 200 },
    { fy: 'FY25', amountNew: 537_100, signaturesNew: 40, detections: 180 },
    { fy: 'FY26', amountNew: 846_400, signaturesNew: 50, detections: 184 },
  ],
  ownerBridge: {
    active: {
      label: 'Commerciaux actifs',
      prev: 537_100,
      curr: 846_400,
      delta: 309_300,
    },
    dg: {
      label: 'PDG',
      prev: 334_200,
      curr: 57_600,
      delta: -276_600,
    },
    departed: {
      label: 'Commerciaux partis',
      prev: 196_500,
      curr: 0,
      delta: -196_500,
    },
    total: -163_800,
    conservation: { ok: true, delta_amount: 0 },
  },
  productivity: {
    FY25: {
      fy: 'FY25',
      fte: 4.17,
      amountNew: 733_600,
      signatures: 49,
      detections: 265,
      caPerFte: 176_000,
      signaturesPerFte: 11.8,
      detectionsPerFte: 63.6,
    },
    FY26: {
      fy: 'FY26',
      fte: 2,
      amountNew: 846_400,
      signatures: 50,
      detections: 184,
      caPerFte: 423_200,
      signaturesPerFte: 25,
      detectionsPerFte: 92,
    },
    evolution: {
      caPerFte: 140,
      signaturesPerFte: 113,
      detectionsPerFte: 45,
    },
  },
  attribution_limit:
    'Attribution par Owner courant du snapshot — pas de reconstitution historique.',
  rdv_limit:
    'RDV Salesforce · périmètre différent du snapshot Excel du 21/07/2026',
};

describe('CapacitySection', () => {
  it('rend le bridge Owner avant la comparaison Paul/Christophe (R10)', () => {
    const { container } = render(
      <CapacitySection data={payload} loading={false} />,
    );
    const text = container.textContent || '';
    const bridgeAt = text.indexOf('Bridge Owner');
    const compareAt = text.indexOf('Paul / Christophe');
    expect(bridgeAt).toBeGreaterThanOrEqual(0);
    expect(compareAt).toBeGreaterThan(bridgeAt);
  });
});
