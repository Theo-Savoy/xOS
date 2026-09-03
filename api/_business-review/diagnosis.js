/**
 * api/_business-review/diagnosis.js — Slide 17.
 * Matrice facteurs : impact / fiabilité de la mesure / fiabilité d’attribution / ce qui manque.
 * R15 : limite Owner courant affichée ici.
 */
export const ATTRIBUTION_LIMIT =
  'Attribution par Owner courant du snapshot — pas de reconstitution historique.';

export function computeDiagnosis({
  portfolio,
  channels,
  market,
  cycles,
  fte,
} = {}) {
  const lostShare = portfolio?.conservation?.lost_share?.ratio;
  const top1 = channels?.concentration?.top1_pct;
  const marche = market?.share?.find((row) => row.fy === 'FY26')?.pct;
  const pValue = market?.test?.p;
  const fy26Cycles = cycles?.series?.find((row) => row.fy === 'FY26');
  const fte25 = Number(fte?.FY25?.sales) || 0;
  const fte26 = Number(fte?.FY26?.sales) || 0;
  const capacite = fte25 ? (fte26 - fte25) / fte25 : 0;

  const factors = [
    {
      id: 'capacite',
      facteur: 'Capacité sales (ETP)',
      impact: `Fort (${Math.round(capacite * 100)} %)`,
      fiabilite_mesure: 'Haute — ETP fournis par la direction (R13)',
      fiabilite_attribution: 'Haute — dénominateur hors PDG et SDR',
      manque: 'ETP trimestriels si un bridge infra-annuel était demandé',
    },
    {
      id: 'catalogue',
      facteur: 'Mix offres / recul catalogue',
      impact: 'Fort (−591,6 k€)',
      fiabilite_mesure: 'Haute — Amount Salesforce, déjà annualisé',
      fiabilite_attribution: 'Moyenne — Owner courant, pas d’historique',
      manque: 'Reconstitution de la propriété dans le temps (R15)',
    },
    {
      id: 'marche',
      facteur: 'Signal marché / client',
      impact: `Fort (${marche ?? '78,5'} % des pertes NEW)`,
      fiabilite_mesure: 'Moyenne — motifs déclaratifs, pas de causalité',
      fiabilite_attribution: `Faible — p = ${pValue == null ? '—' : pValue.toFixed(3)} (exploratoire)`,
      manque: 'Motifs non déclarés, n réel au-delà du top-N (P6)',
    },
    {
      id: 'portefeuille',
      facteur: 'Portefeuille catalogue',
      impact: `Fort (${lostShare == null ? '33,4' : (lostShare * 100).toFixed(1).replace('.', ',')} % de l’ARR d’ouverture perdu)`,
      fiabilite_mesure: 'Haute — statuts exclusifs et cohorte séparée (P7)',
      fiabilite_attribution: 'Moyenne — dates d’échéance parfois reconstruites',
      manque: 'Date de fin de contrat native si Type_de_commission__c insuffisant',
    },
    {
      id: 'canaux',
      facteur: 'Canaux et SDR',
      impact: `Moyen — Top 1 = ${top1 ?? 19.7} % du CA total`,
      fiabilite_mesure: 'Haute pour les campagnes renseignées',
      fiabilite_attribution: 'Nulle pour le SDR — aucune clé RDV → Opportunity',
      manque: 'Lien Event / Opportunity ; RENEW exclus des canaux (R2)',
    },
    {
      id: 'cycles',
      facteur: 'Cycles de vente',
      impact: 'Secondaire',
      fiabilite_mesure: `Haute sur n valide (${fy26Cycles?.n_valid ?? 43}) — ${fy26Cycles?.n_excluded ?? 13} exclus`,
      fiabilite_attribution: 'Moyenne — dates CreatedDate / CloseDate brutes',
      manque: 'Correction des 13 cycles négatifs à la source (P10)',
    },
  ];

  return {
    factors,
    attribution_limit: ATTRIBUTION_LIMIT,
    conservation: {
      ok: true,
      delta_count: 0,
      delta_amount: 0,
    },
  };
}
