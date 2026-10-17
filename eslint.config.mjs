// Lint config for new and changed code only. Run: npm run lint:changed
// The app's dist/ scripts share globals through <script> tags, so no-undef is off;
// these rules catch real bugs without forcing a mass reformat of existing files.
import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['dist/vendor/**', 'dist/sw.js', '**/node_modules/**', 'mobile/ios/**', 'mobile/android/**', 'desktop/dist/**', '**/*.min.js'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.worker, ...globals.node } },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-redeclare': 'off',
      'no-inner-declarations': 'off',
      'no-control-regex': 'off', // intentional: filename sanitizing and binary-file sniffing
      'no-irregular-whitespace': ['warn', { skipComments: true, skipStrings: true, skipTemplates: true }],
    },
  },
  { files: ['dist/**/*.js', 'sw-template.js'], languageOptions: { sourceType: 'script' } },
];
