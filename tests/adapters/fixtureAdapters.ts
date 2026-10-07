import { vi } from 'vitest'
import * as PIXI from 'pixi.js'
import Spine38Adapter from '@/adapters/pixi7/spine38/Spine38Adapter'
import Spine40Adapter from '@/adapters/pixi7/spine40/Spine40Adapter'
import Spine41Adapter from '@/adapters/pixi7/spine41/Spine41Adapter'
import Spine42Adapter from '@/adapters/pixi8/spine42/Spine42Adapter'
import Spine43Adapter from '@/adapters/pixi8/spine43/Spine43Adapter'
import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import { fixtureFileSet, type FixtureVersion } from '../fixtures/spine/fixtures'

const ADAPTERS = {
  '3.8': Spine38Adapter, '4.0': Spine40Adapter, '4.1': Spine41Adapter, '4.2': Spine42Adapter, '4.3': Spine43Adapter,
} as const

/** Loads a fixture (or `skeletonJson` with the fixture atlas) through the real adapter, headless: blank textures, no image decoding. */
export async function loadFixtureAdapter<V extends FixtureVersion>(ver: V, skeletonJson?: string): Promise<InstanceType<typeof ADAPTERS[V]>> {
  const a = new ADAPTERS[ver]() as InstanceType<typeof ADAPTERS[V]>
  const pixi7 = ver === '3.8' || ver === '4.0' || ver === '4.1'
  const spy = pixi7
    ? vi.spyOn(PIXI.Texture, 'from').mockImplementation(() => new PIXI.Texture(new PIXI.BaseTexture(null, { width: 4, height: 4 })))
    : vi.spyOn(a as unknown as { _loadTextures: () => Promise<Map<string, unknown>> }, '_loadTextures').mockResolvedValue(new Map())
  const fileSet = fixtureFileSet(ver, pixi7)
  if (skeletonJson) fileSet.skeleton = { ...fileSet.skeleton, fileBody: skeletonJson }
  await a.load(fileSet)
  spy.mockRestore()
  return a
}

/** One runtime frame (state update → apply → world), as the Pixi ticker runs it. */
export function step(a: ISpineAdapter, dt: number): void {
  (a.getSpineObject() as { update(dt: number): void }).update(dt)
}

export const local = (a: ISpineAdapter, bone: string) => a.getBoneLocalTransforms().find(b => b.name === bone)!.local
export const applied = (a: ISpineAdapter, bone: string) => a.getBoneLocalTransforms().find(b => b.name === bone)!.applied
export const world = (a: ISpineAdapter, bone: string) => a.getBoneTransforms().find(b => b.name === bone)!

/** Signed smallest difference between two angles in degrees. */
export const angleDiff = (x: number, y: number) => ((x - y) % 360 + 540) % 360 - 180
