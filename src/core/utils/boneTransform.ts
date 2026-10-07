/**
 * @file boneTransform.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { BoneLocalTransform, BoneOverrides } from '@/core/types/ISpineAdapter'

export const BONE_LOCAL_KEYS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const

/** Anything carrying the seven local fields: a 3.8–4.2 Bone/BoneData, a 4.3 BonePose. */
export type BoneLike = BoneLocalTransform

/** Applied (after-constraint) fields of a 3.8–4.2 Bone. */
interface AppliedBoneLike {
  ax: number; ay: number; arotation: number; ascaleX: number; ascaleY: number; ashearX: number; ashearY: number
}

export function readLocal(b: BoneLike): BoneLocalTransform {
  return {
    x: b.x, y: b.y, rotation: b.rotation, scaleX: b.scaleX, scaleY: b.scaleY, shearX: b.shearX, shearY: b.shearY,
  }
}

/** `appliedPose` on 4.3, `ax…ashearY` on 3.8–4.2. */
export function readApplied(b: AppliedBoneLike | { appliedPose: BoneLike }): BoneLocalTransform {
  if ('appliedPose' in b) return readLocal(b.appliedPose)
  return {
    x: b.ax, y: b.ay, rotation: b.arotation, scaleX: b.ascaleX, scaleY: b.ascaleY, shearX: b.ashearX, shearY: b.ashearY,
  }
}

export function writeLocal(b: BoneLike, t: Partial<BoneLocalTransform>): void {
  for (const k of BONE_LOCAL_KEYS) {
    const v = t[k]
    if (v !== undefined) b[k] = v
  }
}

export function applyOverrides(map: ReadonlyMap<string, Partial<BoneLocalTransform>> | BoneOverrides, find: (name: string) => BoneLike | null | undefined): void {
  const entries = map instanceof Map ? map.entries() : Object.entries(map)
  for (const [name, t] of entries) {
    const b = find(name)
    if (b) writeLocal(b, t)
  }
}

/** World shear from a Y-up world matrix: angle from the X axis to the Y axis minus 90°, in (−180, 180]. */
export function worldShear(a: number, b: number, c: number, d: number): number {
  if (a === 0 && c === 0) return 0
  const deg = Math.atan2(-(a * b + c * d), a * d - b * c) * 180 / Math.PI
  return deg <= -180 ? deg + 360 : deg + 0
}

/** Setup local transform: `setupPose` on 4.3, the BoneData fields on 3.8–4.2. */
export function setupOf(boneData: BoneLike | { setupPose: BoneLike }, is43: boolean): BoneLocalTransform {
  return readLocal(is43 ? (boneData as { setupPose: BoneLike }).setupPose : boneData as BoneLike)
}

/**
 * Merges `t` into the override of `name` (null releases it); non-finite values are dropped.
 * Returns the released fields, which the caller resets to setup once.
 */
export function mergeOverride(
  map: Map<string, Partial<BoneLocalTransform>>, name: string, t: Partial<BoneLocalTransform> | null,
): (keyof BoneLocalTransform)[] {
  const prev = map.get(name)
  if (t === null) {
    map.delete(name)
    return prev ? BONE_LOCAL_KEYS.filter(k => k in prev) : []
  }
  const next = { ...prev }
  for (const k of BONE_LOCAL_KEYS) {
    const v = t[k]
    if (typeof v === 'number' && Number.isFinite(v)) next[k] = v
  }
  if (Object.keys(next).length) map.set(name, next)
  return []
}

export function overridesToRecord(map: ReadonlyMap<string, Partial<BoneLocalTransform>>): BoneOverrides {
  const out: BoneOverrides = {}
  for (const [k, v] of map) out[k] = { ...v }
  return out
}

/** Values of `keys` from `src`. */
export function pickLocal(src: BoneLocalTransform, keys: readonly (keyof BoneLocalTransform)[]): Partial<BoneLocalTransform> {
  const out: Partial<BoneLocalTransform> = {}
  for (const k of keys) out[k] = src[k]
  return out
}
