# Rapport correctifs QC — Call Manager v2.A/v2.B

Commit de départ : `06e052a`. Branche : `Theo-Savoy/xos-cm-v2b-log`.

## État RED initial (avant correctifs)

```bash
npm test -- --run
# Test Files  4 failed | 11 passed (15)
# Tests  28 failed | 163 passed (191)
```

Échecs principaux :
- `api/calls.test.js` : contrat v1 (`outcome`, `success`, fetch SF inline) vs v2 (`resultat`, `ok`, adapter)
- `api/calls-list.test.js` : imports v1 supprimés (`buildSoqlQuery`, `parseFilters`, …)
- `scripts/call-target-query.test.js` et `scripts/calls-v2-logic.test.js` : collectés par Vitest sans `describe/it`

## Cycle TDD RED → GREEN

### 1. Persistance Supabase (`api/calls.js`)

| Test ciblé | RED (attendu) | GREEN |
|---|---|---|
| `npm test -- api/calls.test.js -t "compensates when contact insert fails"` | absent → ajouté, échoue sans rollback | `contacts_creation_failed` + delete compensatoire |
| `npm test -- api/calls.test.js -t "local persistence fails after SF success"` | absent → 200 malgré update error | `contact_update_failed` 500 + `sf_task_id` |
| `npm test -- api/calls.test.js -t "session lookup DB error"` | absent → 404 masqué | `session_lookup_failed` 500 |
| `npm test -- api/calls.test.js -t "follow-up contact lookup fails"` | absent → 200/400 incorrect | `session_contacts_lookup_failed` 500 |

### 2. Presets strict + erreurs DB (`api/presets.js`)

| Test ciblé | RED | GREEN |
|---|---|---|
| `npm test -- api/presets.test.js -t "rejects partial or non-integer strings"` | `parsePresetId("1abc")` → 1 | `null` → 400 `invalid_id` |
| `npm test -- api/presets.test.js -t "lookup fails"` | 404 masqué | 500 `preset_lookup_failed` |

### 3. Validation Event + succès partiel

| Test ciblé | RED | GREEN |
|---|---|---|
| `npm test -- api/calls.test.js -t "invalid start datetime"` | accepte `"tomorrow"` | 400 `invalid_start` via `isValidEventStart` |
| `npm test -- api/calls.test.js -t "partial invitee failure"` | `{ok:true}` | 502 `event_invitee_failed` + `sf_event_id` persisté |

### 4. Mapping sémantique

| Test ciblé | RED | GREEN |
|---|---|---|
| `node scripts/calls-v2-logic.check.js` | literals en dur dans `calls.js` | `mapping.objects.task.resultSemantic.{rdv,followUpNoAnswer,followUpVoicemail}` |

### 5. Tests v2 réécrits

| Fichier | RED | GREEN |
|---|---|---|
| `api/calls.test.js` | 7 échecs contrat v1 | 29 tests v2 (adapter mocké) |
| `api/calls-list.test.js` | 21 échecs imports v1 | 9 tests adapter + POST v2 |
| `api/presets.test.js` | absent | 11 tests ajoutés |
| Scripts renommés `*.check.js` | 2 fichiers Vitest vides en échec | exclus de Vitest, exécutables via `node` |

## Commandes gate de sortie (GREEN final)

```bash
node scripts/calls-v2-logic.check.js          # OK
node scripts/call-target-query.check.js         # OK
npm test -- --run                               # 14 files, 170 tests, 0 échec
npx tsc --noEmit                                # 0 erreur
npx eslint .                                    # 0 erreur
npm run build                                   # succès
git diff --check                                # succès
```

## Fichiers modifiés

- `api/_crm/mapping.js` — `resultSemantic` (rdv + relance)
- `api/calls.js` — erreurs Supabase, validation ISO, succès partiel Event, mapping sémantique
- `api/presets.js` — `parsePresetId` strict, erreurs DB explicites
- `api/calls.test.js` — réécriture contrat v2
- `api/calls-list.test.js` — réécriture contrat arbre filtres v2
- `api/presets.test.js` — nouveau
- `scripts/calls-v2-logic.check.js` — renommé depuis `.test.js`
- `scripts/call-target-query.check.js` — renommé depuis `.test.js`

## Auto-revue du diff

- Aucune traduction v1→v2 des anciens `outcome` ; les tests utilisent les 5 valeurs `mapping.objects.task.results`.
- `OwnerId` toujours passé via `sf_user_id` ; refus SF remonté en 502 sans retry silencieux.
- `ActivityDate` non ajouté à `logCall` (hors contrat v2).
- Journalisation conservée en best-effort (échec journal ne bloque pas la réponse HTTP).
- Préoccupation restante : vérification prod OwnerId et intégration UI v2.C avant push/déploiement.
