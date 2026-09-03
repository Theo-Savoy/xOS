import { GlassCard } from '../../../components/ui';
import type { DiagnosisFactor } from '../review.types';

export function FactorMatrix({ factors }: { factors: DiagnosisFactor[] }) {
  return (
    <GlassCard className="review-chart-card">
      <table className="review-data-table review-factor-matrix">
        <thead>
          <tr>
            <th>Facteur</th>
            <th>Impact</th>
            <th>Fiabilité mesure</th>
            <th>Fiabilité attribution</th>
            <th>Ce qui manque</th>
          </tr>
        </thead>
        <tbody>
          {factors.map((row) => (
            <tr key={row.id}>
              <td>{row.facteur}</td>
              <td>{row.impact}</td>
              <td>{row.fiabilite_mesure}</td>
              <td>{row.fiabilite_attribution}</td>
              <td>{row.manque}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
