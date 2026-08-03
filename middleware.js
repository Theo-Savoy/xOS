// Auth 100% JWT Supabase sur les fonctions API protégées.
// Route / (racine exacte) et /assets/* /fonts/* /favicon* sont publiques :
//   la SPA charge et LoginScreen gère le magic link email avec PKCE.
// Les routes /api/* protégées exigent un header Authorization: Bearer ***
//   (la vérification du JWT lui-même est faite par chaque endpoint via verifyJWT).
// /api/auth (et l'alias legacy /api/sso-bridge) est public : il porte son
//   propre JWT en Authorization header (et gère aussi le callback OAuth Salesforce).

export const config = { matcher: '/(.*)' };

const LOGIN_HTML = `<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>XOS — Connexion</title>
<body style="margin:0;font-family:system-ui,sans-serif;background:#0f1115;color:#e6e6e6;display:flex;justify-content:center;align-items:center;height:100vh">
<div style="text-align:center;background:#181b22;padding:32px 40px;border-radius:12px;border:1px solid #2a2f3a;max-width:360px;width:100%">
<h2 style="margin-top:0">🗑️ Dashboard XOS Déchet</h2>
<a href="/" style="display:block;padding:10px;border-radius:8px;background:#fff;color:#333;text-decoration:none;font-weight:600;font-size:14px">Connexion par lien magique</a>
<p style="margin-top:16px;font-size:12px;color:#555">Comptes <strong>@xos-learning.fr</strong> uniquement</p>
</div></body></html>`;

function loginPage(status) {
  return new Response(LOGIN_HTML, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// Routes publiques (SPA statique, pas de données protégées)
function isPublic(pathname) {
  if (pathname === '/') return true;
  if (pathname.startsWith('/assets/')) return true;
  if (pathname.startsWith('/fonts/')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (/\\.(png|webp|svg|ico|jpe?g|gif)$/i.test(pathname)) return true;
  // Préfixes du serveur de dev Vite : en dev les modules sont servis depuis
  // /src/, /@vite/, /@react-refresh, /@fs/, /node_modules/. En prod le build
  // empaquette tout dans /assets/ — ces préfixes n'existent pas, donc aucune
  // donnée protégée n'est exposée. (Le code source est déjà public côté Vite.)
  if (pathname.startsWith('/src/')) return true;
  if (pathname.startsWith('/@vite/')) return true;
  if (pathname.startsWith('/@react-refresh')) return true;
  if (pathname.startsWith('/@fs/')) return true;
  if (pathname.startsWith('/node_modules/')) return true;
  return false;
}

/** Auth bridge + SF OAuth + Telnyx webhook — JWT/callback handled inside the route, not via cookie.
 * /api/dialer is OPEN by design: the Telnyx webhook endpoint (?resource=webhooks) cannot carry
 * a JWT — its auth is the Ed25519 signature (see api/_dialer/webhooks.js). The router itself
 * enforces JWT on every OTHER resource (api/dialer.js checks verifyJWT when resource != webhooks). */
function isAuthBridge(pathname) {
  return (
    pathname === '/api/auth' ||
    pathname === '/api/sso-bridge' ||
    pathname === '/api/dialer'
  );
}

// Routes protégées par le header Authorization: Bearer ***
function isProtected(pathname) {
  if (pathname.startsWith('/api/')) return true;
  return false;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // /api/auth (ex /api/sso-bridge) porte son propre JWT / gère le callback OAuth
  if (isAuthBridge(pathname)) {
    return;
  }

  // Routes publiques : SPA + assets
  if (isPublic(pathname)) {
    return;
  }

  // Routes protégées : vérifier la présence du header Authorization: Bearer ***
  // (le JWT lui-même est vérifié par chaque endpoint via verifyJWT).
  if (isProtected(pathname)) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ') && authHeader.slice(7).length > 0) {
      return;
    }
    return loginPage(401);
  }

  // Tout le reste → login
  return loginPage(401);
}

export { isAuthBridge, isPublic, isProtected };
