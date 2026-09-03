/**
 * api/index.js — dispatcher pathname des routes JWT consolidées.
 *
 * Rewrite Vercel `/api/(.*)` → `/api`. Les fichiers restants (auth, dialer,
 * et les routeurs non encore migrés) sont résolus avant le rewrite.
 * Auth: inchangée — middleware.js matche le pathname d'origine.
 */
import { respond } from './_auth.js';

export const ROUTES = {
  profile: () => import('./_profile/router.js'),
  'weekly-targets': () => import('./_weekly/router.js'),
  notifications: () => import('./_notifications/router.js'),
  status: () => import('./_status/router.js'),
  'crm/picklists': () => import('./_crm/picklistsRouter.js'),
};

function routeKey(request) {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith('/api/')) return '';
  return pathname.slice('/api/'.length);
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':
        process.env.APP_ORIGIN || 'https://xos.hellotheo.fr',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  });
}

async function dispatch(request, method) {
  const load = ROUTES[routeKey(request)];
  if (!load) return respond(404, { error: 'route_not_found' });
  const mod = await load();
  const handler = mod[method];
  if (typeof handler === 'function') return handler(request);
  if (method === 'OPTIONS') return corsPreflight();
  return respond(405, { error: 'method_not_allowed' });
}

export async function GET(request) {
  return dispatch(request, 'GET');
}

export async function POST(request) {
  return dispatch(request, 'POST');
}

export async function DELETE(request) {
  return dispatch(request, 'DELETE');
}

export async function OPTIONS(request) {
  return dispatch(request, 'OPTIONS');
}
