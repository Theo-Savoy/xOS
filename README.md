# XOS — Portail & Labo CRM

Monorepo Vercel : portail **X OS** (React/Vite) + **Labo Cleaner natif** (React/TypeScript) + API serverless Node.

## Structure

```
├── api/                  # Fonctions serverless Vercel (Node)
├── public/
│   ├── fonts/            # Polices web (woff2) servies en prod
│   └── logo-xos.png
├── scripts/
│   ├── audit/            # Scripts d'audit Salesforce
│   ├── fetch_dechet_opps.py
│   └── compute_and_score.py
├── src/
│   ├── auth/             # Connexion OTP + session Supabase
│   ├── apps/             # Applications fenêtrées X OS
│   ├── components/ui/    # Design system (Button, Tag, GlassCard…)
│   ├── lib/              # Clients partagés (Supabase, types)
│   └── os/               # Bureau virtuel (dock, fenêtres, launcher)
├── supabase/migrations/
└── middleware.js         # Protection edge des fonctions API
```

## Développement

```bash
npm install
npm run dev      # SPA X OS sur http://localhost:5173
npm test         # Vitest
npm run build    # Build production
```

En dev, le registry expose aussi des apps de démo (aperçu, notes, design system).

## Labo Cleaner natif

Labo est une application native du bureau X OS. Sa V1 expose le module **Opportunités**, avec cockpit, Nettoyage, Synthèse et Historique. Le deep link `/clean?q=texte` ouvre directement le module Opportunités et conserve le filtre de recherche.

Routes natives :

- `GET /api/cleaner?module=opportunities&resource=workspace|analytics|history` — lecture JWT-scopée.
- `POST /api/cleaner` avec `action: "preview"` puis `action: "execute"` — corrections Salesforce avec validation, idempotence et journal Supabase.
- `GET/POST /api/status` — état Hub et réglages `cleaner_v2`.

Le script `scripts/migrate-cleaner-history.js --dry-run` prépare l’import de l’historique Blob vers Supabase et imprime les comptes source/cible. L’import réel, les écritures Salesforce live et toute suppression Blob restent bloqués sans approbation explicite et credentials dédiés ; aucun volume réel n’est supposé ici.

## Authentification

- **X OS** : écran de login dual-option — **Salesforce OAuth** ou magic link Supabase (`@xos-learning.fr`), puis bridge SSO vers cookie `xos_auth`
- **API natives** : JWT Supabase vérifié par chaque handler ; le middleware protège les fonctions `/api/*` et laisse le bridge d’authentification public.

Variables Vercel : `SF_*`, `DASHBOARD_PASSWORD`, `SUPABASE_*`, `VITE_SUPABASE_*`.

## Polices

Seuls les fichiers `public/fonts/*.woff2` sont servis en production. Les sources OTF/webfont kit (Brockmann, Neue Montreal) restent hors dépôt — voir [docs/fonts.md](docs/fonts.md).

## Documentation

- [Plan d'implémentation X OS](docs/xos_implementation_plan.md)
- [Plan portail](docs/xos_portal_plan.md)
- [Rôles & Hub](docs/specs/roles-and-hub.md)
- [Weekly Perf](docs/specs/weekly-perf.md)
- [Fonctions Vercel (Hobby 12)](docs/ops/vercel-functions.md)
