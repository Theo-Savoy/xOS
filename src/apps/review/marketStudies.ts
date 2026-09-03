/** Études externes slide 13 — constantes, aucune resource API (§2.12). */
export type StudyPoint = {
  label: string;
  pct: number;
};

export type MarketStudy = {
  id: 'istf' | 'synofdes' | 'dalloz';
  source: string;
  sample: string;
  points: StudyPoint[];
};

export const MARKET_STUDIES: MarketStudy[] = [
  {
    id: 'istf',
    source: 'ISTF 2026',
    sample: '≈500 réponses',
    points: [
      { label: 'Projets internalisés', pct: 75 },
      { label: 'Citent un frein financier', pct: 24 },
      { label: "Utilisent déjà l'IA", pct: 33 },
      { label: 'Mobilisent des experts internes', pct: 38 },
    ],
  },
  {
    id: 'synofdes',
    source: 'Synofdes 2025–2026',
    sample: 'n=149',
    points: [
      { label: 'Ont réduit ou suspendu une activité', pct: 56 },
      { label: 'Sous leurs prévisions', pct: 54 },
      { label: 'Fortement touchés par les budgets', pct: 49 },
      { label: 'Ont réduit leur masse salariale', pct: 48 },
    ],
  },
  {
    id: 'dalloz',
    source: 'L. Dalloz 2025',
    sample: 'décideurs formation',
    points: [{ label: 'Financement cité par les décideurs', pct: 57 }],
  },
];
