# Plan : Import CSV dans le List Builder

**Date** : 2026-09-03
**Statut** : planification (pas ce tour)
**Prérequis** : écran de sélection type de séance (feat/session-type-select) mergé

## Contexte

La migration SQL `supabase/migrations_leadjime/001_campaign_contacts.sql` existe déjà :
- Table `csv_imports` (id, uploaded_by, file_name, row_count, dedupe_count, invalid_count, status)
- Table `campaign_contacts` (id, csv_import_id, contact_name, phone_e164, email, company_name, title, linkedin_url, tags)
- Pont `call_session_contacts.campaign_contact_id` + `external_source_id` (nullable, FK)
- RLS : select = authenticated, écritures = service-role via API

Le modèle est prêt. Il manque l'UI + l'API route.

## Flux UX cible

1. Écran sélection type → card "Import CSV" (actuellement grisée "Bientôt")
2. Clic → nouvel écran `CsvImportView`
3. Upload fichier → parsing client (validation colonnes) → preview tableau
4. Mapping colonnes → champs canonical (contact_name, phone, email, company_name, title)
5. Création session : POST `/api/csv-import` → insert `csv_imports` + `campaign_contacts` → create session avec `campaign_contact_id`

## Tâches

### Phase 1 — API (backend)
- [ ] `POST /api/csv-import` : parse CSV (papaparse ou stdlib), validate, insert `csv_imports` + `campaign_contacts` batch
- [ ] Validation : phone E.164, champs requis (contact_name), dedupe par phone/email
- [ ] Retourne `csv_import_id` + liste `campaign_contacts` pour preview

### Phase 2 — UI (frontend)
- [ ] `CsvImportView.tsx` : dropzone + mapping + preview
- [ ] Désactiver la card "Bientôt" → brancher `onSelectCsv`
- [ ] Création session via `campaign_contact_id` (adapter `handleCreate` dans CallManagerApp)

### Phase 3 — Tests
- [ ] API : parse, validate, dedupe, insert
- [ ] UI : upload, mapping, preview, création

## Estimation
~1 séance de dev. Backend + frontend en parallèle.
