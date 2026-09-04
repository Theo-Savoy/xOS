import { beforeEach, describe, expect, it, vi } from 'vitest';
import reportContactsActivation from './__fixtures__/sf-reports/report-contacts-activation.json';
import reportSummary from './__fixtures__/sf-reports/report-summary.json';
import reportTabularOpps from './__fixtures__/sf-reports/report-tabular-opps.json';

const { mockFetchSFToken, mockListReports, mockRunReport } = vi.hoisted(() => ({
  mockFetchSFToken: vi.fn(),
  mockListReports: vi.fn(),
  mockRunReport: vi.fn(),
}));

vi.mock('../_crm/salesforce.js', () => ({
  fetchSFToken: mockFetchSFToken,
  listReports: mockListReports,
  runReport: mockRunReport,
}));

import {
  extractReportIds,
  listReportsAction,
  runReportAction,
} from './reports.js';

const CLIENT = { from: vi.fn() };
const USER_ID = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchSFToken.mockResolvedValue({ accessToken: 'sf-token' });
});

describe('extractReportIds', () => {
  it('extracts account ids from every summary factMap group', () => {
    expect(extractReportIds(reportSummary)).toMatchObject({
      contact_ids: [],
      account_ids: [
        '001ANON000174XX',
        '001ANON000141XX',
        '001ANON000178XX',
        '001ANON000491XX',
        '001ANON000157XX',
        '001ANON000094XX',
      ],
      row_count: 6,
      duplicate_contact_count: 0,
      duplicate_account_count: 0,
      unusable_count: 0,
      truncated: false,
    });
  });

  it('extracts and deduplicates the real contacts activation report', () => {
    const result = extractReportIds(reportContactsActivation);

    expect(result.row_count).toBe(364);
    expect(result.contact_ids).toHaveLength(364);
    expect(result.account_ids).toHaveLength(310);
    expect(result.duplicate_contact_count).toBe(0);
    expect(result.duplicate_account_count).toBe(54);
    expect(result.unusable_count).toBe(0);
    expect(result.contact_ids[0]).toBe('003ANON000001XX');
    expect(result.account_ids[0]).toBe('001ANON000163XX');
  });

  it('marks a report as truncated when Salesforce says allData is false', () => {
    expect(
      extractReportIds({ ...reportTabularOpps, allData: false }).truncated,
    ).toBe(true);
  });

  it('counts rows without an exploitable contact or account id', () => {
    const payload = {
      ...reportTabularOpps,
      factMap: {
        ...reportTabularOpps.factMap,
        'T!T': {
          ...reportTabularOpps.factMap['T!T'],
          rows: [
            ...reportTabularOpps.factMap['T!T'].rows,
            { dataCells: [{ label: 'No Salesforce id', value: 'not-an-id' }] },
          ],
        },
      },
    };

    expect(extractReportIds(payload)).toMatchObject({
      row_count: 267,
      unusable_count: 1,
    });
  });

  it('compares 15 and 18 character ids as the same record', () => {
    const payload = {
      allData: true,
      factMap: {
        '0!T': {
          rows: [
            {
              dataCells: [
                { value: '003ANON000001XX' }, // 15 chars
                { value: '001ANON000163XX' },
              ],
            },
            {
              dataCells: [
                { value: '003ANON000001XXXXX' }, // 18 chars — même record
                { value: '001ANON000163XXXXX' },
              ],
            },
          ],
        },
      },
    };

    expect(extractReportIds(payload)).toMatchObject({
      contact_ids: ['003ANON000001XX'],
      account_ids: ['001ANON000163XX'],
      row_count: 2,
      duplicate_contact_count: 1,
      duplicate_account_count: 1,
    });
  });
});

describe('listReportsAction', () => {
  it('rejects a non-string report query', async () => {
    await expect(
      listReportsAction(CLIENT, USER_ID, { q: 42 }),
    ).resolves.toEqual({ error: 'invalid_query', status: 400 });
    expect(mockFetchSFToken).not.toHaveBeenCalled();
  });

  it('rejects a report query longer than 100 characters', async () => {
    await expect(
      listReportsAction(CLIENT, USER_ID, { q: 'x'.repeat(101) }),
    ).resolves.toEqual({ error: 'invalid_query', status: 400 });
  });

  it('returns the report catalog using the user Salesforce token', async () => {
    mockListReports.mockResolvedValue({
      reports: [
        {
          id: '00OSb00000C6fZRMAZ',
          name: 'XOS — Opps créées par semaine',
          folder_name: 'Public Reports',
          last_run_date: '2026-09-03T08:00:00.000+0000',
        },
      ],
    });

    await expect(
      listReportsAction(CLIENT, USER_ID, { q: 'Opps' }),
    ).resolves.toEqual({
      reports: [
        {
          id: '00OSb00000C6fZRMAZ',
          name: 'XOS — Opps créées par semaine',
          folder_name: 'Public Reports',
          last_run_date: '2026-09-03T08:00:00.000+0000',
        },
      ],
    });
    expect(mockFetchSFToken).toHaveBeenCalledWith({
      client: CLIENT,
      userId: USER_ID,
    });
    expect(mockListReports).toHaveBeenCalledWith('sf-token', { q: 'Opps' });
  });

  it('maps Salesforce authentication failures to a gateway error', async () => {
    mockFetchSFToken.mockResolvedValue({ error: 'sf_auth_error' });

    await expect(listReportsAction(CLIENT, USER_ID, {})).resolves.toEqual({
      error: 'sf_auth_error',
      status: 502,
    });
    expect(mockListReports).not.toHaveBeenCalled();
  });
});

describe('runReportAction', () => {
  it('rejects a missing or malformed Salesforce report id', async () => {
    await expect(
      runReportAction(CLIENT, USER_ID, { reportId: 'not-an-id' }),
    ).resolves.toEqual({ error: 'invalid_report_id', status: 400 });
    expect(mockFetchSFToken).not.toHaveBeenCalled();
  });

  it('runs a report and returns its extracted ids and counters', async () => {
    mockRunReport.mockResolvedValue(reportContactsActivation);

    await expect(
      runReportAction(CLIENT, USER_ID, {
        reportId: '00OIV00000dqkbN2AQ',
      }),
    ).resolves.toEqual({
      report_id: '00OIV00000dqkbN2AQ',
      report_name: 'Contacts à activer',
      contact_ids: expect.arrayContaining(['003ANON000001XX']),
      account_ids: expect.arrayContaining(['001ANON000163XX']),
      row_count: 364,
      duplicate_contact_count: 0,
      duplicate_account_count: 54,
      unusable_count: 0,
      truncated: false,
    });
    expect(mockRunReport).toHaveBeenCalledWith(
      'sf-token',
      '00OIV00000dqkbN2AQ',
    );
  });

  it('maps Salesforce authentication failures to a gateway error', async () => {
    mockFetchSFToken.mockResolvedValue({ error: 'sf_auth_error' });

    await expect(
      runReportAction(CLIENT, USER_ID, {
        reportId: '00OIV00000dqkbN2AQ',
      }),
    ).resolves.toEqual({ error: 'sf_auth_error', status: 502 });
    expect(mockRunReport).not.toHaveBeenCalled();
  });
});
