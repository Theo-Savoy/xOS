/**
 * src/apps/review/ReviewApp.tsx — Bilan : Business Review FY26 interactif.
 * Shell à sidebar groupée par familles. Lot 6 : cockpit legacy retiré.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  EmptyState,
  GlassCard,
  Select,
  Skeleton,
} from '../../components/ui';
import { apiFetch } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { BridgeNewSection } from './sections/BridgeNewSection';
import { CapacitySection } from './sections/CapacitySection';
import { CatalogueBridgeSection } from './sections/CatalogueBridgeSection';
import { ConseilSection } from './sections/ConseilSection';
import { CycleSection } from './sections/CycleSection';
import { PerformanceSection } from './sections/PerformanceSection';
import { ProductCompareSection } from './sections/ProductCompareSection';
import { ProductivitySection } from './sections/ProductivitySection';
import { SalesComparisonSection } from './sections/SalesComparisonSection';
import { MarketSignalSection } from './sections/MarketSignalSection';
import { MarketStudiesSection } from './sections/MarketStudiesSection';
import { WinReasonsSection } from './sections/WinReasonsSection';
import { SynthesisSection } from './sections/SynthesisSection';
import { PortfolioSection } from './sections/PortfolioSection';
import { ChannelsSection } from './sections/ChannelsSection';
import { DiagnosisSection } from './sections/DiagnosisSection';
import { PatternsSection } from './sections/PatternsSection';
import { ActivityAnnex } from './sections/annexes/ActivityAnnex';
import { CampaignsAnnex } from './sections/annexes/CampaignsAnnex';
import { DefinitionsAnnex } from './sections/annexes/DefinitionsAnnex';
import { HistoryAnnex } from './sections/annexes/HistoryAnnex';
import { JeromeAnnex } from './sections/annexes/JeromeAnnex';
import { ProductFyAnnex } from './sections/annexes/ProductFyAnnex';
import { QualityAnnex } from './sections/annexes/QualityAnnex';
import { ReasonsAnnex } from './sections/annexes/ReasonsAnnex';
import { useBusinessReview } from './useBusinessReview';
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
import './review.css';

// ── Types ──────────────────────────────────────────────────────────────────

type SharedAnalysis = {
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

type NavId =
  | 'synthesis'
  | 'performance'
  | 'bridge-new'
  | 'sales-compare'
  | 'capacity'
  | 'productivity'
  | 'cycle'
  | 'product-compare'
  | 'catalogue-bridge'
  | 'conseil'
  | 'a1'
  | 'a2'
  | 'a3'
  | 'a4'
  | 'a5'
  | 'a6'
  | 'a7'
  | 'a8'
  | 'market'
  | 'market-studies'
  | 'win-reasons'
  | 'portfolio'
  | 'channels'
  | 'diagnosis'
  | 'patterns'
  | 'shared';

const FY_OPTIONS = [
  { value: 'FY22', label: 'FY22' },
  { value: 'FY23', label: 'FY23' },
  { value: 'FY24', label: 'FY24' },
  { value: 'FY25', label: 'FY25' },
  { value: 'FY26', label: 'FY26' },
];

const NAV_FAMILIES: {
  id: string;
  label: string;
  items: { id: NavId; label: string; soon?: boolean }[];
}[] = [
  {
    id: 'performance',
    label: 'Performance',
    items: [
      { id: 'synthesis', label: 'Synthèse' },
      { id: 'performance', label: 'NEW et RENEW' },
      { id: 'bridge-new', label: 'Bridge NEW' },
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial',
    items: [
      { id: 'sales-compare', label: 'Paul / Christophe' },
      { id: 'capacity', label: 'Capacité' },
      { id: 'productivity', label: 'Productivité' },
    ],
  },
  {
    id: 'product',
    label: 'Produit',
    items: [
      { id: 'cycle', label: 'Cycle' },
      { id: 'product-compare', label: 'Catalogue vs sur-mesure' },
      { id: 'catalogue-bridge', label: 'Recul catalogue' },
      { id: 'conseil', label: 'Conseil' },
    ],
  },
  {
    id: 'market',
    label: 'Marché',
    items: [
      { id: 'market', label: 'Signal' },
      { id: 'market-studies', label: 'Études' },
      { id: 'win-reasons', label: 'Motifs de gain' },
    ],
  },
  {
    id: 'diagnosis',
    label: 'Diagnostic',
    items: [
      { id: 'portfolio', label: 'Portefeuille' },
      { id: 'channels', label: 'Canaux' },
      { id: 'diagnosis', label: 'Diagnostic' },
      { id: 'patterns', label: 'Conclusion' },
    ],
  },
  {
    id: 'tools',
    label: 'Outils',
    items: [
      { id: 'shared', label: 'Partages' },
    ],
  },
];

const ANNEX_ITEMS: {
  id: NavId;
  label: string;
  ready?: boolean;
}[] = [
  { id: 'a1', label: 'A1 · Définitions', ready: true },
  { id: 'a2', label: 'A2 · Jérôme', ready: true },
  { id: 'a3', label: 'A3 · Activité', ready: true },
  { id: 'a4', label: 'A4 · Historique', ready: true },
  { id: 'a5', label: 'A5 · Produit × exercice', ready: true },
  { id: 'a6', label: 'A6 · Motifs', ready: true },
  { id: 'a7', label: 'A7 · Campagnes', ready: true },
  { id: 'a8', label: 'A8 · Qualité', ready: true },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function ReviewApp({
  params,
}: {
  params?: Record<string, string>;
} = {}) {
  const [token, setToken] = useState<string | null>(null);
  const [nav, setNav] = useState<NavId>(
    params?.shared ? 'shared' : 'synthesis',
  );
  const [period, setPeriod] = useState('FY26');
  const [compare, setCompare] = useState('FY25');
  const [annexesOpen, setAnnexesOpen] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [roleKnown, setRoleKnown] = useState(false);

  // Partage
  const [shared, setShared] = useState<SharedAnalysis[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load profile
  useEffect(() => {
    if (!token) return;
    apiFetch<{ role: string; sf_user_id: string | null }>(token, '/api/profile')
      .then((p) => {
        setIsManager(p.role === 'manager' || p.role === 'admin');
        setRoleKnown(true);
      })
      .catch(() => {
        setRoleKnown(true);
      });
  }, [token]);

  const canFetchBusiness = roleKnown && isManager;
  const overviewResource =
    canFetchBusiness && (nav === 'performance' || nav === 'a4')
      ? 'overview'
      : null;
  const bridgeResource =
    canFetchBusiness && (nav === 'bridge-new' || nav === 'catalogue-bridge')
      ? 'bridge'
      : null;
  const productResource =
    canFetchBusiness &&
    (nav === 'product-compare' || nav === 'conseil' || nav === 'a5')
      ? 'product'
      : null;
  const cyclesResource = canFetchBusiness && nav === 'cycle' ? 'cycles' : null;
  const commercialNav =
    nav === 'sales-compare' ||
    nav === 'capacity' ||
    nav === 'productivity' ||
    nav === 'a2' ||
    nav === 'a3';
  const commercialResource =
    canFetchBusiness && commercialNav ? 'commercial' : null;
  const marketNav =
    nav === 'market' || nav === 'win-reasons' || nav === 'a6';
  const marketResource = canFetchBusiness && marketNav ? 'market' : null;
  const overview = useBusinessReview<OverviewPayload>(token, overviewResource, {
    fy: period,
    compare,
  });
  const bridge = useBusinessReview<BridgePayload>(token, bridgeResource, {
    fy: period,
    compare,
  });
  const product = useBusinessReview<ProductPayload>(token, productResource, {
    fy: period,
    compare,
  });
  const cycles = useBusinessReview<CyclesPayload>(token, cyclesResource, {
    fy: period,
    compare,
  });
  const commercial = useBusinessReview<CommercialPayload>(
    token,
    commercialResource,
    { fy: period, compare },
  );
  const market = useBusinessReview<MarketPayload>(token, marketResource, {
    fy: period,
    compare,
  });
  const synthesisResource =
    canFetchBusiness && (nav === 'synthesis' || nav === 'patterns')
      ? 'synthesis'
      : null;
  const portfolioResource =
    canFetchBusiness && nav === 'portfolio' ? 'portfolio' : null;
  const channelsResource =
    canFetchBusiness && (nav === 'channels' || nav === 'a7')
      ? 'channels'
      : null;
  const diagnosisResource =
    canFetchBusiness && nav === 'diagnosis' ? 'diagnosis' : null;
  const qualityResource =
    canFetchBusiness && nav === 'a8' ? 'quality' : null;
  const definitionsResource =
    canFetchBusiness && nav === 'a1' ? 'definitions' : null;
  const synthesis = useBusinessReview<SynthesisPayload>(
    token,
    synthesisResource,
    { fy: period, compare },
  );
  const portfolio = useBusinessReview<PortfolioPayload>(
    token,
    portfolioResource,
    { fy: period, compare },
  );
  const channels = useBusinessReview<ChannelsPayload>(
    token,
    channelsResource,
    { fy: period, compare },
  );
  const diagnosis = useBusinessReview<DiagnosisPayload>(
    token,
    diagnosisResource,
    { fy: period, compare },
  );
  const quality = useBusinessReview<QualityPayload>(token, qualityResource, {
    fy: period,
    compare,
  });
  const definitions = useBusinessReview<DefinitionsPayload>(
    token,
    definitionsResource,
    { fy: period, compare },
  );

  // Chargement des partages
  const fetchShared = useCallback(async () => {
    if (!token) return;
    setSharedLoading(true);
    setSharedError(null);
    try {
      const res = await apiFetch<{ analyses: SharedAnalysis[] }>(
        token,
        '/api/review?resource=shared',
      );
      setShared(res.analyses || []);
    } catch (err) {
      setSharedError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setSharedLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (nav === 'shared' && token) fetchShared();
  }, [nav, token, fetchShared]);

  // Share handler
  const handleShare = useCallback(async () => {
    if (!token) return;
    try {
      await apiFetch(token, '/api/review?resource=shared', {
        method: 'POST',
        body: JSON.stringify({
          config: { granularity: 'year', period },
          note: `Analyse ${period}`,
        }),
      });
      fetchShared();
    } catch {
      /* ignore */
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
        /* ignore */
      }
    },
    [token, fetchShared],
  );

  const compareOptions = FY_OPTIONS.filter((opt) => opt.value < period);
  const fetchedAt =
    overview.fetchedAt ||
    bridge.fetchedAt ||
    product.fetchedAt ||
    cycles.fetchedAt ||
    commercial.fetchedAt ||
    market.fetchedAt ||
    synthesis.fetchedAt ||
    portfolio.fetchedAt ||
    channels.fetchedAt ||
    diagnosis.fetchedAt ||
    quality.fetchedAt ||
    definitions.fetchedAt;
  const liveAt = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const sectionError =
    overview.error ||
    bridge.error ||
    product.error ||
    cycles.error ||
    commercial.error ||
    market.error ||
    synthesis.error ||
    portfolio.error ||
    channels.error ||
    diagnosis.error ||
    quality.error ||
    definitions.error;
  const refreshing =
    overview.loading ||
    bridge.loading ||
    product.loading ||
    cycles.loading ||
    commercial.loading ||
    market.loading ||
    synthesis.loading ||
    portfolio.loading ||
    channels.loading ||
    diagnosis.loading ||
    quality.loading ||
    definitions.loading;

  const handlePeriod = (next: string) => {
    setPeriod(next);
    if (compare >= next) {
      const prev = FY_OPTIONS.filter((opt) => opt.value < next).at(-1);
      if (prev) setCompare(prev.value);
    }
  };

  const handleRefresh = () => {
    overview.refresh();
    bridge.refresh();
    product.refresh();
    cycles.refresh();
    commercial.refresh();
    market.refresh();
    synthesis.refresh();
    portfolio.refresh();
    channels.refresh();
    diagnosis.refresh();
    quality.refresh();
    definitions.refresh();
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

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="review-app review-app--shell">
      <header className="review-header">
        <div className="review-header-left">
          <h2 className="review-title">Bilan</h2>
          <span className="review-subtitle">Business Review FY26</span>
          {liveAt ? (
            <span className="review-live">Données live · {liveAt}</span>
          ) : (
            <span className="review-live">Données live</span>
          )}
        </div>
        <div className="review-header-right">
          <Select
            aria-label="Exercice"
            value={period}
            onChange={(v) => handlePeriod(v)}
            options={FY_OPTIONS}
          />
          <Select
            aria-label="Comparaison"
            value={compare}
            onChange={(v) => setCompare(v)}
            options={
              compareOptions.length ? compareOptions : [{ value: 'FY25', label: 'FY25' }]
            }
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? '…' : '↻'}
          </Button>
        </div>
      </header>

      <div className="review-body">
        <nav className="review-sidebar" aria-label="Sections du bilan">
          {NAV_FAMILIES.map((family) => (
            <div key={family.id} className="review-nav-family">
              <span className="review-nav-family-label">{family.label}</span>
              {family.items.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`review-nav-item ${nav === item.id ? 'review-nav-item--active' : ''}`}
                  onClick={() => setNav(item.id)}
                >
                  {item.label}
                  {item.soon ? (
                    <span className="review-nav-soon">bientôt</span>
                  ) : null}
                </Button>
              ))}
            </div>
          ))}
          <div className="review-nav-family">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="review-nav-family-label review-nav-accordion"
              aria-expanded={annexesOpen}
              onClick={() => setAnnexesOpen((open) => !open)}
            >
              Annexes
            </Button>
            {annexesOpen
              ? ANNEX_ITEMS.map((item) =>
                  item.ready ? (
                    <Button
                      key={item.id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={`review-nav-item ${nav === item.id ? 'review-nav-item--active' : ''}`}
                      onClick={() => setNav(item.id as NavId)}
                    >
                      {item.label}
                    </Button>
                  ) : (
                    <span
                      key={item.id}
                      className="review-nav-item review-nav-item--muted"
                    >
                      {item.label}
                    </span>
                  ),
                )
              : null}
          </div>
        </nav>

        <div className="review-main">
          {sectionError ? <div className="review-error">{sectionError}</div> : null}
          <main className="review-content">
            {nav === 'synthesis' && (
              <SynthesisSection
                data={synthesis.data}
                loading={synthesis.loading}
              />
            )}
            {nav === 'performance' && (
              <PerformanceSection data={overview.data} loading={overview.loading} />
            )}
            {nav === 'bridge-new' && (
              <BridgeNewSection data={bridge.data} loading={bridge.loading} />
            )}
            {nav === 'sales-compare' && (
              <SalesComparisonSection
                data={commercial.data}
                loading={commercial.loading}
              />
            )}
            {nav === 'capacity' && (
              <CapacitySection
                data={commercial.data}
                loading={commercial.loading}
              />
            )}
            {nav === 'productivity' && (
              <ProductivitySection
                data={commercial.data}
                loading={commercial.loading}
              />
            )}
            {nav === 'cycle' && (
              <CycleSection data={cycles.data} loading={cycles.loading} />
            )}
            {nav === 'product-compare' && (
              <ProductCompareSection
                data={product.data}
                loading={product.loading}
                compare={compare}
              />
            )}
            {nav === 'catalogue-bridge' && (
              <CatalogueBridgeSection
                data={bridge.data}
                loading={bridge.loading}
              />
            )}
            {nav === 'conseil' && (
              <ConseilSection data={product.data} loading={product.loading} />
            )}
            {nav === 'a5' && (
              <ProductFyAnnex data={product.data} loading={product.loading} />
            )}
            {nav === 'a2' && (
              <JeromeAnnex
                data={commercial.data}
                loading={commercial.loading}
              />
            )}
            {nav === 'a3' && (
              <ActivityAnnex
                data={commercial.data}
                loading={commercial.loading}
              />
            )}
            {nav === 'market' && (
              <MarketSignalSection
                data={market.data}
                loading={market.loading}
              />
            )}
            {nav === 'market-studies' && <MarketStudiesSection />}
            {nav === 'win-reasons' && (
              <WinReasonsSection data={market.data} loading={market.loading} />
            )}
            {nav === 'a6' && (
              <ReasonsAnnex data={market.data} loading={market.loading} />
            )}
            {nav === 'a1' && (
              <DefinitionsAnnex
                data={definitions.data}
                loading={definitions.loading}
              />
            )}
            {nav === 'a4' && (
              <HistoryAnnex data={overview.data} loading={overview.loading} />
            )}
            {nav === 'a7' && (
              <CampaignsAnnex data={channels.data} loading={channels.loading} />
            )}
            {nav === 'a8' && (
              <QualityAnnex data={quality.data} loading={quality.loading} />
            )}
            {nav === 'portfolio' && (
              <PortfolioSection
                data={portfolio.data}
                loading={portfolio.loading}
              />
            )}
            {nav === 'channels' && (
              <ChannelsSection
                data={channels.data}
                loading={channels.loading}
              />
            )}
            {nav === 'diagnosis' && (
              <DiagnosisSection
                data={diagnosis.data}
                loading={diagnosis.loading}
              />
            )}
            {nav === 'patterns' && (
              <PatternsSection
                data={synthesis.data}
                loading={synthesis.loading}
              />
            )}
            {nav === 'shared' && (
              <SharedSection
                shared={shared}
                loading={sharedLoading}
                error={sharedError}
                isManager={isManager}
                onShare={handleShare}
                onRevoke={handleRevoke}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// ── SharedSection ──────────────────────────────────────────────────────────

function SharedSection({
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
        <div className="review-skeleton">
          <Skeleton height={200} />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="review-section">
        <div className="review-error">{error}</div>
      </div>
    );
  }
  return (
    <div className="review-section">
      <GlassCard className="review-chart-card">
        <div className="review-shared-header">
          <h3 className="review-card-title">Analyses partagées</h3>
          {isManager && (
            <Button size="sm" onClick={onShare}>
              + Partager
            </Button>
          )}
        </div>
        {shared.length === 0 ? (
          <EmptyState
            title="Aucun partage"
            description="Les analyses partagées par le manager apparaîtront ici."
          />
        ) : (
          <div className="review-shared-list">
            {shared.map((a) => (
              <div key={a.id} className="review-shared-item">
                <div>
                  <span className="review-shared-period">
                    {a.config.period}
                  </span>
                  {a.note && (
                    <span className="review-shared-note">{a.note}</span>
                  )}
                </div>
                <div className="review-shared-actions">
                  <span className="review-shared-date">
                    {new Date(a.created_at).toLocaleDateString('fr-FR')}
                  </span>
                  {isManager && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(a.id)}
                    >
                      ✕
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

