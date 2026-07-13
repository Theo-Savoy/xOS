// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpportunitiesHistoryView } from './OpportunitiesHistoryView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OpportunitiesHistoryView', () => {
  it('renders audit before/after, outcome, replay and paginates without duplicating rows', async () => {
    const first = {
      id: 2,
      actor: 'ada',
      at: '2026-07-13T09:00:00Z',
      module_id: 'opportunities',
      action_type: 'update_stage',
      source: 'labo',
      command_id: 'cmd-2',
      idempotency_key: 'idem-2',
      cleaner_action_targets: [
        {
          sf_record_id: 'opp-2',
          before_state: { StageName: 'Prospection' },
          after_state: { StageName: 'Qualification' },
          success: true,
          error: null,
        },
      ],
      result: { updated: 1 },
    };
    const second = {
      id: 1,
      actor: null,
      actor_label: 'Legacy CRM Cleaner',
      at: '2026-07-12T09:00:00Z',
      module_id: 'opportunities',
      action_type: 'legacy_update',
      source: 'legacy_blob',
      cleaner_action_targets: [
        {
          sf_record_id: 'opp-1',
          before_state: { StageName: 'Old' },
          after_state: { StageName: 'New' },
          success: false,
          error: 'Refus Salesforce',
        },
      ],
      result: { failed: 1 },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [first], nextCursor: 'next-1' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [second], nextCursor: null }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [first], nextCursor: 'next-1' }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<OpportunitiesHistoryView accessToken="token" />);

    expect(await screen.findByText('update_stage')).toBeTruthy();
    expect(screen.getByText(/Prospection/)).toBeTruthy();
    expect(screen.getByText(/Qualification/)).toBeTruthy();
    expect(screen.getByText(/idem-2/)).toBeTruthy();
    expect(screen.getAllByText(/réussi/i).length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole('button', { name: /page suivante/i }));
    await waitFor(() =>
      expect(screen.getAllByText('Legacy CRM Cleaner').length).toBeGreaterThan(
        1,
      ),
    );
    expect(screen.queryByText('update_stage')).toBeNull();
    expect(screen.getAllByText(/Refus Salesforce/).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: /page précédente/i }));
    await waitFor(() => expect(screen.getByText('update_stage')).toBeTruthy());
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/cleaner?module=opportunities&resource=history&limit=25',
      expect.any(Object),
    );
  });

  it('keeps the commercial view limited to rows returned by the scoped backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 1,
                actor: 'commercial-1',
                actor_label: 'Commercial',
                module_id: 'opportunities',
                action_type: 'own_action',
                cleaner_action_targets: [],
              },
            ],
            nextCursor: null,
          }),
          { status: 200 },
        ),
      ),
    );
    render(<OpportunitiesHistoryView accessToken="token" role="commercial" />);
    expect(await screen.findByText('own_action')).toBeTruthy();
    expect(screen.queryByText('Legacy CRM Cleaner')).toBeNull();
  });

  it('explains that history will appear after the first command when selected opportunities have no entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
        }),
      ),
    );

    render(
      <OpportunitiesHistoryView
        accessToken="token"
        selectedOpportunityCount={2}
      />,
    );

    expect(
      await screen.findByText(
        "Pas encore d'historique pour vos opportunités — vos actions apparaîtront ici après la première commande.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText('Aucune action dans votre périmètre.'),
    ).toBeNull();
  });

  it('shows the schema-cache recovery hint when history reports schema_cache', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'schema_cache',
            message: 'Le schéma est indisponible.',
          }),
          { status: 500 },
        ),
      ),
    );

    render(<OpportunitiesHistoryView accessToken="token" />);

    expect(
      await screen.findByText(
        'Le cache du schéma Supabase n’est pas à jour. Appliquez la migration 026_reload_postgrest_schema.sql puis réessayez.',
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', {
          name: 'supabase/migrations/026_reload_postgrest_schema.sql',
        })
        .getAttribute('href'),
    ).toBe('/supabase/migrations/026_reload_postgrest_schema.sql');
  });
});
