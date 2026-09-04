# Runner Combo — Refonte structurelle #119 — CONTRAT D'EXÉCUTION

Statut : **VALIDÉ** (Théo 2026-09-04) — arbitrages Grok (GO conditionnel) + Sol (GO conditionnel) intégrés.
Base : `01f5131`. Branche chantier : `audit-issue-119` (worktree `real-liger`).
Implémentation : Gemini (fondation + phases 1-4), Luna (lots 5-6 parallèles), contrôle Opus/Grok.
Ce document EST le brief. Tout agent doit le lire intégralement avant d'éditer.

---

## 0. Périmètre et interdits

### Dans le périmètre
- Refonte de la hiérarchie du runner (hors shell Combo qui reste inchangé) : `SessionWorkspace` maître-détail.
- Suppression des deux modes d'affichage concurrents « Liste / Fiche » (toggle header et arbre `mode === 'list' ? ... : ...`).
- File persistante (`SessionQueue`) + contact actif (`ContactWorkspace`) + contexte (`ContextInspector`).
- Power = mode opérationnel avec machine d'états UI explicite.
- File étendue = surface outil (bulk, rappels longs), jamais un second mode Liste.
- HUD condensé, un CTA primaire par état, utilitaires en menu.
- Responsive : 3 régions ≥900px, 2 colonnes 720-899px, 1 zone + sheets <720px.
- Nettoyage CSS legacy, tokens, a11y, tests.

### HORS périmètre (interdits, sauf demande explicite de Théo)
- `DialerView` / `PowerDialerView` : suppression interdite.
- Backend/API, schémas, contrats réseau, `pool.js`, `useDialerPool.ts` : aucune modification.
- State manager global, virtualisation, nouvelle dépendance, migration de données.
- Ajout de fonctionnalité produit.
- `ComboNav` / shell : inchangé (présent sur recalls, absent du runner séance).
- Modification des permissions/claims serveur.

### Files chaudes (un seul intégrateur à la fois, jamais 2 agents simultanés)
- `src/apps/calls/modules/runner/RunnerView.tsx`
- `src/apps/calls/CallManagerApp.tsx`
- `src/apps/calls/calls.css`
- `src/apps/calls/calls-dialer.css` (visuel Power réel : `.power-*` à `calls-dialer.css:248`, tokens globaux `:has()` à `calls.css:978`)
- Ordre des imports CSS.

---

## 1. Architecture cible

```
SessionWorkspace
├── SessionHeader        (retour, nom, progression condensée, menu séance …)
├── SessionQueue         (rail de navigation : identité, statut, claim, pastille Power)
├── ContactWorkspace     (fiche active : contact, actions appel, ACW, résultats, rappel, RDV)
├── ContextInspector     (contexte CRM en lecture)
└── PowerWorkspace       (console opérationnelle Power, repliée pendant conversation)
```

### Layout par largeur (container `.calls-app`, pas uniquement viewport)
| Largeur | Layout |
|---|---|
| ≥900px | 3 colonnes : Queue | Contact | Inspecteur |
| 720-899px | 2 colonnes : Queue | Contact ; Inspecteur en sheet |
| <720px | 1 zone, Contact par défaut ; File / Contexte / Power en sheets ; CTA sticky |

En conversation Power : le rail se replie toujours (priorité à l'appel + ACW).

### 3 régions fonctionnelles, 3 responsabilités
1. **HUD séance** : progression + synchronisation (une ligne `18/42 · 2/4 RDV`, zéro rangée de 5 cartes KPI, zéro tag décoratif « Cockpit »).
2. **ACW** : résultat, rappel, RDV, commentaire — **jamais fusionné dans un même `<form>` que le CRM**.
3. **CRM** : contexte en lecture.

---

## 2. Machine d'états Power (view model UI PUR)

Le moteur (`useDialerPool`/`pool.js`) garde SES booléens. Interdiction de les réécrire.
Le workspace dérive un état discriminé **uniquement** :

```
type PowerUiState =
  | 'off'            // powerOn=false — CTA primaire : Appeler séquentiel
  | 'ready'          // powerOn, idle, pas de retry — CTA : Lancer N / Relancer
  | 'wave'           // running, AUCUNE ligne connected — CTA : Raccrocher tout (panel uniquement)
  | 'conversation'   // ≥1 ligne connected — CTA : Consigner & suivant
  | 'acw'            // after-call work — CTA : Consigner & suivant
  | 'hangupRetry'    // hangupRetryable — CTA unique : Réessayer le raccrochage
```

Transitions (à figer et tester) :
```
off → ready
ready → wave (Lancer)
wave → conversation (≥1 connected)
wave → ready (vague terminée sans connecté) → Relancer
conversation/acw → ready (Relancer) ou → off (sortie)
wave|conversation → hangupRetry (échec raccrochage) → ready OU sortie seulement si 200
```

Règles impératives :
- `Raccrocher tout` **dans le panel Power uniquement** ; jamais dans le header.
- En conversation : `Raccrocher` = secondaire danger (panel), jamais primaire.
- `Appeler` séquentiel et CallBar **masqués** quand Power est actif.
- Réglages (caller ID >1, parallélisme 1-5, quota si remaining <8) visibles seulement en `ready` ; verrouillés en `wave` (settings unmount).
- Caller ID vide ≠ blocage client.
- `Relancer` doit survivre après vague terminée ; « Raccrocher et quitter » unique tue Relancer → séparer **raccrocher / quitter / relancer / retry**.
- `Quitter` pendant vague = séquence hangup puis sortie **seulement** si 200 ; sinon écran retry.
- `hangupRetryable` : un seul bouton, plus de doublon header+strip.
- Power absent des rappels ; entitlement requis.
- Une seule source de vérité pour la projection file : la normalisation/déduplication des numéros DOIT être centralisée (actuellement dupliquée entre `PowerStrip.tsx:125` et le résumé `RunnerView.tsx:1352` → une seule projection).

---

## 3. Fusion Liste/Fiche — contrat de comportement

- **Supprimer** le toggle `Liste | Fiche` et l'arbre exclusif ; le rail `SessionQueue` est la file de navigation.
- **Conserver** la capacité bulk dans la **File étendue** (overlay/vue outil), jamais un écran concurrent.
- Comportements à préserver EXACTEMENT :
  - Après « Consigner & suivant » en fiche : le focus suit le prochain pending (FIFO).
  - Après bulk en file : on reste sur la file.
  - Un seul chemin de focus/claim : le clic header « Fiche » ne claim pas ; `F` claim via `openDetail`. Harmoniser en un seul chemin.
  - Raccourcis `1-5` / `⌘↵` : applicables seulement quand un contact est focus ; **jamais** en même temps que le formulaire bulk (exclusivité focus/bulk).
  - Focus et formulaire bulk mutuellement exclusifs ; si formulaire dirty → blocage ou confirmation avant changement de contact (pas de perte silencieuse d'ACW).
- File étendue : interdite pendant une conversation Power.
- Mobile : File / Contexte / Power en sheets, une zone visible.

---

## 4. Invariants métier à PRÉSERVER (non négociables)

| # | Invariant | Preuve attendue |
|---|---|---|
| I1 | File FIFO de consignation (suivant = prochain pending) | test séquence |
| I2 | Rollback optimiste des logs rejetés | test rollback |
| I3 | Préchargement du contexte contact | test |
| I4 | Protection des contacts partagés | test |
| I5 | Workflow RDV (transaction appel+Event, Event rejeté après appel réussi) | test |
| I6 | Claims concurrents | test |
| I7 | Bulk par vagues de 4 + erreurs partielles | test |
| I8 | Rappels rapides/date + NPA | test |
| I9 | Résumé de file = destinations réellement envoyées au pool (projection unique) | test |
| I10 | `Quitter` jamais direct pendant vague (patron actuel : `onBack` direct interdit) | test |
| I11 | Aucune action clavier dans champs, overlays, surface legacy inactive | test focus |
| I12 | `L` ne quitte jamais la fiche pendant conversation Power (closure `runComboAction` à corriger : `isPowerConversationActive` absent des deps) | test |
| I13 | Pas de double listener clavier (runner caché sous pré-session = `aria-hidden` → la V2 doit être `inert` ou non montée) | grep/test |
| I14 | `prefers-reduced-motion` respecté | test |
| I15 | Raccourcis `L`/`F`/`1-5`/`⌘↵` conservés hors champs/bulk/conversation | test |

Handler réseau `CallManagerApp` : **inchangés** pendant la migration (log optimiste `:1163`, transaction RDV `:1264`, rappels multi-séances `:1126`, claims `:1736`).

---

## 5. Migration et coexistence (obligatoire)

1. Façade unique recevant le contrat actuel de `RunnerView`, sélectionnant legacy ou V2.
2. **Une seule surface montée à la fois** (monter legacy+V2 = double listeners/effets).
3. Flag figé à l'ouverture de la séance ; AUCUN basculement dynamique pendant vague Power.
4. Rollback legacy possible uniquement avant lancement ou après raccrochage confirmé (rappel : unmount pool = fire-and-forget, `useDialerPool.ts:493`).
5. Legacy conservé jusqu'à **parité complète de la matrice fonctionnelle** + comparaison erreurs/log/abandon/transitions Power.
6. Critères de promotion et de rollback du flag RÉDIGÉS.

---

## 6. Design system

- Primitives EXISTANTES uniquement (`Button`, `Select`, `SegmentedControl`, `Checkbox`, `Tag`, `ProgressBar`, `Modal`, `Skeleton`, `EmptyState`).
- Tokens existants réellement disponibles (`--xos-space-*`, `--xos-radius-*`) — token fantômes interdits (pas de `--xos-radius-pill` inventé, pas de `--xos-surface-3`).
- Rayons : `sm/md/lg` + pill ; max 3 niveaux de surface.
- Aucun input natif ajouté dans le runner (`<select>`/`<input>` hors kit interdits) — réutiliser `Select`/`Button` kit, copier le style `.calls-input` pour un input texte.
- Suppression des valeurs ad hoc (`0.35rem`, `0.55rem`, `0.65rem`, `0.7rem`, `0.75rem`, `0.85rem`, `0.9rem`) vers l'échelle `--xos-space-*`.
- Container queries basées sur `.calls-app` ; max 3 niveaux de surface ; responsive testé aux largeurs 320/500/719/720/899/900/1200 + hauteurs contraintes.

---

## 7. Critères d'acceptation (contrôle final — tous DOIVENT être vérifiables)

### Structure
- [ ] Aucun toggle `Liste | Fiche` (grep 0).
- [ ] Aucun arbre `mode === 'list'` comme unique alternatif.
- [ ] Structure visible différente (axe layout/IA), pas un re-skin vertical.
- [ ] Rail desktop, 2 colonnes intermédiaire, sheets mobile ; rail replié en conversation Power.
- [ ] Un CTA primaire par état ; utilitaires en menu.
- [ ] Fichiers chauds restructurés : `RunnerView` < ~2 000 lignes ; composants extraits (Queue/Contact/Inspector/Power/HUD).
- [ ] Pas de `CallModePanel` = simple renommage de `PowerStrip` (machine d'états réelle).

### Métier
- [ ] Parité des 6 résultats, rappels rapides/date, NPA, RDV appel+Event, report, retrait, bulk, clôture.
- [ ] I1-I15 tous verts (voir §4).
- [ ] Cas erreur : log rejeté, Event rejeté après appel réussi, erreur Salesforce non bloquante, claim concurrent, échec partiel bulk, quota/config dialer indisponible.

### UX/a11y
- [ ] Captures Playwright 320/500/719/720/899/900/1200 + hauteur contrainte, chaque état majeur.
- [ ] CTA primaire visible à 960×620 (taille par défaut fenêtre XOS).
- [ ] Aucun scroll imbriqué involontaire.
- [ ] Focus visible, tab order correct (changement contact, log réussi, modale), reduced motion.
- [ ] axe sans violation sérieuse/critique ; live regions non bavardes.

### Architecture
- [ ] Zéro requête/API dans composants de présentation.
- [ ] Une seule source d'état Power.
- [ ] CSS V2 scopé ; aucun sélecteur legacy orphelin (grep).
- [ ] `npm run test`, `npm run lint`, `npm run build` verts APRÈS dernier changement.

---

## 8. Décisions d'arbitrage (tranchées — ne pas re-arbitrer)

| # | Décision | Source |
|---|---|---|
| D1 | Fusion des modes, pas de toggle ; file = rail, fiche = contact actif | Grok |
| D2 | Bulk = File étendue overlay, jamais écran concurrent | Grok |
| D3 | Power = machine d'états dérivée, pas de réécriture moteur | Grok+Sol |
| D4 | ACW primaire en conversation (`Consigner & suivant`), hangup secondaire | Grok |
| D5 | Raccrocher/Quitter/Relancer/Retry = 4 intentions séparées ; sortie transactionnelle | Grok |
| D6 | Rail replié en conversation Power | Grok |
| D7 | HUD condensé, KPI fusionnés, zéro cartes KPI en rangée | Sol |
| D8 | 3 régions fonctionnelles (HUD/ACW/CRM) jamais 1 seul `<form>` | Grok |
| D9 | View model dérivé PUR, ne copie pas CallManagerApp/dialer | Sol |
| D10 | Façade legacy/V2, une surface montée, flag figé | Sol |
| D11 | Phase 5 scindée (5A file/filtres/sélection, 5B bulk/rappels, 5C raccourcis/nudges) | Sol |
| D12 | Implementation : Gemini phases 1-4 + intégrations chaudes ; Luna lots 5-6 bornés ; contrôles Opus (critique) + Grok (intermédiaire) | Sol+Théo |
| D13 | `calls-dialer.css` inclus dans le périmètre CSS Power | Sol |

---

## 9. Découpage opérationnel

| Lot | Acteur | Contenu | Worktree |
|---|---|---|---|
| L1 | Gemini | View model pur + machine Power + façade legacy/V2 + contrats types | `real-liger` |
| L2 | Gemini | Shell SessionWorkspace (Queue/Contact/Inspector/HUD), suppression toggle | `real-liger` |
| L3 | Gemini | Migration flux standard + ACW (invariants I1-I8) | `real-liger` |
| L4 | Gemini | Intégration Power complète (I9-I13) | `real-liger` |
| L5A | Luna | File étendue : file/filtres/sélection, exclusivité focus/bulk | worktree séparé productif |
| L5B | Luna | Bulk/report/retrait/rappels | idem |
| L5C | Luna | Raccourcis/nudges/command bar + tests clavier | idem |
| L6 | Luna | Composants feuilles, fixtures Playwright, matrice responsive/a11y, cleanup CSS | idem |

Séquencement : L1 (Gemini) → contrôle Grok → L2-L3 (Gemini séquentiel) → contrôle Grok → L4 (Gemini) → contrôle Opus → fusion L5-L6 (Luna) → contrôle Opus → contrôle final Alaric.
Luna ne touche JAMAIS RunnerView/CallManagerApp/calls.css/calls-dialer.css (sauf : ses fichiers propres sous `src/apps/calls/modules/runner/` si isolés — à valider au merge).

## 10. Défauts connus à corriger (de Sol, file:ligne)
- `RunnerView.tsx:223` — 4 booléens Power indépendants → état discriminé.
- `RunnerView.tsx:1429` — Quitter = `onBack` direct, dangereux pendant vague.
- `RunnerView.tsx:1352` vs `PowerStrip.tsx:125` — double vérité déduplication → projection unique.
- `RunnerView.tsx:1043` — `runComboAction` lit `isPowerConversationActive` absent des deps.
- `CallManagerApp.tsx:2133` — runner `aria-hidden` sous pré-session, listener clavier actif → V2 inert/non montée.
- `e2e/combo-power-dialing.spec.ts:80` — attend « contacts joignables » + quota `12/50`, le composant dit « numéros prêts » et masque le quota → adapter le test (le comportement actuel est la référence).
- `responsive.test.tsx:17` — vérifie des chaînes CSS, pas le layout → renforcer avec assertions de layout réel.