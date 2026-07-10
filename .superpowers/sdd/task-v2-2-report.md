# Rapport Lot v2.2 — Presets fonction élargis + opacité fenêtres

Branche : `Theo-Savoy/xos-cm-v2-2-adjust`. Base : `6aca2bf` (main avec v2.1).

## État RED initial (avant correctifs)

```bash
npm test -- --run api/calls-list.test.js -t "responsable_rh"
# FAIL — preset responsable_rh absent du mapping, aucune clause SOQL Title LIKE
```

Les 7 nouveaux presets RH/org, les enrichissements v2.1 et l'opacité du contenu fenêtre étaient absents.

## Cycle TDD RED → GREEN

### 1. Presets Fonction élargis + enrichissement v2.1

| Test ciblé | RED | GREEN |
|---|---|---|
| `api/calls-list.test.js -t "mirrors front FONCTION_PRESETS"` | 4 presets seulement | 11 presets synchrones backend ↔ `src/crm/index.ts` |
| `api/calls-list.test.js -t "responsable_rh preset clauses"` | Pas de clause `%responsable rh%` / IN RRH,HRBP | `fonctionPresets` enrichi dans `mapping.js` + miroir front |
| `api/calls-list.test.js -t "unknown fonction presets"` | (passait déjà — comportement documenté) | `buildFonctionConditions` ignore les ids inconnus sans crash |
| `scripts/call-target-query.check.js` | Pas d'assertions RH | Assertions `responsable_rh`, `directeur_rh`, preset inconnu |

**Nouveaux presets** : `responsable_rh`, `developpement_rh`, `directeur_rh`, `pedagogie`, `sirh`, `recrutement`, `direction_generale`.

**Enrichissements v2.1** :
- `charge_formation` : +5 likes (`training project manager`, `coordinat%formation%`, etc.)
- `directeur_formation` : + `%training director%`, `%head of learning%`
- `digital_learning_manager` : + exact `DLM`

Variantes accentuées/non accentuées fournies pour SOQL (ex. `%développement rh%` + `%developpement rh%`, `%pédagogique%` + `%pedagogique%`).

### 2. Fenêtres XOS — contenu opaque, titlebar verre

| Aspect | Avant | Après |
|---|---|---|
| `.xos-window` | `background: rgba(5,9,31,0.9)` + `backdrop-filter` sur toute la fenêtre | Fond opaque `--xos-window-content-bg` ; blur retiré du conteneur |
| `.xos-window__titlebar` | `background: rgba(255,255,255,0.035)` sans blur propre | `--xos-window-titlebar-bg` translucide + `backdrop-filter: blur(24px)` |
| `.xos-window__content` | Héritait la transparence | `background: var(--xos-window-content-bg)` (#0a1129, dérivé de rgb(5,9,31)) |
| Variables | — | `--xos-window-content-bg`, `--xos-window-titlebar-bg` dans `theme.css` |

Pas de changement DOM. `overflow: hidden` et `border-radius` conservés ; états focus/maximized inchangés côté structure.

## Commandes gate de sortie (GREEN final)

```bash
node scripts/call-target-query.check.js          # OK
node scripts/calls-v2-logic.check.js             # OK
npm test -- --run                                # 17 files, 252 tests, 0 échec
npx tsc --noEmit                                 # 0 erreur
npx eslint .                                     # 1 warning préexistant react-refresh/only-export-components
npm run build                                    # succès
git diff --check                                 # succès
```

## Fichiers modifiés

- `api/_crm/mapping.js` — 7 nouveaux presets + enrichissements v2.1
- `src/crm/index.ts` — miroir `FONCTION_PRESETS` (11 entrées)
- `api/calls-list.test.js` — sync mirror, responsable_rh SOQL, preset inconnu
- `scripts/call-target-query.check.js` — assertions presets RH
- `src/os/theme.css` — variables fond fenêtre
- `src/os/desktop.css` — opacité contenu, verre titlebar

## Préoccupations restantes

- Les presets `pedagogie`, `sirh`, `recrutement`, `direction_generale` sont identifiés dans les données org mais non validés en usage réel — à ajuster si des intitulés fréquents manquent.
- Le fond opaque `#0a1129` est une approximation du rendu perçu de `rgba(5,9,31,0.9)` sur le wallpaper ; affiner si le contraste titlebar/contenu semble trop marqué en prod.
