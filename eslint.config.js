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
      'src/os/**/*.{ts,tsx}',
      'src/auth/**/*.{ts,tsx}',
    ],
    rules: {
      // Frontière modules Combo: interdire les deep imports depuis l'extérieur
      // de apps/calls/. CallManagerApp.tsx et modules/* sont exempted (entry
      // point + boundary interne).
      // Évite la dérive pendant Phase 11 (8-9 semaines, agents parallèles).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/apps/calls/modules/*/**',
                '**/apps/calls/modules/*',
              ],
              message:
                'Cross-module deep imports into apps/calls/modules/* are forbidden. Import only from CallManagerApp.tsx (entry point).',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/apps/**/*.{ts,tsx}',
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
);
