import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchSFToken, mockSearchContacts, mockBuildLightningUrl } =
  vi.hoisted(() => ({
    mockFetchSFToken: vi.fn(),
    mockSearchContacts: vi.fn(),
    mockBuildLightningUrl: vi.fn(),
  }));

vi.mock('../../_crm/salesforce.js', () => ({
  fetchSFToken: mockFetchSFToken,
  searchContacts: mockSearchContacts,
  buildLightningUrl: mockBuildLightningUrl,
}));

import {
  __resetOpportunityReadCache,
  loadOpportunityWorkspace,
} from './read.js';

const baseContext = {
  user: { id: 'user-1' },
  profile: { fullName: 'Ada' },
  role: 'commercial',
  sfUserId: 'sf-self',
  teamSfUserIds: ['sf-self', 'sf-other'],
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }),
  },
  token: 'sf-token',
  today: '2026-07-12',
};

function rawOpportunity(id, ownerId, closeDate = '2026-06-01') {
  return {
    Id: id,
    Name: `Opportunity ${id}`,
    AccountId: `account-${id}`,
    'Account.Name': `Account ${id}`,
    OwnerId: ownerId,
    'Owner.Name': `Owner ${ownerId}`,
    'Owner.IsActive': true,
    IsClosed: false,
    StageName: 'Qualification',
    Amount: 3000,
    Probability: 20,
    CloseDate: closeDate,
    CreatedDate: '2026-01-20T00:00:00.000Z',
    LastActivityDate: '2026-07-01',
    Type_de_vente__c: 'Catalogue',
  };
}

beforeEach(() => {
  __resetOpportunityReadCache();
  mockFetchSFToken.mockReset();
  mockSearchContacts.mockReset();
  mockBuildLightningUrl.mockReset();
  mockFetchSFToken.mockResolvedValue({ accessToken: 'sf-token' });
  mockBuildLightningUrl.mockImplementation(
    (type, id) => `https://sf/${type}/${id}`,
  );
});

describe('loadOpportunityWorkspace', () => {
  it('normalizes, detects anomalies, paginates deterministically and filters commercial scope after raw cache', async () => {
    mockSearchContacts.mockResolvedValue({
      records: [
        rawOpportunity('opp-self-1', 'sf-self'),
        rawOpportunity('opp-other', 'sf-other'),
        rawOpportunity('opp-self-2', 'sf-self', '2026-07-01'),
      ],
    });

    const first = await loadOpportunityWorkspace({ ...baseContext, limit: 1 });
    const second = await loadOpportunityWorkspace({
      ...baseContext,
      limit: 1,
      cursor: first.nextCursor,
      query: { ownerId: 'sf-other' },
    });

    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      id: 'opp-self-1',
      owner_id: 'sf-self',
      account: 'Account opp-self-1',
      salesforce_url: 'https://sf/Opportunity/opp-self-1',
    });
    expect(first.items[0].anomalies.map((anomaly) => anomaly.ruleId)).toContain(
      'close_date_overdue_under_3_months',
    );
    expect(first.total).toBe(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.items.map((item) => item.id)).toEqual(['opp-self-2']);
    expect(mockSearchContacts).toHaveBeenCalledOnce();
    expect(mockSearchContacts.mock.calls[0][1]).toContain('FROM Opportunity');
  });

  it('returns a bounded timeout instead of swallowing a Salesforce hang', async () => {
    mockSearchContacts.mockImplementation(() => new Promise(() => {}));

    await expect(
      loadOpportunityWorkspace({ ...baseContext, timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: 'timeout', status: 504 });
  });

  it('maps a Salesforce transport failure to the integration error contract', async () => {
    mockSearchContacts.mockRejectedValue(
      new Error('Salesforce connection reset'),
    );

    await expect(loadOpportunityWorkspace(baseContext)).rejects.toMatchObject({
      code: 'salesforce_error',
      status: 502,
    });
  });

  it('keeps evidence actual values within the frontend contract', async () => {
    mockSearchContacts.mockResolvedValue({
      records: [
        {
          ...rawOpportunity('opp-inactive-owner', 'sf-self'),
          'Owner.IsActive': false,
        },
      ],
    });

    const result = await loadOpportunityWorkspace(baseContext);
    const ownerAnomaly = result.items[0].anomalies.find(
      (anomaly) => anomaly.ruleId === 'owner_inactive',
    );

    expect(ownerAnomaly.evidence[0].actual).toBe('false');
  });

  it('uses a supplied token and does not require a guessed Salesforce opportunity helper', async () => {
    mockSearchContacts.mockResolvedValue({ records: [] });
    await loadOpportunityWorkspace(baseContext);
    expect(mockFetchSFToken).not.toHaveBeenCalled();
  });

  it('accepts a safe numeric offset cursor for deterministic pagination', async () => {
    mockSearchContacts.mockResolvedValue({
      records: [
        rawOpportunity('opp-self-1', 'sf-self'),
        rawOpportunity('opp-self-2', 'sf-self'),
      ],
    });
    const result = await loadOpportunityWorkspace({
      ...baseContext,
      limit: 1,
      cursor: '1',
    });
    expect(result.items.map((item) => item.id)).toEqual(['opp-self-2']);
  });
});
