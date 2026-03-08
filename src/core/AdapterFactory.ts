/**
 * @file AdapterFactory.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { IPixiApp } from './types/IPixiApp'
import type { ISpineAdapter } from './types/ISpineAdapter'
import type { PixiVersion, SpineVersion } from './stores/useVersionStore'

/**
 * Dynamically imports and creates a Pixi application for the given version.
 * Each adapter is lazily loaded so both Pixi 7 and Pixi 8 are never bundled
 * together in the same chunk.
 */
export async function createPixiApp(
  pixiVersion: PixiVersion,
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
): Promise<IPixiApp> {
  if (pixiVersion === 7) {
    const { Pixi7App } = await import('@/adapters/pixi7/Pixi7App')
    return new Pixi7App(canvas, w, h)
  }
  // Register SpinePipe extension BEFORE initializing the Pixi8 Application.
  // spine-pixi-v8's index.js calls extensions.add(SpinePipe) as a side effect,
  // which must happen before app.init() so the renderer includes the 'spine' pipe.
  await import('@esotericsoftware/spine-pixi-v8')
  const { Pixi8App } = await import('@/adapters/pixi8/Pixi8App')
  return Pixi8App.create(canvas, w, h)
}

/**
 * Dynamically imports and creates a Spine adapter for the given version combo.
 * Spine adapters are implemented in Step 4.
 */
export async function createSpineAdapter(
  pixiVersion: PixiVersion,
  spineVersion: SpineVersion,
): Promise<ISpineAdapter> {
  const key = `${pixiVersion}-${spineVersion}` as const

  const loaders: Record<string, () => Promise<{ default: new () => ISpineAdapter }>> = {
    '7-3.8': () => import('@/adapters/pixi7/spine38/Spine38Adapter'),
    '7-4.0': () => import('@/adapters/pixi7/spine40/Spine40Adapter'),
    '7-4.1': () => import('@/adapters/pixi7/spine41/Spine41Adapter'),
    '8-4.2': () => import('@/adapters/pixi8/spine42/Spine42Adapter'),
  }

  const loader = loaders[key]
  if (!loader) throw new Error(`No adapter for pixi${pixiVersion} + spine${spineVersion}`)

  const mod = await loader()
  return new mod.default()
}
