/**
 * api/calls-list.js — SOQL contact sourcing for Call Manager sessions.
 *
 * POST /api/calls-list { filters } → Salesforce Contact query.
 * Response shape matches create_session contacts[] (lot 4.A contract).
 */

import { createClient } from "@supabase/supabase-js";
import { verifyJWT } from "./_auth.js";

const SF_ID = /^[a-zA-Z0-9]{15,18}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Escape a string for use inside SOQL single-quoted literals.
 */
export function escapeSOQL(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Build a SOQL query for Contact sourcing.
 * @param {{ ownerOnly: boolean, hasPhone: boolean, accountId?: string, limit: number }} filters
 * @param {string | null | undefined} sfUserId
 */
export function buildSoqlQuery(filters, sfUserId) {
  const conditions = [];

  if (filters.hasPhone) {
    conditions.push("Phone != null");
  }
  if (filters.ownerOnly && sfUserId) {
    conditions.push(`OwnerId = '${escapeSOQL(sfUserId)}'`);
  }
  if (filters.accountId) {
    conditions.push(`AccountId = '${escapeSOQL(filters.accountId)}'`);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  return `SELECT Id, Name, Phone, Account.Id, Account.Name FROM Contact${where} LIMIT ${filters.limit}`;
}

/**
 * Map raw Salesforce Contact records to create_session contact shape.
 */
export function normalizeContacts(records) {
  if (!Array.isArray(records)) return [];

  return records
    .filter((r) => typeof r?.Id === "string" && r.Id.length > 0)
    .map((r) => ({
      sf_contact_id: r.Id,
      sf_account_id: r.Account?.Id ?? null,
      contact_name: r.Name || "",
      account_name: r.Account?.Name ?? null,
      phone: r.Phone ?? null,
    }));
}

/**
 * Parse and validate filters from the request body.
 * @returns {{ ok: true, filters: object, sfUserId?: string } | { ok: false, error: string }}
 */
export function parseFilters(body) {
  if (body.filters === undefined || body.filters === null) {
    return { ok: false, error: "invalid_body" };
  }
  if (typeof body.filters !== "object" || Array.isArray(body.filters)) {
    return { ok: false, error: "invalid_filters" };
  }

  const raw = body.filters;

  const ownerOnly = raw.ownerOnly !== undefined ? raw.ownerOnly : true;
  const hasPhone = raw.hasPhone !== undefined ? raw.hasPhone : true;
  const limit = raw.limit !== undefined ? raw.limit : DEFAULT_LIMIT;

  if (typeof ownerOnly !== "boolean") {
    return { ok: false, error: "invalid_filters" };
  }
  if (typeof hasPhone !== "boolean") {
    return { ok: false, error: "invalid_filters" };
  }
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return { ok: false, error: "invalid_filters" };
  }

  let accountId;
  // An empty/whitespace accountId means "no account filter" (the UI sends "").
  const rawAccountId =
    typeof raw.accountId === "string" ? raw.accountId.trim() : raw.accountId;
  if (rawAccountId !== undefined && rawAccountId !== null && rawAccountId !== "") {
    if (typeof rawAccountId !== "string" || !SF_ID.test(rawAccountId)) {
      return { ok: false, error: "invalid_filters" };
    }
    accountId = rawAccountId;
  }

  return {
    ok: true,
    filters: { ownerOnly, hasPhone, accountId, limit },
  };
}

/**
 * Fetch a Salesforce OAuth access token using the refresh token flow.
 */
export async function fetchSFToken() {
  const clientId = process.env.SF_CLIENT_ID || "";
  const clientSecret = process.env.SF_CLIENT_SECRET || "";
  const refreshToken = process.env.SF_REFRESH_TOKEN || "";
  const loginUrl = process.env.SF_LOGIN_URL || "https://login.salesforce.com";

  if (!clientId || !clientSecret || !refreshToken) {
    return { error: "sf_missing_credentials" };
  }

  const tokenResp = await fetch(loginUrl + "/services/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!tokenResp.ok) {
    return { error: "sf_auth_error" };
  }

  return { accessToken: (await tokenResp.json()).access_token };
}

/**
 * Execute a SOQL query against Salesforce.
 */
export async function queryContacts(accessToken, soql) {
  const instanceUrl =
    process.env.SF_INSTANCE_URL || "https://db0000000d7rdeay.my.salesforce.com";

  const queryUrl =
    instanceUrl + "/services/data/v67.0/query?" + new URLSearchParams({ q: soql });

  const queryResp = await fetch(queryUrl, {
    headers: { Authorization: "Bearer " + accessToken },
    signal: AbortSignal.timeout(30_000),
  });

  if (!queryResp.ok) {
    return { error: "sf_query_error" };
  }

  return { records: (await queryResp.json()).records };
}

/**
 * Read sf_user_id from profiles for the authenticated user (service role).
 */
export async function fetchSfUserId(userId) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return { error: "missing_supabase_config" };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase
    .from("profiles")
    .select("sf_user_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { error: "profile_lookup_failed" };
  }

  return { sfUserId: data?.sf_user_id ?? null };
}

/**
 * POST /api/calls-list — source contacts to call from Salesforce.
 */
export async function POST(request) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

  const user = await verifyJWT(request);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers });
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers });
  }

  const parsed = parseFilters(body);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), { status: 400, headers });
  }

  const { filters } = parsed;
  let sfUserId = null;

  if (filters.ownerOnly) {
    const profileResult = await fetchSfUserId(user.id);
    if (profileResult.error) {
      return new Response(JSON.stringify({ error: "invalid_filters" }), { status: 400, headers });
    }
    if (!profileResult.sfUserId || !SF_ID.test(profileResult.sfUserId)) {
      return new Response(JSON.stringify({ error: "no_sf_user_mapping" }), { status: 400, headers });
    }
    sfUserId = profileResult.sfUserId;
  }

  const tokenResult = await fetchSFToken();
  if (tokenResult.error) {
    return new Response(JSON.stringify({ error: tokenResult.error }), { status: 502, headers });
  }

  const soql = buildSoqlQuery(filters, sfUserId);
  const queryResult = await queryContacts(tokenResult.accessToken, soql);
  if (queryResult.error) {
    return new Response(JSON.stringify({ error: queryResult.error }), { status: 502, headers });
  }

  const contacts = normalizeContacts(queryResult.records);

  return new Response(JSON.stringify({ contacts }), { status: 200, headers });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
