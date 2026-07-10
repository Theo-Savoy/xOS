# 🔍 Rapport de Revue Quality Control (QC) — Lot 1.3 (CRM Cleaner Iframe)

Ce rapport présente l'audit de qualité, de non-régression et d'accessibilité mené sur le lot de livraison **1.3 (Iframe CRM Cleaner)** du projet X OS.

---

## 📋 Statut des Vérifications Automatiques (CI/CD Local)

Toutes les commandes de vérification ont été exécutées avec succès sur la branche de travail `Theo-Savoy/xos-lot-1.3-cleaner` (commit `e4fc60b`) :

*   `npx tsc --noEmit` : **OK** (aucune erreur de type)
*   `npx eslint .` : **OK** (aucune alerte de style ou de syntaxe)
*   `npm run build` : **OK** (build Vite réussi en 163ms)
*   `NODE_ENV=test npm test -- --run` : **OK** (21 tests unitaires et d'intégration Vitest/JSDOM réussis à 100%, y compris les nouveaux tests d'iframe de `CleanerApp.test.tsx`)
*   `git diff --check` : **OK** (aucune erreur de formatage ou d'espace en fin de ligne)

---

## 🔒 Vérification de Non-Régression Statique

Les fichiers critiques du "Cleaner" legacy sont restés strictement inchangés dans le diff de livraison :
*   `public/dashboard.html` : **Inchangé**
*   `api/refresh.py` : **Inchangé**
*   `api/update.js` : **Inchangé**
*   `api/history.js` : **Inchangé**
*   `middleware.js` : **Inchangé**

Le périmètre de modification est exclusivement restreint aux fichiers spécifiés du lot 1.3 :
*   `src/apps/cleaner/CleanerApp.tsx` (Création)
*   `src/apps/cleaner/CleanerApp.test.tsx` (Création)
*   `src/os/registry.ts` (Ajout au Dock et déclaration)
*   `src/os/registry.test.ts` (Mise à jour du test de registre)

---

## 🔎 Analyse d'Architecture, UX & Sécurité

### 1. Audit de la Race Condition d'Authentification (Supabase ↔ Iframe)
*   **Classification** : **HIGH** (Risque d'expérience utilisateur cassée / blocage d'iframe)
*   **Description** : Le hook `useSession` déclenche l'appel `fetch('/api/sso-bridge')` en mode *fire-and-forget* (asynchrone non bloquant) dès que la session Supabase est présente, et renvoie immédiatement l'état `session` actif. Le composant `App` affiche alors le bureau virtuel (`Desktop`). Si la fenêtre `CRM Cleaner` s'ouvre automatiquement au démarrage (restaurée depuis `localStorage`), l'iframe demande `/dashboard.html` en parallèle. Si cette requête d'iframe arrive au middleware Vercel *avant* que l'appel `sso-bridge` ne se soit terminé et n'ait écrit le cookie `xos_auth`, le middleware retourne un code `401` et sert le formulaire de connexion Basic Auth legacy. L'iframe se fige alors sur la boîte de login legacy et ne se rechargera pas d'elle-même, même après l'écriture ultérieure du cookie par le bridge.
*   **Recommandation** : **FIX BEFORE MERGE**. Modifier `useSession.ts` pour attendre la résolution positive de l'appel `/api/sso-bridge` avant de passer l'état `loading` à `false` et de propager la session au reste de l'application.

---

### 2. Audit du Contenu du Dock V1 (Registry)
*   **Classification** : **MEDIUM** (Gestion de la mise en production)
*   **Description** : Le registre `src/os/registry.ts` contient actuellement les applications fictives `overview-demo`, `notes-demo`, et `ui-demo` en plus de `cleaner`. Pour le lancement de la version 1.0 (V1) en production, ces applications mockées affichant des données statiques ne doivent pas être visibles par les commerciaux finaux.
*   **Recommandation** : **FIX BEFORE MERGE**. Conditionner l'inclusion des applications de démo dans le registre au mode développement :
    ```typescript
    export const appRegistry: AppManifest[] = [
      {
        id: "cleaner",
        title: "CRM Cleaner",
        icon: "◈",
        component: lazy(() => import("../apps/cleaner/CleanerApp")),
        defaultSize: { w: 1100, h: 540 },
      },
      ...(import.meta.env.DEV ? [
        {
          id: "overview-demo",
          title: "Aperçu commercial",
          icon: "◒",
          component: lazy(() => import("../apps/demo/OverviewDemo")),
          defaultSize: { w: 760, h: 520 },
        },
        // ... autres démos
      ] : [])
    ];
    ```

---

### 3. UX & Accessibilité de l'Iframe
*   **Accessibilité (A11y)** : **Conforme**. L'attribut `title="CRM Cleaner"` est correctement positionné sur la balise `<iframe>`, permettant aux lecteurs d'écran d'identifier le contenu du cadre.
*   **UX (Resize lag)** : **LOW**. Lors du redimensionnement de la fenêtre dans `react-rnd`, si la souris passe au-dessus de l'iframe, le drag&drop peut saccader car l'iframe capture les mouvements de souris. (Piste d'amélioration future : ajouter un masque transparent au-dessus de l'iframe pendant les phases de drag/resize actives de `react-rnd`).
*   **Sécurité (Sandbox)** : **Sans action**. L'iframe chargeant une page locale de même origine (`same-origin`), l'absence de l'attribut `sandbox` est justifiée car le dashboard legacy requiert l'exécution complète de scripts, la soumission de formulaires et l'affichage de confirmations (`confirm()`) sans restriction artificielle qui casserait son fonctionnement.

---

## ⚖️ Verdict de Livraison

*   **Verdict général** : **FIX BEFORE MERGE** (bloqué par la race condition d'authentification à résoudre dans le socle commun de session).
