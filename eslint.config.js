// @ts-check
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/dist-test/',
      '**/.vscode-test/',
      '**/test-results/',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // ADR 0001: core runs in plain Node, so it never imports the VS Code API.
    files: ['packages/core/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { paths: ['vscode'] }],
    },
  },
);
