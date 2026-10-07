import { expect } from 'vitest'
import { serializeSkeletonData, type SpineJsonDialect } from '@/core/spineJson/serializeSkeletonData'
import { stubAttachmentLoader } from './fixtures'

// TODO: remove the any when the runtimes ship one typed module shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rt = any

/** Spec tolerances of "Binary skeleton conversion". */
export const TOL = { pos: 0.05, deg: 0.05, scale: 0.001, color: 1 / 255 + 1e-6 }
const STEP = 1 / 30

/** Parses Spine JSON (object/text) or binary with the runtime's own reader and a texture-less attachment loader. */
export function parse(mod: Rt, input: object | string | Uint8Array): Rt {
  if (input instanceof Uint8Array) return new mod.SkeletonBinary(stubAttachmentLoader(mod)).readSkeletonData(input)
  return new mod.SkeletonJson(stubAttachmentLoader(mod)).readSkeletonData(typeof input === 'string' ? JSON.parse(input) : input)
}

export interface RoundTrip { data1: Rt; json: Record<string, unknown>; warnings: string[]; data2: Rt }

/** data → JSON → data again, through the same runtime. */
export function roundTrip(mod: Rt, data1: Rt, dialect: SpineJsonDialect): RoundTrip {
  const { json, warnings } = serializeSkeletonData(data1, mod, dialect)
  // through text, as the viewer stores it
  const text = JSON.stringify(json)
  return { data1, json: JSON.parse(text), warnings, data2: parse(mod, text) }
}

const deg = (r: number) => r * 180 / Math.PI
const angleDiff = (x: number, y: number) => ((x - y) % 360 + 540) % 360 - 180

interface Frame {
  bones: Array<{ name: string; x: number; y: number; rx: number; ry: number; sx: number; sy: number }>
  slots: Array<{ name: string; attachment: string | null; color: number[]; dark: number[] | null; deform: number[]; seq: number }>
  drawOrder: string[]
}

function capture(skeleton: Rt): Frame {
  const bones = skeleton.bones.map((b: Rt) => {
    const m = b.matrix // pixi-spine keeps the world transform in a PIXI.Matrix (b and c swapped)
    const p = m ? { a: m.a, b: m.c, c: m.b, d: m.d, worldX: m.tx, worldY: m.ty } : b.appliedPose ?? b
    return {
      name: b.data.name, x: p.worldX, y: p.worldY,
      rx: deg(Math.atan2(p.c, p.a)), ry: deg(Math.atan2(p.d, p.b)), sx: Math.hypot(p.a, p.c), sy: Math.hypot(p.b, p.d),
    }
  })
  const slots = skeleton.slots.map((s: Rt) => {
    const p = s.appliedPose ?? s
    const c = p.color
    const d = p.darkColor
    return {
      name: s.data.name,
      attachment: (p.attachment ?? s.getAttachment?.())?.name ?? null,
      color: [c.r, c.g, c.b, c.a],
      dark: d ? [d.r, d.g, d.b] : null,
      deform: Array.from((p.deform ?? []) as number[]),
      seq: p.sequenceIndex ?? -1,
    }
  })
  const order = skeleton.drawOrder.appliedPose ?? skeleton.drawOrder
  return { bones, slots, drawOrder: order.map((s: Rt) => s.data.name) }
}

/** Plays `animation` from 0 to its end and captures a frame every 1/30 s (plus the setup pose when no animation). */
export function sample(mod: Rt, data: Rt, animation: string | null): Frame[] {
  const skeleton = new mod.Skeleton(data)
  const state = new mod.AnimationState(new mod.AnimationStateData(data))
  const physics = mod.Physics?.update
  const frames: Frame[] = []
  const duration = animation ? data.findAnimation(animation).duration : 0
  if (animation) state.setAnimation(0, animation, false)
  for (let t = 0, first = true; t <= duration + 1e-6; t += STEP) {
    const dt = first ? 0 : STEP
    first = false
    state.update(dt)
    state.apply(skeleton)
    skeleton.update?.(dt)
    skeleton.updateWorldTransform(physics)
    frames.push(capture(skeleton))
  }
  return frames
}

/** Frame-by-frame comparison within the spec tolerances; mismatches are collected (expect per value is slow). */
export function expectSamePlayback(mod: Rt, d1: Rt, d2: Rt, animation: string | null) {
  const f1 = sample(mod, d1, animation)
  const f2 = sample(mod, d2, animation)
  expect(f2.length).toBe(f1.length)
  const bad: string[] = []
  const close = (a: number, b: number, tol: number, what: string) => {
    if (!(Math.abs(a - b) <= tol)) bad.push(`${what}: ${a} vs ${b}`)
  }
  const same = (a: unknown, b: unknown, what: string) => { if (a !== b) bad.push(`${what}: ${a} vs ${b}`) }
  f1.forEach((a, i) => {
    const b = f2[i]
    const at = `${animation ?? 'setup'} @${(i * STEP).toFixed(3)}s`
    same(b.drawOrder.join(), a.drawOrder.join(), `${at} draw order`)
    a.bones.forEach((x, j) => {
      const y = b.bones[j]
      const w = `${at} bone ${x.name}`
      close(x.x, y.x, TOL.pos, `${w} x`)
      close(x.y, y.y, TOL.pos, `${w} y`)
      // a collapsed axis has no direction
      if (x.sx > 1e-3) close(angleDiff(x.rx, y.rx), 0, TOL.deg, `${w} rotation`)
      if (x.sy > 1e-3) close(angleDiff(x.ry, y.ry), 0, TOL.deg, `${w} rotation Y`)
      close(x.sx, y.sx, TOL.scale, `${w} scaleX`)
      close(x.sy, y.sy, TOL.scale, `${w} scaleY`)
    })
    a.slots.forEach((x, j) => {
      const y = b.slots[j]
      const w = `${at} slot ${x.name}`
      same(y.attachment, x.attachment, `${w} attachment`)
      same(y.seq, x.seq, `${w} sequence index`)
      x.color.forEach((c, k) => close(c, y.color[k], TOL.color, `${w} color`))
      same(!!y.dark, !!x.dark, `${w} dark`)
      x.dark?.forEach((c, k) => close(c, y.dark![k], TOL.color, `${w} dark`))
      same(y.deform.length, x.deform.length, `${w} deform length`)
      x.deform.forEach((v, k) => close(v, y.deform[k], TOL.pos, `${w} deform`))
    })
  })
  expect(bad.slice(0, 10), `${bad.length} mismatches`).toEqual([])
}

const names = (list: Rt[] | undefined) => (list ?? []).map(x => x.name)

/** Names and order of everything the spec lists, plus per-animation timeline counts and durations. */
export function expectSameStructure(d1: Rt, d2: Rt) {
  expect(d2.version).toBe(d1.version)
  expect(names(d2.bones)).toEqual(names(d1.bones))
  expect(names(d2.slots)).toEqual(names(d1.slots))
  expect(names(d2.skins)).toEqual(names(d1.skins))
  expect(names(d2.events)).toEqual(names(d1.events))
  for (const list of ['constraints', 'ikConstraints', 'transformConstraints', 'pathConstraints', 'physicsConstraints']) {
    expect(names(d2[list]), list).toEqual(names(d1[list]))
  }
  d1.skins.forEach((s: Rt, i: number) => {
    const entries = (skin: Rt) => skin.getAttachments()
      .map((e: Rt) => `${e.slotIndex}/${e.placeholder ?? e.name}=${e.attachment.name}:${e.attachment.constructor.name}`).sort()
    expect(entries(d2.skins[i]), `skin ${s.name}`).toEqual(entries(s))
  })
  expect(names(d2.animations)).toEqual(names(d1.animations))
  d1.animations.forEach((a: Rt, i: number) => {
    const b = d2.animations[i]
    expect(Math.abs(b.duration - a.duration), `${a.name} duration`).toBeLessThan(1e-4)
    const kinds = (x: Rt) => x.timelines.map((t: Rt) => t.constructor.name).sort()
    expect(kinds(b), `${a.name} timelines`).toEqual(kinds(a))
  })
}

/** Every animation (and the setup pose) plays alike before and after the round trip. */
export function expectRoundTrip(mod: Rt, rt: RoundTrip) {
  expectSameStructure(rt.data1, rt.data2)
  expectSamePlayback(mod, rt.data1, rt.data2, null)
  for (const a of rt.data1.animations) expectSamePlayback(mod, rt.data1, rt.data2, a.name)
}

/** Paths where two JSON values differ; numbers count as equal within `tol` of their magnitude. */
export function jsonDiff(a: unknown, b: unknown, tol = 1e-5, at = ''): string[] {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a)) ? [] : [`${at}: ${a} vs ${b}`]
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].flatMap(k => jsonDiff((a as Rt)[k], (b as Rt)[k], tol, `${at}/${k}`))
  }
  return a === b ? [] : [`${at}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`]
}
