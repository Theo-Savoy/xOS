import { useMemo, useState } from 'react';
import {
  Button,
  EmptyState,
  GlassCard,
  Skeleton,
} from '../../../components/ui';
import { InfoHint } from '../components/InfoHint';

export type SharedAnalysis = {
  id: string;
  created_by: string;
  created_by_label?: string;
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
  currentUserId,
  team = [],
  onShare,
  onRevoke,
}: {
  shared: SharedAnalysis[];
  loading: boolean;
  error: string | null;
  isManager: boolean;
  currentUserId: string | null;
  team?: { user_id: string; label: string }[];
  onShare: (recipientId: string | null, note: string) => void;
  onRevoke: (id: string) => void;
}) {
  const [isSharing, setIsSharing] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const shareableTeam = useMemo(
    () =>
      team.filter(
        (member) =>
          member.user_id &&
          member.user_id !== currentUserId &&
          !String(member.user_id).startsWith('map:'),
      ),
    [team, currentUserId],
  );

  const handleSubmitShare = (e: React.FormEvent) => {
    e.preventDefault();
    onShare(selectedRecipient || null, noteInput);
    setIsSharing(false);
    setSelectedRecipient('');
    setNoteInput('');
  };

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
          <h1>
            Partages{' '}
            <InfoHint
              label="Comment lire la page Partages"
              text="Conserver un instant de lecture sans dupliquer les données métier."
            />
          </h1>
        </div>
        {isManager && !isSharing ? (
          <Button size="sm" onClick={() => setIsSharing(true)}>
            Partager l'analyse
          </Button>
        ) : null}
      </header>
      
      {isSharing ? (
        <form className="review-share-banner" onSubmit={handleSubmitShare}>
          <div className="review-share-banner-fields">
            <select
              className="xos-input"
              value={selectedRecipient}
              onChange={(e) => setSelectedRecipient(e.target.value)}
              required
            >
              <option value="" disabled>
                Sélectionner un destinataire...
              </option>
              {shareableTeam.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              className="xos-input"
              placeholder="Note optionnelle"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
            />
          </div>
          <div className="review-share-banner-actions">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsSharing(false);
                setSelectedRecipient('');
                setNoteInput('');
              }}
            >
              Annuler
            </Button>
            <Button type="submit" size="sm">
              Envoyer
            </Button>
          </div>
        </form>
      ) : null}

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
                    {analysis.created_by_label
                      ? `${analysis.created_by_label} · `
                      : ''}
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
