import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, GlassCard, Tag } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import "./weekly.css";

type Tracking = "commercial" | "sdr" | "dg";
type Owner = { sf_user_id: string; name: string; email: string | null; role: "commercial" | "manager" | "admin" | null; tracking?: Tracking };
type Pulse = { sf_user_id: string; week: string; week_start: string; calls: number; meetings: number; proposals: number };
type WonByType = { catalogue: number; sur_mesure: number; conseil: number };
type Pipeline = { sf_user_id: string; week: string; week_start: string; generated_count: number; generated_amount: number; won_count: number; won_amount: number; won_by_type: WonByType; won_arr_amount: number; closing_rate_count: number | null; closing_rate_amount: number | null };
type Effort = { sf_user_id: string; week: string; week_start: string; progressions: number; open_opps_at_start: number; effort_rate: number | null };
type Quarter = { sf_user_id: string; quarter: string; signed_to_date: number; weighted_open: number; forecast: number; custom_pipe: number; target: number | null };
type ForecastPoint = { sf_user_id: string; week_start: string; week: string; forecast: number | null; signed_to_date: number };
type CustomPipeOpp = { id: string | null; name: string; sf_user_id: string; amount: number; expected: number; probability: number; close_date: string; month: string };
type CustomPipe = {
  horizon_days: number;
  total_amount: number;
  total_expected: number;
  count: number;
  months: Array<{ month: string; label: string; amount: number; expected: number; count: number; by_owner?: Record<string, { amount: number; expected: number; count: number }> }>;
  by_owner: Array<{ sf_user_id: string; amount: number; expected: number; count: number }>;
  opps: CustomPipeOpp[];
};
type PerfResponse = {
  weeks: number;
  period?: "weeks" | "quarter";
  range: { from: string; to: string };
  view: "self" | "team";
  owners: Owner[];
  pulse: Pulse[];
  pipeline: Pipeline[];
  effort: Effort[];
  quarter: Quarter[];
  forecast_history?: ForecastPoint[];
  custom_pipe?: CustomPipe;
  warning?: "sf_user_unmapped";
};
type Week = { start: string; label: string };
type PeriodMode = 8 | 4 | "quarter";
type Health = { label: string; tone: "ok" | "warn" | "crit"; reco: string };

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const countFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const weekLabel = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const emptyWonByType = (): WonByType => ({ catalogue: 0, sur_mesure: 0, conseil: 0 });
const TYPE_LABELS: Record<keyof WonByType, string> = { catalogue: "Catalogue", sur_mesure: "Sur-mesure", conseil: "Conseil" };
const emptyCustomPipe = (): CustomPipe => ({ horizon_days: 180, total_amount: 0, total_expected: 0, count: 0, months: [], by_owner: [], opps: [] });

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function makeWeeks(response: PerfResponse): Week[] {
  return Array.from({ length: response.weeks }, (_, index) => {
    const start = addDays(response.range.from, index * 7);
    return { start, label: weekLabel.format(new Date(`${start}T12:00:00.000Z`)) };
  });
}

function trackingOf(owner: Owner): Tracking {
  return owner.tracking || "commercial";
}

function trackingBadge(tracking: Tracking, role: Owner["role"]) {
  if (tracking === "sdr") return "SDR";
  if (tracking === "dg") return "DG";
  if (role === "manager") return "Manager";
  if (role === "admin") return "Admin";
  return null;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function wowDelta(current: number, previous: number | undefined) {
  if (previous === undefined) return null;
  return current - previous;
}

function formatDelta(value: number | null, format: "count" | "money" = "count") {
  if (value === null) return null;
  const absolute = format === "money" ? money.format(Math.abs(value)) : countFmt.format(Math.abs(value));
  if (value === 0) return "= S−1";
  return `${value > 0 ? "+" : "−"}${absolute} vs S−1`;
}

function cadenceHealth(tracking: Tracking, pulse: Pulse[], pipeline: Pipeline[]): Health {
  const currentPulse = pulse.at(-1)!;
  const currentPipe = pipeline.at(-1)!;
  const priorPulse = pulse.slice(0, -1);
  const priorPipe = pipeline.slice(0, -1);
  if (tracking === "sdr") {
    const avgCalls = average(priorPulse.map((point) => point.calls));
    const avgMeetings = average(priorPulse.map((point) => point.meetings));
    if (currentPulse.calls === 0 && currentPulse.meetings === 0 && currentPipe.generated_count === 0) {
      return { label: "Critique", tone: "crit", reco: "Semaine sans activité SDR — relancer appels et prise de RDV." };
    }
    if (currentPulse.calls < Math.max(1, avgCalls * 0.6) || currentPulse.meetings < Math.max(1, avgMeetings * 0.6)) {
      return { label: "À surveiller", tone: "warn", reco: `${currentPulse.calls} appels · ${currentPulse.meetings} RDV — sous la cadence des semaines précédentes.` };
    }
    return { label: "OK", tone: "ok", reco: `${currentPipe.generated_count} opp${currentPipe.generated_count > 1 ? "s" : ""} détectée${currentPipe.generated_count > 1 ? "s" : ""} — cadence saine.` };
  }
  if (tracking === "dg") {
    if (currentPipe.won_amount <= 0) return { label: "Calme", tone: "warn", reco: "Pas de signature cette semaine." };
    return { label: "OK", tone: "ok", reco: `${money.format(currentPipe.won_amount)} signés cette semaine.` };
  }
  const avgMeetings = average(priorPulse.map((point) => point.meetings));
  const avgOpps = average(priorPipe.map((point) => point.generated_count));
  if (currentPulse.meetings === 0 && currentPipe.generated_count === 0 && currentPipe.won_amount === 0) {
    return { label: "Critique", tone: "crit", reco: "Aucun RDV, aucune opp, aucun signé — vérifier la semaine." };
  }
  if (currentPulse.meetings < Math.max(1, avgMeetings * 0.6) || currentPipe.generated_count < Math.max(1, avgOpps * 0.6)) {
    return { label: "À surveiller", tone: "warn", reco: `${currentPulse.meetings} RDV · ${currentPipe.generated_count} opps — sous la cadence habituelle.` };
  }
  return { label: "OK", tone: "ok", reco: `${currentPulse.meetings} RDV · ${currentPipe.generated_count} opps · ${money.format(currentPipe.won_amount)} signés.` };
}

async function perfRequest(period: PeriodMode) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("missing_session");
  const query = period === "quarter" ? "period=quarter" : `weeks=${period}`;
  const response = await fetch(`/api/perf?${query}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  if (!response.ok) throw new Error("perf_unavailable");
  return { payload: await response.json() as PerfResponse, email: session.user.email || null };
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${28 - (value / max) * 24}`).join(" ");
  return <svg className="weekly-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} /></svg>;
}

function QuarterGauge({ data }: { data: Quarter | undefined }) {
  const signed = data?.signed_to_date || 0;
  const forecast = data?.forecast || 0;
  const target = data?.target ?? null;
  const ceiling = Math.max(target || 0, forecast, signed, 1);
  const signedWidth = `${Math.min(100, signed / ceiling * 100)}%`;
  const forecastWidth = `${Math.min(100, forecast / ceiling * 100)}%`;
  const targetText = target === null ? "—" : money.format(target);
  return <div className="weekly-quarter">
    <div className="weekly-quarter-heading"><span>{data?.quarter || "Trimestre"}</span><small>Objectif trimestriel</small></div>
    <div className="weekly-quarter-track" aria-hidden="true"><span className="weekly-quarter-forecast" style={{ width: forecastWidth }} /><span className="weekly-quarter-signed" style={{ width: signedWidth }} /></div>
    <div className="weekly-quarter-stats">
      <span aria-label={`Signé ${money.format(signed)}`}><small>Signé</small><strong>{money.format(signed)}</strong></span>
      <span aria-label={`Forecast ${money.format(forecast)}`}><small>Forecast</small><strong>{money.format(forecast)}</strong></span>
      <span aria-label={`Target ${targetText}`}><small>Target</small><strong>{targetText}</strong></span>
    </div>
  </div>;
}

function Breakdown({ wonByType, wonAmount }: { wonByType: WonByType; wonAmount: number }) {
  return <>
    <div className="weekly-breakdown" aria-label="Répartition du CA signé">
      {(Object.entries(wonByType) as Array<[keyof WonByType, number]>).map(([type, value]) => (
        <span className={`weekly-breakdown-${type}`} key={type} style={{ width: wonAmount ? `${value / wonAmount * 100}%` : "0%" }} title={`${TYPE_LABELS[type]}: ${money.format(value)}`} />
      ))}
    </div>
    <div className="weekly-breakdown-labels">
      {(Object.keys(TYPE_LABELS) as Array<keyof WonByType>).map((type) => (
        <span className={`weekly-legend-${type}`} key={type}>{TYPE_LABELS[type]}</span>
      ))}
    </div>
  </>;
}

type TableMetric = { label: string; format: "count" | "money"; values: Array<number | null> };

function MetricTable({ owner, weeks, pulse, pipeline, quarter }: { owner: Owner; weeks: Week[]; pulse: Pulse[]; pipeline: Pipeline[]; quarter: Quarter | undefined }) {
  const tracking = trackingOf(owner);
  const snapshot = (value: number | null | undefined) => weeks.map((_, index) => index === weeks.length - 1 && value !== null && value !== undefined ? value : null);
  const rows: TableMetric[] = tracking === "sdr"
    ? [
      { label: "Appels", format: "count", values: pulse.map((point) => point.calls) },
      { label: "RDV pris", format: "count", values: pulse.map((point) => point.meetings) },
      { label: "Opps détectées", format: "count", values: pipeline.map((point) => point.generated_count) },
    ]
    : tracking === "dg"
      ? [
        { label: "CA signé", format: "money", values: pipeline.map((point) => point.won_amount) },
        { label: "Sur-mesure", format: "money", values: pipeline.map((point) => point.won_by_type.sur_mesure) },
        { label: "Catalogue", format: "money", values: pipeline.map((point) => point.won_by_type.catalogue) },
        { label: "Conseil", format: "money", values: pipeline.map((point) => point.won_by_type.conseil) },
        { label: "Dont ARR", format: "money", values: pipeline.map((point) => point.won_arr_amount) },
        { label: "Forecast trimestre", format: "money", values: snapshot(quarter?.forecast) },
        { label: "Target", format: "money", values: snapshot(quarter?.target) },
      ]
      : [
        { label: "RDV effectués", format: "count", values: pulse.map((point) => point.meetings) },
        { label: "Opps détectées", format: "count", values: pipeline.map((point) => point.generated_count) },
        { label: "CA signé", format: "money", values: pipeline.map((point) => point.won_amount) },
        { label: "Sur-mesure", format: "money", values: pipeline.map((point) => point.won_by_type.sur_mesure) },
        { label: "Catalogue", format: "money", values: pipeline.map((point) => point.won_by_type.catalogue) },
        { label: "Conseil", format: "money", values: pipeline.map((point) => point.won_by_type.conseil) },
        { label: "Dont ARR", format: "money", values: pipeline.map((point) => point.won_arr_amount) },
        { label: "Forecast trimestre", format: "money", values: snapshot(quarter?.forecast) },
        { label: "Target", format: "money", values: snapshot(quarter?.target) },
      ];
  const formatValue = (value: number | null, format: TableMetric["format"]) => value === null ? "—" : format === "money" ? money.format(value) : countFmt.format(value);
  const badge = trackingBadge(tracking, owner.role);
  return <GlassCard className="weekly-table-card">
    <div className="weekly-person"><h4>{owner.name}</h4>{badge && <Tag variant="muted">{badge}</Tag>}</div>
    <div className="weekly-table-scroll">
      <table className="weekly-table" aria-label={`Suivi hebdomadaire de ${owner.name}`}>
        <thead><tr><th scope="col">Métrique</th>{weeks.map((week) => <th scope="col" key={week.start}>{week.label}</th>)}<th scope="col">Total</th><th scope="col">Moyenne</th></tr></thead>
        <tbody>{rows.map((metric) => {
          const populated = metric.values.filter((value): value is number => value !== null);
          const total = populated.length ? populated.reduce((sum, value) => sum + value, 0) : null;
          const averageValue = total === null ? null : total / populated.length;
          return <tr key={metric.label}><th scope="row">{metric.label}</th>{metric.values.map((value, index) => <td key={weeks[index].start}>{formatValue(value, metric.format)}</td>)}<td className="weekly-table-total">{formatValue(total, metric.format)}</td><td>{formatValue(averageValue, metric.format)}</td></tr>;
        })}</tbody>
      </table>
    </div>
  </GlassCard>;
}

function MetricCell({ label, value, series, moneyValue = false }: { label: string; value: number; series: number[]; moneyValue?: boolean }) {
  const delta = wowDelta(value, series.at(-2));
  const deltaText = formatDelta(delta, moneyValue ? "money" : "count");
  return <div>
    <span>{label}</span>
    <strong className="xos-numeric">{moneyValue ? money.format(value) : value}</strong>
    {deltaText && <small className={`weekly-delta ${delta && delta < 0 ? "weekly-delta--down" : delta && delta > 0 ? "weekly-delta--up" : ""}`}>{deltaText}</small>}
    <Sparkline values={series} />
  </div>;
}

function PersonCard({ owner, pulseSeries, pipelineSeries, quarter, delay }: { owner: Owner; pulseSeries: Pulse[]; pipelineSeries: Pipeline[]; quarter: Quarter | undefined; delay: number }) {
  const tracking = trackingOf(owner);
  const current = pulseSeries.at(-1)!;
  const currentPipeline = pipelineSeries.at(-1)!;
  const badge = trackingBadge(tracking, owner.role);
  const health = cadenceHealth(tracking, pulseSeries, pipelineSeries);

  return <GlassCard className="weekly-pulse-card weekly-pulse-card--current" style={{ "--weekly-delay": `${delay}ms` } as React.CSSProperties}>
    <div className="weekly-person">
      <h4>{owner.name}</h4>
      <div className="weekly-person-tags">
        {badge && <Tag variant="muted">{badge}</Tag>}
        <span className={`weekly-health weekly-health--${health.tone}`}>{health.label}</span>
      </div>
    </div>
    <p className="weekly-reco">{health.reco}</p>
    <div className={`weekly-metrics weekly-metrics--${tracking === "sdr" ? 3 : tracking === "dg" ? 2 : 4}`}>
      {tracking === "sdr" ? <>
        <MetricCell label="Appels" value={current.calls} series={pulseSeries.map((point) => point.calls)} />
        <MetricCell label="RDV pris" value={current.meetings} series={pulseSeries.map((point) => point.meetings)} />
        <MetricCell label="Opps détectées" value={currentPipeline.generated_count} series={pipelineSeries.map((point) => point.generated_count)} />
      </> : tracking === "dg" ? <>
        <MetricCell label="CA signé" value={currentPipeline.won_amount} series={pipelineSeries.map((point) => point.won_amount)} moneyValue />
        <MetricCell label="Dont ARR" value={currentPipeline.won_arr_amount} series={pipelineSeries.map((point) => point.won_arr_amount)} moneyValue />
      </> : <>
        <MetricCell label="Appels" value={current.calls} series={pulseSeries.map((point) => point.calls)} />
        <MetricCell label="RDV" value={current.meetings} series={pulseSeries.map((point) => point.meetings)} />
        <MetricCell label="Opps détectées" value={currentPipeline.generated_count} series={pipelineSeries.map((point) => point.generated_count)} />
        <MetricCell label="Propositions" value={current.proposals} series={pulseSeries.map((point) => point.proposals)} />
      </>}
    </div>
    {tracking !== "sdr" && (
      <div className="weekly-revenue">
        {tracking === "commercial" && <div><span>CA signé</span><strong className="xos-numeric">{money.format(currentPipeline.won_amount)}</strong></div>}
        <Breakdown wonByType={currentPipeline.won_by_type} wonAmount={currentPipeline.won_amount} />
      </div>
    )}
    {tracking !== "sdr" && <QuarterGauge data={quarter} />}
  </GlassCard>;
}

function TeamFlux({ owners, pulseFor, pipelineFor }: { owners: Owner[]; pulseFor: (owner: Owner) => Pulse[]; pipelineFor: (owner: Owner) => Pipeline[] }) {
  const sellers = owners.filter((owner) => trackingOf(owner) !== "sdr");
  const sdrs = owners.filter((owner) => trackingOf(owner) === "sdr");
  const band = (label: string, total: number, subs: string[], moneyValue = false) => (
    <div className="weekly-flux-band">
      <small>{label}</small>
      <strong className="xos-numeric">{moneyValue ? money.format(total) : total}</strong>
      {subs.length > 0 && <span>{subs.join(" · ")}</span>}
    </div>
  );
  const meetings = owners.reduce((sum, owner) => sum + (pulseFor(owner).at(-1)?.meetings || 0), 0);
  const opps = owners.reduce((sum, owner) => sum + (pipelineFor(owner).at(-1)?.generated_count || 0), 0);
  const won = sellers.reduce((sum, owner) => sum + (pipelineFor(owner).at(-1)?.won_amount || 0), 0);
  const meetingSubs = owners.filter((owner) => (pulseFor(owner).at(-1)?.meetings || 0) > 0).map((owner) => `${owner.name.split(" ")[0]} ${pulseFor(owner).at(-1)!.meetings}`);
  const oppSubs = owners.filter((owner) => (pipelineFor(owner).at(-1)?.generated_count || 0) > 0).map((owner) => `${owner.name.split(" ")[0]} ${pipelineFor(owner).at(-1)!.generated_count}`);
  const wonSubs = sellers.filter((owner) => (pipelineFor(owner).at(-1)?.won_amount || 0) > 0).map((owner) => `${owner.name.split(" ")[0]} ${money.format(pipelineFor(owner).at(-1)!.won_amount)}`);
  const calls = sdrs.reduce((sum, owner) => sum + (pulseFor(owner).at(-1)?.calls || 0), 0);
  return <GlassCard className="weekly-flux">
    <div className="weekly-flux-heading"><p>Flux équipe</p><h3>Cette semaine</h3></div>
    <div className="weekly-flux-grid">
      {band("RDV", meetings, meetingSubs)}
      {band("Opps détectées", opps, oppSubs)}
      {sellers.length > 0 && band("CA signé", won, wonSubs, true)}
      {sdrs.length > 0 && band("Appels SDR", calls, sdrs.map((owner) => `${owner.name.split(" ")[0]} ${pulseFor(owner).at(-1)?.calls || 0}`))}
    </div>
  </GlassCard>;
}

function CustomPipeSection({ pipe, owners, sellerIds }: { pipe: CustomPipe; owners: Owner[]; sellerIds: Set<string> }) {
  const nameOf = (id: string) => owners.find((owner) => owner.sf_user_id === id)?.name || id;
  const ownerRows = pipe.by_owner.filter((row) => sellerIds.has(row.sf_user_id));
  const months = pipe.months.map((entry) => ({ ...entry, label: entry.label.replace(".", "") }));
  const opps = pipe.opps.filter((opp) => sellerIds.has(opp.sf_user_id));
  return <section className="weekly-section">
    <div className="weekly-section-heading"><p>Pipe sur-mesure</p><h3>6 prochains mois consolidés</h3></div>
    <GlassCard className="weekly-custom-pipe">
      <div className="weekly-custom-kpis">
        <div><small>Montant brut</small><strong className="xos-numeric">{money.format(pipe.total_amount)}</strong></div>
        <div><small>CA attendu</small><strong className="xos-numeric">{money.format(pipe.total_expected)}</strong></div>
        <div><small>Opps</small><strong className="xos-numeric">{pipe.count}</strong></div>
      </div>
      <div className="weekly-chart weekly-chart--custom">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months}>
            <XAxis dataKey="label" stroke="var(--xos-text-muted)" tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip formatter={(value) => money.format(Number(value))} contentStyle={{ background: "var(--xos-window-content-bg)", border: "1px solid var(--xos-border)" }} />
            <Bar dataKey="expected" name="CA attendu" fill="var(--xos-accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {ownerRows.length > 1 && <div className="weekly-custom-owners">{ownerRows.map((row) => <span key={row.sf_user_id}>{nameOf(row.sf_user_id).split(" ")[0]} · {money.format(row.expected)}</span>)}</div>}
      {opps.length > 0 && <div className="weekly-custom-opps" aria-label="Principales opportunités sur-mesure">
        <table>
          <thead><tr><th>Opportunité</th><th>Owner</th><th>Close</th><th>Attendu</th></tr></thead>
          <tbody>{opps.slice(0, 5).map((opp) => <tr key={`${opp.id || opp.name}-${opp.close_date}`}><td>{opp.name}</td><td>{nameOf(opp.sf_user_id).split(" ")[0]}</td><td>{opp.close_date.slice(5)}</td><td className="xos-numeric">{money.format(opp.expected)}</td></tr>)}</tbody>
        </table>
      </div>}
      <p className="weekly-closing">Open Sur-mesure · CloseDate dans les {pipe.horizon_days} prochains jours · barres = ExpectedRevenue</p>
    </GlassCard>
  </section>;
}

function ForecastChart({ weeks, history, ownerIds }: { weeks: Week[]; history: ForecastPoint[]; ownerIds: Set<string> }) {
  const data = weeks.map((week) => {
    const points = history.filter((point) => point.week_start === week.start && ownerIds.has(point.sf_user_id));
    const forecastValues = points.map((point) => point.forecast).filter((value): value is number => value !== null);
    const signed = points.reduce((sum, point) => sum + (point.signed_to_date || 0), 0);
    return {
      label: week.label,
      forecast: forecastValues.length ? forecastValues.reduce((sum, value) => sum + value, 0) : null,
      signed,
    };
  });
  const hasForecast = data.some((point) => point.forecast !== null);
  return <GlassCard className="weekly-chart-card weekly-forecast-card">
    <div className="weekly-chart weekly-chart--forecast">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="color-mix(in srgb, var(--xos-border) 80%, transparent)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--xos-text-muted)" tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip formatter={(value) => (value === null || value === undefined ? "—" : money.format(Number(value)))} contentStyle={{ background: "var(--xos-window-content-bg)", border: "1px solid var(--xos-border)" }} />
          <Legend />
          {hasForecast && <Line type="monotone" dataKey="forecast" name="Forecast" stroke="var(--xos-accent)" strokeWidth={2.4} dot={{ r: 3 }} connectNulls={false} />}
          <Line type="monotone" dataKey="signed" name="Signé cumulé" stroke="var(--xos-alert)" strokeWidth={2.4} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <p className="weekly-closing">Snapshot forecast chaque lundi · courbe signée reconstruite depuis Salesforce{!hasForecast ? " · historique forecast en cours de constitution" : ""}</p>
  </GlassCard>;
}

function Skeleton() {
  return <main className="weekly-app"><header className="weekly-header"><div className="weekly-skeleton weekly-skeleton--tag" /><div className="weekly-skeleton weekly-skeleton--title" /></header><section className="weekly-pulse-grid">{Array.from({ length: 3 }, (_, index) => <GlassCard className="weekly-pulse-card weekly-skeleton-card" key={index}><div className="weekly-skeleton weekly-skeleton--line" /><div className="weekly-skeleton weekly-skeleton--metrics" /></GlassCard>)}</section></main>;
}

export default function WeeklyApp() {
  const [period, setPeriod] = useState<PeriodMode>("quarter");
  const [result, setResult] = useState<{ payload: PerfResponse; email: string | null } | null>(null);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<"self" | "team">("self");
  const [displayMode, setDisplayMode] = useState<"cards" | "table">("cards");
  const [commercialsOnly, setCommercialsOnly] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(false);
    try {
      const next = await perfRequest(period);
      setResult(next);
      setSelectedWeek(null);
    } catch { setError(true); }
  }, [period]);

  useEffect(() => { void refresh(); }, [refresh]);

  const model = useMemo(() => {
    if (!result) return null;
    const { payload, email } = result;
    const weeks = makeWeeks(payload);
    const latestWeek = weeks.at(-1)?.start || payload.range.from;
    const selfOwner = payload.owners.find((owner) => owner.email?.toLowerCase() === email?.toLowerCase()) || payload.owners[0];
    const visibleOwners = mode === "self"
      ? (selfOwner ? [selfOwner] : [])
      : payload.owners.filter((owner) => {
        if (!commercialsOnly) return true;
        if (trackingOf(owner) === "dg") return false;
        return owner.role !== "manager" && owner.role !== "admin";
      });
    const pulseFor = (owner: Owner) => weeks.map(({ start }) => payload.pulse.find((point) => point.sf_user_id === owner.sf_user_id && point.week_start === start) || { sf_user_id: owner.sf_user_id, week: "", week_start: start, calls: 0, meetings: 0, proposals: 0 });
    const pipelineFor = (owner: Owner) => weeks.map(({ start }) => payload.pipeline.find((point) => point.sf_user_id === owner.sf_user_id && point.week_start === start) || { sf_user_id: owner.sf_user_id, week: "", week_start: start, generated_count: 0, generated_amount: 0, won_count: 0, won_amount: 0, won_by_type: emptyWonByType(), won_arr_amount: 0, closing_rate_count: null, closing_rate_amount: null });
    const sellers = visibleOwners.filter((owner) => trackingOf(owner) !== "sdr");
    const sellerIds = new Set(sellers.map((owner) => owner.sf_user_id));
    const pipeline = weeks.map(({ start, label }) => {
      const points = payload.pipeline.filter((point) => point.week_start === start && sellerIds.has(point.sf_user_id));
      return { week_start: start, label, generated_amount: points.reduce((sum, point) => sum + point.generated_amount, 0), won_amount: points.reduce((sum, point) => sum + point.won_amount, 0), generated_count: points.reduce((sum, point) => sum + point.generated_count, 0), won_count: points.reduce((sum, point) => sum + point.won_count, 0) };
    });
    const quarterFor = (owner: Owner) => payload.quarter.find((point) => point.sf_user_id === owner.sf_user_id);
    const customPipe = payload.custom_pipe || emptyCustomPipe();
    const ownerRows = customPipe.by_owner.filter((row) => sellerIds.has(row.sf_user_id));
    const scopedPipe: CustomPipe = {
      ...customPipe,
      by_owner: ownerRows,
      opps: customPipe.opps.filter((opp) => sellerIds.has(opp.sf_user_id)),
      total_amount: ownerRows.reduce((sum, row) => sum + row.amount, 0),
      total_expected: ownerRows.reduce((sum, row) => sum + row.expected, 0),
      count: ownerRows.reduce((sum, row) => sum + row.count, 0),
      months: customPipe.months.map((month) => {
        const parts = Object.entries(month.by_owner || {}).filter(([id]) => sellerIds.has(id));
        return {
          month: month.month,
          label: month.label,
          amount: parts.reduce((sum, [, row]) => sum + row.amount, 0),
          expected: parts.reduce((sum, [, row]) => sum + row.expected, 0),
          count: parts.reduce((sum, [, row]) => sum + row.count, 0),
        };
      }),
    };
    return { payload, weeks, latestWeek, visibleOwners, pulseFor, pipelineFor, quarterFor, pipeline, sellerIds, forecastHistory: payload.forecast_history || [], customPipe: scopedPipe };
  }, [commercialsOnly, mode, result]);

  if (error) return <main className="weekly-app weekly-app__state"><GlassCard className="weekly-error"><h2>Performance indisponible</h2><p>La récupération des données n’a pas abouti.</p><Button onClick={() => void refresh()}>Réessayer</Button></GlassCard></main>;
  if (!model) return <Skeleton />;
  const { payload, latestWeek, visibleOwners, pulseFor, pipelineFor, quarterFor, pipeline, sellerIds, forecastHistory, customPipe } = model;
  const activeWeek = selectedWeek || latestWeek;
  const selectedPipeline = pipeline.find((point) => point.week_start === activeWeek) || pipeline.at(-1);
  const hasActivity = payload.pulse.some((point) => point.calls || point.meetings || point.proposals) || payload.pipeline.some((point) => point.generated_amount || point.won_amount) || payload.effort.some((point) => point.progressions) || customPipe.count > 0;
  const showPipelineBars = visibleOwners.some((owner) => trackingOf(owner) === "commercial");
  const showForecast = visibleOwners.some((owner) => trackingOf(owner) !== "sdr");
  const showCustomPipe = visibleOwners.some((owner) => trackingOf(owner) !== "sdr");
  const showTeamFlux = mode === "team" && displayMode === "cards" && visibleOwners.length > 1;

  const customPipeBlock = showCustomPipe ? <CustomPipeSection pipe={customPipe} owners={visibleOwners} sellerIds={sellerIds} /> : null;

  return <main className="weekly-app">
    <header className="weekly-header">
      <div><Tag variant="accent">Performance</Tag><h2>Weekly Perf</h2></div>
      <div className="weekly-period" aria-label="Période">
        <Button variant={period === "quarter" ? "primary" : "secondary"} onClick={() => setPeriod("quarter")}>Trimestre</Button>
        <Button variant={period === 8 ? "primary" : "secondary"} onClick={() => setPeriod(8)}>8 semaines</Button>
        <Button variant={period === 4 ? "primary" : "secondary"} onClick={() => setPeriod(4)}>4 semaines</Button>
      </div>
    </header>
    {payload.warning === "sf_user_unmapped" && <div className="weekly-warning" role="status">Compte Salesforce non lié — passez par le Hub ou le login Salesforce.</div>}
    <div className="weekly-controls">
      {payload.view === "team" && <div className="weekly-toggle" aria-label="Vue"><Button variant={mode === "self" ? "primary" : "secondary"} onClick={() => setMode("self")}>Moi</Button><Button variant={mode === "team" ? "primary" : "secondary"} onClick={() => setMode("team")}>Équipe</Button></div>}
      {payload.view === "team" && mode === "team" && <label className="weekly-checkbox"><input type="checkbox" checked={commercialsOnly} onChange={(event) => setCommercialsOnly(event.target.checked)} /> Commerciaux seulement</label>}
      <div className="weekly-toggle weekly-display-toggle" aria-label="Affichage"><Button variant={displayMode === "cards" ? "primary" : "secondary"} onClick={() => setDisplayMode("cards")}>Cards</Button><Button variant={displayMode === "table" ? "primary" : "secondary"} onClick={() => setDisplayMode("table")}>Tableau</Button></div>
    </div>
    {!hasActivity ? <GlassCard className="weekly-empty"><h3>Une semaine encore calme</h3><p>Les activités Salesforce apparaîtront ici au fil des saisies.</p><span>Consultez Call Manager pour enregistrer vos appels.</span></GlassCard> : <>
      {displayMode === "table" ? <>
        <section className="weekly-section"><div className="weekly-section-heading"><p>Rituel équipe</p><h3>{period === "quarter" ? "Suivi du trimestre en cours" : "Suivi semaine par semaine"}</h3></div><div className="weekly-tables weekly-view-transition">{visibleOwners.map((owner) => <MetricTable key={owner.sf_user_id} owner={owner} weeks={model.weeks} pulse={pulseFor(owner)} pipeline={pipelineFor(owner)} quarter={quarterFor(owner)} />)}</div></section>
        {customPipeBlock}
      </> : <>
        {showTeamFlux && <TeamFlux owners={visibleOwners} pulseFor={pulseFor} pipelineFor={pipelineFor} />}
        <section className="weekly-section"><div className="weekly-section-heading"><p>Pulse</p><h3>Qui a bougé cette semaine ?</h3></div><div className="weekly-pulse-grid weekly-view-transition">{visibleOwners.map((owner, ownerIndex) => (
          <PersonCard key={owner.sf_user_id} owner={owner} pulseSeries={pulseFor(owner)} pipelineSeries={pipelineFor(owner)} quarter={quarterFor(owner)} delay={ownerIndex * 70} />
        ))}</div></section>
        {showPipelineBars && <section className="weekly-section"><div className="weekly-section-heading"><p>Pipeline</p><h3>Généré, puis gagné</h3></div><GlassCard className="weekly-chart-card"><div className="weekly-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={pipeline} onMouseMove={(state) => { const point = pipeline.find((item) => item.label === state.activeLabel); if (point) setSelectedWeek(point.week_start); }}><XAxis dataKey="label" stroke="var(--xos-text-muted)" tickLine={false} axisLine={false} /><YAxis hide /><Tooltip formatter={(value) => money.format(Number(value))} contentStyle={{ background: "var(--xos-window-content-bg)", border: "1px solid var(--xos-border)" }} /><Bar dataKey="generated_amount" name="Généré" fill="var(--xos-accent)" radius={[4, 4, 0, 0]} /><Bar dataKey="won_amount" name="Gagné" fill="var(--xos-alert)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div><p className="weekly-closing">{selectedPipeline?.label} · closing <strong className="xos-numeric">{selectedPipeline?.generated_count ? percent.format(selectedPipeline.won_count / selectedPipeline.generated_count) : "—"}</strong> en nombre · <strong className="xos-numeric">{selectedPipeline?.generated_amount ? percent.format(selectedPipeline.won_amount / selectedPipeline.generated_amount) : "—"}</strong> en valeur</p></GlassCard></section>}
        {customPipeBlock}
        {showForecast && <section className="weekly-section"><div className="weekly-section-heading"><p>Effort</p><h3>Le pipeline avance-t-il ?</h3></div><ForecastChart weeks={model.weeks} history={forecastHistory} ownerIds={sellerIds} /></section>}
      </>}
    </>}
  </main>;
}
