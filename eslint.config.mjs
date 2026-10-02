import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
export default [
  { ignores: ['node_modules/**', 'dist/**', '.wsl-migration/**'] },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] } } },
  { files: ['src/**/*.{ts,tsx,vue}', 'scripts/**/*.mjs'], rules: { 'no-script-url': 'error' } },
  { files: ['tests/**/*.ts'], rules: { 'no-script-url': 'off' } },
  { files: ['**/*.{ts,tsx,js,mjs,vue}'], rules: { 'no-eval': 'error', 'no-implied-eval': 'error', 'vue/no-v-html': 'error' } },
];
