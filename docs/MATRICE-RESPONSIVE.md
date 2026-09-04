# Matrice responsive du runner Combo

Cette matrice est la baseline visuelle avant migration. Le container observé
est `.calls-app`, conformément au contrat #119 ; les seuils ne sont donc pas
déduits d’un `window.innerWidth` isolé dans le composant.

## Largeurs et hauteurs

| Largeur | Bande contractuelle | Attente legacy à conserver | Capture |
| ---: | --- | --- | --- |
| 320 px | `<720` | une zone compacte ; la file et le contexte restent des surfaces repliables ; le CTA ne doit pas sortir du viewport | `runner-*-320x620.png` |
| 500 px | `<720` | même zone mobile, avec davantage de place pour les libellés et la fiche | `runner-*-500x620.png` |
| 719 px | `<720` | dernier point mobile avant le seuil container | `runner-*-719x620.png` |
| 720 px | `720–899` | bascule intermédiaire : deux régions, file et fiche ; contexte en surface secondaire | `runner-*-720x620.png` |
| 899 px | `720–899` | dernier point intermédiaire avant l’ouverture desktop | `runner-*-899x620.png` |
| 900 px | `≥900` | trois responsabilités visibles : file, fiche, inspecteur/contexte | `runner-*-900x620.png` |
| 1200 px | `≥900` | desktop large sans largeur artificielle maximale | `runner-*-1200x620.png` |

`620 px` est la hauteur nominale de la fenêtre Combo. Le scénario
`power-conversation` est aussi capturé à `420 px`, hauteur contrainte qui
force la priorité à l’appel et à l’ACW :
`runner-power-conversation-{largeur}x420.png`. Le smoke a11y rejoue les six
états à `420 px` sur les sept largeurs, même lorsque la capture nominale est à
620 px.

## États majeurs capturés

| État | Racine/repère | Vérification de structure | Origine |
| --- | --- | --- | --- |
| `standard` | `.calls-view--runner` | liste standard, KPI legacy et actions de fiche présents | fixture DOM déterministe |
| `bulk` | `.calls-bulk-bar` | sélection groupée visible, formulaire bulk séparé de la fiche | fixture DOM déterministe |
| `power-off` | absence de `.calls-view--power` | message Power désactivé et liste standard disponibles | fixture DOM déterministe |
| `power-ready` | `.calls-view--power` + `.calls-power-strip` | CTA `Lancer 3 appels`, file prête et réglages exposés | fixture DOM déterministe |
| `power-wave` | `.calls-power-strip__line--ringing` | lignes en composition/sonnerie, `Raccrocher tout` visible | fixture DOM déterministe |
| `power-conversation` | `.calls-view--power-conversation` | conversation prioritaire, rail/queue non requis dans la zone principale | fixture DOM déterministe |

Les fixtures sont construites par
[`runnerStateMarkup`](../e2e/fixtures/runnerStates.ts). Les classes sont celles
du rendu actuel pour que les container queries et les tokens existants soient
exercés. Les états `wave` et `conversation` ne lancent aucun appel réel et ne
constituent pas une preuve du moteur `useDialerPool` ; ce moteur conserve ses
propres tests unitaires.

## Nommage et reproduction

La spec [`runner-responsive.spec.ts`](../e2e/runner-responsive.spec.ts) fixe
le viewport, émule `prefers-reduced-motion: reduce`, charge
`runnerFixtureDocument(state)` et utilise `toHaveScreenshot`. Les fichiers
générés sont dans `e2e/baselines/` avec les noms `runner-{state}-{width}x{height}.png`.

Commandes :

```sh
npx playwright test e2e/runner-responsive.spec.ts --update-snapshots --workers=1
npx playwright test e2e/runner-responsive.spec.ts e2e/runner-a11y.spec.ts --workers=1
```

La seconde commande doit comparer les 42 PNG existants et exécuter les 6
scénarios a11y. Une différence de capture doit être examinée avec le nom de
l’état, la largeur et la hauteur ; elle ne doit pas être masquée par une
tolérance globale.

## Points de vigilance pour la migration

- Le tableau large est un overflow intentionnel du wrapper de liste ; il ne
  doit pas devenir un débordement horizontal du shell.
- Les seuils `719/720` et `899/900` sont testés de part et d’autre pour
  détecter les off-by-one de container query.
- À `320 × 420`, les actions et le contenu de conversation doivent rester
  atteignables sans que le header ou le CTA soit coupé.
- Le changement d’état `power-wave → power-conversation` doit replier la file
  étendue et conserver une cible de consignation visible.
- Toute modification volontaire de la baseline doit venir avec une
  explication dans ce document et un nouveau run avec le même navigateur,
  reduced-motion et les mêmes dimensions.
