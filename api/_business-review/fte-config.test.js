import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FTE, loadFte } from './fte-config.js';

const {
  mockVerifyJWT,
  mockGetServiceClient,
  mockGetProfile,
  mockFetchSFToken,
  mockSearchContacts,
} = vi.hoisted(() => ({
  mockVerifyJWT: vi.fn(),
  mockGetServiceClient: vi.fn(),
  mockGetProfile: vi.fn(),
  mockFetchSFToken: vi.fn(),
  mockSearchContacts: vi.fn(),
}));

vi.mock('../_auth.js', () => ({
  verifyJWT: mockVerifyJWT,
}));

vi.mock('../_calls/http.js', () => ({
  getServiceClient: mockGetServiceClient,
}));

vi.mock('../_calls/profileCache.js', () => ({
  getProfile: mockGetProfile,
}));

vi.mock('../_crm/salesforce.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchSFToken: mockFetchSFToken,
    searchContacts: mockSearchContacts,
  };
});

import { POST } from '../review.js';

function settingsClient({ existing = null } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return {
    upsert,
    from(table) {
      if (table !== 'settings') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: existing, error: null }),
          }),
        }),
        upsert,
      };
    },
  };
}

function postFte(role) {
  mockVerifyJWT.mockResolvedValue({ id: `user-${role}` });
  mockGetProfile.mockResolvedValue({
    role,
    sfUserId: '005MGR',
    fullName: 'Test',
    error: null,
  });
  const client = settingsClient();
  mockGetServiceClient.mockReturnValue(client);
  return POST(
    new Request('https://xos.hellotheo.fr/api/review?resource=fte-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        FY25: { sales: 4.17, sdr: 0 },
        FY26: { sales: 2, sdr: 1 },
      }),
    }),
  ).then(async (response) => ({ response, client }));
}

describe('loadFte', () => {
  it('renvoie les valeurs par défaut si la clé est absente (D2)', async () => {
    const client = settingsClient({ existing: null });
    await expect(loadFte(client)).resolves.toEqual(DEFAULT_FTE);
    expect(DEFAULT_FTE).toEqual({
      FY25: { sales: 4.17, sdr: 0 },
      FY26: { sales: 2.0, sdr: 1 },
    });
  });
});

describe('POST /api/review?resource=fte-config', () => {
  beforeEach(() => {
    mockVerifyJWT.mockReset();
    mockGetServiceClient.mockReset();
    mockGetProfile.mockReset();
    mockFetchSFToken.mockReset();
    mockSearchContacts.mockReset();
  });

  it('accepte un manager (200)', async () => {
    const { response, client } = await postFte('manager');
    expect(response.status).toBe(200);
    expect(client.upsert).toHaveBeenCalled();
  });

  it('refuse un commercial (403)', async () => {
    const { response, client } = await postFte('commercial');
    expect(response.status).toBe(403);
    expect(client.upsert).not.toHaveBeenCalled();
  });
});
