// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportSessionView } from './ReportSessionView';
import {
  fetchContactList,
  fetchReports,
  fetchRunReport,
  CallsApiError,
  type SalesforceReportRun,
} from './api';
import type { ContactPreview, TeamMember } from './types';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchContactList: vi.fn(),
    fetchPresets: vi.fn().mockResolvedValue([]),
    fetchReports: vi.fn(),
    fetchRunReport: vi.fn(),
  };
});

afterEach(cleanup);
afterEach(() => vi.clearAllMocks());

const report = {
  id: '00O-report-1',
  name: 'Prospects à rappeler',
  folder_name: 'Équipe commerciale',
  created_date: '2026-09-03T08:00:00.000Z',
};

const contactA: ContactPreview = {
  sf_contact_id: '003-contact-a',
  sf_account_id: '001-account-a',
  contact_name: 'Alice Martin',
  account_name: 'ACME',
  phone: '+33100000001',
  title: 'Directrice commerciale',
  email: 'alice@acme.test',
};

const contactB: ContactPreview = {
  sf_contact_id: '003-contact-b',
  sf_account_id: '001-account-b',
  contact_name: 'Bruno Petit',
  account_name: 'Globex',
  phone: '+33100000002',
  title: 'Responsable achats',
  email: 'bruno@globex.test',
};

const reportRunWithContacts: SalesforceReportRun = {
  report_id: report.id,
  report_name: report.name,
  contact_ids: [contactA.sf_contact_id, contactB.sf_contact_id],
  account_ids: [contactA.sf_account_id!, contactB.sf_account_id!],
  row_count: 2,
  duplicate_contact_count: 0,
  duplicate_account_count: 0,
  unusable_count: 0,
  truncated: false,
};

const team: TeamMember[] = [
  { user_id: 'user-1', label: 'Paul Martin', sf_user_id: '005-user-1' },
  { user_id: 'user-2', label: 'Camille Durand', sf_user_id: '005-user-2' },
];

function renderView() {
  const onCreateAudience = vi.fn();
  const view = render(
    <ReportSessionView
      token="token-123"
      team={team}
      onBack={vi.fn()}
      onCreateAudience={onCreateAudience}
      creating={false}
      createError={null}
    />,
  );
  return { ...view, onCreateAudience };
}

async function chooseAndLoadReport(
  user: ReturnType<typeof userEvent.setup>,
  run: SalesforceReportRun = reportRunWithContacts,
) {
  vi.mocked(fetchReports).mockResolvedValue({ reports: [report] });
  vi.mocked(fetchRunReport).mockResolvedValue({ run });

  renderView();
  await waitFor(() =>
    expect(fetchReports).toHaveBeenCalledWith('token-123', ''),
  );
  const reportRadio = await screen.findByRole('radio', {
    name: report.name,
  });
  await user.click(reportRadio);
  await waitFor(() =>
    expect(fetchRunReport).toHaveBeenCalledWith('token-123', report.id),
  );
}

describe('ReportSessionView', () => {
  it('affiche le chargement pendant le run auto à la sélection', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchReports).mockResolvedValue({ reports: [report] });
    vi.mocked(fetchRunReport).mockReturnValue(new Promise(() => {}));

    renderView();

    await waitFor(() =>
      expect(fetchReports).toHaveBeenCalledWith('token-123', ''),
    );
    await user.click(await screen.findByRole('radio', { name: report.name }));

    expect(
      await screen.findByText('Chargement du rapport…'),
    ).toBeTruthy();
  });

  it('traduit l’erreur de recherche du rapport en message utilisateur', async () => {
    vi.mocked(fetchReports).mockRejectedValue(
      new CallsApiError(400, 'invalid_query'),
    );

    renderView();

    expect(
      await screen.findByText(
        'Réduisez la recherche du rapport à 100 caractères maximum.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Erreur API \(invalid_query\)/)).toBeNull();
  });

  it('n’affiche pas de code API pour une erreur technique inconnue', async () => {
    vi.mocked(fetchReports).mockRejectedValue(
      new CallsApiError(500, 'server_error'),
    );

    renderView();

    expect(
      await screen.findByText('Une erreur est survenue. Réessayez.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Erreur API \(server_error\)/)).toBeNull();
  });

  it('bloque la première étape sans rapport chargé avec des contacts', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchReports).mockResolvedValue({ reports: [report] });
    vi.mocked(fetchRunReport).mockResolvedValue({
      run: {
        ...reportRunWithContacts,
        contact_ids: [],
        account_ids: [],
        row_count: 4,
        unusable_count: 4,
      },
    });

    renderView();

    await waitFor(() =>
      expect(fetchReports).toHaveBeenCalledWith('token-123', ''),
    );
    const continueButton = screen.getByRole('button', {
      name: 'Continuer vers Filtrer →',
    });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('radio', { name: report.name }));

    expect(
      await screen.findByText('Ce rapport n’expose ni contact ni compte'),
    ).toBeTruthy();
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('préserve une sélection manuelle quand la preview est rafraîchie par un filtre', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchContactList)
      .mockResolvedValueOnce({
        contacts: [contactA, contactB],
        dedup: [],
        truncated: false,
      })
      .mockResolvedValueOnce({
        contacts: [contactA, contactB],
        dedup: [],
        truncated: false,
      });

    await chooseAndLoadReport(user);
    await user.click(
      screen.getByRole('button', { name: 'Continuer vers Filtrer →' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Continuer vers Composer →' }),
    );
    await screen.findByRole('checkbox', {
      name: `Sélectionner ${contactB.contact_name}`,
    });
    await user.click(
      screen.getByRole('checkbox', {
        name: `Sélectionner ${contactB.contact_name}`,
      }),
    );

    await user.click(
      screen.getByRole('button', { name: '← Précédent : Filtrer' }),
    );

    await user.click(screen.getAllByText('Entreprise')[0]!);
    await user.click(screen.getByRole('button', { name: 'A' }));
    await user.click(
      screen.getByRole('button', { name: 'Continuer vers Composer →' }),
    );

    await waitFor(() => expect(fetchContactList).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetchContactList).mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({ maxPerCompany: null }),
    );
    expect(vi.mocked(fetchContactList).mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        contact: expect.objectContaining({
          contacts_cibles: reportRunWithContacts.contact_ids,
        }),
        entreprise: expect.objectContaining({ tiers: ['A'] }),
      }),
    );

    expect(
      (
        screen.getByRole('checkbox', {
          name: `Sélectionner ${contactA.contact_name}`,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (
        screen.getByRole('checkbox', {
          name: `Sélectionner ${contactB.contact_name}`,
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it('sépare le filtrage de la composition en quatre étapes', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchContactList).mockResolvedValue({
      contacts: [contactA, contactB],
      dedup: [],
      truncated: false,
    });

    await chooseAndLoadReport(user);

    const stepper = screen.getByRole('navigation', {
      name: 'Étapes de composition de la séance',
    });
    expect(stepper.querySelectorAll('li')).toHaveLength(4);
    expect(stepper.textContent).toContain('Planifier');

    await user.click(
      screen.getByRole('button', { name: 'Continuer vers Filtrer →' }),
    );
    const filterPane = document.querySelector('[data-step="filtrer"]');
    expect(filterPane).toBeTruthy();
    expect(filterPane?.querySelector('.calls-report-source')).toBeNull();
    expect(
      filterPane?.querySelector('.calls-report-preview-summary'),
    ).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Continuer vers Composer →' }),
    );
    const composerPane = document.querySelector('[data-step="composer"]');
    expect(
      composerPane?.querySelector('.calls-report-preview-summary'),
    ).toBeTruthy();
    expect(composerPane?.querySelector('.calls-report-source')).toBeNull();
  });

  it('inclut tous les comptes sélectionnés (aucun écarté) en planification', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchContactList).mockResolvedValue({
      contacts: [contactA, contactB],
      dedup: [],
      truncated: false,
    });

    await chooseAndLoadReport(user);
    await user.click(
      screen.getByRole('button', { name: 'Continuer vers Filtrer →' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Continuer vers Composer →' }),
    );
    await screen.findByRole('checkbox', {
      name: `Sélectionner ${contactB.contact_name}`,
    });
    await user.click(
      screen.getByRole('button', { name: 'Continuer vers Planifier →' }),
    );

    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Taille cible par séance' }),
      {
        target: { value: '1' },
      },
    );
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Nombre max de séances' }),
      {
        target: { value: '1' },
      },
    );

    // Le packing s'ajuste : tout doit être inclus, aucun message d'écart.
    expect(screen.getByText('Séance #1')).toBeTruthy();
    expect(screen.queryByText(/compte écarté/)).toBeNull();
    await waitFor(() => expect(screen.getByText(/Séance #2/)).toBeTruthy());
  });

  it('appelle onCreateAudience avec le payload de groupes et le type de séance', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchContactList).mockResolvedValue({
      contacts: [contactA, contactB],
      dedup: [],
      truncated: false,
    });

    const { onCreateAudience } = renderView();
    await waitFor(() =>
      expect(fetchReports).toHaveBeenCalledWith('token-123', ''),
    );
    await user.click(screen.getByRole('radio', { name: report.name }));
    await waitFor(() =>
      expect(fetchRunReport).toHaveBeenCalledWith('token-123', report.id),
    );
    await user.click(
      screen.getByRole('button', { name: 'Continuer vers Filtrer →' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Continuer vers Composer →' }),
    );
    await screen.findByRole('checkbox', {
      name: `Sélectionner ${contactB.contact_name}`,
    });
    await user.click(
      screen.getByRole('button', { name: 'Continuer vers Planifier →' }),
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Nom des séances (préfixe)' }), {
      target: { value: 'Rapport Prospects' },
    });
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Taille cible par séance' }),
      { target: { value: '5' } },
    );
    await user.click(
      screen.getByRole('button', { name: /Créer .* séance.* Rapport/ }),
    );

    await waitFor(() => expect(onCreateAudience).toHaveBeenCalledTimes(1));
    expect(onCreateAudience).toHaveBeenCalledWith(
      expect.objectContaining({
        namePrefix: 'Rapport Prospects',
        sessionType: 'prospection',
        groups: expect.any(Array),
        targetSize: 5,
      }),
    );
  });
});
