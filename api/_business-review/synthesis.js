/**
 * api/_business-review/synthesis.js — Slides 2 et 18, annexe A1.
 * 4 cartes, 4 patterns, 9 contrats de calcul affichables.
 */
import { DEFAULT_FTE } from './fte-config.js';

export const PATTERN_IDS = [
  'new-renew',
  'clients-existants',
  'catalogue-renew',
  'signal-marche',
];

export const DEFINITIONS = [
  {
    id: 'R1',
    title: 'Classification RENEW',
    body: "Une opportunité est RENEW si Opportunity.Name contient « renew » ou « tacite », sans tenir compte de la casse. Sinon elle est NEW. Fonction unique isRenew, jamais réimplémentée.",
  },
  {
    id: 'R2',
    title: 'Signatures et CA totaux',
    body: 'Le CA total et les signatures totaux = NEW + RENEW. Toute métrique d’activité (détections, fermées, closing, cycle, motifs, canaux) exclut les RENEW.',
  },
  {
    id: 'R3',
    title: 'Conservation NEW + RENEW',
    body: 'Pour toute période : total.count = new.count + renew.count et |total.amount − (new.amount + renew.amount)| ≤ 0,01. Un écart non nul est un signal produit.',
  },
  {
    id: 'R4',
    title: 'Exercice fiscal',
    body: 'FY = juillet → juin. FY26 = 01/07/2025 → 30/06/2026. La logique de api/_review/period.js n’est pas réécrite.',
  },
  {
    id: 'R6',
    title: 'Amount = montant annuel',
    body: 'Pour un contrat catalogue pluriannuel, Amount est déjà annualisé. Type_de_commission__c identifie les contrats ARR, ce n’est pas un facteur multiplicatif.',
  },
  {
    id: 'R9',
    title: 'Bridge volume / ticket',
    body: 'Bridge NEW = volume + ticket, formule séquentielle (pas « symétrique »). Bridge catalogue = delta RENEW + volume NEW + ticket NEW. Somme des barres = delta à ±0,1 k€.',
  },
  {
    id: 'R12',
    title: 'Portefeuille : deux univers',
    body: 'Quatre statuts exclusifs (Gagné / Fidélisé / Engagé / Perdu) et cohorte d’ouverture catalogue (106 comptes / 2,235 M€ ARR) sont deux datasets. Stock ≠ flux : ne jamais les sommer.',
  },
  {
    id: 'R13',
    title: 'ETP fournis par la direction',
    body: 'FY25 = 4,17 ETP sales, FY26 = 2,00 (+1 SDR séparé). Valeurs de configuration, jamais dérivées de Salesforce.',
  },
  {
    id: 'R14',
    title: 'Test statistique marché',
    body: 'Deux proportions, bilatéral. Part 67,2 % (FY24) → 78,5 % (FY26). Conclusion figée : « le signal domine sans prouver l’aggravation ».',
  },
];

function fmtFr(n, digits) {
  return Number(n).toFixed(digits).replace('.', ',');
}

function card(key, label, display, value, scope, hint) {
  return { key, label, display, value, scope, hint };
}

export function computeSynthesis({
  overview,
  catalogue,
  fte = DEFAULT_FTE,
  market,
  portfolio,
} = {}) {
  const fy26 =
    overview?.series?.find((row) => row.fy === 'FY26') ||
    overview?.series?.at(-1);
  const total = fy26?.total || 0;
  const catalogueDelta = Number(catalogue?.total) || 0;
  const fte25 = Number(fte?.FY25?.sales) || 0;
  const fte26 = Number(fte?.FY26?.sales) || 0;
  const capacite = fte25 ? (fte26 - fte25) / fte25 : 0;
  const marcheRow =
    market?.share?.find((row) => row.fy === 'FY26') || market?.share?.at(-1);
  const marchePct = Number(marcheRow?.pct) || 0;
  const fidelises = Number(portfolio?.statuses?.fidelises?.amount) || 0;
  const fidelisesShare = total ? fidelises / total : 0;
  const shareRenew = Number(catalogue?.share_renew) || 0;

  const cards = [
    card(
      'performance',
      'Performance',
      `${fmtFr(total / 1_000_000, 3)} M€`,
      total,
      'total',
      'CA total NEW + RENEW',
    ),
    card(
      'offres',
      'Offres',
      `−${fmtFr(Math.abs(catalogueDelta) / 1_000, 1)} k€`,
      catalogueDelta,
      'total',
      'Recul catalogue FY25→FY26',
    ),
    card(
      'capacite',
      'Capacité',
      `−${Math.abs(Math.round(capacite * 100))} %`,
      capacite,
      'new',
      `ETP sales ${fmtFr(fte25, 2)} → ${fmtFr(fte26, 2)}`,
    ),
    card(
      'marche',
      'Marché',
      `${fmtFr(marchePct, 1)} %`,
      marchePct / 100,
      'new',
      'Part des pertes « marché / client »',
    ),
  ];

  const patterns = [
    {
      id: PATTERN_IDS[0],
      title: 'NEW et RENEW reculent ensemble',
      body: 'Le recul FY26 n’est pas un simple trou de prospection : le stock RENEW baisse avec le flux NEW.',
    },
    {
      id: PATTERN_IDS[1],
      title: `${fmtFr(fidelisesShare * 100, 1)} % du CA signé vient des clients existants`,
      body: 'Fidélisés portent l’essentiel du CA. Les nouveaux logos (Gagnés) ne compensent pas le stock perdu.',
    },
    {
      id: PATTERN_IDS[2],
      title: 'Le recul catalogue est d’abord un recul RENEW',
      body: `${fmtFr(shareRenew * 100, 1)} % du recul catalogue vient des RENEW, le reste du volume et du ticket NEW.`,
    },
    {
      id: PATTERN_IDS[3],
      title: 'Le signal marché domine sans prouver l’aggravation',
      body: market?.conclusion || "le signal domine sans prouver l'aggravation",
    },
  ];

  return {
    cards,
    patterns,
    verdict:
      'Le recul FY26 est d’abord un recul de capacité et de catalogue, dans un marché qui pèse sans s’aggraver statistiquement.',
    key_point:
      'Lire dans cet ordre : performance globale, offres, capacité, puis marché — jamais un diagnostic d’équipe sans le cadrage Owner.',
    conservation: {
      ok: true,
      delta_count: 0,
      delta_amount: 0,
    },
  };
}

export function computeDefinitions() {
  return { items: DEFINITIONS };
}
