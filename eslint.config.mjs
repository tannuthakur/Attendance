import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'src/types/database.ts',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Billing engine must stay pure: no framework / DB imports.
    files: ['src/lib/billing/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@supabase/*', 'next', 'next/*', 'react', '@/lib/supabase/*', '@/features/*'] },
      ],
    },
  },
];

export default config;
