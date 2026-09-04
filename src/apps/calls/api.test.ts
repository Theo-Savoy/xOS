// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchReports, fetchRunReport, fetchTeam, logCall } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('logCall', () => {
  it('sends resultat with optional recall and do_not_call flags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await logCall('token', 12, 34, 'Appel non décroché', {
      comments: 'Notes',
      recallAt: '2026-07-14',
      doNotCall: false,
    });

    const firstCall = fetchMock.mock.calls[0];
    expect(JSON.parse(String(firstCall?.[1]?.body))).toMatchObject({
      action: 'log_call',
      resultat: 'Appel non décroché',
      comments: 'Notes',
      recall_at: '2026-07-14',
    });
    expect(JSON.parse(String(firstCall?.[1]?.body))).not.toHaveProperty(
      'duration_sec',
    );
    expect(JSON.parse(String(firstCall?.[1]?.body))).not.toHaveProperty(
      'do_not_call',
    );
  });

  it('includes do_not_call when requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await logCall('token', 12, 34, 'Appel non décroché', { doNotCall: true });
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      do_not_call: true,
    });
  });
});

describe('fetchTeam', () => {
  it('loads team members from the calls API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        team: [
          { user_id: 'user-1', label: 'Alice', sf_user_id: '005000000000001' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTeam('token')).resolves.toEqual([
      { user_id: 'user-1', label: 'Alice', sf_user_id: '005000000000001' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/calls?resource=team',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
  });
});

describe('Salesforce reports API', () => {
  it('lists Salesforce reports with the search query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reports: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchReports('token', 'Opps')).resolves.toEqual({
      reports: [],
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: 'list_reports',
      q: 'Opps',
    });
  });

  it('runs a Salesforce report and exposes its run payload', async () => {
    const run = {
      report_id: '00OSb00000C6fZRMAZ',
      contact_ids: [],
      account_ids: ['001000000000001'],
      row_count: 1,
      duplicate_count: 0,
      unusable_count: 0,
      truncated: false,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => run,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchRunReport('token', '00OSb00000C6fZRMAZ'),
    ).resolves.toEqual({ run });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: 'run_report',
      reportId: '00OSb00000C6fZRMAZ',
    });
  });
});
