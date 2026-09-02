import { describe, expect, it, vi, beforeEach } from 'vitest';
import handler, { __resetSfDataCache } from './review.js';

vi.mock('./_auth.js', () => ({
  verifyJWT: vi.fn(async () => ({ id: 'user-1', email: 'x@y.fr' })),
}));

vi.mock('./_crm/salesforce.js', () => ({
  fetchSFToken: vi.fn(async () => ({ accessToken: 'sf-token-12345678' })),
  searchContacts: vi.fn(async () => ({ records: [] })),
  escapeSOQL: (v) => String(v),
}));

const mockClient = {
  _data: [],
  from: (table) => ({
    select: () => ({ data: mockClient._data, error: null }),
  }),
};

vi.mock('./_calls/profileCache.js', () => ({
  getProfile: vi.fn(async () => ({
    sfUserId: '005000000000000AAA',
    role: 'manager',
    sfAuthConnectedAt: null,
    userLinked: false,
  })),
}));

vi.mock('./_calls/http.js', () => ({
  getServiceClient: () => mockClient,
}));

describe('review handler — scoping roster + cache', () => {
  beforeEach(() => {
    __resetSfDataCache();
    vi.clearAllMocks();
  });

  it('manager sans roster → payload vide 200, aucune requête SF', async () => {
    mockClient._data = [];
    const { searchContacts } = await import('./_crm/salesforce.js');
    const req = new Request(
      'https://x.test/api/review?period=FY26&resource=kpis',
      { headers: { authorization: 'Bearer t' } },
    );
    const responded = await handler(req);
    expect(responded.status).toBe(200);
    expect(searchContacts).not.toHaveBeenCalled();
    const body = await responded.json();
    expect(body.ca_signe).toBe(0);
    expect(body.by_owner).toEqual({});
  });

  it('roster présent → scope aux owners mappés (pas null=org entière)', async () => {
    mockClient._data = [
      { sf_user_id: '005AZ000000AAAAAAA' },
      { sf_user_id: '005AZ000000BBBBBBB15' },
    ];
    const { searchContacts } = await import('./_crm/salesforce.js');
    const req = new Request(
      'https://x.test/api/review?period=FY26&resource=attention',
      { headers: { authorization: 'Bearer t' } },
    );
    await handler(req);
    const soql = searchContacts.mock.calls[0][1];
    expect(soql).toContain('IN (\'005AZ000000AAAAAAA\', \'005AZ000000BBBBBBB15\')');
  });
});