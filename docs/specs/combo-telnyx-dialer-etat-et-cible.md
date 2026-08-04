# Combo × Telnyx — État du dialer & cible power dialing

> **Statut : EN COURS (2026-08-04)** — transport WebRTC mono-ligne opérationnel,
> branchement UI livré (provider + CallBar + bouton Runner), power dialing 3
> lignes en conception. Recherche marché : `docs/power-dialer-research.md`
> (Minari vs Flunter). Audits : `docs/audits/lot-11.2`, `lot-11.3`,
> `lot-11.4`.

---

## 1. État du code (vérifié sur `main`)

### Transport (opérationnel, testé en réel)

| Brique | Fichier | État |
|---|---|---|
| Token WebRTC éphémère (triple gate JWT→flags→entitlement, dry-run = aucun token) | `api/dialer.js` `?resource=webrtc_token` | ✅ |
| Client SDK Telnyx 2.27.8 (import dynamique, null si token absent) | `infrastructure/telnyx/rtcClient.ts` | ✅ |
| Hook machine à états (idle→dialing→ringing→connected→ended, micro avant composer, pas d'auto-next) | `application/useRtcCall.ts` | ✅ |
| Badge debug codec/MOS/jitter | `useRtcCall` → `callStats` | ✅ **debug only** (affiché dans DialerView, PAS dans le produit) |
| G.722 en tête des codecs préférés (verdict lot-11.4 : 64kbps CBR, pas de transcodage PSTN) | `rtcClient.ts` `getPreferredCodecs` | ✅ |

### UI (branchement Combo livré, commit en cours)

| Brique | Fichier | État |
|---|---|---|
| **DialerProvider** — UNE instance de `useRtcCall`, exposée par contexte (garantit « un appel à la fois ») | `modules/dialer/DialerProvider.tsx` | ✅ nouveau |
| **CallBar** — barre persistante (phase, durée, numéro, Raccrocher, erreur) + `<audio data-rtc-remote>` monté en permanence (fix B2 : sans lui l'audio part mais on n'entend rien) | `modules/dialer/CallBar.tsx` | ✅ nouveau |
| Bouton Appeler/Raccrocher de la fiche contact branché sur le dialer (fallback `tel:` conservé) | `modules/runner/ContactCardPanel.tsx` | ✅ |
| DialerView consomme le provider (plus d'instance propre) | `modules/dialer/DialerView.tsx` | ✅ |
| `dialerDryRun` 3 niveaux (config/entitlement/flags) fourni au provider | `CallManagerApp.tsx` | ✅ |

### Config Telnyx (vérifiée 2026-08-04)

- Credential Connection `3018458287965210179`, `active=true`
- **`channel_limit: None`** → pas de limite explicite : le parallélisme est techniquement possible (plafond = plan Telnyx)
- `outbound_voice_profile_id: 3018524374878652022` (Portal, whitelist US/CA/FR)
- codecs : `['OPUS','G722','G711U','G711A']` + `getPreferredCodecs` navigateur : `[G722, OPUS, PCMU, PCMA]`
- `ani_override=None` (caller ID du SDK respecté), `localization=FR`, `call_parking_enabled=false`
- Credential WebRTC `d14c8093-…` (status active) stocké dans `dialer_user_entitlements.telnyx_credential_id`

---

## 2. Cible produit : POWER DIALING 3 lignes (décision Théo 2026-08-04)

### Le pattern (aligné Minari/Flunter — voir `docs/power-dialer-research.md`)

1. Le commercial clique **Play** → le système compose **3 numéros en parallèle** (configurable jusqu'à 5, cf. recherche)
2. **Skip automatique** : non-réponse / répondeur / mauvais numéro → avance dans la file
3. **Réponse humaine** sur une ligne → **connect** le commercial → **hangup les autres** (abandon des appels perdants)
4. L'appel terminé → **le système s'arrête** → le commercial **re-clique Play** pour relancer
   → le commercial reste **maître du rythme** : pas d'enchaînement automatique incontrôlé

> **Lecture réglementaire (corrigée 2026-08-04)** : ce pattern est du **power
> dialing parallèle mono-utilisateur** (standard du cold call B2B FR : Minari,
> Flunter), pas du prédictif massif de centre d'appels B2C. L'ARCEP 2022-1583
> §7.1.3 vise les systèmes automatisés « sans commande explicite d'un humain
> pour chaque appel » ; ici chaque cycle est déclenché par un clic humain et
> le commercial garde le rythme. Bloctel inapplicable en B2B (régime opt-out
> CNIL prospection professionnelle).

### Architecture cible

```
DialerPool (3 slots)                ← remplace la machine 1-ligne du provider
├── slot[0] : useRtcCall-line (idle/dialing/ringing/connected/failed)
├── slot[1] : ...
├── slot[2] : ...
├── file d'attente (queue de numéros à composer)
├── Play()    → compose les 3 prochains numéros
├── Skip()    → abandonne la ligne, passe au suivant
├── Connect() → réponse humaine : garde la ligne, hangup les autres
└── onEnded   → stop, attend le re-clic Play
```

- **3 lignes** : 3 instances du client TelnyxRTC (une par slot) — `channel_limit=None` le permet
- **UI** : panneau de file d'appels (état par ligne : ringing / connecté / skipped) + bouton Play/Pause global + la file à venir — le pattern « Live Parallel Call Status Panel » de la recherche
- **Pas de badge codec dans le produit** : le codec/MOS reste dans DialerView (panneau ops/debug)
- **AMD (répondeur)** : à prévoir pour le skip automatique voicemail — table stakes selon la recherche

### Livrable en lot (ordre)

1. **Lot 11.5 — DialerPool** : refactor `useRtcCall` → multi-slots + file + Play/Skip/Connect, tests
2. **Lot 11.6 — UI power dialing** : panneau de file dans le Runner, bouton Play/Pause, états par ligne
3. **Lot 11.7 — AMD** : détection répondeur (Phase B webhooks ou SDK) pour le skip auto

---

## 3. Décisions & contraintes (source de vérité)

- **B2B uniquement** — Bloctel inapplicable, régime opt-out CNIL prospection professionnelle (correction Théo 2×, 2026-08-03)
- **Caller ID par utilisateur** : `dialer_phone_numbers` (owner_user_id, e164, label, status, priority), sélecteur dans les paramètres — jamais de var d'env globale par user
- **`TELNYX_CALLER_ID_DEV`** = fallback DEV smoke test uniquement
- **Budget** : RPC atomique `dialer_reserve_budget`/`dialer_release_reservation`, kill switch `ORG_EXCEEDED`, dry-run 3 niveaux
- **ARCEP** : click-to-call humain, le commercial garde le rythme (re-clic Play), pas de parallélisation au-delà du paramétré, pas d'enchaînement auto après raccrochage
- **G.722 en tête** (verdict lot-11.4) — le bitrate n'était pas le problème (artefact ÷5s), la qualité réelle limitée par la jambe PSTN 8 kHz
