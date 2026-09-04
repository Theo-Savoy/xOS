import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockVerifyJWT,
  mockGetServiceClient,
  mockGetProfile,
  mockFetchSFToken,
  mockSearchContacts,
  mockInsertUserNotification,
} = vi.hoisted(() => ({
  mockVerifyJWT: vi.fn(),
  mockGetServiceClient: vi.fn(),
  mockGetProfile: vi.fn(),
  mockFetchSFToken: vi.fn(),
  mockSearchContacts: vi.fn(),
  mockInsertUserNotification: vi.fn(),
}));

vi.mock('./_notifications/router.js', () => ({
  insertUserNotification: mockInsertUserNotification,
}));

vi.mock('./_auth.js', () => ({
  verifyJWT: mockVerifyJWT,
}));

vi.mock('./_calls/http.js', () => ({
  getServiceClient: mockGetServiceClient,
}));

vi.mock('./_calls/profileCache.js', () => ({
  getProfile: mockGetProfile,
}));

vi.mock('./_crm/salesforce.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchSFToken: mockFetchSFToken,
    searchContacts: mockSearchContacts,
  };
});

vi.mock('./_business-review/fte-config.js', () => ({
  DEFAULT_FTE: {},
  loadFte: vi.fn().mockResolvedValue({}),
  saveFte: vi.fn().mockResolvedValue({}),
}));

import { GET } from './review.js';

function request(path) {
  return new Request(`https://xos.hellotheo.fr${path}`);
}

describe('GET /api/review — resources business', () => {
  beforeEach(() => {
    mockVerifyJWT.mockReset();
    mockGetServiceClient.mockReset();
    mockGetProfile.mockReset();
    mockFetchSFToken.mockReset();
    mockSearchContacts.mockReset();
  });

  it('répond 401 sans Authorization', async () => {
    mockVerifyJWT.mockResolvedValue(null);
    const response = await GET(request('/api/review?resource=overview'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(mockGetServiceClient).not.toHaveBeenCalled();
  });

  it('répond 403 pour un rôle commercial sur overview', async () => {
    mockVerifyJWT.mockResolvedValue({ id: 'user-com' });
    mockGetServiceClient.mockReturnValue({ from: vi.fn() });
    mockGetProfile.mockResolvedValue({
      role: 'commercial',
      sfUserId: '005COM',
      fullName: 'Camille',
      error: null,
    });
    const response = await GET(request('/api/review?resource=overview'));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'manager_required',
    });
    expect(mockFetchSFToken).not.toHaveBeenCalled();
  });

  it('répond 400 avec la liste des resources valides si resource inconnue', async () => {
    mockVerifyJWT.mockResolvedValue({ id: 'user-mgr' });
    mockGetServiceClient.mockReturnValue({ from: vi.fn() });
    mockGetProfile.mockResolvedValue({
      role: 'manager',
      sfUserId: '005MGR',
      fullName: 'Morgane',
      error: null,
    });
    const response = await GET(request('/api/review?resource=inconnue'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('unknown_resource');
    expect(body.valid).toEqual([
      'shared',
      'overview',
      'bridge',
      'product',
      'cycles',
      'commercial',
      'market',
      'portfolio',
      'channels',
      'diagnosis',
      'synthesis',
      'quality',
      'fte-config',
      'definitions',
    ]);
  });

  it('répond 400 si le semestre n’est ni S1 ni S2', async () => {
    mockVerifyJWT.mockResolvedValue({ id: 'user-mgr' });
    mockGetServiceClient.mockReturnValue({ from: vi.fn() });
    mockGetProfile.mockResolvedValue({
      role: 'manager',
      sfUserId: '005MGR',
      fullName: 'Morgane',
      error: null,
    });
    const response = await GET(
      request('/api/review?resource=overview&fy=FY26&semester=S3'),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_semester',
      hint: 'S1 ou S2',
    });
  });

  it('accepte le semestre sur synthesis (devenue period-aware)', async () => {
    mockVerifyJWT.mockResolvedValue({ id: 'user-mgr' });
    mockGetServiceClient.mockReturnValue({ from: vi.fn() });
    mockGetProfile.mockResolvedValue({
      role: 'manager',
      sfUserId: '005MGR',
      fullName: 'Morgane',
      error: null,
    });
    mockFetchSFToken.mockResolvedValue({ accessToken: 'token-sf' });
    mockSearchContacts.mockResolvedValue({ records: [] });
    const response = await GET(
      request('/api/review?resource=synthesis&fy=FY26&semester=S1'),
    );
    expect(response.status).not.toBe(400);
    const body = await response.json();
    expect(body.period).toEqual({
      granularity: 'semester',
      semester: 'S1',
      quarter: null,
      label: 'FY26 S1',
      compare_label: 'FY25 S1',
    });
    expect(Array.isArray(body.cards)).toBe(true);
    expect(body.analysis).toEqual({ status: 'none' });
  });

  it('accepte le trimestre sur overview', async () => {
    mockVerifyJWT.mockResolvedValue({ id: 'user-mgr' });
    mockGetServiceClient.mockReturnValue({ from: vi.fn() });
    mockGetProfile.mockResolvedValue({
      role: 'manager',
      sfUserId: '005MGR',
      fullName: 'Morgane',
      error: null,
    });
    mockFetchSFToken.mockResolvedValue({ accessToken: 'token-sf' });
    mockSearchContacts.mockResolvedValue({ records: [] });
    const response = await GET(
      request('/api/review?resource=overview&fy=FY26&quarter=Q2'),
    );
    expect(response.status).not.toBe(400);
    const body = await response.json();
    expect(body.period).toEqual({
      granularity: 'quarter',
      semester: null,
      quarter: 'Q2',
      label: 'FY26 T2',
      compare_label: 'FY25 T2',
    });
  });

  it('rejette un quarter invalide', async () => {
    mockVerifyJWT.mockResolvedValue({ id: 'user-mgr' });
    mockGetServiceClient.mockReturnValue({ from: vi.fn() });
    mockGetProfile.mockResolvedValue({
      role: 'manager',
      sfUserId: '005MGR',
      fullName: 'Morgane',
      error: null,
    });
    const response = await GET(
      request('/api/review?resource=overview&fy=FY26&quarter=Q5'),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('invalid_quarter');
  });

  it('rejette le trimestre sur les vues annuelles (portfolio)', async () => {
    mockVerifyJWT.mockResolvedValue({ id: 'user-mgr' });
    mockGetServiceClient.mockReturnValue({ from: vi.fn() });
    mockGetProfile.mockResolvedValue({
      role: 'manager',
      sfUserId: '005MGR',
      fullName: 'Morgane',
      error: null,
    });
    const response = await GET(
      request('/api/review?resource=portfolio&fy=FY26&quarter=Q1'),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('annual_only_resource');
  });
});
describe('POST /api/review?resource=shared', () => {
  let mockInsert;
  let mockSelect;
  let mockSingle;
  let mockEq;
  let mockClient;

  beforeEach(() => {
    mockVerifyJWT.mockResolvedValue({ id: 'u1', email: 'u1@test.fr' });
    mockGetProfile.mockResolvedValue({ role: 'manager', fullName: 'User Un' });
    mockInsertUserNotification.mockClear();
    
    mockSingle = vi.fn().mockResolvedValue({ data: { id: 'u2' } });
    mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq, single: mockSingle, in: vi.fn().mockResolvedValue({ data: [] }) });
    mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    mockClient = {
      from: vi.fn().mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        eq: mockEq,
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
      }),
    };
    mockGetServiceClient.mockReturnValue(mockClient);
  });

  it('insère une notification si recipient_id est présent', async () => {
    const req = new Request('https://xos.hellotheo.fr/api/review?resource=shared', {
      method: 'POST',
      body: JSON.stringify({
        config: { granularity: 'fy', period: 'FY26', fy: 'FY26' },
        recipient_id: 'u2',
      }),
    });
    const { POST } = await import('./review.js');
    const res = await POST(req);
    expect(res.status).toBe(201);
    
    expect(mockInsertUserNotification).toHaveBeenCalledTimes(1);
    expect(mockInsertUserNotification.mock.calls[0][1]).toMatchObject({
      kind: 'review_shared',
      payload: expect.objectContaining({
        actor_id: 'u1',
        app_id: 'review',
        params: { shared: '1', fy: 'FY26' },
      }),
    });
  });

  it('aucune notification insérée si partage équipe (pas de recipient_id)', async () => {
    const req = new Request('https://xos.hellotheo.fr/api/review?resource=shared', {
      method: 'POST',
      body: JSON.stringify({
        config: { granularity: 'fy', period: 'FY26' },
      }),
    });
    const { POST } = await import('./review.js');
    const res = await POST(req);
    expect(res.status).toBe(201);
    
    expect(mockInsertUserNotification).not.toHaveBeenCalled();
  });

  it('répond 400 invalid_recipient si destinataire inconnu', async () => {
    mockSingle.mockResolvedValueOnce({ data: null });
    const req = new Request('https://xos.hellotheo.fr/api/review?resource=shared', {
      method: 'POST',
      body: JSON.stringify({
        config: { granularity: 'fy', period: 'FY26' },
        recipient_id: 'unknown-user',
      }),
    });
    const { POST } = await import('./review.js');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_recipient');
  });
});

describe('GET /api/review?resource=shared', () => {
  let mockClient;

  beforeEach(() => {
    mockVerifyJWT.mockResolvedValue({ id: 'u1', email: 'u1@test.fr' });
    mockGetProfile.mockResolvedValue({ role: 'manager', fullName: 'User Un' });

    const mockIn = vi.fn().mockResolvedValue({
      data: [{ id: 'creator-id', full_name: 'Creator Name' }]
    });

    mockClient = {
      from: vi.fn((table) => {
        if (table === 'shared_analyses') {
          return {
            select: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [{ id: 'a1', created_by: 'creator-id' }]
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({ in: mockIn }),
          };
        }
      })
    };
    mockGetServiceClient.mockReturnValue(mockClient);
  });

  it('ajoute created_by_label aux analyses listées', async () => {
    const req = new Request('https://xos.hellotheo.fr/api/review?resource=shared');
    const { GET } = await import('./review.js');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analyses[0].created_by_label).toBe('Creator Name');
  });
});
