import { expect, test } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/auth';

// Repro manuel : ouvre Bilan (rôle manager mocké) et maximise la fenêtre.
// Objectif : reproduire le React error #185 (Maximum update depth exceeded)
// au passage en plein écran. Voir branche fix/bilan-fullscreen-react-185.
// Viewport large + dpr Retina : la fenêtre par défaut (1280x820) est nettement
// plus petite que le viewport, donc la maximisation provoque un gros delta de
// taille ; le dpr=2 génère des mesures subpixel (comme l'écran de Théo) qui
// déclenchent la boucle de mesure recharts Legend/Tooltip (issue #7463, fix
// upstream #7671 non publié en stable).
test.use({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 2 });

const PAGES: { id: string; heading: string }[] = [
  { id: 'Synthèse', heading: 'Synthèse' },
  { id: 'Trajectoire', heading: 'Trajectoire' },
  { id: 'Commercial', heading: 'Commercial' },
  { id: 'Produit', heading: 'Produit' },
  { id: 'Marché', heading: 'Marché' },
  { id: 'Diagnostic', heading: 'Diagnostic' },
];

for (const { id, heading } of PAGES) {
  test(`Bilan maximize on ${id} without React #185`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await mockAuthenticatedSession(page);

    // Rôle manager : le profil doit renvoyer 'manager' pour que Bilan soit visible.
    await page.route('**/rest/v1/profiles**', (route) =>
      route.fulfill({
        status: 200,
        json: { id: 'e2e-fake-user-id', role: 'manager' },
      }),
    );
    await page.route('**/api/profile**', (route) =>
      route.fulfill({
        status: 200,
        json: { role: 'manager', sf_user_id: null },
      }),
    );

    const year = (v: number) => ({
      fy: `FY${String(v).slice(2)}`,
      total: 100000 + v * 10000,
      new: 60000 + v * 5000,
      renew: 40000 + v * 5000,
      total_count: 10 + v,
      new_count: 6 + v,
      renew_count: 4 + v,
      detections_new: 8 + v,
      closed_new: 7 + v,
      signatures_new: 6 + v,
      closing_new: 1,
      other: { count: 2, amount: 5000, label: 'Autre' },
      conservation: { ok: true, delta_count: 0, delta_amount: 0 },
    });

    const reviewPayload = (resource: string) => ({
      resource,
      fy: 'FY25',
      compare: 'FY24',
      truncated: false,
      truncated_fys: [],
      conservation: { ok: true, delta_count: 0, delta_amount: 0 },
    });

    // Délai réseau simulé : les données arrivent APRES le maximize, comme sur
    // le terrain de Théo (réseau réel) — les charts se montent pendant que la
    // fenêtre est déjà en plein écran.
    const late = (
      route: { fulfill: (r: { status: number; json: unknown }) => Promise<void> },
      json: unknown,
    ) =>
      new Promise((resolve) =>
        setTimeout(() => resolve(route.fulfill({ status: 200, json })), 400),
      );

    await page.route('**/api/review**', (route) => {
      const url = new URL(route.request().url());
      const resource = url.searchParams.get('resource') ?? 'overview';
      const base = reviewPayload(resource);
      if (resource === 'overview') {
        return late(route, { ...base, series: [2022, 2023, 2024, 2025].map(year) });
      }
      if (resource === 'bridge') {
        return late(route, {
          ...base,
          volume_ticket: {
            volume: 100000,
            ticket: 10000,
            delta: 5,
            prev: { volume: 95000, ticket: 9500, delta: 0 },
            curr: { volume: 100000, ticket: 10000, delta: 5 },
            conservation: { ok: true, delta_amount: 0 },
          },
          owner: {
            active: { label: 'Actifs', prev: 50000, curr: 52000, delta: 4 },
            dg: { label: 'DG', prev: 10000, curr: 11000, delta: 10 },
            departed: { label: 'Partis', prev: 5000, curr: 3000, delta: -40 },
            total: 66000,
            conservation: { ok: true, delta_amount: 0 },
          },
        });
      }
      if (resource === 'synthesis') {
        return late(route, {
          ...base,
          cards: [
            { key: 'ca', label: 'CA', display: '140 k€', value: 140000, scope: 'total' },
            { key: 'new', label: 'Nouvelles affaires', display: '80 k€', value: 80000, scope: 'new' },
            { key: 'renew', label: 'Renouvellements', display: '60 k€', value: 60000, scope: 'total' },
          ],
          patterns: [],
          verdict: 'OK',
          key_point: 'Point clé',
        });
      }
      if (resource === 'commercial') {
        return late(route, {
          ...base,
          sales: [
            {
              ownerId: 'u1', name: 'Alice', mode: 'actif', rdv: 5, weeks: 4,
              rdvPerWeek: 1.25, detections: 8, detectionRate: 0.5,
              closedNew: 7, signaturesNew: 6, closing: 1, ticket: 10000,
              amountNew: 60000,
            },
          ],
          activity: [],
          company: {
            amountNew: 60000,
            signaturesNew: 6,
            detections: 8,
            closedNew: 7,
            closing: 1,
          },
          dg: {},
          capacity: [
            { fy: 'FY24', amountNew: 50000, signaturesNew: 5, detections: 6 },
            { fy: 'FY25', amountNew: 60000, signaturesNew: 6, detections: 8 },
          ],
          ownerBridge: {
            active: { label: 'Actifs', prev: 50000, curr: 52000, delta: 4 },
            dg: { label: 'DG', prev: 10000, curr: 11000, delta: 10 },
            departed: { label: 'Partis', prev: 5000, curr: 3000, delta: -40 },
            total: 66000,
            conservation: { ok: true, delta_amount: 0 },
          },
          productivity: {
            evolution: { caPerFte: null, signaturesPerFte: null, detectionsPerFte: null },
          },
          attribution_limit: '2026-07-01',
          rdv_limit: '2026-07-01',
        });
      }
      if (resource === 'quality') {
        return late(route, {
          ...base,
          tag_mismatch: 1,
          negative_cycles: 0,
          over_365: 2,
          over_730: 1,
          missing_amount: 3,
          won_total: 40,
          created_rows: 100,
          closed_rows: 90,
          n_valid: 35,
          n_won_new: 30,
          limits: ['Limite 1'],
        });
      }
      if (resource === 'definitions') {
        return late(route, { ...base, items: [] });
      }
      return route.fulfill({ status: 200, json: base });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Ouvrir Bilan' }).click();
    const bilan = page.getByRole('dialog', { name: 'Bilan' });
    await expect(bilan).toBeVisible();

    // Navigue vers la page testée.
    if (id !== 'Synthèse') {
      await page.getByRole('button', { name: id, exact: true }).click();
    }
    await expect(
      page.getByRole('heading', { name: heading, level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Maximise puis laisse tourner d'éventuelles boucles de rendu.
    await page.getByRole('button', { name: 'Agrandir Bilan' }).click();
    await page.waitForTimeout(4000);

    expect(errors, `page errors on ${id}: ${errors.join(' | ')}`).toEqual([]);
    await expect(bilan).toBeVisible();
  });
}