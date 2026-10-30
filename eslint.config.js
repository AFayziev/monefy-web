import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/', '.wrangler/', 'worker-configuration.d.ts', 'scripts/*.gs', 'migrations/'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      curly: ['error', 'all'],
      // Descriptive names: no single-letter variables, parameters or properties.
      'id-length': ['error', { min: 2, exceptions: ['_', 'i', 'j'], properties: 'never' }],
      'padding-line-between-statements': [
        'error',
        // A blank line before jumps and control flow, and around blocks and declarations.
        { blankLine: 'always', prev: '*', next: ['return', 'throw', 'break', 'continue'] },
        {
          blankLine: 'always',
          prev: '*',
          next: ['if', 'for', 'while', 'do', 'switch', 'try', 'function', 'class'],
        },
        {
          blankLine: 'always',
          prev: ['if', 'for', 'while', 'do', 'switch', 'try', 'function', 'class'],
          next: '*',
        },
        { blankLine: 'always', prev: 'multiline-block-like', next: '*' },
        { blankLine: 'always', prev: '*', next: 'multiline-block-like' },
        // Multi-line statements stand on their own.
        { blankLine: 'always', prev: 'multiline-const', next: '*' },
        { blankLine: 'always', prev: '*', next: 'multiline-const' },
        { blankLine: 'always', prev: 'multiline-expression', next: '*' },
        { blankLine: 'always', prev: '*', next: 'multiline-expression' },
        // Declarations are grouped, then separated from the code that uses them.
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        { blankLine: 'always', prev: '*', next: 'export' },
        { blankLine: 'any', prev: 'export', next: 'export' },
      ],
    },
  },
  {
    files: ['worker/**', 'web/vite.config.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
  { files: ['web/src/**'], languageOptions: { globals: globals.browser } },
  { files: ['scripts/**'], languageOptions: { globals: globals.node } },
  {
    files: ['scripts/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier,
  // eslint-config-prettier disables curly; this project wants it enforced.
  { rules: { curly: ['error', 'all'] } },
);
