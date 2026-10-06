import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom',
    restoreMocks: true,
    // inline so its 'pixi.js' imports go through spinePixi8Redirect instead of Node resolving Pixi 7
    server: { deps: { inline: ['spine-pixi-v8-43'] } },
  },
}))
