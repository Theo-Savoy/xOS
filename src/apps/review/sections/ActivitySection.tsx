import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { fmtEur, fmtNum, fmtPct1 } from '../review.helpers';
import { seriesLabel } from '../review.period';
import type { CommercialPayload, CommercialPerson } from '../review.types';

function roleLabel(mode: string): string {
  if (mode === 'dg') return 'PDG';
  if (mode === 'sdr') return 'SDR';
  return 'commercial';
}

function closingCell(person: CommercialPerson): string {
  if (person.mode === 'sdr' || person.closing === null) return 'n/a';
  return fmtPct1(person.closing);
}

export function ActivitySection({
  data,
  loading,
}: {
  data: CommercialPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={200} />
      </div>
    );
  }
  if (!data?.activity?.length) {
    return (
      <EmptyState
        title="Activité nominative indisponible"
        description="Aucune donnée d'activité individuelle sur cet exercice."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Par personne
          </h3>
          <ScopeTag scope="new" />
          <p className="review-section-kicker">
            CA nouvelles affaires · {seriesLabel(data.fy, data.period)} · les totaux
            entreprise ne se somment pas avec les lignes
          </p>
        </div>
      </header>

      <GlassCard className="review-chart-card">
        <table className="review-data-table review-data-table--wide">
          <thead>
            <tr>
              <th>Personne</th>
              <th>Rôle</th>
              <th>RDV</th>
              <th>Sem.</th>
              <th>RDV/sem</th>
              <th>Détections</th>
              <th>Taux dét.</th>
              <th>Fermées nouvelles affaires</th>
              <th>Signatures nouvelles affaires</th>
              <th>Closing</th>
              <th>CA nouvelles affaires</th>
            </tr>
          </thead>
          <tbody>
            {data.activity.map((person) => (
              <tr key={person.ownerId}>
                <td>{person.name}</td>
                <td>{roleLabel(person.mode)}</td>
                <td>{person.rdv}</td>
                <td>{person.weeks}</td>
                <td>{fmtNum(person.rdvPerWeek, 2)}</td>
                <td>{person.detections}</td>
                <td>{fmtPct1(person.detectionRate)}</td>
                <td>{person.closedNew}</td>
                <td>{person.signaturesNew}</td>
                <td>{closingCell(person)}</td>
                <td>{fmtEur(person.amountNew)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="review-section-note">{data.rdv_limit}</p>
        <p className="review-section-note">
          On ne peut pas mesurer combien de ventes viennent du SDR.
        </p>
      </GlassCard>
    </div>
  );
}
