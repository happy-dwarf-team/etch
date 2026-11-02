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
    // The media pipeline's helper extension is plain CommonJS, loaded by VS Code as it is.
    files: ['packages/media/live-helper/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', exports: 'writable', process: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // ADR 0001: core runs in plain Node, so it never imports the VS Code API.
    files: ['packages/core/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { paths: ['vscode'] }],
    },
  },
);
