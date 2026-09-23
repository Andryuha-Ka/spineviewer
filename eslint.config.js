import { defineConfig } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default defineConfig(
  {
    ignores: [
      'dist/**', 'node_modules/**', 'public/**', 'example/**', 'errors/**',
      'kb/**', '.claude/**', '.ai-work/**', '.docs/**', '.serena/**',
      'src/**/*.d.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // TypeScript already reports undefined identifiers, incl. unplugin auto-imports
      'no-undef': 'off',
      // storage and File System Access calls are best-effort by design
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
)
