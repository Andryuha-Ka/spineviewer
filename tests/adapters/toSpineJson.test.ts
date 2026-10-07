import { describe, it, expect } from 'vitest'
import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import { FIXTURE_VERSIONS, FIXTURE_SPINE_STRINGS } from '../fixtures/spine/fixtures'
import { loadFixtureAdapter, step, local, world } from './fixtureAdapters'

// TODO: remove the any when the Spine JSON document gets a type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any

describe.each(FIXTURE_VERSIONS)('%s adapter: toSpineJson', ver => {
  it('writes the skeleton data as loaded, never the live pose', async () => {
    const a = await loadFixtureAdapter(ver)
    a.setAnimation(0, 'anim', true)
    a.setBoneOverride('tail', { rotation: 77, x: 3 })
    step(a, 0.6)
    expect(local(a, 'c').rotation).toBeCloseTo(55, 3)

    const { json, warnings } = a.toSpineJson() as { json: Doc; warnings: string[] }
    expect(warnings).toEqual([])
    expect(json.skeleton.spine).toBe(FIXTURE_SPINE_STRINGS[ver])
    const bone = (name: string) => json.bones.find((b: Doc) => b.name === name)
    expect(bone('c').rotation).toBe(5)
    expect(bone('tail')).toMatchObject({ rotation: 30, x: -40 })
    if (ver === '4.3') {
      expect(json.constraints.find((c: Doc) => c.type === 'slider')).toEqual({ type: 'slider', name: 'slide', animation: 'slider-anim' })
    }
    a.destroy()
  })

  it('the JSON loads back into the same adapter and plays alike', async () => {
    const src = await loadFixtureAdapter(ver)
    const copy = await loadFixtureAdapter(ver, JSON.stringify(src.toSpineJson().json))
    expect(copy.animations).toEqual(src.animations)
    expect(copy.bones).toEqual(src.bones)
    for (const a of [src, copy] as ISpineAdapter[]) {
      a.setAnimation(0, 'extra', false)
      step(a, 0.45)
    }
    for (const b of src.bones) {
      const [p, q] = [world(src, b.name), world(copy, b.name)]
      expect(Math.abs(q.x - p.x), b.name).toBeLessThan(0.05)
      expect(Math.abs(q.y - p.y), b.name).toBeLessThan(0.05)
    }
    src.destroy()
    copy.destroy()
  })

  it('throws before a skeleton is loaded', async () => {
    const a = await loadFixtureAdapter(ver)
    const Ctor = a.constructor as new () => ISpineAdapter
    expect(() => new Ctor().toSpineJson()).toThrow('No skeleton loaded')
    a.destroy()
  })
})
