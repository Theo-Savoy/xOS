import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/auth';

// Parcours power dialing dans une séance : l'encart ne s'ouvre que sur clic,
// affiche la file réelle de la séance, le quota du jour et le numéro sortant.
// Aucun appel ne part : le pool exige un poste WebRTC Telnyx, absent en e2e.

const today = new Date().toISOString().slice(0, 10);

const session = {
  id: 1, name: 'Prospection Île-de-France', status: 'active',
  created_at: `${today}T08:00:00Z`, scheduled_for: today,
  session_type: 'prospection', is_owner: true, rdv_goal: 3, members: [],
  engaged_at: `${today}T08:05:00Z`,
};

const contacts = [
  ['Marie Dupont', 'Groupe Vinci', '+33612000001'],
  ['Paul Bernard', 'Eiffage Construction', '+33612000002'],
  ['Sophie Lambert', 'Bouygues TP', '+33612000003'],
  ['Karim Benali', 'Colas Rail', '+33612000004'],
  ['Julie Moreau', 'Spie Batignolles', '+33612000005'],
  ['Thomas Petit', 'NGE Fondations', null],
].map(([contact_name, account_name, phone], i) => ({
  id: i + 1, position: i, sf_contact_id: null, campaign_contact_id: i + 1,
  sf_account_id: null, contact_name, account_name, phone,
  email: null, title: 'Directeur travaux', linkedin_url: null,
  status: 'pending', outcome: null, comments: null, sf_task_id: null,
  sf_event_id: null, called_at: null, attempt_count: 0, marked_npa: false,
}));

function dialerConfig(callsToday: number) {
  return {
    env: 'production', is_dry_run: false, has_caller_id: true,
    has_connection_id: true, has_webhook_public_key: true,
    caller_numbers: [
      { e164: '+33184800001', label: 'Ligne Paris', status: 'active', priority: 0 },
      { e164: '+33478900002', label: 'Ligne Lyon', status: 'active', priority: 1 },
    ],
    entitlement: {
      enabled: true, dry_run: false, calls_day_limit: 50, calls_today: callsToday,
    },
    flags: {
      enabled: true, dry_run: false, budget_session_cents: 300,
      budget_user_day_cents: 1000, budget_org_month_cents: 15000,
      rate_rps: 5, rate_burst: 20,
    },
  };
}

async function openRunner(page: Page, callsToday = 12) {
  await mockAuthenticatedSession(page);
  await page.route('**/api/dialer**', (route) =>
    route.fulfill({ status: 200, json: dialerConfig(callsToday) }));
  await page.route('**/api/calls**', (route) => {
    const url = route.request().url();
    if (url.includes('session_id=')) {
      return route.fulfill({ status: 200, json: { session, contacts } });
    }
    if (url.includes('resource=team')) {
      return route.fulfill({ status: 200, json: { team: [] } });
    }
    return route.fulfill({
      status: 200,
      json: {
        sessions: [{ ...session, contact_count: contacts.length, called_count: 0 }],
        stats: { calls_today: callsToday, calls_week: 40, sessions_active: 1, sessions_completed: 0 },
        recall_count: 0,
      },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Ouvrir Combo' }).click();
  const combo = page.getByRole('dialog', { name: 'Combo' });
  await combo.getByText('Prospection Île-de-France').first().click();
  return combo;
}

test('l’encart power s’ouvre sur clic et décrit la file réelle de la séance', async ({ page }) => {
  const combo = await openRunner(page);
  await expect(combo.getByText(/contacts joignables/)).toHaveCount(0);

  await combo.getByRole('button', { name: 'Power' }).click();

  // 6 contacts, dont un sans numéro : 5 composables.
  await expect(combo.getByText('5 numéros prêts · 1 sans numéro valide')).toBeVisible();
  await expect(combo.getByRole('button', { name: /Lancer 3 appels/ })).toBeEnabled();
  // Le quota n’est affiché que lorsqu’il reste moins de huit compositions.
  await expect(combo.getByText('12/50')).toHaveCount(0);

  // Second clic : l'encart se referme, rien ne reste monté.
  await combo.getByRole('button', { name: 'Power' }).click();
  await expect(combo.getByText('5 numéros prêts · 1 sans numéro valide')).toHaveCount(0);
});

test('le numéro sortant se choisit dans la liste déroulante', async ({ page }) => {
  const combo = await openRunner(page);
  await combo.getByRole('button', { name: 'Power' }).click();

  const caller = combo.getByRole('button', { name: 'Numéro sortant' });
  await expect(caller).toContainText('Ligne Paris');

  await caller.click();
  await combo.getByRole('option', { name: /Ligne Lyon/ }).click();
  await expect(caller).toContainText('Ligne Lyon');
});

test('la limite quotidienne atteinte bloque le lancement', async ({ page }) => {
  const combo = await openRunner(page, 50);
  await combo.getByRole('button', { name: 'Power' }).click();

  await expect(combo.getByText('50/50')).toBeVisible();
  const launch = combo.getByRole('button', { name: /Lancer 3 appels/ });
  await expect(launch).toBeDisabled();
  await expect(launch).toHaveAttribute('title', 'Limite d’appels du jour atteinte');
});
