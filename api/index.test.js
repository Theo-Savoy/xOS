import { describe, expect, it } from 'vitest';
import * as mod from './index.js';
import { GET, ROUTES } from './index.js';

describe('api/index dispatcher', () => {
  it('exporte GET, POST, DELETE, OPTIONS', () => {
    expect(Object.keys(mod)).toEqual(
      expect.arrayContaining(['GET', 'POST', 'DELETE', 'OPTIONS']),
    );
  });

  it('route chaque entrée de ROUTES sans 404 de routage', async () => {
    for (const path of Object.keys(ROUTES)) {
      const response = await GET(new Request(`https://x/api/${path}`));
      const body = await response.json().catch(() => ({}));
      expect(
        response.status === 404 && body.error === 'route_not_found',
      ).toBe(false);
    }
  });

  it('répond 404 de routage sur un path inconnu', async () => {
    const response = await GET(new Request('https://x/api/sso-bridge'));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'route_not_found' });
  });
});
