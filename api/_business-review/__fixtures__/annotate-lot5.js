/**
 * Annotation lot 5 — AccountId / campagnes / cohorte ARR sur la fixture d'or.
 * Ne change pas les totaux NEW/RENEW ni les counts produit déjà testés.
 */

function isRenewName(name) {
  const lower = String(name || '').toLowerCase();
  return lower.includes('renew') || lower.includes('tacite');
}

function account(id, name) {
  return { AccountId: id, Account: { Name: name } };
}

function campaign(id, name) {
  if (!id) return { CampaignId: null, Campaign: null };
  return { CampaignId: id, Campaign: { Name: name } };
}

function splitAmount(total, n) {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

const TOP = [
  { id: '001ACC000000SGAAA', name: 'Société Générale', target: 331_000 },
  { id: '001ACC000000CCIAA', name: 'CCI France', target: 160_000 },
  { id: '001ACC000000DGSEA', name: 'DGSE', target: 79_000 },
  { id: '001ACC000000ABEIA', name: 'Abeille Assurances', target: 57_000 },
  { id: '001ACC000000OMNIA', name: 'Omnicell', target: 56_000 },
];

const CHANNELS = [
  { id: null, name: 'Détecté/Signé hors action marketing' },
  { id: '701CAM000009060', name: '9060. Salon Learning Technologies 2026' },
  {
    id: '701CAM00000SITE',
    name: 'Formulaire Site Internet (Test, Contact ou Devis)',
  },
  { id: '701CAM00000PART', name: 'Partenaires' },
  { id: '701CAM000000950', name: '950. Salon LT février 2023 : Leads' },
  { id: '701CAM000007010', name: '7010. Salon SRH mars 2025' },
  { id: '701CAM000010020', name: '10020. Salon SRH 2026' },
];

function packTarget(records, target, acct) {
  let filled = 0;
  const sorted = [...records].sort((a, b) => b.Amount - a.Amount);
  for (const record of sorted) {
    if (record.AccountId) continue;
    if (filled >= target) break;
    if (filled + record.Amount > target) continue;
    Object.assign(record, acct);
    filled += record.Amount;
  }
  return filled;
}

function roundPct1(part, total) {
  if (!total) return 0;
  return Math.round((part * 1000) / total) / 10;
}

function top5Sum(won) {
  const map = new Map();
  for (const record of won) {
    if (!record.AccountId) continue;
    map.set(record.AccountId, (map.get(record.AccountId) || 0) + record.Amount);
  }
  return [...map.values()]
    .sort((a, b) => b - a)
    .slice(0, 5)
    .reduce((sum, n) => sum + n, 0);
}

export function annotateLot5(window) {
  const won = window.FY26.won;
  const closed = window.FY26.closed;
  const fy25Won = window.FY25.won;

  const news = won.filter((record) => !isRenewName(record.Name));
  const cats = news.filter((record) => record.Type_de_vente__c === 'Catalogue');
  const sms = news.filter((record) => record.Type_de_vente__c === 'Sur-mesure');
  const gagnes = [...cats.slice(0, 18), ...sms.slice(0, 5)];
  gagnes.forEach((record, i) => {
    Object.assign(
      record,
      account(`001ACCNEW${String(i).padStart(3, '0')}`, `Nouveau logo ${i + 1}`),
    );
  });

  const sgDeal = won.find(
    (record) => record.Amount === 331_000 && isRenewName(record.Name),
  );
  if (sgDeal) Object.assign(sgDeal, account(TOP[0].id, TOP[0].name));

  for (const top of TOP.slice(1)) {
    packTarget(won, top.target, account(top.id, top.name));
  }

  const totalSigned = won.reduce((sum, record) => sum + record.Amount, 0);
  const fillAcct = account(TOP[4].id, TOP[4].name);
  const smallest = [...won]
    .filter((record) => !record.AccountId)
    .sort((a, b) => a.Amount - b.Amount);
  for (const record of smallest) {
    const pct = roundPct1(top5Sum(won), totalSigned);
    if (pct >= 40.6) break;
    Object.assign(record, fillAcct);
  }

  const donor = won.find(
    (record) =>
      record.AccountId === TOP[4].id &&
      isRenewName(record.Name) &&
      record.Type_de_vente__c === 'Catalogue' &&
      record.Amount > 3_000,
  );
  const receiver = won.find(
    (record) =>
      !record.AccountId &&
      isRenewName(record.Name) &&
      record.Type_de_vente__c === 'Catalogue' &&
      record.Amount > 1_000,
  );
  if (donor && receiver) {
    while (roundPct1(top5Sum(won), totalSigned) > 40.8 && donor.Amount > 1_000) {
      donor.Amount -= 100;
      receiver.Amount += 100;
    }
    while (
      roundPct1(top5Sum(won), totalSigned) < 40.6 &&
      receiver.Amount > 1_000
    ) {
      donor.Amount += 100;
      receiver.Amount -= 100;
    }
  }

  const fideliseExtra = Array.from({ length: 45 }, (_, i) =>
    account(`001ACCFID${String(i).padStart(3, '0')}`, `Client fidèle ${i + 1}`),
  );
  const unset = won.filter((record) => !record.AccountId);
  unset.forEach((record, i) => {
    Object.assign(record, fideliseExtra[i % fideliseExtra.length]);
  });

  const fideliseById = new Map();
  for (const record of won) {
    if (String(record.AccountId || '').includes('NEW')) continue;
    if (!record.AccountId) continue;
    fideliseById.set(record.AccountId, {
      AccountId: record.AccountId,
      Account: record.Account,
    });
  }
  const fideliseList = [...fideliseById.values()];
  fy25Won.forEach((record, i) => {
    const prior = fideliseList[i % fideliseList.length];
    if (prior) Object.assign(record, prior);
  });

  const newClosed = closed.filter((record) => !isRenewName(record.Name));
  const newWon = newClosed.filter((record) => record.IsWon);
  const newLost = newClosed.filter((record) => !record.IsWon);
  const wonPlan = [
    { channel: CHANNELS[1], count: 2 },
    { channel: CHANNELS[2], count: 10 },
    { channel: CHANNELS[3], count: 9 },
    { channel: CHANNELS[4], count: 1 },
    { channel: CHANNELS[5], count: 1 },
  ];
  let offset = 0;
  for (const { channel, count } of wonPlan) {
    for (let i = 0; i < count; i += 1) {
      const record = newWon[offset + i];
      if (record) Object.assign(record, campaign(channel.id, channel.name));
    }
    offset += count;
  }
  for (let i = offset; i < newWon.length; i += 1) {
    Object.assign(newWon[i], campaign(null, CHANNELS[0].name));
  }
  if (newLost[0]) {
    Object.assign(newLost[0], campaign(CHANNELS[6].id, CHANNELS[6].name));
  }
  for (let i = 1; i < newLost.length; i += 1) {
    Object.assign(newLost[i], campaign(null, CHANNELS[0].name));
  }

  return window;
}

export function buildArrCohort(window) {
  const won = window.FY26.won;
  const fideliseIds = [
    ...new Set(
      won
        .filter((record) => !String(record.AccountId || '').includes('NEW'))
        .map((record) => record.AccountId),
    ),
  ];
  const retainedIds = fideliseIds.slice(0, 31);
  const retainedAmounts = splitAmount(522_500, retainedIds.length);
  const retained = retainedIds.map((id, i) => {
    const sample = won.find((record) => record.AccountId === id);
    return {
      AccountId: id,
      AccountName: sample?.Account?.Name || `Cohorte ${i + 1}`,
      arr: retainedAmounts[i],
      active_at_close: true,
    };
  });
  const engages = splitAmount(966_400, 44).map((arr, i) => ({
    AccountId: `001ACCENG${String(i).padStart(3, '0')}`,
    AccountName: `Engagé ${i + 1}`,
    arr,
    active_at_close: true,
  }));
  const perdus = splitAmount(746_100, 31).map((arr, i) => ({
    AccountId: `001ACCLOS${String(i).padStart(3, '0')}`,
    AccountName: `Perdu ${i + 1}`,
    arr,
    active_at_close: false,
  }));
  return [...retained, ...engages, ...perdus];
}
