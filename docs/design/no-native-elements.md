# Éléments de formulaire natifs

## Décision

Les interfaces X OS n'utilisent pas directement `<select>`,
`<input type="date">`, `<input type="time">` ni
`<input type="checkbox">`. Ces contrôles passent toujours par un composant du
design system.

Les champs `<input type="text">`, `<input type="email">` et `<textarea>`
restent autorisés lorsqu'ils sont stylés avec les tokens et conventions du
design system.

Cette règle garantit une cohérence visuelle entre les applications, une
accessibilité contrôlée et un comportement de focus et de focus trap cohérent
entre les composants.

## Vivier partagé

Avant de créer un contrôle, consulter `src/components/ui/`. Ce vivier contient
déjà `Button`, `GlassCard`, `Tag`, `Select`, `Checkbox` et `Modal`; ces
composants sont la source de référence et doivent être réutilisés.

L'[audit de consolidation](../audits/audit-consolidation-2026-07-17.md#32-adoption-réelle-par-app)
recense notamment 134 boutons natifs improvisés au §3.2. Cette dette confirme
la nécessité d'un contrat partagé et d'un verrou anti-régression.

## Chantiers prioritaires de mutualisation

Le plan de l'audit s'applique aux développements qui suivent ce brief :

1. **Lot 1 — fondations** : mutualiser le client authentifié dans
   `src/lib/apiClient.ts`, centraliser les utilitaires de dates dans
   `src/lib/dates.ts` et `api/_lib/dates.js`, puis enrichir les tokens de thème
   et remplacer progressivement les couleurs codées en dur.
2. **Lot 2 — vivier** : livrer `Button` v2 avec ses variants et tailles,
   unifier les overlays dans `Modal`, puis promouvoir `EmptyState`, `Skeleton`,
   `ProgressBar`, `ChipGroup` sous la forme `SegmentedControl`, et `DatePicker`
   dans `src/components/ui/`. Chaque promotion doit être documentée dans la
   page `ui-demo` et remplacer les implémentations locales concernées.

Ces lots sont des chantiers transverses à exécuter de façon progressive et
testable; ils ne justifient pas de réinventer un composant dans une application
en attendant leur migration complète.
