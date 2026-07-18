// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetPicklistValuesCache,
  PicklistValuesProvider,
  usePicklistValues,
} from './usePicklistValues';

const FIELD = 'Raison_de_perte_V2__c';
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(PicklistValuesProvider, {
    accessToken: 'supabase-token',
    children,
  });

beforeEach(() => {
  __resetPicklistValuesCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('usePicklistValues', () => {
  it('loads values from the authenticated picklist endpoint', async () => {
    const values = [
      { label: 'Budget insuffisant', active: true, default: false },
      { label: 'Priorité différente', active: true, default: true },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          field: FIELD,
          values,
          controllerName: 'Type_de_vente__c',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePicklistValues(FIELD), { wrapper });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.values).toEqual(values);
    expect(result.current.error).toBeNull();
    expect(result.current.dependOn).toBe('Type_de_vente__c');
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/crm/picklists?field=${encodeURIComponent(FIELD)}`,
      {
        headers: {
          Authorization: 'Bearer supabase-token',
          'Content-Type': 'application/json',
        },
      },
    );
  });

  it('shares the one-hour client cache between hook instances', async () => {
    const values = [
      { label: 'Budget insuffisant', active: true, default: false },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ field: FIELD, values }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const first = renderHook(() => usePicklistValues(FIELD), { wrapper });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();
    const second = renderHook(() => usePicklistValues(FIELD), { wrapper });

    expect(second.result.current).toEqual({
      values,
      loading: false,
      error: null,
      dependOn: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns an error and no values when the endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'sf_describe_failed' }), {
          status: 502,
        }),
      ),
    );

    const { result } = renderHook(() => usePicklistValues(FIELD), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.values).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });

  it('refetches when the controlling value changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            field: FIELD,
            controllerName: 'Type_de_vente__c',
            values: [{ label: 'Budget', active: true, default: false }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            field: FIELD,
            controllerName: 'Type_de_vente__c',
            values: [{ label: 'Expertise', active: true, default: false }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ controllingValue }: { controllingValue?: string }) =>
        usePicklistValues(FIELD, controllingValue),
      {
        initialProps: { controllingValue: 'Catalogue' },
        wrapper,
      },
    );
    await waitFor(() =>
      expect(result.current.values.map((value) => value.label)).toEqual([
        'Budget',
      ]),
    );

    rerender({ controllingValue: 'Conseil' });
    await waitFor(() =>
      expect(result.current.values.map((value) => value.label)).toEqual([
        'Expertise',
      ]),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/crm/picklists?field=${encodeURIComponent(FIELD)}&controllingValue=Catalogue`,
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/crm/picklists?field=${encodeURIComponent(FIELD)}&controllingValue=Conseil`,
      expect.any(Object),
    );
    expect(result.current.dependOn).toBe('Type_de_vente__c');
  });
});
