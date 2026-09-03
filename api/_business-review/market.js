/**
 * api/_business-review/market.js — Slides 12, 14, annexe A6.
 * Motifs déclarés (pas de causalité). Test deux proportions bilatéral (R14).
 * Tables tronquées : n_displayed / n_total, % sur n_total (P6). Arrondi 1 décimale (P5).
 */
import mapping from '../_crm/mapping.js';
import { isRenew, productKey } from './classify.js';

const { opportunity: opp } = mapping.objects;

export const CONCLUSION_MARCHE = "le signal domine sans prouver l'aggravation";
const TOP_N = 8;

function nameOf(record) {
  return record?.[opp.fields.name];
}

function isWon(record) {
  return record?.[opp.fields.isWon] === true;
}

function isNew(record) {
  return !isRenew(nameOf(record));
}

function lossLabel(record) {
  return String(record?.[opp.lossReasonField] || '').trim();
}

function winLabel(record) {
  return String(record?.[opp.winReasonField] || '').trim();
}

function normalize(label) {
  return String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** marché | produit | prix | null */
function lossBucket(label) {
  const n = normalize(label);
  if (!n) return null;
  if (n === 'prix' || n.startsWith('prix ')) return 'prix';
  if (
    n.includes('no go') ||
    n === 'design' ||
    n.includes('reponse xos') ||
    n.includes('produit')
  ) {
    return 'produit';
  }
  if (
    n.includes('abandon') ||
    n.includes('aucune reponse') ||
    n.includes('budget') ||
    n.includes('internalisation') ||
    n.includes('sous contrat')
  ) {
    return 'marche';
  }
  return null;
}

/** Arrondi au demi-supérieur sur une décimale (P5). */
function roundPct1(count, total) {
  if (!total) return 0;
  return Math.round((count * 1000) / total) / 10;
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * abs);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-abs * abs);
  return sign * y;
}

function normCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Deux proportions, bilatéral, z = (p2 − p1) / se poolé. */
export function twoProportionTest(x1, n1, x2, n2) {
  if (!(n1 > 0) || !(n2 > 0)) return { z: null, p: null };
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (!se) return { z: 0, p: 1 };
  const z = (p2 - p1) / se;
  const p = Math.min(1, 2 * (1 - normCdf(Math.abs(z))));
  return { z, p };
}

function emptyMix() {
  return { n: 0, marche: 0, produit: 0, prix: 0 };
}

function packMix(counts) {
  const n = counts.n;
  return {
    n,
    marche: counts.marche,
    produit: counts.produit,
    prix: counts.prix,
    marche_pct: roundPct1(counts.marche, n),
    produit_pct: roundPct1(counts.produit, n),
    prix_pct: roundPct1(counts.prix, n),
  };
}

function reasonsTable(records, labelOf, nTotal) {
  const counts = new Map();
  for (const record of records) {
    const label = labelOf(record) || '(non renseigné)';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], 'fr');
  });
  const top = sorted.slice(0, TOP_N);
  return {
    items: top.map(([label, count]) => ({
      label,
      count,
      pct: roundPct1(count, nTotal),
    })),
    n_displayed: top.length,
    n_total: nTotal,
    truncated: sorted.length > TOP_N,
  };
}

function fyOfWindow(window) {
  return Object.keys(window || {}).sort();
}

export function computeMarket(window, { fy, compare } = {}) {
  const share = [];
  const mixByFy = {};

  for (const fy of fyOfWindow(window)) {
    const closed = window[fy]?.closed || [];
    const won = window[fy]?.won || [];
    const lostNew = closed.filter((record) => isNew(record) && !isWon(record));
    const wonNew = won.filter(isNew);

    let n_marche = 0;
    const mix = {
      global: emptyMix(),
      catalogue: emptyMix(),
      sur_mesure: emptyMix(),
      conseil: emptyMix(),
      autre: emptyMix(),
    };

    for (const record of lostNew) {
      const bucket = lossBucket(lossLabel(record));
      const product = productKey(record);
      mix.global.n += 1;
      if (mix[product]) mix[product].n += 1;
      if (bucket === 'marche') {
        n_marche += 1;
        mix.global.marche += 1;
        if (mix[product]) mix[product].marche += 1;
      } else if (bucket === 'produit') {
        mix.global.produit += 1;
        if (mix[product]) mix[product].produit += 1;
      } else if (bucket === 'prix') {
        mix.global.prix += 1;
        if (mix[product]) mix[product].prix += 1;
      }
    }

    const n_lost = lostNew.length;
    share.push({
      fy,
      n_marche,
      n_lost,
      share: n_lost ? n_marche / n_lost : 0,
      pct: roundPct1(n_marche, n_lost),
    });
    mixByFy[fy] = {
      global: packMix(mix.global),
      catalogue: packMix(mix.catalogue),
      sur_mesure: packMix(mix.sur_mesure),
      conseil: packMix(mix.conseil),
    };

    mixByFy[fy]._lostNew = lostNew;
    mixByFy[fy]._wonNew = wonNew;
  }

  const currentFy =
    (fy && share.some((row) => row.fy === fy) && fy) ||
    share.at(-1)?.fy;
  const current = mixByFy[currentFy] || {
    global: packMix(emptyMix()),
    catalogue: packMix(emptyMix()),
    sur_mesure: packMix(emptyMix()),
    conseil: packMix(emptyMix()),
    _lostNew: [],
    _wonNew: [],
  };

  const fy25 = share.find((row) => row.fy === 'FY25');
  const fy26 = share.find((row) => row.fy === 'FY26');
  const isTargetPair =
    (!fy || fy === 'FY26') && (!compare || compare === 'FY25');
  const test =
    isTargetPair && fy25 && fy26
      ? {
          ...twoProportionTest(
            fy25.n_marche,
            fy25.n_lost,
            fy26.n_marche,
            fy26.n_lost,
          ),
          fy_from: 'FY25',
          fy_to: 'FY26',
          x1: fy25.n_marche,
          n1: fy25.n_lost,
          x2: fy26.n_marche,
          n2: fy26.n_lost,
        }
      : { z: null, p: null, fy_from: null, fy_to: null };
  const lostNew = current._lostNew || [];
  const wonNew = current._wonNew || [];
  const catWon = wonNew.filter((record) => productKey(record) === 'catalogue');
  const smWon = wonNew.filter((record) => productKey(record) === 'sur_mesure');
  const conseilWon = wonNew.filter((record) => productKey(record) === 'conseil');

  const catLost = lostNew.filter((record) => productKey(record) === 'catalogue');
  const smLost = lostNew.filter((record) => productKey(record) === 'sur_mesure');
  const conseilLost = lostNew.filter((record) => productKey(record) === 'conseil');

  const mix = {
    global: current.global,
    catalogue: current.catalogue,
    sur_mesure: current.sur_mesure,
    conseil: current.conseil,
  };
  return {
    conclusion: CONCLUSION_MARCHE,
    share,
    mix,
    test,
    loss_reasons: reasonsTable(lostNew, lossLabel, lostNew.length),
    win_reasons: reasonsTable(wonNew, winLabel, wonNew.length),
    win_by_offer: {
      catalogue: reasonsTable(catWon, winLabel, catWon.length),
      sur_mesure: reasonsTable(smWon, winLabel, smWon.length),
      conseil: reasonsTable(conseilWon, winLabel, conseilWon.length),
    },
    loss_by_offer: {
      catalogue: reasonsTable(catLost, lossLabel, catLost.length),
      sur_mesure: reasonsTable(smLost, lossLabel, smLost.length),
      conseil: reasonsTable(conseilLost, lossLabel, conseilLost.length),
    },
  };
}
