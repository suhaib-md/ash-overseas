import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      '.wrangler',
      'migrations',
      'coverage',
      'worker/worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Client (browser) code
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // Worker + shared code (no DOM globals)
  {
    files: ['worker/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.node },
    },
  },
  // Config files run in Node
  {
    files: ['*.config.{ts,js}', 'vitest.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
