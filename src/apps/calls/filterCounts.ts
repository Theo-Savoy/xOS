import type { FilterTree } from '../../crm';

export function countEntrepriseFilters(
  entreprise: FilterTree['entreprise'],
): number {
  let count = 0;
  if (entreprise.secteurs.length) count += 1;
  if (entreprise.effectifs.length) count += 1;
  if (entreprise.type_client.length) count += 1;
  if (entreprise.tiers.length) count += 1;
  if (entreprise.opp_ouverte !== null) count += 1;
  if (entreprise.opp_perdue !== null) count += 1;
  if (entreprise.compte_principal) count += 1;
  if (entreprise.proprietaires.length) count += 1;
  if (entreprise.comptes_cibles?.length) count += 1;
  return count;
}

export function countContactFilters(contact: FilterTree['contact']): number {
  let count = 0;
  // Defaults (téléphone + exclure NPA) don't count as "active" filters.
  if (!contact.a_telephone) count += 1;
  if (contact.fonctions.length) count += 1;
  if (contact.contacts_cibles?.length) count += 1;
  if (!contact.exclure_npa) count += 1;
  return count;
}

export function countRelanceFilters(relance: FilterTree['relance']): number {
  let count = 0;
  if (relance.jamais_appele !== null) count += 1;
  if (relance.dernier_appel_avant_jours !== null) count += 1;
  if (relance.dernier_appel_dans_jours !== null) count += 1;
  if (relance.dernier_resultat.length) count += 1;
  if (relance.exclure_si_plus_de) count += 1;
  return count;
}
