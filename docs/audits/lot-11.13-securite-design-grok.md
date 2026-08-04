# Audit sécurité + design — module dialer Telnyx (lot 11.13)

> Agent : Cursor Grok 4.5 · HEAD audité : `1ce6786`  
> Périmètre : `api/dialer.js`, `api/_dialer/*`, `src/apps/calls/modules/dialer/dialerApi.ts`, échanges navigateur→API (token WebRTC) ; UI `PowerDialerView.tsx`, `CallBar.tsx`, `DialerView.tsx`, `calls-dialer.css` (+ variantes design system `src/components/ui`).  
> Méthode : revue statique uniquement — **aucun fichier applicatif modifié**.

---

## Verdict synthétique

| Domaine | Verdict |
|---|---|
| **Sécurité** | **CONDITIONAL GO** — dry-run WebRTC fail-closed et JWT/entitlements sont solides ; le chemin d’appel réel (WebRTC) **contourne le budget atomique**, et le endpoint `dial` Call Control accepte encore `connection_id` / `webhook_url` / `from` non validés. |
| **Design** | **GO avec dettes** — cohérent GlassCard/Tag/Button ; lacunes a11y (aria-live, Play désactivé opaque), responsive CallBar/compteurs, EmptyState/Skeleton non utilisés. |

---

## SÉCURITÉ

### Points positifs (déjà en place)

| Contrôle | Preuve | Commentaire |
|---|---|---|
| Dry-run WebRTC fail-closed | `api/dialer.js:119-129` | `isDryRun` (cfg ∨ flags ∨ entitlement) → `{ token: null, expires_in: 0 }` — **aucun JWT RTC émis**. |
| Choke point réseau Telnyx | `api/_dialer/telnyx.js:35-41` | `telnyxPost` short-circuit si `dryRun` avant `fetch`. |
| JWT sur ressources non-webhook | `api/dialer.js:332-333` | `verifyJWT` obligatoire hors `webhooks`. |
| Entitlement fail-closed | `api/_dialer/budget.js:110-117` | Défaut `enabled: false`, `dryRun: true` si row absente. |
| Ownership caller ID (WebRTC) | `api/dialer.js:146-157` | `caller_number` rejeté s’il n’appartient pas à l’user (`403 caller_number_not_owned`). |
| Webhooks Ed25519 fail-closed | `api/_dialer/webhooks.js:125-148` | Sans clé / signature invalide → 503/401 ; tentatives rejetées persistées. |
| Idempotence webhooks | `api/_dialer/idempotency.js:46-65` | INSERT-first, PK = lock, erreur ≠ 23505 → throw. |
| Budget atomique (chemin `dial`) | `api/_dialer/budget.js:48-79` | RPC `dialer_reserve_budget` + advisory lock. |
| Config plus open-read | `api/dialer.js:329-341` | JWT requis (fix audit §2.3). |
| CSRF classique | `src/lib/apiClient.ts:45-48` | Auth via `Authorization: Bearer` (pas cookie session API) → CSRF navigateur classique mitigé. |
| Pas d’IDs Telnyx connection dans l’UI config | `api/dialer.js:79-98` | Réponse config : booléens + budgets + caller_numbers — pas de `connection_id` / API key. |

---

### Findings

#### S1 — Chemin WebRTC réel sans réservation budgétaire

- **Fichier:ligne** : `api/dialer.js:107-178` (`handleWebrtcToken`) vs `api/dialer.js:228-241` (`handleDial`) ; client `src/apps/calls/modules/dialer/application/useRtcCall.ts:172-190`
- **Risque** : L’UI produit les appels via token WebRTC + `client.newCall()` (pas via `?resource=dial`). `handleWebrtcToken` vérifie JWT / flags / entitlement / dry-run, mais **n’appelle jamais `reserveBudget`**. Un user entitlé peut donc composer hors caps session/jour/org et hors kill-switch org-month.
- **Sévérité** : **CRITIQUE**
- **Recommandation** : Avant d’émettre un token (ou via un `resource=dial_intent` lié au numéro), appeler `reserveBudget` avec le même schéma de caps que `handleDial`. Lier la consommation au hangup/webhook `call.hangup` (release `consumed` / `released`). Refuser le token si `allowed: false`. Documenter que le chemin Call Control `dial` n’est plus le chemin produit, ou le retirer.

#### S2 — `POST ?resource=dial` : `connection_id`, `webhook_url`, `from` contrôlés par le client

- **Fichier:ligne** : `api/dialer.js:202-209`, `272-283` ; client `dialerApi.ts:96-103`
- **Risque** :
  1. **`connection_id`** arbitraire → dial via n’importe quelle connection Telnyx accessible à la clé API (contournement d’allocation).
  2. **`webhook_url`** arbitraire → **SSRF / exfiltration d’événements d’appel** vers un endpoint attaquant (signatures Telnyx incluses).
  3. **`from: body?.from ?? cfg.callerId`** → spoof de caller ID **sans** check `dialer_phone_numbers` (asymétrie avec WebRTC B7).
- **Sévérité** : **HAUTE** (CRITIQUE si le endpoint reste exposé en prod avec clé multi-connection)
- **Recommandation** : Ignorer totalement `connection_id` / `webhook_url` / `from` du body. Résoudre connection + webhook depuis config serveur (`TELNYX_*` / settings). Valider `from` comme `caller_number` WebRTC (ownership). Allowlist stricte du host webhook (`https://<app>/api/dialer?resource=webhooks`).

#### S3 — Aucune validation E.164 serveur sur `to` / destination

- **Fichier:ligne** : `api/dialer.js:202-210` ; UI soft-check seulement `DialerView.tsx:96-98` ; WebRTC passe `destination` brut à Telnyx (`useRtcCall.ts:225-226`)
- **Risque** : Injection de formats non-E.164, numéros internationaux hors politique FR, chaînes SIP/abuse. Aucun regex `/^\+[1-9]\d{6,14}$/` (ou libphonenumber) côté API. Le token WebRTC n’est pas scopé à une destination.
- **Sévérité** : **HAUTE**
- **Recommandation** : Valider E.164 (et éventuellement allowlist pays) sur `handleDial` **et** sur une intention serveur avant token, ou via Outbound Voice Profile Telnyx France-only + daily spend limit (défense en profondeur déjà citée lot 11.1). Rejeter `400 invalid_e164`.

#### S4 — Rate limiter présent mais jamais branché

- **Fichier:ligne** : `api/_dialer/rateLimit.js` (TokenBucket/RateLimiter) ; **aucun import** dans `api/dialer.js`
- **Risque** : Flags `rate_rps` / `rate_burst` exposés en config (`dialer.js:95-96`) mais non appliqués. Flood de dials / tokens → coût Telnyx + DoS quotas.
- **Sévérité** : **HAUTE**
- **Recommandation** : Instancier un `RateLimiter` (clé = `user.id` et/ou caller ID) dans `handleDial` et `handleWebrtcToken` ; répondre `429` + `Retry-After`. Preferer un store partagé (Redis/Supabase) : le Map in-memory est inefficace multi-instance Vercel.

#### S5 — Idempotence dial insuffisante (UUID serveur à chaque requête)

- **Fichier:ligne** : `api/dialer.js:268-271`
- **Risque** : `command_id = xos-dial-${crypto.randomUUID()}` est généré **par requête**. Un double-clic / retry client après timeout crée un **nouveau** `command_id` → Telnyx ne déduplique pas → **deux appels réels**. L’idempotence webhooks (S+) ne protège pas ce cas.
- **Sévérité** : **HAUTE**
- **Recommandation** : Exiger un header `Idempotency-Key` (ou `command_id`) **client** stable par intention ; persister dans une table / Redis avant l’appel Telnyx ; rejouer la réponse stockée si clé déjà vue.

#### S6 — Fuite d’erreurs Telnyx vers le client + détail réservation

- **Fichier:ligne** : `api/dialer.js:310` (`message: err.message`) ; `api/dialer.js:264` (`reservation` entière dans le 429)
- **Risque** : Messages Telnyx / stack internes exposés (enum paths, IDs). Objet `reservation` peut révéler structure interne des caps.
- **Sévérité** : **MOYENNE**
- **Recommandation** : Réponses client : codes stables (`dial_failed`, `budget_exceeded_*`) sans `err.message` brut. Logger le détail côté serveur uniquement. 429 : `{ error: reason }` seulement.

#### S7 — Audit WebRTC logue `credential_id` Telnyx

- **Fichier:ligne** : `api/dialer.js:168-176`
- **Risque** : `telnyx_credential_id` dans `dialer_audit_log.payload`. Acceptable en forensique si RLS/admin-only ; dangereux si `resource=audit` devient lisible trop largement (actuellement 501).
- **Sévérité** : **BASSE**
- **Recommandation** : Hasher / tronquer le credential_id dans le payload ; s’assurer que la future API audit est manager/admin + RLS stricte.

#### S8 — Middleware ouvre tout `/api/dialer` (dépendance totale au routeur)

- **Fichier:ligne** : `middleware.js:50-59`, `72-74`
- **Risque** : `/api/dialer` est `isAuthBridge` → le middleware **ne vérifie pas** le Bearer. La sécurité repose uniquement sur `dialer.js`. Une régression (oublier `verifyJWT` sur une nouvelle resource) ouvre l’endpoint.
- **Sévérité** : **MOYENNE** (défense en profondeur)
- **Recommandation** : Au middleware, n’exempter que `?resource=webhooks` (parse query) ; exiger Bearer pour le reste. Ou scinder `/api/dialer/webhooks` en route dédiée.

#### S9 — Liste `valid` des resources incomplète / commentaires obsolètes

- **Fichier:ligne** : `api/dialer.js:370-373` (manque `webrtc_token`) ; commentaires L9/L19 « open read » vs réalité JWT
- **Risque** : Confusion ops ; faible impact sécurité direct.
- **Sévérité** : **BASSE**
- **Recommandation** : Ajouter `webrtc_token` à `valid` ; aligner les commentaires header.

#### S10 — `hangupCall` importé mais non exposé / non gated

- **Fichier:ligne** : `api/dialer.js:31` (import) ; pas de `resource=hangup`
- **Risque** : Pas d’exposition actuelle (dead import). Si ajouté plus tard sans ownership du `call_control_id`, hangup cross-user possible.
- **Sévérité** : **BASSE** (latente)
- **Recommandation** : Retirer l’import mort ; si hangup API : vérifier que le call appartient à `user.id` (client_state / table calls).

#### S11 — Données sensibles dans les logs

- **Fichier:ligne** : `api/dialer.js:376` (`console.error` unexpected) ; `webhooks.js:188-190` ; audit payload avec `to` E.164 (`dialer.js:292`)
- **Risque** : Numéros de prospects dans audit/logs (RGPD / rétention). Pas de fuite d’API key observée (bon : `has_caller_id` booléen seulement).
- **Sévérité** : **MOYENNE** (conformité) / **BASSE** (credentials)
- **Recommandation** : Pseudonymiser `to` dans audit (hash salé) ; s’assurer que les agrégateurs de logs ne capturent pas les bodies complets. Ne jamais logger `apiKey` / token RTC (aujourd’hui OK).

#### S12 — Fallback caller ID libre côté UI si aucune allocation

- **Fichier:ligne** : `DialerView.tsx:227-235` ; validé serveur si envoyé (`dialer.js:147-157`)
- **Risque** : L’input free-text n’est pas dangereux **tant que** le serveur refuse les non-owned. Si un futur chemin oublie le check, spoof facile. UX peut laisser croire qu’un numéro quelconque est utilisable.
- **Sévérité** : **BASSE**
- **Recommandation** : Si `caller_numbers.length === 0`, désactiver le dial + message « aucun caller ID alloué » plutôt qu’un input libre.

---

### Matrice dry-run (exigence G2)

| Niveau | Source | Token WebRTC | Appel Call Control |
|---|---|---|---|
| `TELNYX_ENV=dryrun` | `config.js:39` | `token: null` | fixture, pas de fetch |
| `flags.dry_run` | settings | `token: null` | dryRun propagated |
| `entitlement.dry_run` | `dialer_user_entitlements` | `token: null` | dryRun propagated |
| OR pessimiste | `dialer.js:119-120`, `221-222` | **OK fail-closed** | **OK fail-closed** |

**Verdict dry-run** : `dry_run=true` (tout niveau) **garantit AUCUN token WebRTC** et aucun POST Telnyx réel via `telnyxPost`. Conforme à l’exigence.

---

## DESIGN (UI/UX)

Design system vérifié (`Button` : `primary|secondary|ghost|danger|icon` × `sm|md|lg` ; `Tag` : `default|accent|alert|success|warning|muted` ; `GlassCard`, `EmptyState`, `Skeleton` disponibles). Les vues dialer utilisent correctement GlassCard / Tag / Button — **mais pas EmptyState ni Skeleton**.

---

### Findings

#### D1 — Bouton « ▶ Play » désactivé sans explication

- **Fichier:ligne** : `PowerDialerView.tsx:103-109`
- **Problème** : `disabled` quand file vide et lignes idle, **sans** `title`, `aria-describedby`, ni texte d’aide adjacent. L’utilisateur voit un Play grisé opaque (contrairement au toggle démo qui a un `title` L93). Le glyphe `▶` est mal annoncé par les lecteurs d’écran.
- **Recommandation** : `aria-label="Lancer le cycle power dial"` ; si disabled : `title` / hint visible « Charge une file (Remplir démo) avant de lancer » ; remplacer `▶` par texte « Play » + `aria-hidden` sur l’icône éventuelle.

#### D2 — Accessibilité absente (aria-live, roles, labels de formulaire)

- **Fichier:ligne** : `CallBar.tsx:36-59` ; `DialerView.tsx:182-211` ; `PowerDialerView.tsx:117-137`
- **Problème** : Aucun `role="status"` / `aria-live="polite"` sur les changements de phase (Composition → Sonnerie → Connecté). Les `<label>` du formulaire n’ont pas de `htmlFor`/`id`. Les compteurs power n’ont pas de `aria-label` de section. Le reste de l’app Calls (SessionsView, RunnerView) pose un précédent a11y beaucoup plus riche.
- **Recommandation** : Sur CallBar et bandeau de phase DialerView : `role="status" aria-live="polite"`. Associer labels/inputs. Sur compteurs : `aria-label="Indicateurs session"`. Erreurs : `role="alert"`.

#### D3 — États vides / chargement / erreur incomplets

- **Fichier:ligne** : `DialerView.tsx:129-132` ; `PowerDialerView.tsx:185-211` ; absence d’`EmptyState`
- **Problème** : Config = texte brut « Chargement de la config… » (pas de `Skeleton`). File power vide = section absente + hint bas de page seulement si `!demo`. Pas d’EmptyState « Aucun numéro en file ». Erreurs config OK en rouge, mais pas de CTA de retry structuré hors bouton Actualiser.
- **Recommandation** : Utiliser `Skeleton` pendant le fetch config ; `EmptyState` pour file vide avec action « Remplir démo » ; garder les `calls-dialer__error` avec `role="alert"`.

#### D4 — CallBar : lisibilité et overflow sur vues / mobile

- **Fichier:ligne** : `calls-dialer.css:51-76` ; `CallBar.tsx:41-57`
- **Problème** : Barre sticky `display:flex` sans `flex-wrap`. Destination en `white-space: nowrap` ; l’erreur est un `<p>` inline dans le flex → risque de compression / débordement sur Runner ou petite largeur. Fond `rgba(18,24,33,0.92)` cohérent dark, mais pas de contraste explicite testé pour Tag + texte. Pas de `aria` (cf. D2).
- **Recommandation** : `flex-wrap: wrap` ; tronquer la destination (`text-overflow: ellipsis; max-width`) ; erreur sur une 2ᵉ ligne pleine largeur ; tester la barre au-dessus de Sessions/Runner/Dialer.

#### D5 — Responsive : grille 4 compteurs et header actions

- **Fichier:ligne** : `calls-dialer.css:83-87` (`repeat(4, 1fr)`) ; **aucun `@media`** dans le fichier ; `PowerDialerView.tsx:83-114` (actions header)
- **Problème** : 4 colonnes compteurs + rangée de boutons (Démo / Play / Retour) cassent sous ~480px. Le dialer form est `max-width: 720px` (OK) mais power n’a pas de breakpoint.
- **Recommandation** : `@media (max-width: 640px) { .calls-power__counters { grid-template-columns: repeat(2, 1fr); } }` ; header actions en colonne / wrap.

#### D6 — `<select>` caller ID non stylé (seulement `input`)

- **Fichier:ligne** : `calls-dialer.css:186-194` ; `DialerView.tsx:215-226`
- **Problème** : Les inputs ont border/background design system ; le `<select>` hérite du style navigateur natif → rupture visuelle vs GlassCard.
- **Recommandation** : Étendre le sélecteur CSS à `.calls-dialer__form select` (mêmes tokens `--xos-border`, `--xos-input-bg`) ou utiliser le composant `Select` de `src/components/ui`.

#### D7 — Double élément `<audio data-rtc-remote>`

- **Fichier:ligne** : `CallBar.tsx:39` ; `DialerView.tsx:181` ; attache SDK `useRtcCall.ts:224` (`document.querySelector`)
- **Problème** : Deux nœuds matchent le sélecteur ; `querySelector` prend le **premier** du DOM. Selon l’ordre de montage CallBar vs DialerView, le flux peut s’attacher au mauvais (ou à un nœud caché), symptôme « on n’entend rien ».
- **Recommandation** : **Un seul** `<audio data-rtc-remote>` global (CallBar / Provider). Retirer celui de DialerView.

#### D8 — Feedback dry-run / dialer désactivé perfectible

- **Fichier:ligne** : `DialerView.tsx:138-148`, `241-247`
- **Problème** : Tags dry-run / activé sont clairs. Le bouton devient « Dial dry-run » (bien). En revanche si `enabled === false`, le bouton Appeler reste cliquable jusqu’à l’échec API — pas de disable préventif ni message bloquant au-dessus du formulaire.
- **Recommandation** : `disabled={!enabled || isActive}` + bandeau `role="status"` « Dialer désactivé (flag base) » quand `!enabled`.

#### D9 — Contraste des hints (`opacity: 0.6–0.7`)

- **Fichier:ligne** : `calls-dialer.css:105-109`, `168-171`, `196-199`, `217-220`
- **Problème** : Labels déjà en `--xos-muted` (#8a8f98) + hints à opacity 0.65 → risque échec WCAG AA sur fond glass sombre.
- **Recommandation** : Remplacer opacity par une couleur token unique (`--xos-muted`) sans double atténuation ; viser ratio ≥ 4.5:1.

#### D10 — Cohérence design system : variants OK, patterns manquants

- **Fichier:ligne** : usages Tag/Button dans les 3 vues ; `EmptyState.tsx` / `Skeleton.tsx` non importés
- **Problème** : Variants utilisés (`accent`, `alert`, `muted`, `warning`, `primary`, `secondary`, `danger`, `ghost`, `sm`) existent tous — pas de variant inventé. Écart : le module n’adopte pas EmptyState/Skeleton pourtant standards ailleurs dans Calls.
- **Recommandation** : Aligner sur RunnerView/RdvSuiviView (EmptyState + role/status) pour homogénéité produit.

---

## Priorisation recommandée

| Priorité | ID | Action |
|---|---|---|
| P0 | S1 | Budget atomique sur chemin WebRTC |
| P0 | S2 | Server-side connection / webhook / from (ne plus faire confiance au body) |
| P0 | S3 | Validation E.164 serveur |
| P1 | S4 | Brancher rate limit (store partagé) |
| P1 | S5 | Idempotency-Key client pour dial |
| P1 | D1, D7 | Play disabled explicable + audio unique |
| P2 | S6, S8, D2–D6 | Erreurs sanitaires, middleware, a11y, responsive, select |

---

## Périmètre non modifié

Aucun fichier hors ce rapport n’a été modifié. Rapport livré uniquement dans `docs/audits/lot-11.13-securite-design-grok.md`.
