/**
 * src/apps/review/ReviewApp.tsx — Bilan : cockpit macro & partage d'analyses.
 * Sections : Cockpit (KPIs + breakdown), Funnel (SDR + appels), Attention, Partages.
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

type Tab = 'cockpit' | 'funnel' | 'attention' | 'shared';

const TABS: { id: Tab; label: string }[] = [
  { id: 'cockpit', label: 'Cockpit' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'attention', label: 'Attention' },
  { id: 'shared', label: 'Partages' },
];

const PERIOD_OPTIONS = [
  { value: 'FY26', label: 'FY26' },
  { value: 'FY26-Q1', label: 'FY26 Q1' },
  { value: 'FY26-Q2', label: 'FY26 Q2' },
  { value: 'FY26-Q3', label: 'FY26 Q3' },
  { value: 'FY26-Q4', label: 'FY26 Q4' },
  { value: 'FY25', label: 'FY25' },
];

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

export default function ReviewApp() {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('cockpit');
  const [period, setPeriod] = useState('FY26');
  const [owner, setOwner] = useState<string | null>(null);
  const [owners] = useState<Owner[]>([]);
  const [isManager, setIsManager] = useState(false);

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
    apiFetch<{ role: string }>(token, '/api/status')
      .then((p) => {
        setIsManager(p.role === 'manager' || p.role === 'admin');
      })
      .catch(() => {});
    apiFetch<{ owners: Owner[] }>(token, '/api/review?resource=shared')
      .then(() => {})
      .catch(() => {});
  }, [token]);

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
    fetchData();
  }, [fetchData]);

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

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="review-app">
      {/* Header */}
      <header className="review-header">
        <div className="review-header-left">
          <h2 className="review-title">Bilan</h2>
          <span className="review-subtitle">Cockpit macro</span>
        </div>
        <div className="review-header-right">
          <Select
            value={period}
            onChange={(v) => setPeriod(v as string)}
            options={PERIOD_OPTIONS}
          />
          {isManager && (
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
            onClick={fetchData}
            disabled={loading}
          >
            {loading ? '…' : '↻'}
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="review-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`review-tab ${tab === t.id ? 'review-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Error */}
      {error && <div className="review-error">{error}</div>}

      {/* Content */}
      <main className="review-content">
        {loading && !kpis ? (
          <div className="review-skeleton">
            <Skeleton height={120} />
            <Skeleton height={200} />
            <Skeleton height={200} />
          </div>
        ) : (
          <>
            {tab === 'cockpit' && (
              <CockpitSection
                kpis={kpis}
                breakdown={breakdown}
                pieData={pieData}
              />
            )}
            {tab === 'funnel' && (
              <FunnelSection
                funnel={funnel}
                callStats={callStats}
                funnelMax={funnelMax}
              />
            )}
            {tab === 'attention' && <AttentionSection attention={attention} />}
            {tab === 'shared' && (
              <SharedSection
                shared={shared}
                isManager={isManager}
                onShare={handleShare}
                onRevoke={handleRevoke}
              />
            )}
          </>
        )}
      </main>
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
