import { Button, EmptyState, GlassCard, Skeleton } from '../../../components/ui';

export type SharedAnalysis = {
  id: string;
  created_by: string;
  recipient_id: string | null;
  config: {
    granularity: string;
    period: string;
    owner?: string;
    sections?: string[];
  };
  note: string | null;
  created_at: string;
};

export function SharedSection({
  shared,
  loading,
  error,
  isManager,
  onShare,
  onRevoke,
}: {
  shared: SharedAnalysis[];
  loading: boolean;
  error: string | null;
  isManager: boolean;
  onShare: () => void;
  onRevoke: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="review-section">
        <Skeleton height={200} />
      </div>
    );
  }
  if (error) return <div className="review-error">{error}</div>;

  return (
    <div className="review-page">
      <header className="review-page-heading">
        <div>
          <h1>Partages</h1>
          <p>Conserver un instant de lecture sans dupliquer les données métier.</p>
        </div>
        {isManager ? (
          <Button size="sm" onClick={onShare}>
            Partager la période
          </Button>
        ) : null}
      </header>
      <GlassCard className="review-chart-card">
        {shared.length === 0 ? (
          <EmptyState
            title="Aucun partage"
            description="Les analyses partagées par le manager apparaîtront ici."
          />
        ) : (
          <div className="review-shared-list">
            {shared.map((analysis) => (
              <div key={analysis.id} className="review-shared-item">
                <div>
                  <span className="review-shared-period">
                    {analysis.config.period}
                  </span>
                  {analysis.note ? (
                    <span className="review-shared-note">{analysis.note}</span>
                  ) : null}
                </div>
                <div className="review-shared-actions">
                  <span className="review-shared-date">
                    {new Date(analysis.created_at).toLocaleDateString('fr-FR')}
                  </span>
                  {isManager ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(analysis.id)}
                    >
                      Révoquer
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
