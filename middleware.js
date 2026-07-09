// Auth par cookie sur tout le site (HTML statique + API), via Vercel Edge Middleware.
// Cookie plutôt que Basic Auth : un header Authorization force le cache CDN en
// BYPASS et casserait le cache quotidien de /api/refresh.
// Mot de passe partagé : env DASHBOARD_PASSWORD. Fail closed si absente.
// ponytail: mot de passe partagé unique en clair dans le cookie (équivalent au
// Basic Auth) ; passer à un token signé ou un vrai IdP si besoin de révocation.
export const config = { matcher: "/(.*)" };

const LOGIN_HTML = `<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>XOS — Connexion</title>
<body style="margin:0;font-family:system-ui,sans-serif;background:#0f1115;color:#e6e6e6;display:flex;justify-content:center;align-items:center;height:100vh">
<form method="POST" action="/login" style="text-align:center;background:#181b22;padding:32px 40px;border-radius:12px;border:1px solid #2a2f3a">
<h2 style="margin-top:0">🗑️ Dashboard XOS Déchet</h2>
<input type="password" name="password" placeholder="Mot de passe" autofocus required
  style="padding:10px;border-radius:8px;border:1px solid #2a2f3a;background:#0f1115;color:#e6e6e6;width:220px">
<button style="padding:10px 18px;border-radius:8px;border:none;background:#3b82f6;color:#fff;cursor:pointer;margin-left:8px">Entrer</button>
</form></body></html>`;

function loginPage(status) {
  return new Response(LOGIN_HTML, {
    status: status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default async function middleware(request) {
  const password = process.env.DASHBOARD_PASSWORD;
  const url = new URL(request.url);

  if (url.pathname === "/login" && request.method === "POST") {
    const form = await request.formData();
    if (password && form.get("password") === password) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": "xos_auth=" + password + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000",
        },
      });
    }
    return loginPage(401);
  }

  const cookies = request.headers.get("cookie") || "";
  if (password && cookies.split(/;\s*/).includes("xos_auth=" + password)) {
    return; // authentifié → la requête continue vers la ressource
  }
  return loginPage(401);
}
