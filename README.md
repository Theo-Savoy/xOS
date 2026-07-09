# XOS — Dashboard Opportunités Déchet

Dashboard statique (HTML + JSON) listant les opportunités Salesforce "déchet" :
opp ouvertes avec CloseDate dépassée, sans activité, sans montant, etc.

## Structure
- `dashboard.html` — dashboard statique (dark theme, filtres, tri, pagination)
- `dashboard_data.json` — données générées par les scripts
- `fetch_dechet_opps.py` — SOQL extraction des opps déchet
- `compute_and_score.py` — scoring + génération du JSON
- `gen_dashboard.py` — génération du HTML

## Refresh
Les données sont rafraîchies via un cron job local qui :
1. Exécute `fetch_dechet_opps.py` (SOQL Salesforce)
2. Exécute `compute_and_score.py` (scoring)
3. Exécute `gen_dashboard.py` (HTML)
4. Commit + push vers ce repo

Le bouton 🔄 Actualiser sur le dashboard recharge le JSON avec cache-busting.
