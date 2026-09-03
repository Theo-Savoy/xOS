/** Format monétaire du deck : 1,068 M€ / 118,6 k€ (séparateur décimal FR). */
export function fmtEur(n: number): string {
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString('fr-FR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    })} M€`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} k€`;
  }
  return `${sign}${abs.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;
}
