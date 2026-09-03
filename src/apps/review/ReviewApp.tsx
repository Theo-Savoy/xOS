/**
 * Bilan — Business Review FY26 adaptée au web.
 * Six pages d’analyse, sans transposition slide par slide ni annexes séparées.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Skeleton } from '../../components/ui';
import { apiFetch } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { PeriodSelector } from './components/PeriodSelector';
import {
  CommercialPage,
  DiagnosticPage,
  MarketPage,
  ProductPage,
  SummaryPage,
  TrajectoryPage,
} from './pages/ReviewPages';
import type { PeriodSelection } from './review.period';
import type {
  BridgePayload,
  ChannelsPayload,
  CommercialPayload,
  CyclesPayload,
  DefinitionsPayload,
  DiagnosisPayload,
  MarketPayload,
  OverviewPayload,
  PortfolioPayload,
  ProductPayload,
  QualityPayload,
  SynthesisPayload,
} from './review.types';
import { SharedSection, type SharedAnalysis } from './sections/SharedSection';
import { useBusinessReview } from './useBusinessReview';
import './review.css';

type NavId =
  | 'summary'
  | 'trajectory'
  | 'commercial'
  | 'product'
  | 'market'
  | 'diagnostic'
  | 'shared';

const ANALYSIS_PAGES: {
  id: Exclude<NavId, 'shared'>;
  label: string;
}[] = [
  { id: 'summary', label: 'Synthèse' },
  { id: 'trajectory', label: 'Trajectoire' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'product', label: 'Produit' },
  { id: 'market', label: 'Marché' },
  { id: 'diagnostic', label: 'Diagnostic' },
];

export default function ReviewApp({
  params,
}: {
  params?: Record<string, string>;
} = {}) {
  const [token, setToken] = useState<string | null>(null);
  const [nav, setNav] = useState<NavId>(params?.shared ? 'shared' : 'summary');
  const [period, setPeriod] = useState<PeriodSelection>({
    mode: 'fy',
    fy: 'FY26',
    semester: 'S1',
  });
  const [isManager, setIsManager] = useState(false);
  const [roleKnown, setRoleKnown] = useState(false);
  const [shared, setShared] = useState<SharedAnalysis[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!token) return;
    apiFetch<{ role: string; sf_user_id: string | null }>(token, '/api/profile')
      .then((profile) => {
        setIsManager(profile.role === 'manager' || profile.role === 'admin');
        setRoleKnown(true);
      })
      .catch(() => setRoleKnown(true));
  }, [token]);

  const canFetch = roleKnown && isManager;
  const semester = period.mode === 'semester';
  const referenceFy = !semester && period.fy === 'FY26';
  const overview = useBusinessReview<OverviewPayload>(
    token,
    canFetch && nav === 'trajectory' ? 'overview' : null,
    period,
  );
  const bridge = useBusinessReview<BridgePayload>(
    token,
    canFetch && (nav === 'summary' || nav === 'product') ? 'bridge' : null,
    period,
  );
  const commercial = useBusinessReview<CommercialPayload>(
    token,
    canFetch && nav === 'commercial' ? 'commercial' : null,
    period,
  );
  const product = useBusinessReview<ProductPayload>(
    token,
    canFetch && nav === 'product' ? 'product' : null,
    period,
  );
  const cycles = useBusinessReview<CyclesPayload>(
    token,
    canFetch && nav === 'product' ? 'cycles' : null,
    period,
  );
  const market = useBusinessReview<MarketPayload>(
    token,
    canFetch && nav === 'market' ? 'market' : null,
    period,
  );
  const channels = useBusinessReview<ChannelsPayload>(
    token,
    canFetch && nav === 'market' ? 'channels' : null,
    period,
  );
  const quality = useBusinessReview<QualityPayload>(
    token,
    canFetch && nav === 'diagnostic' ? 'quality' : null,
    period,
  );
  const definitions = useBusinessReview<DefinitionsPayload>(
    token,
    canFetch && nav === 'diagnostic' ? 'definitions' : null,
    period,
  );
  const synthesis = useBusinessReview<SynthesisPayload>(
    token,
    canFetch && nav === 'summary' ? 'synthesis' : null,
    period,
  );
  const portfolio = useBusinessReview<PortfolioPayload>(
    token,
    canFetch && nav === 'trajectory' && referenceFy ? 'portfolio' : null,
    period,
  );
  const diagnosis = useBusinessReview<DiagnosisPayload>(
    token,
    canFetch && nav === 'diagnostic' && referenceFy ? 'diagnosis' : null,
    period,
  );

  const fetchShared = useCallback(async () => {
    if (!token) return;
    setSharedLoading(true);
    setSharedError(null);
    try {
      const response = await apiFetch<{ analyses: SharedAnalysis[] }>(
        token,
        '/api/review?resource=shared',
      );
      setShared(response.analyses || []);
    } catch (error) {
      setSharedError(
        error instanceof Error ? error.message : 'Erreur de chargement',
      );
    } finally {
      setSharedLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (nav === 'shared' && token) fetchShared();
  }, [nav, token, fetchShared]);

  const handleShare = useCallback(async () => {
    if (!token) return;
    const periodKey =
      period.mode === 'semester'
        ? `${period.fy}-${period.semester}`
        : period.fy;
    try {
      await apiFetch(token, '/api/review?resource=shared', {
        method: 'POST',
        body: JSON.stringify({
          config: { granularity: period.mode, period: periodKey },
          note: `Analyse ${periodKey}`,
        }),
      });
      fetchShared();
    } catch {
      // Conserver la liste valide si la création échoue.
    }
  }, [token, period, fetchShared]);

  const handleRevoke = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        await apiFetch(token, `/api/review?resource=shared&id=${id}`, {
          method: 'DELETE',
        });
        fetchShared();
      } catch {
        // Conserver la liste valide si la révocation échoue.
      }
    },
    [token, fetchShared],
  );

  const resources = [
    overview,
    bridge,
    commercial,
    product,
    cycles,
    market,
    channels,
    quality,
    definitions,
    synthesis,
    portfolio,
    diagnosis,
  ];
  const fetchedAt = resources.find((resource) => resource.fetchedAt)?.fetchedAt;
  const liveAt = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const sectionError = resources.find((resource) => resource.error)?.error;
  const refreshing = resources.some((resource) => resource.loading);

  const handleRefresh = () => {
    resources.forEach((resource) => resource.refresh());
    if (nav === 'shared') fetchShared();
  };

  if (!roleKnown) {
    return (
      <div className="review-app">
        <div className="review-skeleton">
          <Skeleton height={120} />
          <Skeleton height={200} />
        </div>
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="review-app">
        <EmptyState
          title="Bilan réservé aux managers"
          description="Cette revue d'exercice n'est pas ouverte aux commerciaux. Demandez une analyse partagée à votre manager."
        />
      </div>
    );
  }

  return (
    <div className="review-app review-app--shell">
      <header className="review-header">
        <div className="review-header-left">
          <div>
            <h2 className="review-title">Bilan</h2>
            <span className="review-subtitle">
              Business Review · FY juillet → juin
            </span>
          </div>
          <span className="review-live">
            Données live{liveAt ? ` · ${liveAt}` : ''}
          </span>
        </div>
        <div className="review-header-right">
          <PeriodSelector value={period} onChange={setPeriod} />
          <Button
            variant="icon"
            size="sm"
            aria-label="Rafraîchir les données"
            title="Rafraîchir les données"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="review-refresh-icon"
            >
              <path d="M15.6 6.1A6.5 6.5 0 1 0 16.5 12" />
              <path d="M15.6 2.8v3.7h-3.7" />
            </svg>
          </Button>
        </div>
      </header>

      <div className="review-body">
        <nav className="review-sidebar" aria-label="Pages du bilan">
          <span className="review-nav-family-label">Analyse</span>
          {ANALYSIS_PAGES.map((page) => (
            <Button
              key={page.id}
              type="button"
              variant="ghost"
              size="sm"
              className={`review-nav-item ${nav === page.id ? 'review-nav-item--active' : ''}`}
              aria-current={nav === page.id ? 'page' : undefined}
              onClick={() => setNav(page.id)}
            >
              {page.label}
            </Button>
          ))}
          <div className="review-nav-tools">
            <span className="review-nav-family-label">Outils</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`review-nav-item ${nav === 'shared' ? 'review-nav-item--active' : ''}`}
              aria-current={nav === 'shared' ? 'page' : undefined}
              onClick={() => setNav('shared')}
            >
              Partages
            </Button>
          </div>
        </nav>

        <div className="review-main">
          {sectionError ? (
            <div className="review-error">{sectionError}</div>
          ) : null}
          <main className="review-content">
            {nav === 'summary' ? (
              <SummaryPage
                period={period}
                synthesis={synthesis}
                bridge={bridge}
              />
            ) : null}
            {nav === 'trajectory' ? (
              <TrajectoryPage
                period={period}
                overview={overview}
                portfolio={portfolio}
              />
            ) : null}
            {nav === 'commercial' ? (
              <CommercialPage period={period} commercial={commercial} />
            ) : null}
            {nav === 'product' ? (
              <ProductPage
                period={period}
                product={product}
                bridge={bridge}
                cycles={cycles}
              />
            ) : null}
            {nav === 'market' ? (
              <MarketPage period={period} market={market} channels={channels} />
            ) : null}
            {nav === 'diagnostic' ? (
              <DiagnosticPage
                period={period}
                diagnosis={diagnosis}
                quality={quality}
                definitions={definitions}
              />
            ) : null}
            {nav === 'shared' ? (
              <SharedSection
                shared={shared}
                loading={sharedLoading}
                error={sharedError}
                isManager={isManager}
                onShare={handleShare}
                onRevoke={handleRevoke}
              />
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
