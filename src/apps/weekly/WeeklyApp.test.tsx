// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../../lib/supabase", () => ({ supabase: { auth: { getSession } } }));
vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="forecast-chart">{children}</div>,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import WeeklyApp from "./WeeklyApp";

const selfPayload = {
  weeks: 8,
  period: "weeks" as const,
  timezone: "Europe/Paris",
  range: { from: "2026-05-18", to: "2026-07-12" },
  view: "self" as const,
  owners: [{ sf_user_id: "self", name: "Ada Lovelace", email: "ada@xos-learning.fr", role: "commercial" as const, tracking: "commercial" as const }],
  pulse: [{ sf_user_id: "self", week: "2026-W28", week_start: "2026-07-06", calls: 4, meetings: 2, proposals: 1 }],
  pipeline: [{ sf_user_id: "self", week: "2026-W28", week_start: "2026-07-06", generated_count: 2, generated_amount: 12000, won_count: 1, won_amount: 6000, won_by_type: { catalogue: 3000, sur_mesure: 2000, conseil: 1000 }, won_arr_amount: 3000, closing_rate_count: 0.5, closing_rate_amount: 0.5 }],
  effort: [{ sf_user_id: "self", week: "2026-W28", week_start: "2026-07-06", progressions: 3, open_opps_at_start: 20, effort_rate: 0.15 }],
  quarter: [{ sf_user_id: "self", quarter: "FY27-Q1", signed_to_date: 20000, weighted_open: 15000, forecast: 35000, custom_pipe: 18000, target: 60000 }],
  forecast_history: [
    { sf_user_id: "self", week_start: "2026-07-06", week: "2026-W28", forecast: 35000, signed_to_date: 20000 },
  ],
  custom_pipe: {
    horizon_days: 180,
    total_amount: 18000,
    total_expected: 9000,
    count: 1,
    months: [
      { month: "2026-07", label: "juil.", amount: 0, expected: 0, count: 0, by_owner: {} },
      { month: "2026-08", label: "août", amount: 0, expected: 0, count: 0, by_owner: {} },
      { month: "2026-09", label: "sept.", amount: 0, expected: 0, count: 0, by_owner: {} },
      { month: "2026-10", label: "oct.", amount: 18000, expected: 9000, count: 1, by_owner: { self: { amount: 18000, expected: 9000, count: 1 } } },
      { month: "2026-11", label: "nov.", amount: 0, expected: 0, count: 0, by_owner: {} },
      { month: "2026-12", label: "déc.", amount: 0, expected: 0, count: 0, by_owner: {} },
    ],
    by_owner: [{ sf_user_id: "self", amount: 18000, expected: 9000, count: 1 }],
    opps: [{ id: "006", name: "Deal SM", sf_user_id: "self", amount: 18000, expected: 9000, probability: 50, close_date: "2026-10-15", month: "2026-10" }],
  },
};

const teamPayload = {
  ...selfPayload,
  view: "team" as const,
  owners: [
    ...selfPayload.owners,
    { sf_user_id: "manager", name: "Grace Hopper", email: "grace@xos-learning.fr", role: "manager" as const, tracking: "commercial" as const },
    { sf_user_id: "sdr", name: "Yanis Agharbi", email: "yanis@xos-learning.fr", role: "commercial" as const, tracking: "sdr" as const },
    { sf_user_id: "dg", name: "Jérôme Bosio", email: "jerome@xos-learning.fr", role: "manager" as const, tracking: "dg" as const },
  ],
  pulse: [
    ...selfPayload.pulse,
    { sf_user_id: "manager", week: "2026-W28", week_start: "2026-07-06", calls: 7, meetings: 3, proposals: 2 },
    { sf_user_id: "sdr", week: "2026-W28", week_start: "2026-07-06", calls: 12, meetings: 5, proposals: 0 },
    { sf_user_id: "dg", week: "2026-W28", week_start: "2026-07-06", calls: 0, meetings: 0, proposals: 0 },
  ],
  pipeline: [
    ...selfPayload.pipeline,
    { sf_user_id: "manager", week: "2026-W28", week_start: "2026-07-06", generated_count: 3, generated_amount: 18000, won_count: 2, won_amount: 9000, won_by_type: { catalogue: 4000, sur_mesure: 3000, conseil: 1000 }, won_arr_amount: 4000, closing_rate_count: 0.67, closing_rate_amount: 0.5 },
    { sf_user_id: "sdr", week: "2026-W28", week_start: "2026-07-06", generated_count: 4, generated_amount: 0, won_count: 0, won_amount: 0, won_by_type: { catalogue: 0, sur_mesure: 0, conseil: 0 }, won_arr_amount: 0, closing_rate_count: null, closing_rate_amount: null },
    { sf_user_id: "dg", week: "2026-W28", week_start: "2026-07-06", generated_count: 0, generated_amount: 0, won_count: 1, won_amount: 15000, won_by_type: { catalogue: 0, sur_mesure: 15000, conseil: 0 }, won_arr_amount: 0, closing_rate_count: null, closing_rate_amount: null },
  ],
  effort: [...selfPayload.effort, { sf_user_id: "manager", week: "2026-W28", week_start: "2026-07-06", progressions: 4, open_opps_at_start: 20, effort_rate: 0.2 }],
  quarter: [...selfPayload.quarter, { sf_user_id: "manager", quarter: "FY27-Q1", signed_to_date: 25000, weighted_open: 10000, forecast: 35000, custom_pipe: 12000, target: null }],
};

const tablePayload = {
  ...selfPayload,
  weeks: 2,
  range: { from: "2026-06-29", to: "2026-07-12" },
  pulse: [
    { sf_user_id: "self", week: "2026-W27", week_start: "2026-06-29", calls: 1, meetings: 2, proposals: 0 },
    { sf_user_id: "self", week: "2026-W28", week_start: "2026-07-06", calls: 2, meetings: 4, proposals: 1 },
  ],
  pipeline: [
    { sf_user_id: "self", week: "2026-W27", week_start: "2026-06-29", generated_count: 1, generated_amount: 5000, won_count: 1, won_amount: 1000, won_by_type: { catalogue: 1000, sur_mesure: 0, conseil: 0 }, won_arr_amount: 1000, closing_rate_count: 1, closing_rate_amount: 0.2 },
    { sf_user_id: "self", week: "2026-W28", week_start: "2026-07-06", generated_count: 3, generated_amount: 9000, won_count: 2, won_amount: 3000, won_by_type: { catalogue: 1000, sur_mesure: 1000, conseil: 500 }, won_arr_amount: 1000, closing_rate_count: 2 / 3, closing_rate_amount: 1 / 3 },
  ],
  quarter: [{ sf_user_id: "self", quarter: "FY27-Q1", signed_to_date: 20000, weighted_open: 15000, forecast: 35000, custom_pipe: 18000, target: null }],
};

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: "token", user: { email: "ada@xos-learning.fr" } } } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(selfPayload), { status: 200 })));
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Weekly Perf", () => {
  it("renders a commercial's metrics without a team toggle", async () => {
    render(<WeeklyApp />);

    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Équipe" })).toBeNull();
  });

  it("requests the current fiscal quarter by default", async () => {
    render(<WeeklyApp />);
    await screen.findByText("Ada Lovelace");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/perf?period=quarter", expect.any(Object));
  });

  it("filters managers and DG by default and reveals them with their badge", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(teamPayload), { status: 200 })));
    render(<WeeklyApp />);

    expect(await screen.findByRole("button", { name: "Équipe" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Équipe" }));
    expect(screen.queryByText("Grace Hopper")).toBeNull();
    expect(screen.queryByText("Jérôme Bosio")).toBeNull();
    expect(screen.getByText("Yanis Agharbi")).toBeTruthy();
    expect(screen.getByText("SDR")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Commerciaux seulement" }));
    expect(await screen.findByText("Grace Hopper")).toBeTruthy();
    expect(screen.getByText("Jérôme Bosio")).toBeTruthy();
    expect(screen.getByText("DG")).toBeTruthy();
  });

  it("shows SDR metrics without sales breakdown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(teamPayload), { status: 200 })));
    render(<WeeklyApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Équipe" }));
    const sdrCard = screen.getByText("Yanis Agharbi").closest(".weekly-pulse-card");
    expect(sdrCard).toBeTruthy();
    expect(within(sdrCard as HTMLElement).getByText("RDV pris")).toBeTruthy();
    expect(within(sdrCard as HTMLElement).queryByLabelText("Répartition du CA signé")).toBeNull();
  });

  it("shows the Salesforce mapping warning as a banner", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...selfPayload, warning: "sf_user_unmapped" }), { status: 200 })));
    render(<WeeklyApp />);

    expect(await screen.findByText(/Compte Salesforce non lié/)).toBeTruthy();
  });

  it("retries the request after an API error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(selfPayload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WeeklyApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders the forecast vs signed effort chart", async () => {
    render(<WeeklyApp />);

    await screen.findByText("Ada Lovelace");
    expect(screen.getByText("Le pipeline avance-t-il ?")).toBeTruthy();
    expect(screen.getByTestId("forecast-chart")).toBeTruthy();
  });

  it("renders the quarter gauge with signed, forecast and target amounts", async () => {
    render(<WeeklyApp />);

    await screen.findByText("Ada Lovelace");
    expect(screen.getByLabelText(/Signé.*20.*000/)).toBeTruthy();
    expect(screen.getByLabelText(/Forecast.*35.*000/)).toBeTruthy();
    expect(screen.getByLabelText(/Target.*60.*000/)).toBeTruthy();
    const legend = screen.getByLabelText("Répartition du CA signé").parentElement?.querySelectorAll(".weekly-breakdown-labels span");
    expect(legend).toHaveLength(3);
    expect(legend?.[0].className).toContain("weekly-legend-catalogue");
  });

  it("computes table totals and averages client-side", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(tablePayload), { status: 200 })));
    render(<WeeklyApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Tableau" }));
    const table = screen.getByRole("table", { name: "Suivi hebdomadaire de Ada Lovelace" });
    expect(within(table).getByRole("columnheader", { name: "Total" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Moyenne" })).toBeTruthy();
    expect(within(table).getByRole("row", { name: /RDV effectués.*2.*4.*6.*3/ })).toBeTruthy();
    expect(within(table).getByRole("row", { name: /CA signé.*1.*000.*3.*000.*4.*000.*2.*000/ })).toBeTruthy();
    expect(within(table).queryByRole("row", { name: /Pipe sur-mesure/ })).toBeNull();
    expect(within(table).getAllByRole("row")).toHaveLength(10);
  });

  it("renders the dedicated sur-mesure 6-month section", async () => {
    render(<WeeklyApp />);
    expect(await screen.findByText("6 prochains mois consolidés")).toBeTruthy();
    expect(screen.getByText("Deal SM")).toBeTruthy();
    expect(screen.getByText(/ExpectedRevenue/)).toBeTruthy();
  });

  it("shows dashes for a missing target and its empty average", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(tablePayload), { status: 200 })));
    render(<WeeklyApp />);

    await screen.findByText("Ada Lovelace");
    expect(screen.getByLabelText("Target —")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tableau" }));
    const targetRow = within(screen.getByRole("table", { name: "Suivi hebdomadaire de Ada Lovelace" })).getByRole("row", { name: /Target/ });
    expect(within(targetRow).getAllByText("—")).toHaveLength(4);
  });
});
