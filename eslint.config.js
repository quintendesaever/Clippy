import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'dashboard/dist/**', 'node_modules/**', 'dashboard/node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*', 'shared/**/*', 'scripts/**/*'], languageOptions: { globals: globals.node } },
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  { files: ['dashboard/src/**/*'], languageOptions: { globals: globals.browser } },
];
