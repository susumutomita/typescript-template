import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

// Root typed linting covers repository automation scripts; generated workspaces extend it separately.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.spec.ts',
      '**/*.test.ts',
    ],
  },
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  sonarjs.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      // Existing repositories introduce assertion removal as a visible backlog;
      // new projects generated from this template can promote it to error at day one.
      '@typescript-eslint/consistent-type-assertions': [
        'warn',
        { assertionStyle: 'never' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      // Stylistic migrations must not hide correctness findings on adoption.
      '@typescript-eslint/array-type': 'warn',
      'sonarjs/slow-regex': 'warn',
      'sonarjs/no-invariant-returns': 'warn',
      'sonarjs/regex-complexity': 'warn',
      'sonarjs/no-os-command-from-path': 'warn',
      'sonarjs/no-alphabetical-sort': 'warn',
      // no-floating-promises uses `void promise` for intentional fire-and-forget.
      // Sonar forbids that construct, so promise-safety takes precedence.
      'sonarjs/void-use': 'off',
    },
  },
  {
    files: ['scripts/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
    },
  }
);
