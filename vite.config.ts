import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'

// Exact ESM entry for pixi.js@8 (our "pixi8" npm alias).
const pixi8Entry = path.resolve(__dirname, 'node_modules/pixi8/lib/index.mjs')

/**
 * Redirects `import … from 'pixi.js'` inside @esotericsoftware/* packages to
 * pixi8 (pixi.js@8), so the Spine 4.2 adapter and Pixi8App share one Pixi instance.
 *
 * enforce:'pre' is required — Vite's built-in node resolver runs before normal
 * plugins, so without it the hook is never reached for node_modules imports.
 */
function spinePixi8Redirect(): Plugin {
  return {
    name: 'spine-pixi8-redirect',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'pixi.js' && importer?.includes('@esotericsoftware')) {
        return pixi8Entry
      }
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    spinePixi8Redirect(),
    AutoImport({
      imports: ['vue', 'pinia', '@vueuse/core'],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [NaiveUiResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'pixi7': path.resolve(__dirname, 'node_modules/pixi.js'),
      'pixi8': path.resolve(__dirname, 'node_modules/pixi8'),
    },
  },
  optimizeDeps: {
    // Exclude from esbuild pre-bundling so Vite serves files directly and
    // our resolveId hook (above) can redirect pixi.js → pixi8 in dev mode too.
    exclude: ['@esotericsoftware/spine-pixi-v8', '@esotericsoftware/spine-core'],
  },
})
