import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'public', 'api', '.worktrees/**', '**/.worktrees/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: [
      'src/apps/**/*.{ts,tsx}',
      'src/os/**/*.{ts,tsx}',
      'src/auth/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "JSXOpeningElement[name.name='button']",
          message:
            'Use <Button> from src/components/ui instead of a native <button> (vivier UI — see docs/audits/audit-consolidation-2026-07-17.md).',
        },
      ],
    },
  },
  {
    // Frontière modules Combo: interdire les deep imports depuis la RACINE de
    // apps/calls/ (où aucun fichier ne devrait connaître l'intérieur des modules
    // sauf CallManagerApp.tsx, l'entry point). Évite la dérive pendant Phase 11.
    //
    // Whitelist: fichiers partagés historiquement qui font du cross-module
    // (formControls, EventPanel, CommandBar). À migrer dans un module commun
    // lors d'un refactor dédié (post-Phase 11). Jusque-là, la règle catch
    // uniquement les NOUVEAUX imports interdits.
    files: [
      'src/apps/calls/*.{ts,tsx}',
      'src/apps/calls/*',
    ],
    ignores: [
      '**/CallManagerApp.tsx',
      '**/CommandBar.tsx',
      '**/CommandBar.test.tsx',
      '**/EventPanel.tsx',
      '**/formControls.tsx',
      '**/CallManagerFixes.test.tsx',
      '**/responsive.test.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                './modules/*/**',
                './modules/*',
              ],
              message:
                'Do not deep-import into apps/calls/modules/* from the apps/calls/ root. CallManagerApp.tsx is the only entry point allowed to traverse modules.',
            },
          ],
        },
      ],
    },
  },
  {
    // Telnyx boundary (Phase 11): tout accès direct à la lib Telnyx ou aux
    // helpers d'infrastructure Telnyx doit passer par
    // src/apps/calls/modules/dialer/infrastructure/telnyx/**. Cela évite que
    // d'autres modules ou apps n'appellent l'API Telnyx directement.
    //
    // Note: tant que la lib Telnyx n'est pas installée, cette règle catche
    // uniquement les imports du barrel `apps/calls/modules/dialer` hors
    // infrastructure/telnyx. Sera renforcée en 11.2 quand le SDK sera
    // ajouté.
    files: [
      'src/**/*.{ts,tsx}',
    ],
    ignores: [
      '**/modules/dialer/infrastructure/telnyx/**',
      '**/modules/dialer/index.ts',
      '**/dialer/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/modules/dialer/infrastructure/telnyx/**',
                '**/modules/dialer/infrastructure/telnyx',
              ],
              message:
                'Direct imports of Telnyx infrastructure are forbidden outside modules/dialer/infrastructure/telnyx/. Use the public dialer API instead.',
            },
          ],
        },
      ],
    },
  },
);
