// Auth dual-mode : Supabase session (cookie auto-géré par @supabase/supabase-js)
// OU cookie xos_auth legacy (Basic Auth partagé).
//
// Si aucun cookie valide → page de login middleware avec :
//   - formulaire Basic Auth (POST /login, cookie xos_auth)
//   - lien vers la SPA pour Google SSO avec PKCE
//
// Le paramètre ?auth=sso laisse passer pour que le SPA charge
// et que le composant LoginScreen gère le flux OAuth complet.
export const config = { matcher: "/(.*)" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_PROJECT_REF = SUPABASE_URL.replace("https://", "").split(".")[0];

const SUPA_AUTH_COOKIE = SUPABASE_PROJECT_REF
  ? `sb-${SUPABASE_PROJECT_REF}-auth-token`
  : "";

function loginPage(status) {
  return new Response(
    `<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>XOS — Connexion</title>
<body style="margin:0;font-family:system-ui,sans-serif;background:#0f1115;color:#e6e6e6;display:flex;justify-content:center;align-items:center;height:100vh">
<div style="text-align:center;background:#181b22;padding:32px 40px;border-radius:12px;border:1px solid #2a2f3a;max-width:360px;width:100%">
<h2 style="margin-top:0">🗑️ Dashboard XOS Déchet</h2>
<form method="POST" action="/login" style="margin-bottom:24px">
<input type="password" name="password" placeholder="Mot de passe" autofocus required
  style="padding:10px;border-radius:8px;border:1px solid #2a2f3a;background:#0f1115;color:#e6e6e6;width:100%;box-sizing:border-box">
<button style="margin-top:12px;padding:10px;border-radius:8px;border:none;background:#3b82f6;color:#fff;cursor:pointer;width:100%;box-sizing:border-box;font-size:14px">Entrer</button>
</form>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;color:#555">
<div style="flex:1;height:1px;background:#2a2f3a"></div><span>ou</span><div style="flex:1;height:1px;background:#2a2f3a"></div>
</div>
<a href="/?auth=sso" style="display:block;padding:10px;border-radius:8px;background:#fff;color:#333;text-decoration:none;font-weight:600;font-size:14px">Se connecter avec Google</a>
<p style="margin-top:16px;font-size:12px;color:#555">Comptes <strong>@xos-learning.fr</strong> uniquement</p>
</div></body></html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

function hasSupabaseSession(cookieHeader) {
  if (!SUPA_AUTH_COOKIE || !cookieHeader) return false;
  return cookieHeader.split(/;\s*/).some((c) => c.startsWith(SUPA_AUTH_COOKIE + "="));
}

// Détecte un callback OAuth Supabase dans l'URL
function isSupabaseAuthCallback(url) {
  return /[?&](?:code|access_token|refresh_token|type=recovery|error)=/.test(url.search);
}

export default async function middleware(request) {
  const password = process.env.DASHBOARD_PASSWORD;
  const url = new URL(request.url);

  // POST /login → Basic Auth form submission
  if (url.pathname === "/login" && request.method === "POST") {
    const form = await request.formData();
    if (password && form.get("password") === password) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": `xos_auth=${password}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        },
      });
    }
    return loginPage(401);
  }

  // ?auth=sso → laisser charger la SPA pour le flux Google SSO
  if (url.searchParams.has("auth")) {
    return;
  }

  // OAuth callback (code, token dans l'URL) → laisser passer
  if (isSupabaseAuthCallback(url)) {
    return;
  }

  const cookieHeader = request.headers.get("cookie") || "";

  // Supabase session cookie présent
  if (hasSupabaseSession(cookieHeader)) {
    return;
  }

  // Legacy Basic Auth cookie
  if (password && cookieHeader.split(/;\s*/).includes("xos_auth=" + password)) {
    return;
  }

  return loginPage(401);
}
