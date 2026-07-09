// Basic Auth sur tout le site (HTML statique + API), via Vercel Edge Middleware.
// Identifiant: xos — mot de passe: env DASHBOARD_PASSWORD.
// ponytail: mot de passe partagé unique ; passer à des comptes individuels (Vercel
// Password Protection ou vrai IdP) si le besoin de révocation par personne arrive.
export const config = { matcher: "/(.*)" };

export default function middleware(request) {
  const password = process.env.DASHBOARD_PASSWORD;
  const expected = "Basic " + btoa("xos:" + password);
  // Fail closed : sans DASHBOARD_PASSWORD configuré, tout est refusé.
  if (password && request.headers.get("authorization") === expected) {
    return; // authentifié → la requête continue vers la ressource
  }
  return new Response("Authentification requise", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="XOS Dashboard"' },
  });
}
