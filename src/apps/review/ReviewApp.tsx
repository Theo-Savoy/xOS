/**
 * src/apps/review/ReviewApp.tsx — Bilan : Business Review FY26 + cockpit actuel.
 * Shell à sidebar groupée (lot 1). Anciennes sections conservées jusqu'au lot 6.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Button,
  EmptyState,
  GlassCard,
  Select,
  Skeleton,
  Tag,
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

type Period = {
  from: string;
  toExclusive: string;
  label: string;
  granularity: string;
};
type Kpis = {
  ca_signe: number;
  pipeline_genere: number;
  pipeline_count: number;
  closing_rate_count: number | null;
  closing_rate_amount: number | null;
  won_count: number;
  closed_count: number;
  lost_count: number;
  by_owner: Record<
    string,
    {
      won: number;
      wonAmount: number;
      closed: number;
      closedAmount: number;
      created: number;
      createdAmount: number;
    }
  >;
  prior: {
    ca_signe: number;
    pipeline_genere: number;
    pipeline_count: number;
    won_count: number;
  } | null;
  prior2: {
    ca_signe: number;
    pipeline_genere: number;
    pipeline_count: number;
    won_count: number;
  } | null;
};
type Breakdown = {
  by_type: Record<string, { count: number; amount: number; pct: number }>;
  total_count: number;
  total_amount: number;
};
type FunnelStage = { label: string; count: number };
type Funnel = {
  stages: FunnelStage[];
  total: number;
  conversion: Record<string, number | null>;
};
type CallStats = {
  total: number;
  per_week: { week: string; count: number }[];
  funnel: Funnel;
};
type AttentionOpp = {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  account_name: string;
  stage: string;
  amount: number;
  probability: number;
  close_date: string;
  last_activity?: string;
  days_since_activity?: number | null;
  score?: number;
};
type Attention = {
  stale: AttentionOpp[];
  key: AttentionOpp[];
  hot: AttentionOpp[];
};
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
type Owner = { sf_user_id: string; name: string };

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
  | 'cockpit'
  | 'funnel'
  | 'attention'
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
    id: 'cockpit-legacy',
    label: 'Cockpit actuel',
    items: [
      { id: 'cockpit', label: 'Cockpit' },
      { id: 'funnel', label: 'Funnel' },
      { id: 'attention', label: 'Attention' },
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

const LEGACY_NAV: NavId[] = ['cockpit', 'funnel', 'attention', 'shared'];

const PIE_COLORS = [
  '#5b8def',
  'var(--xos-accent)',
  '#f0a35e',
  '#7d8aa3',
  '#e06c75',
];

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} k€`;
  return `${n.toFixed(0)} €`;
}

function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${(n * 100).toFixed(0)}%`;
}

function delta(
  current: number,
  prior: number | null,
): { value: string; positive: boolean } | null {
  if (prior === null || prior === 0) return null;
  const pct = ((current - prior) / prior) * 100;
  return {
    value: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`,
    positive: pct >= 0,
  };
}

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
  const [owner, setOwner] = useState<string | null>(null);
  const [owners] = useState<Owner[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [roleKnown, setRoleKnown] = useState(false);

  // Data
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [callStats, setCallStats] = useState<CallStats | null>(null);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [shared, setShared] = useState<SharedAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Load profile + owners
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

  const isLegacy = LEGACY_NAV.includes(nav);
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

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const ownerParam = owner ? `&owner=${owner}` : '';
      const base = `/api/review?period=${period}${ownerParam}`;

      const [
        kpisRes,
        breakdownRes,
        funnelRes,
        callsRes,
        attentionRes,
        sharedRes,
      ] = await Promise.all([
        apiFetch<Kpis & { period: Period }>(token, `${base}&resource=kpis`),
        apiFetch<Breakdown>(token, `${base}&resource=breakdown`),
        apiFetch<Funnel>(token, `${base}&resource=funnel`),
        apiFetch<CallStats>(token, `${base}&resource=calls`),
        apiFetch<Attention>(token, `${base}&resource=attention`),
        apiFetch<{ analyses: SharedAnalysis[] }>(
          token,
          '/api/review?resource=shared',
        ),
      ]);

      setKpis(kpisRes);
      setBreakdown(breakdownRes);
      setFunnel(funnelRes);
      setCallStats(callsRes);
      setAttention(attentionRes);
      setShared(sharedRes.analyses || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [token, period, owner]);

  useEffect(() => {
    if (isLegacy) fetchData();
  }, [fetchData, isLegacy]);

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
      fetchData();
    } catch {
      /* ignore */
    }
  }, [token, period, fetchData]);

  const handleRevoke = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        await apiFetch(token, `/api/review?resource=shared&id=${id}`, {
          method: 'DELETE',
        });
        fetchData();
      } catch {
        /* ignore */
      }
    },
    [token, fetchData],
  );

  // Derived
  const pieData = useMemo(() => {
    if (!breakdown) return [];
    return Object.entries(breakdown.by_type).map(([type, d]) => ({
      name: type,
      value: d.amount,
      count: d.count,
    }));
  }, [breakdown]);

  const funnelMax = useMemo(() => {
    if (!funnel) return 1;
    return Math.max(...funnel.stages.map((s) => s.count), 1);
  }, [funnel]);

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
  const sectionError = isLegacy
    ? error
    : overview.error ||
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
    (isLegacy && loading) ||
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
    if (isLegacy) fetchData();
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
          {isManager && isLegacy && (
            <Select
              value={owner || ''}
              onChange={(v) => setOwner(v || null)}
              options={[
                { value: '', label: "Toute l'équipe" },
                ...owners.map((o) => ({ value: o.sf_user_id, label: o.name })),
              ]}
            />
          )}
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
            {nav === 'cockpit' &&
              (loading && !kpis ? (
                <div className="review-skeleton">
                  <Skeleton height={120} />
                  <Skeleton height={200} />
                </div>
              ) : (
                <CockpitSection
                  kpis={kpis}
                  breakdown={breakdown}
                  pieData={pieData}
                />
              ))}
            {nav === 'funnel' && (
              <FunnelSection
                funnel={funnel}
                callStats={callStats}
                funnelMax={funnelMax}
              />
            )}
            {nav === 'attention' && <AttentionSection attention={attention} />}
            {nav === 'shared' && (
              <SharedSection
                shared={shared}
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

// ── Sections ───────────────────────────────────────────────────────────────

function CockpitSection({
  kpis,
  breakdown,
  pieData,
}: {
  kpis: Kpis | null;
  breakdown: Breakdown | null;
  pieData: { name: string; value: number; count: number }[];
}) {
  if (!kpis)
    return (
      <EmptyState
        title="Aucune donnée"
        description="Sélectionnez une période."
      />
    );

  const caDelta = delta(kpis.ca_signe, kpis.prior?.ca_signe ?? null);
  const pipeDelta = delta(
    kpis.pipeline_genere,
    kpis.prior?.pipeline_genere ?? null,
  );

  return (
    <div className="review-section">
      {/* KPI cards */}
      <div className="review-kpi-grid">
        <GlassCard className="review-kpi-card">
          <span className="review-kpi-label">CA signé</span>
          <span className="review-kpi-value">{fmtEur(kpis.ca_signe)}</span>
          {caDelta && (
            <Tag variant={caDelta.positive ? 'success' : 'alert'}>
              {caDelta.value} vs N-1
            </Tag>
          )}
        </GlassCard>
        <GlassCard className="review-kpi-card">
          <span className="review-kpi-label">Pipeline généré</span>
          <span className="review-kpi-value">
            {fmtEur(kpis.pipeline_genere)}
          </span>
          {pipeDelta && (
            <Tag variant={pipeDelta.positive ? 'success' : 'alert'}>
              {pipeDelta.value} vs N-1
            </Tag>
          )}
        </GlassCard>
        <GlassCard className="review-kpi-card">
          <span className="review-kpi-label">Taux closing (nb)</span>
          <span className="review-kpi-value">
            {fmtPct(kpis.closing_rate_count)}
          </span>
          <span className="review-kpi-sub">
            {kpis.won_count} gagnés / {kpis.closed_count} clos
          </span>
        </GlassCard>
        <GlassCard className="review-kpi-card">
          <span className="review-kpi-label">Taux closing (€)</span>
          <span className="review-kpi-value">
            {fmtPct(kpis.closing_rate_amount)}
          </span>
          <span className="review-kpi-sub">{kpis.lost_count} perdus</span>
        </GlassCard>
      </div>

      {/* Breakdown pie */}
      {breakdown && pieData.length > 0 && (
        <GlassCard className="review-chart-card">
          <h3 className="review-card-title">CA par type de vente</h3>
          <div className="review-pie-row">
            <ResponsiveContainer width="50%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmtEur(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="review-pie-legend">
              {pieData.map((d, i) => (
                <div key={d.name} className="review-legend-item">
                  <span
                    className="review-legend-dot"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="review-legend-label">{d.name}</span>
                  <span className="review-legend-value">
                    {fmtEur(d.value)} ({d.count})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function FunnelSection({
  funnel,
  callStats,
  funnelMax,
}: {
  funnel: Funnel | null;
  callStats: CallStats | null;
  funnelMax: number;
}) {
  if (!funnel)
    return (
      <EmptyState
        title="Aucune donnée"
        description="Pas d'appels sur cette période."
      />
    );

  const funnelColors = [
    '#7d8aa3',
    '#7d8aa3',
    '#5b8def',
    'var(--xos-accent)',
    'var(--xos-alert)',
  ];

  return (
    <div className="review-section">
      {/* SDR Funnel */}
      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">Funnel SDR</h3>
        <div className="review-funnel">
          {funnel.stages.map((stage, i) => (
            <div key={stage.label} className="review-funnel-row">
              <span className="review-funnel-label">{stage.label}</span>
              <div className="review-funnel-bar-track">
                <div
                  className="review-funnel-bar"
                  style={{
                    width: `${(stage.count / funnelMax) * 100}%`,
                    background: funnelColors[i % funnelColors.length],
                  }}
                />
              </div>
              <span className="review-funnel-count">{stage.count}</span>
            </div>
          ))}
        </div>
        <div className="review-funnel-rates">
          <Tag>Décroché : {fmtPct(funnel.conversion.decroche_rate)}</Tag>
          <Tag>Argumenté : {fmtPct(funnel.conversion.argumente_rate)}</Tag>
          <Tag>RDV : {fmtPct(funnel.conversion.rdv_rate)}</Tag>
        </div>
      </GlassCard>

      {/* Calls per week */}
      {callStats && callStats.per_week.length > 0 && (
        <GlassCard className="review-chart-card">
          <h3 className="review-card-title">
            Appels par semaine ({callStats.total} total)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={callStats.per_week}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              />
              <Tooltip />
              <Bar
                dataKey="count"
                fill="var(--xos-accent)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      )}
    </div>
  );
}

function AttentionSection({ attention }: { attention: Attention | null }) {
  if (!attention)
    return (
      <EmptyState
        title="Aucune donnée"
        description="Pas d'opps à surveiller."
      />
    );

  return (
    <div className="review-section">
      <OppList title="⚠️ Opps stagnantes" opps={attention.stale} showScore />
      <OppList title="💰 Opps clés" opps={attention.key} />
      <OppList title="🔥 Opps chaudes" opps={attention.hot} />
    </div>
  );
}

function OppList({
  title,
  opps,
  showScore,
}: {
  title: string;
  opps: AttentionOpp[];
  showScore?: boolean;
}) {
  if (!opps.length) return null;
  return (
    <GlassCard className="review-chart-card">
      <h3 className="review-card-title">{title}</h3>
      <div className="review-opp-table">
        <div className="review-opp-header">
          <span>Opp</span>
          <span>Compte</span>
          <span>Stage</span>
          <span>Montant</span>
          {showScore && <span>Score</span>}
          <span>Owner</span>
        </div>
        {opps.map((opp) => (
          <div key={opp.id} className="review-opp-row">
            <span className="review-opp-name" title={opp.name}>
              {opp.name}
            </span>
            <span>{opp.account_name}</span>
            <span>
              <Tag>{opp.stage}</Tag>
            </span>
            <span>{fmtEur(opp.amount)}</span>
            {showScore && <span>{opp.score?.toFixed(0)}</span>}
            <span>{opp.owner_name}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function SharedSection({
  shared,
  isManager,
  onShare,
  onRevoke,
}: {
  shared: SharedAnalysis[];
  isManager: boolean;
  onShare: () => void;
  onRevoke: (id: string) => void;
}) {
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
