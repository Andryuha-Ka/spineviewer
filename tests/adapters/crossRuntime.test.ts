import { describe, it, expect } from 'vitest'
import type { BoneLocalTransform, BoneTransform, ISpineAdapter } from '@/core/types/ISpineAdapter'
import { FIXTURE_VERSIONS } from '../fixtures/spine/fixtures'
import { loadFixtureAdapter, step, angleDiff } from './fixtureAdapters'

const TOL = 0.01
const ANGLES = new Set(['rotation', 'shearX', 'shearY'])

function expectClose(actual: object, expected: object, where: string) {
  for (const [k, v] of Object.entries(expected)) {
    if (typeof v !== 'number') continue
    const got = (actual as Record<string, number>)[k]
    const diff = ANGLES.has(k) ? angleDiff(got, v) : got - v
    expect(Math.abs(diff), `${where}.${k}: ${got} vs ${v}`).toBeLessThan(TOL)
  }
}

interface Snapshot {
  local: Record<string, BoneLocalTransform>
  applied: Record<string, BoneLocalTransform>
  world: Record<string, BoneTransform>
  setup: Record<string, BoneLocalTransform | null>
}

function snapshot(a: ISpineAdapter): Snapshot {
  const s: Snapshot = { local: {}, applied: {}, world: {}, setup: {} }
  for (const b of a.getBoneLocalTransforms()) { s.local[b.name] = b.local; s.applied[b.name] = b.applied }
  for (const w of a.getBoneTransforms()) s.world[w.name] = w
  for (const b of a.bones) s.setup[b.name] = a.getBoneSetupTransform(b.name)
  return s
}

function expectSame(snaps: Array<[string, Snapshot]>) {
  const [refVer, ref] = snaps[0]
  for (const [ver, s] of snaps.slice(1)) {
    for (const part of ['local', 'applied', 'world', 'setup'] as const) {
      expect(Object.keys(s[part])).toEqual(Object.keys(ref[part]))
      for (const bone of Object.keys(ref[part])) {
        expectClose(s[part][bone]!, ref[part][bone]!, `${ver} vs ${refVer} ${part}.${bone}`)
      }
    }
  }
}

async function poseAll(pose: (a: ISpineAdapter) => void): Promise<Array<[string, Snapshot]>> {
  const out: Array<[string, Snapshot]> = []
  for (const ver of FIXTURE_VERSIONS) {
    const a = await loadFixtureAdapter(ver)
    pose(a)
    out.push([ver, snapshot(a)])
    a.destroy()
  }
  return out
}

describe('the same pose agrees on all five runtimes', () => {
  it('setup pose, incl. local shearX 10 and the IK-bent bones', async () => {
    const snaps = await poseAll(a => step(a, 0))
    for (const [, s] of snaps) expect(s.local.c.shearX).toBe(10)
    expectSame(snaps)
  })

  it('animation in its linear segments, plus an override that moves the IK target', async () => {
    const snaps = await poseAll(a => {
      a.setAnimation(0, 'anim', false)
      a.setBoneOverride('target', { x: 50, y: 70, rotation: 15 })
      step(a, 0.6)
    })
    for (const [, s] of snaps) expect(s.local.c.rotation).toBeCloseTo(55, 4)
    expectSame(snaps)
  })
})
