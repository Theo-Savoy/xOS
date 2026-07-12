# Labo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` task-by-task. Alaric remains coordinator; workers implement code and return evidence through Orca `worker_done`.

**Goal:** Replace the legacy CRM Cleaner iframe with native, modular Labo UI that preserves every legacy capability, migrates history to Supabase, and establishes the first reusable module.

**Architecture:** Modular monolith with a typed React shell and vertical module slices. One exposed Vercel function delegates to focused handlers under `api/_cleaner/`; Salesforce access stays behind `api/_crm/`. Every write follows preview → confirmation → idempotent execute → audit.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 4, Testing Library, Node Vercel functions, Supabase Postgres, Salesforce REST/SOQL, existing X OS design system.

## Global Constraints

- Canonical design: `docs/specs/labo.md`.
- V1 implements only the Opportunités module, but the shell must support later modules without modification.
- Full legacy parity is a release gate, not a best effort.
- Inactivity alone never enters Labo; it only enriches an already anomalous record.
- Commercials can read/write only their own opportunities; managers/admins can use team scope.
- Salesforce field names and org values live only in `api/_crm/mapping.js`.
- One public Vercel route: `api/cleaner.js`; internal files remain under `api/_cleaner/`.
- No new global state library, generic JSON UI engine, microfrontend, remote plugin or silent failure.
- Do not edit unrelated files currently modified by other work in `src/os`, `src/apps/calls`, `src/lib/database.types.ts`, or migration `020` unless the task explicitly requires a coordinated rebase.
- Production deployment, live Salesforce writes, blob deletion and migration execution require explicit approval from Théo.
- Exact model identifiers for “Sonnet 5” and “Minimax M3” must be verified against the local CLIs before dispatch; the human-readable names are not proof of availability.

---

## 1. Orca execution strategy

### 1.1 Canonical lifecycle

For every supervised implementation lot:

```text
task-create → dispatch --inject → check --wait --types worker_done,escalation,decision_gate → independent diff/tests
```

- One writer owns a file at a time.
- Review-only workers must not edit.
- Briefs longer than 500 characters live in a versioned file; the task headline points to it.
- A `worker_done` claim is accepted only after `git status`, `git diff --stat`, full-region review and fresh tests.
- No production deploy, data migration, data deletion or external communication without explicit approval.

### 1.2 Worker routing

Preferred implementation workers, as requested by Théo:

- Claude Code with Sonnet 5 for contracts, backend and migrations.
- OpenCode with Minimax M3 for bounded React components and tests.
- Cline with Minimax M3 for bounded React/CSS implementation and fixture-based tests.

Before first dispatch, verify actual CLI/model IDs with the installed commands. If a requested model is unavailable, stop and report the typed blocker; do not silently substitute a stronger or different model.

### 1.3 Foederati pilot

Use Foederati for **one bounded, reversible first code lot**: Task 2 (domain contracts and pure rules), in its own worktree. Acceptance of the plugin requires:

1. worktree and agent/model are visible and correct;
2. failure classes surface in under 30 seconds;
3. the produced diff is retrievable;
4. no writes escape the worktree;
5. tests run and output is available to Alaric.

If one criterion fails, stop the pilot and execute all remaining lots through canonical Orca dispatch. Never run Foederati and a second worker on the same task concurrently.

---

### Task 1: Freeze the legacy parity fixtures and audit the real data volume

**Objective:** Turn the legacy behavior into executable fixtures and measure the Salesforce query shape before redesigning it.

**Files:**

- Create: `docs/audits/lot-10.0-cleaner-v2.md`
- Create: `scripts/audit/cleaner_v2_audit.py`
- Create: `api/_cleaner/opportunities/__fixtures__/legacy-opportunities.json`
- Create: `api/_cleaner/opportunities/__fixtures__/legacy-meta.json`
- Create: `api/_cleaner/opportunities/parity.test.js`
- Read only: `public/dashboard.html`, `api/refresh.py`, `api/update.js`, `api/history.js`

**Interfaces:**

- Produces fixture records containing every legacy anomaly and action edge case.
- Produces measured counts for open opportunities, returned anomaly candidates, inactive owners, stages and picklist metadata.
- Produces the completed parity matrix copied from `docs/specs/labo.md` §11.

- [ ] Extract representative, anonymized fixture shapes from the legacy response contract; never copy tokens or confidential free text.
- [ ] Write a failing parity test that enumerates every required rule ID and every legacy bulk action.
- [ ] Run `npm test -- api/_cleaner/opportunities/parity.test.js`; expected: FAIL because v2 rules do not exist.
- [ ] Implement the read-only audit using the existing environment loader pattern from `scripts/audit/`.
- [ ] Run `python3 -m py_compile scripts/audit/cleaner_v2_audit.py`.
- [ ] With approval and credentials available, run the audit read-only and record actual volumes; otherwise mark the audit execution as blocked, never invent counts.
- [ ] Review the audit for Salesforce semi-join limits, pagination and expected payload size.

**Gate:** fixture coverage maps every line of the parity matrix; audit script compiles; no production writes.

---

### Task 2: Create domain contracts, settings and pure opportunity rules

**Objective:** Implement typed DTOs and deterministic rules independently from HTTP, React and Salesforce.

**Files:**

- Create: `api/_cleaner/opportunities/rules.js`
- Create: `api/_cleaner/opportunities/score.js`
- Create: `api/_cleaner/opportunities/rules.test.js`
- Create: `api/_cleaner/core/settings.js`
- Create: `api/_cleaner/core/settings.test.js`
- Modify: `api/_crm/mapping.js`
- Create: `src/apps/cleaner/contracts.ts`
- Create: `src/apps/cleaner/modules/opportunities/types.ts`

**Interfaces:**

```js
export function detectOpportunityAnomalies(opportunity, context) {}
export function scoreOpportunity(anomalies, opportunity, thresholds) {}
export function normalizeCleanerSettings(rows) {}
```

```ts
export type CleanerAnomaly = {
  ruleId: string;
  severity: 'warning' | 'critical';
  score: number;
  label: string;
  evidence: Array<{
    field: string;
    actual: string | number | null;
    expected: string;
  }>;
};
```

- [ ] Add failing tests for each stable rule ID, including negative tests proving inactivity alone returns no anomaly.
- [ ] Run `npm test -- api/_cleaner/opportunities/rules.test.js api/_cleaner/core/settings.test.js`; expected: FAIL.
- [ ] Extend `mapping.objects.opportunity` with missing field mappings used by the legacy Cleaner: account relation fields, owner activity, sale type, loss reason and any describe metadata key. Do not hard-code those names in rules.
- [ ] Implement settings defaults and strict normalization; invalid stored settings fall back with an explicit warning result.
- [ ] Implement pure detection and scoring functions with an injectable `today`.
- [ ] Run focused tests; expected: PASS.
- [ ] Re-run the Task 1 parity test; expected: rule coverage passes while HTTP/UI expectations remain pending.

**Gate:** deterministic tests cover all legacy classifications; inactivity-only negative assertion passes; no network calls inside rule functions.

---

### Task 3: Add Labo persistence, idempotency and legacy history import

**Objective:** Make Supabase the only v2 history and command store while preserving every Blob history entry.

**Files:**

- Create: `supabase/migrations/021_cleaner_v2.sql` (renumber if another migration lands first)
- Create: `api/_cleaner/core/audit.js`
- Create: `api/_cleaner/core/audit.test.js`
- Create: `api/_cleaner/core/idempotency.js`
- Create: `api/_cleaner/core/idempotency.test.js`
- Create: `scripts/migrate-cleaner-history.js`
- Create: `scripts/migrate-cleaner-history.test.js`
- Modify after rebasing concurrent work: `src/lib/database.types.ts`

**Interfaces:**

```js
export async function journalCleanerAction(client, entry) {}
export async function reserveCommand(
  client,
  { actorId, idempotencyKey, fingerprint },
) {}
export async function listCleanerHistory(client, query) {}
```

Migration additions must support:

- `source` and deterministic `source_id` for legacy import;
- `module_id`, `command_id` and `idempotency_key` for Labo queries;
- uniqueness constraints that make re-import and double execution impossible;
- indexes for module/date/actor queries.
- nullable `action_journal.actor` only for actor-less legacy imports; application code must reject a missing actor for every new Labo action;
- `cleaner_commands` for preview expiry, fingerprint, command status, idempotency and replayed result;
- `cleaner_action_targets` for one normalized target row with Salesforce owner, before/after and per-record result.

- [ ] Write migration contract tests or SQL assertions before the migration.
- [ ] Write importer tests with duplicate pathnames, partial failures and a second identical run.
- [ ] Run focused tests; expected: FAIL.
- [ ] Implement migration and helpers without changing existing `action_journal` producers.
- [ ] Regenerate or update Supabase types only after the concurrent desktop-shortcuts migration work is merged; preserve every unrelated generated type.
- [ ] Label actor-less imports `Legacy CRM Cleaner`; expose them only to manager/admin history. Commercial history is scoped through `cleaner_action_targets.sf_owner_id` and the authenticated actor.
- [ ] Implement `--dry-run`, `--limit`, source/target counts and non-zero exit on mismatch.
- [ ] Run `node scripts/migrate-cleaner-history.js --dry-run` only when required env vars exist; otherwise verify fixtures and report the concrete missing prerequisites.
- [ ] Never delete Blob data in this task.

**Gate:** second fixture import inserts zero rows; journal failures are returned to callers rather than swallowed.

---

### Task 4: Build authorization, workspace reads and analytics

**Objective:** Serve a role-scoped, paginated Salesforce workspace and matching analytics from one truth.

**Files:**

- Create: `api/_cleaner/core/authorization.js`
- Create: `api/_cleaner/core/authorization.test.js`
- Create: `api/_cleaner/core/errors.js`
- Create: `api/_cleaner/core/validation.js`
- Create: `api/_cleaner/opportunities/read.js`
- Create: `api/_cleaner/opportunities/read.test.js`
- Create: `api/_cleaner/opportunities/analytics.js`
- Create: `api/_cleaner/opportunities/analytics.test.js`
- Create: `api/cleaner.js`
- Create: `api/cleaner.test.js`

**Interfaces:**

```js
export async function loadOpportunityWorkspace(context) {}
export function computeOpportunityAnalytics(items, history, period) {}
export function capabilitiesForRole(role) {}
```

GET contracts:

```text
/api/cleaner?module=opportunities&resource=workspace
/api/cleaner?module=opportunities&resource=analytics
/api/cleaner?module=opportunities&resource=history&cursor=...
```

- [ ] Write failing API tests for 401, commercial self-scope, manager team-scope, invalid resource, pagination and timeout.
- [ ] Write analytics tests matching the legacy owner/stage/overdue/reason fixtures plus evolution/resolution metrics.
- [ ] Run focused tests; expected: FAIL.
- [ ] Implement a thin `api/cleaner.js` route that only authenticates, builds context and delegates.
- [ ] Query all required Salesforce pages through `api/_crm/salesforce.js`; cache only raw org data for a short bounded duration.
- [ ] Filter commercial scope after the shared raw cache and before response construction.
- [ ] Return `Cache-Control: private, no-store` for personalized responses.
- [ ] Run focused tests and `node --check api/cleaner.js`.

**Gate:** a commercial cannot obtain another owner’s record by changing query parameters; analytics totals match workspace items.

---

### Task 5: Implement server-side preview and idempotent execute

**Objective:** Replace direct bulk writes with an authoritative two-step command flow.

**Files:**

- Create: `api/_cleaner/opportunities/preview.js`
- Create: `api/_cleaner/opportunities/preview.test.js`
- Create: `api/_cleaner/opportunities/execute.js`
- Create: `api/_cleaner/opportunities/execute.test.js`
- Modify: `api/cleaner.js`

**Interfaces:**

```js
export async function previewOpportunityCommand(context, input) {}
export async function executeOpportunityCommand(context, input) {}
```

Preview output:

```json
{
  "previewId": "...",
  "fingerprint": "...",
  "expiresAt": "...",
  "changes": {},
  "eligible": [],
  "excluded": [{ "id": "...", "reason": "..." }]
}
```

- [ ] Write failing tests for owner/date/stage/sale type changes, account-owner reassignment, close-lost picklist compatibility, unauthorized IDs, stale data and >200 records.
- [ ] Write failing execute tests for stale preview, duplicate key, partial Salesforce results and audit failure.
- [ ] Run focused tests; expected: FAIL.
- [ ] Implement preview by re-reading authoritative records and metadata; never trust display fields from React.
- [ ] Implement execute with the user’s Salesforce token when available and existing integration fallback.
- [ ] Chunk more than 200 Salesforce updates into batches of at most 200 under the same command/idempotency key, then aggregate all per-record outcomes.
- [ ] Reserve idempotency before Salesforce write and return the prior result on an exact retry.
- [ ] Persist before/after and per-record outcomes in `action_journal`.
- [ ] Run focused API tests and the parity test.

**Gate:** duplicate execute performs at most one Salesforce write; stale preview performs zero writes; partial errors remain explicit.

---

### Task 6: Build the Labo shell, cockpit and module tabs

**Objective:** Replace the iframe boundary with a native shell that can host current and future modules.

**Files:**

- Rewrite: `src/apps/cleaner/CleanerApp.tsx`
- Rewrite: `src/apps/cleaner/CleanerApp.test.tsx`
- Create: `src/apps/cleaner/shell/CleanerShell.tsx`
- Create: `src/apps/cleaner/shell/CleanerShell.test.tsx`
- Create: `src/apps/cleaner/shell/CleanerCockpit.tsx`
- Create: `src/apps/cleaner/shell/CleanerTabs.tsx`
- Create: `src/apps/cleaner/shell/moduleRegistry.ts`
- Create: `src/apps/cleaner/shell/shellState.ts`
- Create: `src/apps/cleaner/cleaner.css`
- Modify: `src/os/registry.tsx` only if the default size must change

**Interfaces:**

```ts
export type CleanerModuleId = 'opportunities';
export type CleanerTabState = {
  open: CleanerModuleId[];
  active: 'home' | CleanerModuleId;
};
```

- [ ] Write failing tests: home fixed, one tab per module, reopen activates existing tab, close does not duplicate or delete state, role hides forbidden modules.
- [ ] Write failing cockpit tests for factual totals, module ordering by criticality, loading/empty/error states and no global health score.
- [ ] Run focused tests; expected: FAIL.
- [ ] Implement shell with React state only; persist session state using the existing X OS local storage conventions.
- [ ] Lazy-load module components from a static typed registry.
- [ ] Implement cockpit summaries without importing Opportunity-specific types.
- [ ] Run focused tests and `npm run build`.

**Gate:** no iframe or `postMessage` remains in `CleanerApp`; shell tests pass at default and minimum window sizes.

---

### Task 7: Build the Opportunities Nettoyage view and detail panel

**Objective:** Deliver the full table/filter/selection parity and lightweight detail flow.

**Files:**

- Create: `src/apps/cleaner/modules/opportunities/manifest.ts`
- Create: `src/apps/cleaner/modules/opportunities/api.ts`
- Create: `src/apps/cleaner/modules/opportunities/OpportunitiesModule.tsx`
- Create: `src/apps/cleaner/modules/opportunities/OpportunitiesCleaningView.tsx`
- Create: `src/apps/cleaner/modules/opportunities/OpportunitiesTable.tsx`
- Create: `src/apps/cleaner/modules/opportunities/OpportunitiesFilters.tsx`
- Create: `src/apps/cleaner/modules/opportunities/OpportunityDetailPanel.tsx`
- Create: `src/apps/cleaner/modules/opportunities/filterState.ts`
- Create corresponding `*.test.tsx` files
- Modify: `src/apps/cleaner/cleaner.css`

**Interfaces:**

```ts
export type OpportunityWorkspaceState = {
  filters: OpportunityFilters;
  sort: { key: OpportunitySortKey; direction: 'asc' | 'desc' };
  page: number;
  selectedIds: Set<string>;
  activeView: 'cleaning' | 'analytics' | 'history';
};
```

- [ ] Write failing tests for all columns, search, sort, pagination, owner/category/sale-type filters and reason-family OU/ET semantics.
- [ ] Write failing selection tests for one row, current page, all filtered records and persistence across pagination/view switches.
- [ ] Write failing detail tests proving row content opens the panel while checkbox clicks do not.
- [ ] Run focused tests; expected: FAIL.
- [ ] Implement B1 compact KPI strip; KPI clicks apply filters.
- [ ] Implement category counts, filters and dominant table layout using existing X OS tokens/components.
- [ ] Implement detail panel with evidence, values, history and Salesforce link.
- [ ] Run focused tests and visual QA in a live Vite window.

**Gate:** all legacy read/filter/select rows in the parity matrix pass; multi-select flow remains available while the detail panel is open or closed.

---

### Task 8: Build bulk action UI and preview/execute flow

**Objective:** Preserve all legacy corrections while making exclusions, confirmation and partial results explicit.

**Files:**

- Create: `src/apps/cleaner/modules/opportunities/BulkActionBar.tsx`
- Create: `src/apps/cleaner/modules/opportunities/BulkActionPanel.tsx`
- Create: `src/apps/cleaner/modules/opportunities/BulkActionPreview.tsx`
- Create corresponding `*.test.tsx` files
- Modify: `src/apps/cleaner/modules/opportunities/api.ts`
- Modify: `src/apps/cleaner/modules/opportunities/OpportunitiesCleaningView.tsx`
- Modify: `src/apps/cleaner/cleaner.css`

- [ ] Write failing tests for sticky selection count, multi-field changes, account owner, close-lost reason, loading lock and cancel.
- [ ] Write failing tests for preview exclusions, stale preview, partial result and retry with the same idempotency key.
- [ ] Run focused tests; expected: FAIL.
- [ ] Implement short actions: Modifier, Réattribuer, Clore en perdue, Désélectionner.
- [ ] Implement the panel fields from live Salesforce metadata; empty fields mean unchanged.
- [ ] Require preview before execute; show exact eligible/excluded counts and reasons.
- [ ] Preserve failed IDs and clear successful IDs after partial execute.
- [ ] Run focused tests and full API tests.

**Gate:** no client path calls Salesforce update without preview; every legacy write action is represented in the parity matrix.

---

### Task 9: Build Synthèse, Historique and Hub settings

**Objective:** Restore all legacy analyses, add factual trends, expose migrated history and manage thresholds through Hub.

**Files:**

- Create: `src/apps/cleaner/modules/opportunities/OpportunitiesAnalyticsView.tsx`
- Create: `src/apps/cleaner/modules/opportunities/OpportunitiesHistoryView.tsx`
- Create corresponding `*.test.tsx` files
- Modify: `src/apps/hub/HubApp.tsx`
- Modify: `src/apps/hub/HubApp.test.tsx`
- Modify: `api/status.js`
- Modify: `api/status.test.js`
- Modify: `src/apps/cleaner/cleaner.css`

- [ ] Write failing analytics tests for owner/stage/overdue/reason distributions and navigation back to filtered Nettoyage.
- [ ] Write failing trend tests for anomaly evolution, corrections and resolution rate without a global health score.
- [ ] Write failing history tests for pagination, actor, before/after, outcomes and role scope.
- [ ] Write failing Hub tests for validated Labo settings and commercial refusal.
- [ ] Run focused tests; expected: FAIL.
- [ ] Implement analyses using existing Recharts dependency where a chart improves reading; use tables where values matter more than shape.
- [ ] Implement history from `action_journal`, not Blob.
- [ ] Implement the typed `cleaner_v2` settings editor and remove `cleaner_late_days`; use the exact defaults and bounds from `docs/specs/labo.md` §6.1.
- [ ] Run focused tests and visual QA.

**Gate:** all four legacy analysis families are present; every chart/table can navigate to the matching filtered work queue.

---

### Task 10: Migrate, cut over, remove legacy and update canonical documentation

**Objective:** Prove parity, switch X OS to v2 and remove dead legacy surfaces without collateral changes.

**Files:**

- Delete after gate: `public/dashboard.html`
- Delete after gate: `api/refresh.py`
- Delete after gate: `api/update.js`
- Delete after gate: `api/history.js`
- Delete after gate: `api/version.js`
- Modify: `middleware.js`
- Modify: `middleware.test.js`
- Modify: `README.md`
- Modify: `docs/xos_portal_plan.md`
- Modify: `docs/xos_implementation_plan.md`
- Modify: `docs/ops/vercel-functions.md`
- Modify tests and docs that still assert iframe/legacy endpoint behavior

- [ ] Run the complete parity matrix before deleting anything; expected: all rows PASS.
- [ ] Run history migration `--dry-run` and compare counts.
- [ ] Request explicit approval for real migration and any live Salesforce smoke records.
- [ ] Execute migration only after approval; run the importer a second time and verify zero inserts.
- [ ] Switch registry/Launcher deep-link behavior and verify `/clean?q=` opens the native module filtered.
- [ ] Search runtime code for `/dashboard.html`, `/api/refresh`, `/api/update`, `/api/history`, `/api/version`; expected: zero runtime references.
- [ ] Delete legacy files only after the preceding gates and explicit scope confirmation.
- [ ] Update middleware protection and Vercel function inventory.
- [ ] Run fresh full verification:

```bash
npm run test
npm run lint
npm run build
npx prettier --check .
git diff --check
node --check api/cleaner.js
```

- [ ] Start the built app and visually exercise cockpit → Opportunités → Nettoyage/Synthèse/Historique → detail → preview.
- [ ] Verify `git status --short` contains only Task 10 scope and required preceding merged files.

**Gate:** no legacy runtime dependency remains; all tests/lint/build/format checks pass; real migration counts match; no production deployment performed without approval.

---

## 2. Dependency graph and recommended waves

```text
Task 1 audit/parity
  └── Task 2 contracts/rules [Foederati pilot]
       ├── Task 3 persistence/migration
       └── Task 4 reads/analytics
            └── Task 5 preview/execute
       └── Task 6 shell/cockpit
            └── Task 7 Nettoyage/detail
                 └── Task 8 bulk actions
Task 3 + Task 7 ──> Task 9 Synthèse/history/settings
Task 5 + Task 6 + Task 8 + Task 9 ──> Task 10 cutover
```

Permitted parallelism:

- Tasks 3 and 4 after Task 2, with disjoint file ownership.
- Task 6 may run alongside Tasks 3–5 using fixtures and frozen contracts.
- All tasks touching `cleaner.css` or the same React module are serialized.
- Task 10 is always last.

## 3. Final acceptance checklist

- [ ] V1 has cockpit, one-tab-per-module navigation and the Opportunités module.
- [ ] Nettoyage, Synthèse and Historique are complete.
- [ ] Every legacy capability has an automated test or explicit live verification.
- [ ] Inactivity-only opportunities are absent from Labo.
- [ ] Commercial/server scope and manager/team scope are proven.
- [ ] Preview/execute/idempotency and partial failures are proven.
- [ ] Blob history is imported exactly once into Supabase.
- [ ] `/clean?q=` works with the native module.
- [ ] Legacy files/routes are removed only after parity and approval gates.
- [ ] Full test, lint, build, format and diff checks pass on a clean re-run.
- [ ] No unrelated concurrent workspace files are included.
