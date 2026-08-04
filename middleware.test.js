// @vitest-environment node

import { describe, expect, it } from 'vitest';
import middleware, {
  isAuthBridge,
  isDialerWebhook,
  isProtected,
  isPublic,
} from './middleware.js';

describe('middleware route classifiers', () => {
  it('treats /api/auth as the public JWT bridge (ex sso-bridge)', () => {
    expect(isAuthBridge('/api/auth')).toBe(true);
    expect(isAuthBridge('/api/sso-bridge')).toBe(true);
    expect(isAuthBridge('/api/calls')).toBe(false);
  });

  it('lets the Telnyx webhook through the middleware (signature is the auth)', () => {
    // P0-1: Telnyx cannot send a JWT — le POST webhook doit passer.
    // S8 (audit 11.13) : exemption la PLUS étroite possible. /api/dialer
    // n'est PLUS un auth bridge en bloc — seul ?resource=webhooks+POST est
    // ouvert (auth = signature Ed25519). Le routeur garde le reste derrière
    // verifyJWT (défense en profondeur par-dessus le middleware).
    expect(isAuthBridge('/api/dialer')).toBe(false);
    expect(isProtected('/api/dialer')).toBe(true);
    expect(
      isDialerWebhook(new URL('http://x/api/dialer?resource=webhooks'), 'POST'),
    ).toBe(true);
    expect(
      isDialerWebhook(new URL('http://x/api/dialer?resource=webhooks'), 'GET'),
    ).toBe(false);
    expect(
      isDialerWebhook(new URL('http://x/api/dialer?resource=dial'), 'POST'),
    ).toBe(false);
  });

  it('keeps SPA root public and native APIs protected by default', () => {
    expect(isPublic('/')).toBe(true);
    expect(isPublic('/assets/index.js')).toBe(true);
    expect(isProtected('/api/calls')).toBe(true);
    expect(isProtected('/api/cleaner')).toBe(true);
    expect(isProtected('/api/status')).toBe(true);
  });

  it('lets Vite dev-server modules through (fix écran blanc en dev)', () => {
    // En dev, Vite sert les modules depuis /src/, /@vite/, /@react-refresh,
    // /@fs/, /node_modules/. Le middleware les bloquait → 401 → écran blanc.
    expect(isPublic('/src/main.tsx')).toBe(true);
    expect(isPublic('/@vite/client')).toBe(true);
    expect(isPublic('/@react-refresh')).toBe(true);
    expect(isPublic('/@fs/Users/theosavoy/src/App.tsx')).toBe(true);
    expect(isPublic('/node_modules/.vite/deps/react.js')).toBe(true);
    // Les données restent protégées : pas de trou vers /api/*.
    expect(isProtected('/api/calls')).toBe(true);
    expect(isPublic('/api/calls')).toBe(false);
  });
});

describe('middleware() runtime', () => {
  it('rejects a protected API route with no Authorization header', async () => {
    const request = new Request('https://xos.hellotheo.fr/api/calls', {
      method: 'POST',
    });
    const response = await middleware(request);

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('text/html');
  });

  it('lets a protected API route through when Authorization: Bearer *** is present', async () => {
    const request = new Request('https://xos.hellotheo.fr/api/calls', {
      method: 'POST',
      headers: { Authorization: 'Bearer fake-jwt-token' },
    });
    const response = await middleware(request);

    expect(response).toBeUndefined();
  });
});
