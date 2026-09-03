import { describe, expect, it } from 'vitest';
import { computeCommercial } from './commercial.js';
import { DEFAULT_FTE } from './fte-config.js';

const PAUL = { id: '005AZ000000fLYkYAM', name: 'Paul Rathouin' };
const CHRISTOPHE = { id: '0055I000002lY9QQAU', name: 'Christophe Hirtz' };
const JEROME = { id: '005b0000005zfnvAAA', name: 'Jérôme Bosio' };
const YANIS = { id: '005Sb000007b6dWIAQ', name: 'Yanis Agharbi' };
const PARTI = { id: '00500000000PARTIAA', name: 'Commercial parti' };

function splitAmount(total, n) {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

function opp({
  id,
  name,
  amount = 0,
  owner,
  closeDate,
  createdDate,
  won = false,
  closed = false,
}) {
  return {
    Id: id,
    Name: name,
    Amount: amount,
    CloseDate: closeDate,
    CreatedDate: createdDate || `${closeDate}T00:00:00.000Z`,
    OwnerId: owner.id,
    Owner: { Name: owner.name },
    StageName: won ? 'Fermée / Gagnée' : closed ? 'Fermée / Perdue' : 'Détectée',
    IsWon: won,
    IsClosed: closed || won,
  };
}

function wonBatch(owner, fy, prefix, total, count, closeDate) {
  return splitAmount(total, count).map((amount, i) =>
    opp({
      id: `006${fy}${prefix}W${String(i).padStart(3, '0')}`,
      name: `Projet ${owner.name} ${fy} ${i}`,
      amount,
      owner,
      closeDate,
      won: true,
      closed: true,
    }),
  );
}

function lostBatch(owner, fy, prefix, count, closeDate) {
  return Array.from({ length: count }, (_, i) =>
    opp({
      id: `006${fy}${prefix}L${String(i).padStart(3, '0')}`,
      name: `Perdu ${owner.name} ${fy} ${i}`,
      amount: 1_000,
      owner,
      closeDate,
      closed: true,
    }),
  );
}

function createdBatch(owner, fy, prefix, count, createdDate) {
  return Array.from({ length: count }, (_, i) =>
    opp({
      id: `006${fy}${prefix}C${String(i).padStart(3, '0')}`,
      name: `Détecté ${owner.name} ${fy} ${i}`,
      owner,
      closeDate: createdDate,
      createdDate: `${createdDate}T00:00:00.000Z`,
    }),
  );
}

function rdvBatch(owner, count, startDate) {
  return Array.from({ length: count }, (_, i) => ({
    Subject: `RDV ${owner.name} ${i}`,
    ActivityDate: shiftDays(startDate, i),
    OwnerId: owner.id,
    Owner: { Name: owner.name },
  }));
}

function shiftDays(isoDay, days) {
  const ms = Date.parse(`${isoDay}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

const FY24_CLOSE = '2024-01-22';
const FY25_CLOSE = '2025-01-15';
const FY26_CLOSE = '2026-03-15';

const fy24Paul = wonBatch(PAUL, 'FY24', 'PA', 800_000, 40, FY24_CLOSE);
const fy24Chr = wonBatch(CHRISTOPHE, 'FY24', 'CH', 400_000, 20, FY24_CLOSE);

const fy25Paul = wonBatch(PAUL, 'FY25', 'PA', 300_100, 18, FY25_CLOSE);
const fy25Chr = wonBatch(CHRISTOPHE, 'FY25', 'CH', 237_000, 22, FY25_CLOSE);
const fy25Parti = wonBatch(PARTI, 'FY25', 'PT', 196_500, 9, FY25_CLOSE);
const fy25Jer = wonBatch(JEROME, 'FY25', 'JE', 334_100, 14, FY25_CLOSE);

const fy26Paul = wonBatch(PAUL, 'FY26', 'PA', 528_400, 21, FY26_CLOSE);
const fy26Chr = wonBatch(CHRISTOPHE, 'FY26', 'CH', 318_000, 29, FY26_CLOSE);
const fy26Jer = wonBatch(JEROME, 'FY26', 'JE', 57_600, 6, FY26_CLOSE);

const window = {
  FY24: {
    won: [...fy24Paul, ...fy24Chr],
    closed: [...fy24Paul, ...fy24Chr],
    created: [],
  },
  FY25: {
    won: [...fy25Paul, ...fy25Chr, ...fy25Parti, ...fy25Jer],
    closed: [
      ...fy25Paul,
      ...fy25Chr,
      ...fy25Parti,
      ...fy25Jer,
      ...lostBatch(PAUL, 'FY25', 'PA', 30, FY25_CLOSE),
    ],
    created: [
      ...createdBatch(PAUL, 'FY25', 'PA', 80, '2024-09-01'),
      ...createdBatch(CHRISTOPHE, 'FY25', 'CH', 100, '2024-09-01'),
      ...createdBatch(PARTI, 'FY25', 'PT', 85, '2024-09-01'),
      ...createdBatch(JEROME, 'FY25', 'JE', 14, '2024-09-01'),
    ],
  },
  FY26: {
    won: [...fy26Paul, ...fy26Chr, ...fy26Jer],
    closed: [
      ...fy26Paul,
      ...fy26Chr,
      ...fy26Jer,
      ...lostBatch(PAUL, 'FY26', 'PA', 60, FY26_CLOSE),
      ...lostBatch(CHRISTOPHE, 'FY26', 'CH', 69, FY26_CLOSE),
      ...lostBatch(JEROME, 'FY26', 'JE', 1, FY26_CLOSE),
    ],
    created: [
      ...createdBatch(PAUL, 'FY26', 'PA', 65, '2025-09-01'),
      ...createdBatch(CHRISTOPHE, 'FY26', 'CH', 119, '2025-09-01'),
      ...createdBatch(JEROME, 'FY26', 'JE', 11, '2025-09-01'),
      ...createdBatch(YANIS, 'FY26', 'YA', 2, '2025-09-01'),
    ],
  },
};

const rdv = {
  FY26: [
    ...rdvBatch(PAUL, 8, '2025-09-02'),
    ...rdvBatch(CHRISTOPHE, 6, '2025-09-02'),
    ...rdvBatch(JEROME, 4, '2025-09-02'),
    ...rdvBatch(YANIS, 10, '2025-09-02'),
  ],
};

function commercial(fy = 'FY26', compare = 'FY25') {
  return computeCommercial(window, DEFAULT_FTE, rdv, { fy, compare });
}

function withinPct(actual, expected, pct = 0.01) {
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThanOrEqual(
    pct,
  );
}

describe('computeCommercial', () => {
  it('exclut Jérôme du classement sales et du dénominateur ETP, pas des totaux entreprise (R7)', () => {
    const result = commercial();
    const ids = result.sales.map((row) => row.ownerId);
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(
      expect.arrayContaining([PAUL.id, CHRISTOPHE.id]),
    );
    expect(ids).not.toContain(JEROME.id);
    expect(ids).not.toContain(YANIS.id);
    expect(result.company.amountNew).toBe(904_000);
  });

  it('place Yanis dans activity avec closing null et amountNew 0 (R8)', () => {
    const result = commercial();
    const yanis = result.activity.find((row) => row.ownerId === YANIS.id);
    expect(yanis).toBeDefined();
    expect(yanis.closing).toBeNull();
    expect(yanis.amountNew).toBe(0);
  });

  it('calcule la productivité FY26 / FY25 (§2.6, ±1 %)', () => {
    const { productivity } = commercial();
    withinPct(productivity.FY26.caPerFte, 423_200);
    withinPct(productivity.FY26.signaturesPerFte, 25.0);
    withinPct(productivity.FY26.detectionsPerFte, 92.0);
    withinPct(productivity.FY25.caPerFte, 176_000);
    withinPct(productivity.FY25.signaturesPerFte, 11.8);
    withinPct(productivity.FY25.detectionsPerFte, 63.6);
  });

  it('calcule les évolutions de productivité ±1 pt (§2.6)', () => {
    const { evolution } = commercial().productivity;
    expect(Math.abs(evolution.caPerFte - 140)).toBeLessThanOrEqual(1);
    expect(Math.abs(evolution.signaturesPerFte - 113)).toBeLessThanOrEqual(1);
    expect(Math.abs(evolution.detectionsPerFte - 45)).toBeLessThanOrEqual(1);
  });
});
