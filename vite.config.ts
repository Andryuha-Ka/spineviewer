import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'
import { readFileSync } from 'fs'
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

/**
 * Redirects `import … from 'pixi.js'` inside @esotericsoftware/* packages to
 * the 'pixi8' alias (pixi.js@8), so the Spine 4.2 adapter and Pixi8App share
 * one Pixi instance.
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

/**
 * Redirects `import … from 'pixi.js'` inside @pixi-spine/* packages to
 * the 'pixi7' alias, so all Spine 3.8/4.0/4.1 adapters and Pixi7App share
 * one Pixi 7 instance. Without this, @pixi-spine pre-bundles its own copy of
 * pixi.js, creating a second extensions registry where Renderer is never
 * registered, causing "Unable to auto-detect a suitable renderer."
 */
function spinePixi7Redirect(): Plugin {
  return {
    name: 'spine-pixi7-redirect',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (id === 'pixi.js' && importer?.includes('@pixi-spine')) {
        const resolved = await this.resolve('pixi7', importer, { skipSelf: true })
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
    spinePixi7Redirect(),
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
    include: ['pixi7', 'pixi8'],
    // Exclude @esotericsoftware so their pixi.js imports reach spinePixi8Redirect.
    exclude: ['@esotericsoftware/spine-pixi-v8', '@esotericsoftware/spine-core'],
  },
})
