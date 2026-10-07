import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom',
    restoreMocks: true,
    // real Spine runtime loads exceed the 5 s default under parallel load
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // inline so their 'pixi.js' imports go through spinePixi8Redirect instead of Node resolving Pixi 7
    server: { deps: { inline: ['spine-pixi-v8-43', '@esotericsoftware/spine-pixi-v8'] } },
  },
}))
