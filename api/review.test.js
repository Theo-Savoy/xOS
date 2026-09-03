import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      label: 'FY26 S1',
      compare_label: 'FY25 S1',
    });
    expect(Array.isArray(body.cards)).toBe(true);
  });
});
