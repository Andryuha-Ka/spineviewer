/**
 * @file boneEffect.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { AttachmentInfo, BoneEffect, BoneEffectReason } from '@/core/types/ISpineAdapter'

/** Slot attachment kind: none, non-drawing (point/bbox/path), region/mesh, clipping */
export type EffectSlotKind = 0 | 1 | 2 | 3

export interface EffectSlot {
  bone: number
  kind: EffectSlotKind
  /** slot alpha × attachment alpha */
  alpha: number
  /** Raw weighted `attachment.bones` (`[n, i1..in, n, …]`) or null */
  weights: ArrayLike<number> | null
  /** A shown user image or child spine sits in this slot */
  userContent: boolean
}

export interface EffectLink {
  name: string
  /** Bones the constraint moves */
  driven: ArrayLike<number>
  /** Bones whose pose feeds the constraint (IK target, transform source, path target bone + weights, slider bone) */
  drivers: ArrayLike<number>
}

/** Flat runtime read, bone arrays in skeleton order (parent index < child index) */
export interface EffectInput {
  /** -1 = root */
  parent: ArrayLike<number>
  active: ArrayLike<number>
  zeroScale: ArrayLike<number>
  keyed: ArrayLike<number>
  slots: readonly EffectSlot[]
  /** Active constraints with a non-zero mix, skeleton order; never physics */
  links: readonly EffectLink[]
}

export const MIN_VISIBLE_ALPHA = 1 / 255

export const EFFECT_REASON_TEXT: Record<BoneEffectReason, string> = {
  inactive: 'Bone is not in the applied skins',
  hidden: 'Attachments hidden in the current frame',
  'no-attachments': 'No drawn attachments on this bone or its children',
}

export function constraintText(names: readonly string[]): string {
  return names.length ? `Driven by ${names.join(', ')} — constrained properties ignore local edits` : ''
}

/** Tooltip lines for a bone: reason (when not visible), then constraints; '' when neither */
export function effectTitle(e: Pick<BoneEffect, 'visible' | 'reason' | 'constraints'> | undefined): string {
  if (!e) return ''
  const lines: string[] = []
  if (!e.visible && e.reason) lines.push(EFFECT_REASON_TEXT[e.reason])
  if (e.constraints.length) lines.push(constraintText(e.constraints))
  return lines.join('\n')
}

export function computeBoneEffects(names: readonly string[], input: EffectInput): BoneEffect[] {
  const n = names.length
  const { parent, active, zeroScale, keyed, slots, links } = input
  const eff = new Uint8Array(n)
  const present = new Uint8Array(n)

  // Marks a bone and its ancestors; stops at the first ancestor already marked.
  const mark = (b: number): void => {
    while (b >= 0 && b < n && !eff[b]) { eff[b] = 1; b = parent[b] }
  }

  for (const s of slots) {
    if (s.kind >= 2) present[s.bone] = 1
    if (!active[s.bone] || zeroScale[s.bone]) continue
    const drawn = (s.kind === 3 || (s.kind === 2 && s.alpha >= MIN_VISIBLE_ALPHA)) || s.userContent
    if (!drawn) continue
    mark(s.bone)
    const w = s.weights
    if (w) for (let i = 0; i < w.length; i += w[i] + 1) for (let j = 1; j <= w[i]; j++) mark(w[i + j])
  }
  for (let b = n - 1; b > 0; b--) if (present[b] && parent[b] >= 0) present[parent[b]] = 1

  // A link marks its drivers once it moves a marked bone; repeat until stable.
  const done = new Uint8Array(links.length)
  for (let changed = true; changed;) {
    changed = false
    for (let l = 0; l < links.length; l++) {
      if (done[l]) continue
      const { driven, drivers } = links[l]
      let hit = false
      for (let i = 0; i < driven.length && !hit; i++) hit = eff[driven[i]] === 1
      if (!hit) continue
      done[l] = 1
      changed = true
      for (let i = 0; i < drivers.length; i++) mark(drivers[i])
    }
  }

  const out: BoneEffect[] = new Array(n)
  for (let b = 0; b < n; b++) {
    const visible = !!active[b] && !!eff[b]
    const reason: BoneEffectReason | null = visible ? null : !active[b] ? 'inactive' : present[b] ? 'hidden' : 'no-attachments'
    out[b] = { name: names[b], visible, reason, keyed: !!keyed[b], constraints: [] }
  }
  for (const { name, driven } of links) {
    for (let i = 0; i < driven.length; i++) {
      const c = out[driven[i]]?.constraints
      if (c && c[c.length - 1] !== name) c.push(name)
    }
  }
  return out
}

// ── Runtime readers (duck-typed, no runtime import) ──────────────────────────

// TODO: remove when one typed runtime surface covers pixi-spine 3.8–4.1 and spine-core 4.2/4.3
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeObject = any

export function slotKind(type: AttachmentInfo['type'] | null): EffectSlotKind {
  if (type === null) return 0
  if (type === 'region' || type === 'mesh') return 2
  return type === 'clipping' ? 3 : 1
}

/** 1 when a world matrix collapses the bone to zero area */
export const isZeroScale = (a: number, b: number, c: number, d: number): number => Math.abs(a * d - b * c) < 1e-6 ? 1 : 0

/** Bones keyed by the current entry of every track and the entries it mixes from */
export function keyedBones(
  boneCount: number,
  tracks: ArrayLike<RuntimeObject>,
  bonesOf: (animation: RuntimeObject) => ArrayLike<number>,
): Uint8Array {
  const keyed = new Uint8Array(boneCount)
  for (let t = 0; t < tracks.length; t++) {
    for (let e = tracks[t]; e; e = e.mixingFrom) {
      if (!e.animation) continue
      const bones = bonesOf(e.animation)
      for (let i = 0; i < bones.length; i++) keyed[bones[i]] = 1
    }
  }
  return keyed
}

/** Bone indices with a bone timeline in a 3.8–4.2 animation, cached per animation object */
export function timelineBones(cache: WeakMap<object, Int32Array>, animation: RuntimeObject): Int32Array {
  let bones = cache.get(animation)
  if (!bones) {
    const set = new Set<number>()
    for (const tl of animation.timelines ?? []) if (typeof tl.boneIndex === 'number') set.add(tl.boneIndex)
    bones = Int32Array.from(set)
    cache.set(animation, bones)
  }
  return bones
}

/** Appends the bone indices of a raw weighted `attachment.bones` array */
export function weightBones(weights: ArrayLike<number> | null, into: number[]): void {
  if (!weights) return
  for (let i = 0; i < weights.length; i += weights[i] + 1) for (let j = 1; j <= weights[i]; j++) into.push(weights[i + j])
}

const anyNonZero = (...mixes: unknown[]): boolean => mixes.some(m => typeof m === 'number' && m !== 0)

/**
 * Input for the 3.8–4.2 runtimes (pixi-spine Pixi 7 and spine-core 4.2): `bone.active`, `slot.attachment`,
 * IK / transform / path constraint lists (physics never). `userContent(slot, alpha)` tells whether a user
 * image or child spine in that slot is shown.
 */
export function readClassicEffectInput(
  skeleton: RuntimeObject,
  tracks: ArrayLike<RuntimeObject>,
  animationBones: WeakMap<object, Int32Array>,
  classify: (attachment: RuntimeObject) => AttachmentInfo['type'],
  userContent: ((slot: RuntimeObject, alpha: number) => boolean) | null,
): EffectInput {
  const bones = skeleton.bones
  const n: number = bones.length
  const parent = new Int32Array(n)
  const active = new Uint8Array(n)
  const zeroScale = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const b = bones[i]
    parent[i] = b.parent ? b.parent.data.index : -1
    active[i] = b.active === false ? 0 : 1
    // pixi-spine keeps the world matrix in `matrix`, spine-core on the bone itself
    const m = b.matrix ?? b
    zeroScale[i] = isZeroScale(m.a, m.b, m.c, m.d)
  }

  const slots: EffectSlot[] = skeleton.slots.map((s: RuntimeObject) => {
    const att = s.attachment
    const kind = slotKind(att ? classify(att) : null)
    const alpha = s.color.a * (kind === 2 ? att.color?.a ?? 1 : 1)
    return {
      bone: s.bone.data.index,
      kind,
      alpha,
      weights: kind === 2 ? att.bones ?? null : null,
      userContent: userContent ? userContent(s, alpha) : false,
    }
  })

  const links: Array<EffectLink & { order: number }> = []
  const idx = (list: RuntimeObject[]): number[] => list.map(b => b.data.index)
  for (const c of skeleton.ikConstraints ?? []) {
    if (!c.active || !anyNonZero(c.mix)) continue
    links.push({ name: c.data.name, order: c.data.order, driven: idx(c.bones), drivers: [c.target.data.index] })
  }
  for (const c of skeleton.transformConstraints ?? []) {
    const on = 'rotateMix' in c
      ? anyNonZero(c.rotateMix, c.translateMix, c.scaleMix, c.shearMix)
      : anyNonZero(c.mixRotate, c.mixX, c.mixY, c.mixScaleX, c.mixScaleY, c.mixShearY)
    if (!c.active || !on) continue
    links.push({ name: c.data.name, order: c.data.order, driven: idx(c.bones), drivers: [c.target.data.index] })
  }
  for (const c of skeleton.pathConstraints ?? []) {
    const on = 'rotateMix' in c ? anyNonZero(c.rotateMix, c.translateMix) : anyNonZero(c.mixRotate, c.mixX, c.mixY)
    if (!c.active || !on) continue
    const drivers = [c.target.bone.data.index]
    weightBones(c.target.attachment?.bones ?? null, drivers)
    links.push({ name: c.data.name, order: c.data.order, driven: idx(c.bones), drivers })
  }
  links.sort((a, b) => a.order - b.order)

  const keyed = keyedBones(n, tracks, a => timelineBones(animationBones, a))
  return { parent, active, zeroScale, keyed, slots, links }
}
