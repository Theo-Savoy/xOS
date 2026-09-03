/**
 * Fixture d'or Business Review — reproduisant §2.1, §2.2, §2.4, §2.5, §2.10, §2.11.
 * Totaux NEW/RENEW et montants Owner FY25/FY26 conservés pour les tests du lot 1.
 */
const PAUL = { id: '005AZ000000fLYkYAM', name: 'Paul Rathouin' };
const CHRISTOPHE = { id: '0055I000002lY9QQAU', name: 'Christophe Hirtz' };
const JEROME = { id: '005b0000005zfnvAAA', name: 'Jérôme Bosio' };
const PARTI = { id: '00500000000PARTIAA', name: 'Commercial parti' };

const SALE = {
  catalogue: 'Catalogue',
  sur_mesure: 'Sur-mesure',
  conseil: 'Conseil',
  autre: 'LMS',
};

function splitAmount(total, n) {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

function shiftDate(isoDay, days) {
  const ms = Date.parse(`${isoDay}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function opp({
  id,
  name,
  amount,
  closeDate,
  cycleDays = 30,
  owner,
  saleType,
  won = true,
}) {
  return {
    Id: id,
    Name: name,
    Amount: amount,
    CloseDate: closeDate,
    CreatedDate: `${shiftDate(closeDate, -cycleDays)}T00:00:00.000Z`,
    OwnerId: owner.id,
    Owner: { Name: owner.name },
    StageName: won ? 'Fermée / Gagnée' : 'Fermée / Perdue',
    IsWon: won,
    IsClosed: true,
    Type_de_vente__c: saleType,
  };
}

function wonBatch({
  fy,
  prefix,
  name,
  amounts,
  closeDate,
  cycles,
  owner,
  saleType,
  renew = false,
}) {
  return amounts.map((amount, i) =>
    opp({
      id: `006${fy}${prefix}${String(i).padStart(3, '0')}`,
      name: renew
        ? `Renouvellement RENEW ${name} ${fy} ${i}`
        : `Projet ${name} ${fy} ${i}`,
      amount,
      closeDate,
      cycleDays: cycles?.[i] ?? 30,
      owner,
      saleType,
    }),
  );
}

function lostBatch({ fy, prefix, name, count, closeDate, owner, saleType }) {
  return Array.from({ length: count }, (_, i) =>
    opp({
      id: `006${fy}${prefix}L${String(i).padStart(3, '0')}`,
      name: `Perdu ${name} ${fy} ${i}`,
      amount: 1_000,
      closeDate,
      cycleDays: 20,
      owner,
      saleType,
      won: false,
    }),
  );
}

const LOSS = 'Raison_de_perte_V2__c';
const WIN = 'Raison_de_gain_V2__c';

function fillReasons(records, field, specs) {
  let offset = 0;
  for (const { label, count } of specs) {
    for (let i = 0; i < count; i += 1) {
      const record = records[offset + i];
      if (record) record[field] = label;
    }
    offset += count;
  }
}

function bySale(records, saleType) {
  return records.filter((record) => record.Type_de_vente__c === saleType);
}

const FY22 = {
  won: [
    opp({
      id: '006FY22NEW',
      name: 'Projet catalogue FY22',
      amount: 2_483_000,
      closeDate: '2021-12-15',
      cycleDays: 136,
      owner: PAUL,
      saleType: SALE.catalogue,
    }),
    opp({
      id: '006FY22REN',
      name: 'Renouvellement RENEW FY22',
      amount: 391_000,
      closeDate: '2022-03-10',
      cycleDays: 191,
      owner: PAUL,
      saleType: SALE.catalogue,
    }),
  ],
  closed: [],
  created: [],
};

const FY23 = {
  won: [
    opp({
      id: '006FY23NEW',
      name: 'Projet sur-mesure FY23',
      amount: 2_050_000,
      closeDate: '2022-11-20',
      cycleDays: 111,
      owner: CHRISTOPHE,
      saleType: SALE.sur_mesure,
    }),
    opp({
      id: '006FY23REN',
      name: 'Tacite reconduction FY23',
      amount: 1_327_000,
      closeDate: '2023-02-14',
      cycleDays: 166,
      owner: CHRISTOPHE,
      saleType: SALE.catalogue,
    }),
  ],
  closed: [],
  created: [],
};

// ── FY24 : montants produit §2.4, total NEW 1 406 k€ ─────────────────────
const FY24_CLOSE = '2024-01-22';
const fy24Cat = wonBatch({
  fy: 'FY24',
  prefix: 'CAT',
  name: 'catalogue',
  amounts: splitAmount(401_000, 32),
  closeDate: FY24_CLOSE,
  owner: PAUL,
  saleType: SALE.catalogue,
});
const fy24Sm = wonBatch({
  fy: 'FY24',
  prefix: 'SM',
  name: 'sur-mesure',
  amounts: splitAmount(774_000, 49),
  closeDate: FY24_CLOSE,
  owner: PAUL,
  saleType: SALE.sur_mesure,
});
const fy24Conseil = wonBatch({
  fy: 'FY24',
  prefix: 'CO',
  name: 'conseil',
  amounts: splitAmount(229_000, 20),
  closeDate: FY24_CLOSE,
  owner: PAUL,
  saleType: SALE.conseil,
});
const fy24Autre = wonBatch({
  fy: 'FY24',
  prefix: 'OT',
  name: 'lms',
  amounts: splitAmount(2_000, 2),
  closeDate: FY24_CLOSE,
  owner: PAUL,
  saleType: SALE.autre,
});
const fy24Renew = wonBatch({
  fy: 'FY24',
  prefix: 'REN',
  name: 'catalogue',
  amounts: [1_723_000],
  closeDate: FY24_CLOSE,
  owner: PAUL,
  saleType: SALE.catalogue,
  renew: true,
});
const fy24WonNew = [...fy24Cat, ...fy24Sm, ...fy24Conseil, ...fy24Autre];
const fy24Lost = [
  ...lostBatch({
    fy: 'FY24',
    prefix: 'CAT',
    name: 'catalogue',
    count: 174 - fy24Cat.length,
    closeDate: FY24_CLOSE,
    owner: PAUL,
    saleType: SALE.catalogue,
  }),
  ...lostBatch({
    fy: 'FY24',
    prefix: 'SM',
    name: 'sur-mesure',
    count: 144 - fy24Sm.length,
    closeDate: FY24_CLOSE,
    owner: PAUL,
    saleType: SALE.sur_mesure,
  }),
  ...lostBatch({
    fy: 'FY24',
    prefix: 'CO',
    name: 'conseil',
    count: 49 - fy24Conseil.length,
    closeDate: FY24_CLOSE,
    owner: PAUL,
    saleType: SALE.conseil,
  }),
  ...lostBatch({
    fy: 'FY24',
    prefix: 'OT',
    name: 'lms',
    count: 4 - fy24Autre.length,
    closeDate: FY24_CLOSE,
    owner: PAUL,
    saleType: SALE.autre,
  }),
];
fillReasons(fy24Lost, LOSS, [
  { label: 'Projet abandonné', count: 180 },
  { label: 'Design', count: fy24Lost.length - 180 },
]);

const FY24 = {
  won: [...fy24WonNew, ...fy24Renew],
  closed: [...fy24WonNew, ...fy24Lost, ...fy24Renew],
  created: [],
};

// ── FY25 ──────────────────────────────────────────────────────────────────
const FY25_CLOSE = '2025-01-15';
const fy25CatPaul = wonBatch({
  fy: 'FY25',
  prefix: 'CPA',
  name: 'catalogue Paul',
  amounts: splitAmount(300_000, 14),
  closeDate: FY25_CLOSE,
  owner: PAUL,
  saleType: SALE.catalogue,
});
const fy25CatParti = wonBatch({
  fy: 'FY25',
  prefix: 'CPT',
  name: 'catalogue ancien',
  amounts: splitAmount(196_500, 9),
  closeDate: FY25_CLOSE,
  owner: PARTI,
  saleType: SALE.catalogue,
});
const fy25CatJer = wonBatch({
  fy: 'FY25',
  prefix: 'CJE',
  name: 'catalogue Jérôme',
  amounts: splitAmount(219_700, 10),
  closeDate: FY25_CLOSE,
  owner: JEROME,
  saleType: SALE.catalogue,
});
const fy25SmChr = wonBatch({
  fy: 'FY25',
  prefix: 'SCH',
  name: 'sur-mesure Christophe',
  amounts: splitAmount(237_000, 20),
  closeDate: FY25_CLOSE,
  owner: CHRISTOPHE,
  saleType: SALE.sur_mesure,
});
const fy25SmJer = wonBatch({
  fy: 'FY25',
  prefix: 'SJE',
  name: 'sur-mesure Jérôme',
  amounts: splitAmount(54_000, 5),
  closeDate: FY25_CLOSE,
  owner: JEROME,
  saleType: SALE.sur_mesure,
});
const fy25Conseil = wonBatch({
  fy: 'FY25',
  prefix: 'CO',
  name: 'conseil Jérôme',
  amounts: splitAmount(53_000, 4),
  closeDate: FY25_CLOSE,
  owner: JEROME,
  saleType: SALE.conseil,
});
const fy25Autre = wonBatch({
  fy: 'FY25',
  prefix: 'OT',
  name: 'lms',
  amounts: [7_500],
  closeDate: FY25_CLOSE,
  owner: JEROME,
  saleType: SALE.autre,
});
const fy25CatRenew = wonBatch({
  fy: 'FY25',
  prefix: 'REN',
  name: 'catalogue',
  amounts: [880_200],
  closeDate: FY25_CLOSE,
  owner: PAUL,
  saleType: SALE.catalogue,
  renew: true,
});
const fy25AutreRenew = wonBatch({
  fy: 'FY25',
  prefix: 'RNO',
  name: 'lms',
  amounts: [800],
  closeDate: FY25_CLOSE,
  owner: PAUL,
  saleType: SALE.autre,
  renew: true,
});
const fy25Cat = [...fy25CatPaul, ...fy25CatParti, ...fy25CatJer];
const fy25Sm = [...fy25SmChr, ...fy25SmJer];
const fy25WonNew = [...fy25Cat, ...fy25Sm, ...fy25Conseil, ...fy25Autre];
const fy25Lost = [
  ...lostBatch({
    fy: 'FY25',
    prefix: 'CAT',
    name: 'catalogue',
    count: 108 - fy25Cat.length,
    closeDate: FY25_CLOSE,
    owner: PAUL,
    saleType: SALE.catalogue,
  }),
  ...lostBatch({
    fy: 'FY25',
    prefix: 'SM',
    name: 'sur-mesure',
    count: 102 - fy25Sm.length,
    closeDate: FY25_CLOSE,
    owner: PAUL,
    saleType: SALE.sur_mesure,
  }),
  ...lostBatch({
    fy: 'FY25',
    prefix: 'CO',
    name: 'conseil',
    count: 30 - fy25Conseil.length,
    closeDate: FY25_CLOSE,
    owner: JEROME,
    saleType: SALE.conseil,
  }),
  ...lostBatch({
    fy: 'FY25',
    prefix: 'OT',
    name: 'lms',
    count: 8 - fy25Autre.length,
    closeDate: FY25_CLOSE,
    owner: JEROME,
    saleType: SALE.autre,
  }),
];
fillReasons(fy25Lost, LOSS, [
  { label: 'Projet abandonné', count: 135 },
  { label: 'Design', count: fy25Lost.length - 135 },
]);

const FY25 = {
  won: [...fy25WonNew, ...fy25CatRenew, ...fy25AutreRenew],
  closed: [...fy25WonNew, ...fy25Lost, ...fy25CatRenew, ...fy25AutreRenew],
  created: [],
};

// ── FY26 ──────────────────────────────────────────────────────────────────
const FY26_CLOSE = '2026-03-15';
const CAT_CYCLES = [
  10, 12, 14, 16, 18, 19, 21, 24, 68, 68, 200, 230, 247, 400, 450, 800, 850,
  900, -1, -2, -3, -5, -8, -11, -15,
];
const SM_CYCLES = [
  4, 5, 6, 8, 10, 12, 13, 14, 15, 16, 17, 22, 40, 50, 60, 68, 180, 200, 220,
  240, 260, -1, -2, -4, -6, -9, -12,
];

const fy26Cat = wonBatch({
  fy: 'FY26',
  prefix: 'CAT',
  name: 'catalogue Paul',
  amounts: splitAmount(458_300, 25),
  closeDate: FY26_CLOSE,
  cycles: CAT_CYCLES,
  owner: PAUL,
  saleType: SALE.catalogue,
});
const fy26Sm = wonBatch({
  fy: 'FY26',
  prefix: 'SM',
  name: 'sur-mesure Christophe',
  amounts: splitAmount(313_000, 27),
  closeDate: FY26_CLOSE,
  cycles: SM_CYCLES,
  owner: CHRISTOPHE,
  saleType: SALE.sur_mesure,
});
const fy26ConseilPaul = wonBatch({
  fy: 'FY26',
  prefix: 'CPA',
  name: 'conseil Paul',
  amounts: [70_100],
  closeDate: FY26_CLOSE,
  cycles: [8],
  owner: PAUL,
  saleType: SALE.conseil,
});
const fy26ConseilJer = wonBatch({
  fy: 'FY26',
  prefix: 'CJE',
  name: 'conseil Jérôme',
  amounts: [57_600],
  closeDate: FY26_CLOSE,
  cycles: [14],
  owner: JEROME,
  saleType: SALE.conseil,
});
const fy26ConseilChr = wonBatch({
  fy: 'FY26',
  prefix: 'CCH',
  name: 'conseil Christophe',
  amounts: [1_300],
  closeDate: FY26_CLOSE,
  cycles: [14],
  owner: CHRISTOPHE,
  saleType: SALE.conseil,
});
const fy26Autre = wonBatch({
  fy: 'FY26',
  prefix: 'OT',
  name: 'lms',
  amounts: [3_700],
  closeDate: FY26_CLOSE,
  cycles: [25],
  owner: CHRISTOPHE,
  saleType: SALE.autre,
});
const fy26Conseil = [...fy26ConseilPaul, ...fy26ConseilJer, ...fy26ConseilChr];
const fy26CatRenew = wonBatch({
  fy: 'FY26',
  prefix: 'REN',
  name: 'catalogue',
  amounts: [546_500],
  closeDate: FY26_CLOSE,
  owner: PAUL,
  saleType: SALE.catalogue,
  renew: true,
});
const fy26ConseilRenew = wonBatch({
  fy: 'FY26',
  prefix: 'RCO',
  name: 'conseil',
  amounts: splitAmount(225_600, 5),
  closeDate: FY26_CLOSE,
  owner: PAUL,
  saleType: SALE.conseil,
  renew: true,
});
const fy26AutreRenew = wonBatch({
  fy: 'FY26',
  prefix: 'ROT',
  name: 'lms',
  amounts: [4_900],
  closeDate: FY26_CLOSE,
  owner: PAUL,
  saleType: SALE.autre,
  renew: true,
});
const fy26WonNew = [...fy26Cat, ...fy26Sm, ...fy26Conseil, ...fy26Autre];
const fy26Lost = [
  ...lostBatch({
    fy: 'FY26',
    prefix: 'CAT',
    name: 'catalogue',
    count: 110 - fy26Cat.length,
    closeDate: FY26_CLOSE,
    owner: PAUL,
    saleType: SALE.catalogue,
  }),
  ...lostBatch({
    fy: 'FY26',
    prefix: 'SM',
    name: 'sur-mesure',
    count: 65 - fy26Sm.length,
    closeDate: FY26_CLOSE,
    owner: CHRISTOPHE,
    saleType: SALE.sur_mesure,
  }),
  ...lostBatch({
    fy: 'FY26',
    prefix: 'CO',
    name: 'conseil',
    count: 9 - fy26Conseil.length,
    closeDate: FY26_CLOSE,
    owner: JEROME,
    saleType: SALE.conseil,
  }),
  ...lostBatch({
    fy: 'FY26',
    prefix: 'OT',
    name: 'lms',
    count: 2 - fy26Autre.length,
    closeDate: FY26_CLOSE,
    owner: CHRISTOPHE,
    saleType: SALE.autre,
  }),
];
fillReasons(bySale(fy26Lost, SALE.catalogue), LOSS, [
  { label: 'Projet abandonné', count: 32 },
  { label: 'Aucune réponse client', count: 18 },
  { label: 'Budget non obtenu', count: 6 },
  { label: 'Internalisation', count: 5 },
  { label: 'Sous contrat', count: 4 },
  { label: 'No go XOS', count: 5 },
  { label: 'Design', count: 4 },
  { label: 'Réponse XOS', count: 6 },
  { label: 'Prix', count: 5 },
]);
fillReasons(bySale(fy26Lost, SALE.sur_mesure), LOSS, [
  { label: 'Projet abandonné', count: 15 },
  { label: 'Aucune réponse client', count: 8 },
  { label: 'Budget non obtenu', count: 3 },
  { label: 'Internalisation', count: 2 },
  { label: 'Sous contrat', count: 2 },
  { label: 'No go XOS', count: 2 },
  { label: 'Design', count: 2 },
  { label: 'Réponse XOS', count: 3 },
  { label: 'Prix', count: 1 },
]);
fillReasons(bySale(fy26Lost, SALE.conseil), LOSS, [
  { label: 'Projet abandonné', count: 3 },
  { label: 'Aucune réponse client', count: 2 },
  { label: 'Internalisation', count: 1 },
]);
fillReasons(bySale(fy26Lost, SALE.autre), LOSS, [
  { label: 'Sous contrat', count: 1 },
]);
fillReasons(fy26Cat, WIN, [
  { label: 'Prix', count: 14 },
  { label: 'Pertinence du dispositif', count: 3 },
  { label: 'Accompagnement du commercial', count: 3 },
  { label: 'Notoriété', count: 2 },
  { label: 'Offre clés en main', count: 1 },
  { label: 'Réactivité', count: 1 },
  { label: 'Pertinence du profil', count: 1 },
]);
fillReasons(fy26Sm, WIN, [
  { label: 'Offre clés en main', count: 8 },
  { label: 'Pertinence du dispositif', count: 7 },
  { label: 'Accompagnement du commercial', count: 5 },
  { label: 'Accompagnement du CP', count: 4 },
  { label: 'Prix', count: 2 },
  { label: 'Réactivité', count: 1 },
]);
fillReasons(fy26Conseil, WIN, [
  { label: 'Prix', count: 1 },
  { label: 'Autre motif', count: 2 },
]);
fillReasons(fy26Autre, WIN, [{ label: 'Autre motif', count: 1 }]);

const FY26 = {
  won: [
    ...fy26WonNew,
    ...fy26CatRenew,
    ...fy26ConseilRenew,
    ...fy26AutreRenew,
  ],
  closed: [
    ...fy26WonNew,
    ...fy26Lost,
    ...fy26CatRenew,
    ...fy26ConseilRenew,
    ...fy26AutreRenew,
  ],
  created: [],
};

const fyWindow = { FY22, FY23, FY24, FY25, FY26 };

export default fyWindow;
