/**
 * api/_business-review/synthesis.js — Cartes de cadrage + slot narratif.
 *
 * KPIs : 4 lectures structurantes calculées sur la période sélectionnée
 * (FY complet ou semestre S1/S2), comparées à la même période N-1 :
 *   1. croissance    — Δ% CA total vs même période N-1
 *   2. mix           — part des nouvelles affaires dans le CA signé
 *   3. closing       — signatures / opportunités fermées (nouv. aff.)
 *   4. cycle         — médiane création → signature des nouvelles affaires gagnées
 * Le narratif (patterns, verdict) est neutralisé : payload vide tant que
 * l'IA n'est pas branchée (voir frozenNarrative + analysis.status = 'none').
 */
import mapping from '../_crm/mapping.js';
import { isRenew, splitNewRenew } from './classify.js';
import { cycleDays, summarizeCycles } from './cycles.js';

const { opportunity: opp } = mapping.objects;

export const PATTERN_IDS = [
  'new-renew',
  'clients-existants',
  'catalogue-renew',
  'signal-marche',
];

export const DEFINITIONS = [
  {
    id: 'R1',
    title: 'Classification renouvellements',
    body: 'Une opportunité est RENEW si Opportunity.Name contient « renew » ou « tacite », sans tenir compte de la casse. Sinon elle est NEW. Fonction unique isRenew, jamais réimplémentée.',
  },
  {
    id: 'R2',
    title: 'Signatures et CA totaux',
    body: 'Le CA total et les signatures totaux = nouvelles affaires + renouvellements. Toute métrique d’activité (détections, fermées, closing, cycle, motifs, canaux) exclut les renouvellements.',
  },
  {
    id: 'R3',
    title: 'Conservation nouv. aff. + renouv.',
    body: 'Pour toute période : total.count = new.count + renew.count et |total.amount − (new.amount + renew.amount)| ≤ 0,01. Un écart non nul est un signal produit.',
  },
  {
    id: 'R4',
    title: 'Exercice fiscal',
    body: 'FY = juillet → juin. Un FYNN va du 01/07/(2000+NN−1) au 30/06/(2000+NN). La logique de api/_review/period.js n’est pas réécrite.',
  },
  {
    id: 'R6',
    title: 'Amount = montant annuel',
    body: 'Pour un contrat catalogue pluriannuel, Amount est déjà annualisé. Type_de_commission__c identifie les contrats ARR, ce n’est pas un facteur multiplicatif.',
  },
  {
    id: 'R9',
    title: 'Bridge volume / ticket',
    body: 'Bridge nouvelles affaires = volume + ticket, formule séquentielle (pas « symétrique »). Bridge catalogue = delta renouvellements + volume + ticket nouvelles affaires. Somme des barres = delta à ±0,1 k€.',
  },
  {
    id: 'R12',
    title: 'Portefeuille : deux univers',
    body: 'Quatre statuts exclusifs (Gagné / Fidélisé / Engagé / Perdu) et cohorte d’ouverture catalogue (106 comptes / 2,235 M€ ARR) sont deux datasets. Stock ≠ flux : ne jamais les sommer.',
  },
  {
    id: 'R13',
    title: 'ETP fournis par la direction',
    body: 'ETP sales et SDR par exercice, lus dans la configuration. Valeurs de configuration, jamais dérivées de Salesforce.',
  },
  {
    id: 'R14',
    title: 'Test statistique marché',
    body: 'Deux proportions, bilatéral. La p-value est exploratoire : un signal n’est pas une causalité.',
  },
];

function fmtFr(n, digits) {
  return Number(n).toFixed(digits).replace('.', ',');
}

function card(key, label, display, value, scope, hint) {
  return { key, label, display, value, scope, hint };
}

function wonNewOf(window, fy) {
  return (window[fy]?.won || []).filter(
    (record) => !isRenew(record?.[opp.fields.name]),
  );
}

/**
 * Narratif calibré sur un couple annuel précis — conservé hors payload
 * (P2-5 / P2-9 / P2-10). Non servi tant que analysis.status === 'none'.
 */
export function frozenNarrative({
  window,
  fy,
  catalogue,
  market,
  portfolio,
} = {}) {
  const total = splitNewRenew(window?.[fy]?.won || []).total.amount;
  const fidelises = Number(portfolio?.statuses?.fidelises?.amount) || 0;
  const fidelisesShare = total ? fidelises / total : 0;
  const shareRenew = Number(catalogue?.share_renew) || 0;
  return {
    patterns: [
      {
        id: PATTERN_IDS[0],
        title: 'Nouvelles affaires et renouvellements reculent ensemble',
        body: 'Le recul n’est pas un simple trou de prospection : le stock renouvellements baisse avec le flux nouvelles affaires.',
      },
      {
        id: PATTERN_IDS[1],
        title: `${fmtFr(fidelisesShare * 100, 1)} % du CA signé vient des clients existants`,
        body: 'Fidélisés portent l’essentiel du CA. Les nouveaux logos (Gagnés) ne compensent pas le stock perdu.',
      },
      {
        id: PATTERN_IDS[2],
        title: 'Le recul catalogue est d’abord un recul des renouvellements',
        body: `${fmtFr(shareRenew * 100, 1)} % du recul catalogue vient des renouvellements, le reste du volume et du ticket nouvelles affaires.`,
      },
      {
        id: PATTERN_IDS[3],
        title: 'Le signal marché pèse sans prouver une aggravation',
        body:
          market?.conclusion ||
          "le signal domine sans prouver l'aggravation",
      },
    ],
    verdict:
      'Le recul est d’abord un recul de capacité et de catalogue, dans un marché qui pèse sans s’aggraver statistiquement.',
  };
}

/**
 * Les 4 cartes de cadrage, calculées sur la période (FY ou semestre).
 * @param {object} window fenêtre { FYxx: { won, closed, created } } déjà
 *   filtrée par semestre le cas échéant (api/_review/semester.js).
 */
export function computeSynthesisCards({
  window,
  fy,
  compare,
  semester = null,
}) {
  const prevTotal = splitNewRenew(window[compare]?.won || []).total.amount;
  const currSplit = splitNewRenew(window[fy]?.won || []);
  const currTotal = currSplit.total.amount;
  const suffix = semester ? ` · ${semester}` : '';
  const periodLabel = `${fy}${suffix}`;
  const prevLabel = `${compare}${suffix}`;

  const growth = prevTotal > 0 ? (currTotal - prevTotal) / prevTotal : null;
  const mixNew = currTotal > 0 ? currSplit.new.amount / currTotal : null;
  const closedNewCount = (window[fy]?.closed || []).filter(
    (record) => !isRenew(record?.[opp.fields.name]),
  ).length;
  const closing =
    closedNewCount > 0 ? currSplit.new.count / closedNewCount : null;
  const cycle = summarizeCycles(wonNewOf(window, fy).map(cycleDays));

  return [
    card(
      'croissance',
      'Croissance',
      growth === null
        ? '—'
        : `${growth > 0 ? '+' : '−'}${fmtFr(Math.abs(growth * 100), 1)} %`,
      growth ?? 0,
      'total',
      `CA total ${prevLabel} → ${periodLabel}`,
    ),
    card(
      'mix-new',
      'Mix new / renew',
      mixNew === null ? '—' : `${fmtFr(mixNew * 100, 1)} % new`,
      mixNew ?? 0,
      'new',
      `Part des nouvelles affaires dans le CA signé ${periodLabel}`,
    ),
    card(
      'closing',
      'Closing new',
      closing === null ? '—' : `${fmtFr(closing * 100, 1)} %`,
      closing ?? 0,
      'signatures-new',
      `${currSplit.new.count} signatures / ${closedNewCount} fermées ${periodLabel}`,
    ),
    card(
      'cycle',
      'Cycle new',
      cycle.median === null ? '—' : `${fmtFr(cycle.median, 0)} j`,
      cycle.median ?? 0,
      'signatures-new',
      `Médiane création → signature ${periodLabel} · ${cycle.n} dossiers`,
    ),
  ];
}

export function computeSynthesis({
  window,
  fy,
  compare,
  semester = null,
} = {}) {
  return {
    cards: computeSynthesisCards({ window, fy, compare, semester }),
    patterns: [],
    verdict: null,
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
