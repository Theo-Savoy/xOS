# XOS — Dashboard Opportunités Déchet

Dashboard (Vercel, HTML + serverless Python) listant les opportunités Salesforce
"déchet" : opp ouvertes avec CloseDate dépassée, sans activité, sans montant, etc.

## Structure
- `dashboard.html` — front (dark theme, filtres, tri, pagination), maintenu à la main
- `api/refresh.py` — fonction serverless : SOQL Salesforce + scoring, source unique des données
- `middleware.js` — Basic Auth (Edge Middleware) sur tout le site
- `fetch_dechet_opps.py`, `compute_and_score.py` — scripts locaux de debug

## Refresh
Le front charge ses données via `GET /api/refresh` :
- **Automatique quotidien** : la réponse est mise en cache par le CDN Vercel
  pendant 24h (`s-maxage=86400`). Passé ce délai, la prochaine visite
  redéclenche un fetch Salesforce. Pas de cron, pas de stockage.
- **Bouton 🔄 Actualiser** : appel avec un query param cache-buster qui bypass
  le CDN → données fraîches immédiates, gardées en `localStorage` pour survivre
  au rechargement de la page.

## Authentification
Tout le site (HTML + API) est derrière un Basic Auth géré par `middleware.js` :
identifiant `xos`, mot de passe dans la variable d'environnement
`DASHBOARD_PASSWORD`. Pour le changer :
`vercel env rm DASHBOARD_PASSWORD production && vercel env add DASHBOARD_PASSWORD production`
puis redéployer.

Variables d'environnement requises (Vercel) : `SF_CLIENT_ID`, `SF_CLIENT_SECRET`,
`SF_REFRESH_TOKEN`, `DASHBOARD_PASSWORD`, et optionnellement `SF_LOGIN_URL`,
`SF_INSTANCE_URL`.
