import { describe, it, expect } from 'vitest'
import {
  applyOverrides, mergeOverride, overridesToRecord, pickLocal, readApplied, readLocal, setupOf, worldShear, writeLocal,
} from '@/core/utils/boneTransform'
import type { BoneLocalTransform } from '@/core/types/ISpineAdapter'

const T: BoneLocalTransform = { x: 1, y: 2, rotation: 3, scaleX: 4, scaleY: 5, shearX: 6, shearY: 7 }

/** Y-up world matrix of axes X (len sx, angle rx) and Y (len sy, angle ry), in spine order a b c d. */
function matrix(rx: number, sx: number, ry: number, sy: number): [number, number, number, number] {
  const r = Math.PI / 180
  return [Math.cos(rx * r) * sx, Math.cos(ry * r) * sy, Math.sin(rx * r) * sx, Math.sin(ry * r) * sy]
}

describe('boneTransform', () => {
  it('readLocal copies the seven fields and nothing else', () => {
    expect(readLocal({ ...T, worldX: 9 } as BoneLocalTransform)).toEqual(T)
  })

  it('readApplied reads ax…ashearY (3.8–4.2) or appliedPose (4.3)', () => {
    const bone = { ax: 1, ay: 2, arotation: 3, ascaleX: 4, ascaleY: 5, ashearX: 6, ashearY: 7, x: 0 }
    expect(readApplied(bone)).toEqual(T)
    expect(readApplied({ appliedPose: { ...T } })).toEqual(T)
  })

  it('writeLocal writes only defined fields', () => {
    const b = { ...T }
    writeLocal(b, { rotation: 30, shearY: undefined, shearX: -2 })
    expect(b).toEqual({ ...T, rotation: 30, shearX: -2 })
  })

  it('applyOverrides writes every override onto the bone it finds, skipping unknown names', () => {
    const bones: Record<string, BoneLocalTransform> = { a: { ...T }, b: { ...T } }
    applyOverrides(new Map([['a', { x: 10 }], ['zz', { x: 1 }]]), n => bones[n])
    applyOverrides({ b: { scaleY: -1 } }, n => bones[n])
    expect(bones.a.x).toBe(10)
    expect(bones.b).toEqual({ ...T, scaleY: -1 })
  })

  it('mergeOverride merges, drops non-finite values and returns released fields on null', () => {
    const map = new Map<string, Partial<BoneLocalTransform>>()
    expect(mergeOverride(map, 'a', { rotation: 10 })).toEqual([])
    mergeOverride(map, 'a', { x: 2, y: NaN, scaleX: Infinity })
    expect(map.get('a')).toEqual({ rotation: 10, x: 2 })
    mergeOverride(map, 'b', { y: NaN })
    expect(map.has('b')).toBe(false)
    expect(mergeOverride(map, 'a', null).sort()).toEqual(['rotation', 'x'])
    expect(map.size).toBe(0)
    expect(mergeOverride(map, 'a', null)).toEqual([])
  })

  it('overridesToRecord returns copies', () => {
    const map = new Map([['a', { x: 1 }]])
    const rec = overridesToRecord(map)
    rec.a.x = 5
    expect(map.get('a')).toEqual({ x: 1 })
  })

  it('setupOf reads BoneData fields or 4.3 setupPose', () => {
    expect(setupOf({ ...T }, false)).toEqual(T)
    expect(setupOf({ setupPose: { ...T } }, true)).toEqual(T)
  })

  it('pickLocal picks the named fields', () => {
    expect(pickLocal(T, ['x', 'shearY'])).toEqual({ x: 1, shearY: 7 })
  })

  describe('worldShear', () => {
    it('is 0 for orthogonal axes at any rotation and scale', () => {
      expect(worldShear(1, 0, 0, 1)).toBe(0)
      expect(worldShear(...matrix(37, 2, 127, 0.5))).toBeCloseTo(0, 9)
    })

    it('reports the angle from X to Y minus 90', () => {
      expect(worldShear(...matrix(10, 1, 85, 1))).toBeCloseTo(-15, 9)
      expect(worldShear(...matrix(-30, 1.5, 100, 2))).toBeCloseTo(40, 9)
    })

    it('mirrored axes (Y flipped) give 180, never -180', () => {
      expect(worldShear(1, 0, 0, -1)).toBe(180)
      expect(worldShear(...matrix(45, 1, -45, 1))).toBeCloseTo(180, 9)
    })

    it('mirrored and sheared stays in (-180, 180]', () => {
      const s = worldShear(...matrix(0, 1, -80, 1))
      expect(s).toBeCloseTo(-170, 9)
    })

    it('degenerate X axis gives 0', () => {
      expect(worldShear(0, 1, 0, 1)).toBe(0)
    })
  })
})
