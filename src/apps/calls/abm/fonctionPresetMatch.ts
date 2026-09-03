import type { FonctionPresetId } from '../../../crm';

type FonctionPattern = {
  likes: readonly string[];
  exacts: readonly string[];
};

const FONCTION_PATTERNS: Record<FonctionPresetId, FonctionPattern> = {
  responsable_formation: {
    likes: ['%responsable%formation%'],
    exacts: ['RF'],
  },
  directeur_formation: {
    likes: ['%direct%formation%', '%training director%', '%head of learning%'],
    exacts: ['DF'],
  },
  digital_learning_manager: {
    likes: ['%digital learning%', '%e-learning%', '%elearning%'],
    exacts: ['DLM'],
  },
  charge_formation: {
    likes: [
      '%charg%formation%',
      '%chef de projet formation%',
      '%training manager%',
      '%learning manager%',
      '%training officer%',
      '%training coordinator%',
      '%gestionnaire%formation%',
      '%training project manager%',
      '%training specialist%',
      '%learning project manager%',
      '%coordinat%formation%',
      '%assistant%formation%',
    ],
    exacts: ['CF', 'CP'],
  },
  responsable_rh: {
    likes: [
      '%responsable rh%',
      '%responsable ressources humaines%',
      '%responsable des ressources humaines%',
      '%responsable%service%ressources humaines%',
      '%hr manager%',
      '%human resources manager%',
      '%head of hr%',
      '%hr business partner%',
      '%human resources business partner%',
    ],
    exacts: ['RRH', 'HRBP', 'Cadre RH'],
  },
  developpement_rh: {
    likes: [
      '%développement rh%',
      '%developpement rh%',
      '%développement des ressources humaines%',
      '%developpement des ressources humaines%',
      '%développement des compétences%',
      '%developpement des competences%',
      '%développement humain%',
      '%hr development%',
      '%learning and development%',
      '%learning & development%',
    ],
    exacts: ['Développement RH'],
  },
  directeur_rh: {
    likes: [
      '%drh%',
      '%directeur rh%',
      '%directrice rh%',
      '%directeur des ressources humaines%',
      '%directrice des ressources humaines%',
      '%direction des ressources humaines%',
      '%hr director%',
      '%human resources director%',
      '%chief human resources officer%',
      '%chief people officer%',
    ],
    exacts: ['CHRO'],
  },
  pedagogie: {
    likes: ['%pédagogique%', '%pedagogique%'],
    exacts: [],
  },
  sirh: {
    likes: ['%sirh%'],
    exacts: [],
  },
  recrutement: {
    likes: ['%recrutement%', '%recruitment%'],
    exacts: [],
  },
  direction_generale: {
    likes: [
      '%directeur général%',
      '%directeur general%',
      '%pdg%',
      '%dirigeant%',
    ],
    exacts: [
      'CEO',
      'DG',
      'Président',
      'Présidente',
      'Gérant',
      'Gérante',
      'Chief Executive Officer',
    ],
  },
};

function likeToRegExp(like: string): RegExp {
  const escaped = like.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/%/g, '.*')}$`, 'i');
}

function matchesPattern(title: string, pattern: FonctionPattern): boolean {
  const normalized = title.toLowerCase();
  if (pattern.exacts.some((exact) => exact.toLowerCase() === normalized)) {
    return true;
  }
  return pattern.likes.some((like) => likeToRegExp(like).test(title));
}

export function contactMatchesFonctionPresets(
  title: string | null | undefined,
  presetIds: readonly string[],
): boolean {
  if (presetIds.length === 0) return true;
  const value = title?.trim() ?? '';
  if (!value) return false;
  return presetIds.some((id) => {
    const pattern = FONCTION_PATTERNS[id as FonctionPresetId];
    return pattern ? matchesPattern(value, pattern) : false;
  });
}
