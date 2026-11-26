// ESLint flat config — SAST con eslint-plugin-security (Tarea 7, gate "avisa")
const js = require('@eslint/js');
const security = require('eslint-plugin-security');

module.exports = [
  {
    files: ['src/**/*.js'],
    ...js.configs.recommended,
  },
  {
    files: ['src/**/*.js'],
    plugins: {
      security,
    },
    rules: {
      ...security.configs.recommended.rules,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
];
