import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockVerifyJWT, mockFetchSFToken, mockGetServiceClient } = vi.hoisted(
  () => ({
    mockVerifyJWT: vi.fn(),
    mockFetchSFToken: vi.fn(),
    mockGetServiceClient: vi.fn(),
  }),
);

vi.mock('../_auth.js', () => ({
  verifyJWT: mockVerifyJWT,
  respond: (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

vi.mock('../_crm/salesforce.js', () => ({
  fetchSFToken: mockFetchSFToken,
}));

vi.mock('../_calls/http.js', () => ({
  getServiceClient: mockGetServiceClient,
}));

import { __resetPicklistCache, GET } from './picklists.js';

const FIELD = 'Raison_de_perte_V2__c';

function request(field, controllingValue) {
  const selectedField = arguments.length === 0 ? FIELD : field;
  const searchParams = new URLSearchParams();
  if (selectedField !== undefined) searchParams.set('field', selectedField);
  if (controllingValue !== undefined)
    searchParams.set('controllingValue', controllingValue);
  const query = searchParams.size ? `?${searchParams}` : '';
  return new Request(`https://xos.test/api/crm/picklists${query}`, {
    headers: { Authorization: 'Bearer token' },
  });
}

function describeResponse() {
  return {
    fields: [
      {
        name: 'Type_de_vente__c',
        controllerName: null,
        picklistValues: [
          { label: 'Catalogue', value: 'Catalogue', active: true },
          { label: 'Sur-mesure', value: 'Sur-mesure', active: true },
          { label: 'Conseil', value: 'Conseil', active: true },
        ],
      },
      {
        name: FIELD,
        controllerName: 'Type_de_vente__c',
        picklistValues: [
          {
            label: 'Budget insuffisant',
            value: 'Budget insuffisant',
            active: true,
            defaultValue: false,
            validFor: 'gA==',
          },
          {
            label: 'Priorité différente',
            value: 'Priorité différente',
            active: true,
            defaultValue: true,
            validFor: 'wA==',
          },
          {
            label: 'Ancienne valeur',
            value: 'Ancienne valeur',
            active: false,
            defaultValue: false,
            validFor: '/w==',
          },
        ],
      },
      {
        name: 'Motif_remise__c',
        controllerName: 'Type_de_vente__c',
        picklistValues: [],
      },
    ],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-18T08:30:00.000Z'));
  vi.clearAllMocks();
  __resetPicklistCache();
  mockVerifyJWT.mockResolvedValue({ id: 'user-1' });
  mockGetServiceClient.mockReturnValue({ from: vi.fn() });
  mockFetchSFToken.mockResolvedValue({ accessToken: 'sf-token' });
  vi.stubEnv('SF_INSTANCE_URL', 'https://example.my.salesforce.com');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(describeResponse()), { status: 200 }),
        ),
      ),
  );
});

describe('GET /api/crm/picklists', () => {
  it('fetches and parses active values from the Salesforce describe response on a cache miss', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      field: FIELD,
      values: [
        { label: 'Budget insuffisant', active: true, default: false },
        { label: 'Priorité différente', active: true, default: true },
      ],
      controllerName: 'Type_de_vente__c',
      controllingValue: null,
      dependents: ['Motif_remise__c'],
      cachedAt: '2026-07-18T08:30:00.000Z',
    });
    expect(mockFetchSFToken).toHaveBeenCalledWith({
      client: mockGetServiceClient.mock.results[0].value,
      userId: 'user-1',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://example.my.salesforce.com/services/data/v67.0/sobjects/Opportunity/describe',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sf-token' },
      }),
    );
  });

  it('returns the one-hour server cache without refetching Salesforce', async () => {
    const first = await GET(request());
    vi.setSystemTime(new Date('2026-07-18T09:29:59.000Z'));
    const second = await GET(request());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockFetchSFToken).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(second.json()).resolves.toMatchObject({
      field: FIELD,
      cachedAt: '2026-07-18T08:30:00.000Z',
    });
  });

  it('filters dependent values with the controlling value validFor bitset', async () => {
    const response = await GET(request(FIELD, 'Sur-mesure'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      field: FIELD,
      values: [{ label: 'Priorité différente', active: true, default: true }],
      controllerName: 'Type_de_vente__c',
      controllingValue: 'Sur-mesure',
      dependents: ['Motif_remise__c'],
    });
  });

  it('keeps separate cache entries for each controlling value', async () => {
    const catalogue = await GET(request(FIELD, 'Catalogue'));
    const custom = await GET(request(FIELD, 'Sur-mesure'));
    const cachedCatalogue = await GET(request(FIELD, 'Catalogue'));

    await expect(catalogue.json()).resolves.toMatchObject({
      controllingValue: 'Catalogue',
      values: [
        { label: 'Budget insuffisant' },
        { label: 'Priorité différente' },
      ],
    });
    await expect(custom.json()).resolves.toMatchObject({
      controllingValue: 'Sur-mesure',
      values: [{ label: 'Priorité différente' }],
    });
    await expect(cachedCatalogue.json()).resolves.toMatchObject({
      controllingValue: 'Catalogue',
      values: [
        { label: 'Budget insuffisant' },
        { label: 'Priorité différente' },
      ],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not filter a field without a controller', async () => {
    const response = await GET(
      request('Type_de_vente__c', 'Valeur sans effet'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      field: 'Type_de_vente__c',
      values: [
        { label: 'Catalogue', active: true, default: false },
        { label: 'Sur-mesure', active: true, default: false },
        { label: 'Conseil', active: true, default: false },
      ],
      controllerName: null,
      controllingValue: 'Valeur sans effet',
      dependents: [],
    });
  });

  it('returns 401 without a valid JWT', async () => {
    mockVerifyJWT.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(mockFetchSFToken).not.toHaveBeenCalled();
  });

  it('returns 400 when field is missing', async () => {
    const response = await GET(request(undefined));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'missing_field' });
    expect(mockFetchSFToken).not.toHaveBeenCalled();
  });

  it('returns 400 when field contains special characters', async () => {
    const response = await GET(request('Raison_de_perte_V2__c;DROP'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_field' });
    expect(mockFetchSFToken).not.toHaveBeenCalled();
  });
});
