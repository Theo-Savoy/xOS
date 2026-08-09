# Re-audit lot 11.7 (ronde 2) — vérification des corrections (Opus)

**Corrections** : `afbd71f` (parent `3a416ee`) · **Diff** : `git diff 3a416ee..afbd71f`
(7 fichiers hors rapport, +248/−14) · **Mode** : lecture seule (mutations F1/F3
faites en local puis `git checkout` — repo restauré, aucune trace).

**Vérifs exécutées** : `npx tsc --noEmit` (0 erreur) · `npx vitest run`
sur `api/dialer.test.js` + `useRtcCall.test.tsx` + `useDialerPool.test.tsx`
(**44/44**, dont 8 nouveaux). Mutation-vérifs F1 et F3 (voir ci-dessous).

## Verdict synthétique

Les 6 findings actionnables de la ronde 1 sont **réellement corrigés**, pas
faux-vertés. Les deux fixes structurants (F1 orphelin, F3 race release) sont
**mutation-vérifiés** : restaurer l'ancien code fait rougir exactement le test
censé les protéger. F5 était une **erreur de ma ronde 1** — je la confirme
réfutée. Aucune régression introduite. **J'approuve.**

---

## F1 (blocker) — RÉSOLU · mutation-vérifié ✅

`useRtcCall.ts:184-192` : le cleanup de démontage appelle désormais
`endCallRecord('ended')` AVANT `dropClient()`, symétrique au pool.

**Mutation** : retiré `endCallRecord('ended')` du cleanup →
`useRtcCall.test.tsx` = **1 failed | 6 passed**, le test rouge étant
précisément « F1 : démontage en cours d'appel clôt le registre ». Repo
restauré. Le fix est réel ET suffisant : sans lui le chemin production
(démontage `CallManagerApp` → `DialerProvider` → `useRtcCall`) laissait la
ligne `dialing` orpheline + budget réservé, exactement le scénario R1.

## F2 (faux-vert) — RÉSOLU ✅

`mockNotifyCallEnded` est maintenant asservi à **7 assertions** sur les chemins
de sortie :
- `useRtcCall.test.tsx` (4) : démontage / hangup / ended SDK décroché / double
  clôture (n'émet qu'une fois). Chacune vérifie `callRecordId`, `status`,
  `answered` via `toMatchObject`.
- `useDialerPool.test.tsx` (3) : skip réel / unmount multi-lignes /
  notification ended d'un slot. `toHaveBeenCalledTimes` + `toMatchObject`.

Le faux-vert R1 (mock câblé, jamais asservi) est fermé : les tests
distinguent désormais « registre clos » de « registre non touché ».

## F3 (race release) — RÉSOLU · mutation-vérifié, test encode bien le nouveau contrat ✅

`persistence.js:98-110` : le release est conditionné à `updated.length`
(`.select('id')` renvoie les lignes réellement affectées par l'UPDATE
`... .is('ended_at', null)`), plus au lookup. `updated.length === 0` →
`{ closed: false }` sans toucher la réservation.

**Précision demandée sur la nature du test** — la consigne demandait de vérifier
que le test `updated.length === 0` « PASSERAIT encore si on restaurait l'ancien
code ». **Ce n'est pas le cas, et c'est heureux** : un test qui passerait sous
l'ancien code serait un faux-vert. Vérité terrain (mutation) : j'ai restauré
l'ancien code (release sur lookup, sans `.select('id')` ni garde
`updated.length`) → `api/dialer.test.js` = **1 failed | 28 passed**, le rouge
étant « F3 : UPDATE affecte 0 ligne → pas de release ». Le test **échoue** sous
l'ancien code (il attendait `closed:false` + zéro `dialer_release_reservation`,
l'ancien code renvoyait `closed:true` + release). Il **encode donc bien le
nouveau contrat** — c'est la propriété voulue (parenthèse de la consigne), pas
la lettre (« passerait encore »). Fix réel et couvert. Repo restauré.

## F4 (maskE164) — RÉSOLU · pas de régression frontend ✅

`persistence.js:29-33` : plancher relevé à 8 (< 8 → `'****'` intégral) ; 8-10 →
`slice(0,2)+'****'` ; ≥ 11 → `slice(0,3)+'****'+slice(-2)`. Test ajouté
(`+3312` → `'****'`, `dialer.test.js:531-546`). L'entrée courte n'est plus
révélée intégralement.

**Régression frontend recherchée** : `UserCallRecord.to_number` est typé
`string` (`dialerApi.ts:253`) et **n'est consommé/rendu nulle part** dans
`src/` (grep `.to_number` hors tests → 0 hit d'affichage). Le nouveau format
n'a donc aucun contrat de rendu à casser — c'est une chaîne opaque côté client.

## F5 (migration FK) — RÉFUTÉE, ma ronde 1 avait tort ✅

Confirmé. `git ls-files` liste `041_dialer_budget_reservations.sql`, committé
dans `a12defa` (« chore: migrations 041-043 align repo with remote »). Le
fichier **crée bien** `public.dialer_budget_reservations` (l.12), et
`045:38-39` la référence en FK. Un `supabase db reset` from-scratch atteint 045
sans casser. Mon finding R1 se fondait sur le commentaire OBSOLÈTE de
`budget.js` (« no committed file »), corrigé dans `afbd71f`. **F5 invalide.**

## F7 (commentaire) — RÉSOLU ✅

`DialerProvider.tsx:8-11` : la référence caduque à l'index 044 (« 1 appel
actif par user ») est remplacée par la borne réelle (budget par composition +
parallelism campagne, 045 ayant retiré l'index pour le power dialing).

## F6 — inchangé, intentionnel ✅

`dial` hors scope registre : réserve **et** consomme/libère dans la même
requête, pas d'orphelin. Conforme R1.

---

## Régressions recherchées (§2 du brief)

| Piste | Verdict |
| --- | --- |
| Démontage clôt en `'ended'` vs effet budget | **OK.** L'effet budget (consommé/libéré) est piloté par `answered = connectedAt != null` (`persistence.js:115`, `useRtcCall.ts:155`), PAS par le `status`. Au démontage d'un appel jamais décroché → `answered:false` → **release**. Correct. Le test F1 l'asserte (`status:'ended', answered:false`). |
| `vi.clearAllMocks()` du pool casse un test antérieur | **Non.** Les implémentations sont re-posées juste après (`useDialerPool.test.tsx:56-60`) ; `clearAllMocks` ne vide que compteurs/résultats. Suite pool entière verte. |
| Nouveau `maskE164` casse le format attendu par le front | **Non.** `to_number` non affiché côté client (cf. F4). |

### Observation mineure (non bloquante, non-finding)

Le démontage mono-ligne étiquette en `status:'ended'` un appel jamais connecté,
là où le pool utilise `'no_answer'` (skip) pour le même cas. Le budget est
correct des deux côtés (piloté par `answered`) ; seul le libellé de reporting
diffère. Cosmétique — la suggestion de correctif R1 autorisait explicitement
`'ended' ou 'failed'`. Rien à corriger pour ce lot.

## Checklist de re-vérification

| # | Point | Résultat |
| - | --- | --- |
| 1 | F1 fix réel + mutation | ✅ 1 failed/6 passed sans le fix |
| 2 | F2 chemins asservis | ✅ 7 assertions `notifyCallEnded` |
| 3 | F3 fix + test encode le contrat | ✅ mutation : 1 failed/28 passed sous l'ancien code |
| 4 | F4 fix + pas de casse front | ✅ plancher 8, `to_number` non rendu |
| 5 | F5 réfutation | ✅ 041 committé (a12defa), FK saine |
| 6 | F7 commentaire | ✅ corrigé |
| 7 | Régressions | ✅ aucune (budget par `answered`, clearAllMocks sûr, front intact) |
| 8 | tsc + suite | ✅ 0 erreur, 44/44 |

AUDIT_VERDICT=APPROVE findings=0 blockers=0
