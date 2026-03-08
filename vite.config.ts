import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'
import pkg from './package.json'

/**
 * Redirects `import … from 'pixi.js'` inside @esotericsoftware/* packages to
 * the 'pixi8' alias (pixi.js@8), so the Spine 4.2 adapter and Pixi8App share
 * one Pixi instance.
 *
 * Using this.resolve('pixi8') instead of a hardcoded path ensures the request
 * goes through Vite's normal resolution (alias + optimizeDeps pre-bundle).
 * This prevents eventemitter3 (CJS, nested inside pixi8/node_modules) from
 * being served raw to the browser — it gets bundled by esbuild instead.
 *
 * enforce:'pre' is required so the hook runs before Vite's built-in resolver.
 */
function spinePixi8Redirect(): Plugin {
  return {
    name: 'spine-pixi8-redirect',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (id === 'pixi.js' && importer?.includes('@esotericsoftware')) {
        const resolved = await this.resolve('pixi8', importer, { skipSelf: true })
        return resolved
      }
    },
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
    // pixi8 must be pre-bundled so esbuild converts its CJS deps (eventemitter3)
    // to ESM. Without this the raw CJS file is served to the browser and fails.
    include: ['pixi8'],
    // Exclude spine packages so their pixi.js imports reach our resolveId hook.
    exclude: ['@esotericsoftware/spine-pixi-v8', '@esotericsoftware/spine-core'],
  },
})
