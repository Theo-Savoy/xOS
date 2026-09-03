import { EmptyState, GlassCard } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { MARKET_STUDIES } from '../marketStudies';

export function MarketStudiesSection() {
  if (!MARKET_STUDIES.length) {
    return (
      <EmptyState
        title="Aucune étude"
        description="Les constantes externes n'ont pas été chargées."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Le marché formation confirme le frein budgétaire{' '}
            <ScopeTag scope="new" />
          </h3>
          <p className="review-section-kicker">
            Études externes · constantes, hors Salesforce · mise en regard du
            signal CRM
          </p>
        </div>
      </header>

      <div className="review-studies-grid">
        {MARKET_STUDIES.map((study) => (
          <GlassCard key={study.id} className="review-chart-card">
            <h3 className="review-card-title">{study.source}</h3>
            <p className="review-section-kicker">{study.sample}</p>
            <ul className="review-study-points">
              {study.points.map((point) => (
                <li key={point.label} className="review-study-point">
                  <span className="review-study-pct">
                    {point.pct.toLocaleString('fr-FR')} %
                  </span>
                  <span>{point.label}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        ))}
      </div>

      <p className="review-section-note">
        Ces chiffres ne viennent pas du CRM : ils cadrent la lecture des motifs
        « marché / client » sans les prouver. Motifs déclarés, pas de causalité.
      </p>
    </div>
  );
}
