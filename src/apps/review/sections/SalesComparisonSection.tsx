import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { fmtEur, fmtNum, fmtPct1 } from '../review.helpers';
import { seriesLabel } from '../review.period';
import type { CommercialPayload, CommercialPerson } from '../review.types';

const DETECTION_STANDARD = 0.5;
const CLOSING_STANDARD = 0.35;

function personNamed(
  sales: CommercialPerson[],
  needle: string,
): CommercialPerson | undefined {
  return sales.find((row) => row.name.toLowerCase().includes(needle));
}

function PersonCell({
  person,
  field,
}: {
  person: CommercialPerson | undefined;
  field: keyof CommercialPerson;
}) {
  if (!person) return <td>—</td>;
  const value = person[field];
  if (value === null || value === undefined) return <td>n/a</td>;
  if (field === 'amountNew' || field === 'ticket') {
    return <td>{fmtEur(Number(value))}</td>;
  }
  if (field === 'rdvPerWeek') return <td>{fmtNum(Number(value), 2)}</td>;
  if (field === 'detectionRate' || field === 'closing') {
    return <td>{fmtPct1(Number(value))}</td>;
  }
  return <td>{String(value)}</td>;
}

export function SalesComparisonSection({
  data,
  loading,
}: {
  data: CommercialPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={120} />
        <Skeleton height={280} />
      </div>
    );
  }
  if (!data?.sales?.length) {
    return (
      <EmptyState
        title="Aucun commercial actif"
        description="Aucun vendeur (hors PDG, hors SDR) sur cet exercice."
      />
    );
  }

  const paul = personNamed(data.sales, 'paul');
  const christophe = personNamed(data.sales, 'christophe');

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Paul / Christophe
          </h3>
          <ScopeTag scope="new" />
          <p className="review-section-kicker">
            CA nouvelles affaires · {seriesLabel(data.fy, data.period)} · classement
            sales hors PDG et hors SDR
          </p>
        </div>
      </header>

      <GlassCard className="review-chart-card">
        <table className="review-data-table">
          <thead>
            <tr>
              <th>Indicateur</th>
              <th>{paul?.name || 'Paul'}</th>
              <th>{christophe?.name || 'Christophe'}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>RDV / sem.</td>
              <PersonCell person={paul} field="rdvPerWeek" />
              <PersonCell person={christophe} field="rdvPerWeek" />
            </tr>
            <tr>
              <td>Détection</td>
              <PersonCell person={paul} field="detectionRate" />
              <PersonCell person={christophe} field="detectionRate" />
            </tr>
            <tr>
              <td>Fermées nouvelles affaires</td>
              <PersonCell person={paul} field="closedNew" />
              <PersonCell person={christophe} field="closedNew" />
            </tr>
            <tr>
              <td>Signatures nouvelles affaires</td>
              <PersonCell person={paul} field="signaturesNew" />
              <PersonCell person={christophe} field="signaturesNew" />
            </tr>
            <tr>
              <td>Closing nouvelles affaires</td>
              <PersonCell person={paul} field="closing" />
              <PersonCell person={christophe} field="closing" />
            </tr>
            <tr>
              <td>Ticket nouvelles affaires</td>
              <PersonCell person={paul} field="ticket" />
              <PersonCell person={christophe} field="ticket" />
            </tr>
            <tr>
              <td>CA nouvelles affaires</td>
              <PersonCell person={paul} field="amountNew" />
              <PersonCell person={christophe} field="amountNew" />
            </tr>
          </tbody>
        </table>
        <p className="review-section-note">
          Standards de lecture : détection {fmtPct1(DETECTION_STANDARD)} ·
          closing {fmtPct1(CLOSING_STANDARD)}. {data.attribution_limit}
        </p>
      </GlassCard>

    </div>
  );
}
