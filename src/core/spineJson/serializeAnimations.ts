/**
 * @file serializeAnimations.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

/** Spine JSON dialect: the reader whose schema is written. */
export type SpineJsonDialect = '3.8' | '4.0' | '4.1' | '4.2' | '4.3'

/** A runtime module namespace; its classes are used only for `instanceof` (names are minified in production). */
export type SpineKit = Record<string, unknown>

// TODO: remove when the five Spine runtimes share typed data classes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RtObj = any

export interface AttachmentPlace { skin: string; slotIndex: number; key: string }

export interface SerializeContext {
  data: RtObj
  kit: SpineKit
  dialect: SpineJsonDialect
  warnings: string[]
  /** Skin entries holding an attachment object. */
  places: Map<unknown, AttachmentPlace[]>
}

export const SEQUENCE_MODES = ['hold', 'once', 'loop', 'pingpong', 'onceReverse', 'loopReverse', 'pingpongReverse']
export const INHERIT_NAMES = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection']

export function is(kit: SpineKit, name: string, obj: unknown): boolean {
  const C = kit[name]
  return typeof C === 'function' && obj instanceof (C as new (...args: never[]) => unknown)
}

/** Shortest decimal that reads back to the same float32 (the runtimes store float32); other doubles keep 9 digits. */
export function num(v: number): number {
  if (!Number.isFinite(v) || v === 0) return v === 0 ? 0 : v
  const f = Math.fround(v)
  if (f !== v) return Number(v.toPrecision(9))
  for (let p = 1; p < 9; p++) {
    const r = Number(v.toPrecision(p))
    if (Math.fround(r) === f) return r
  }
  return Number(v.toPrecision(9))
}


const byte = (c: number) => Math.min(255, Math.max(0, Math.round(c * 255))).toString(16).padStart(2, '0')
export const hex = (r: number, g: number, b: number, a?: number) =>
  byte(r) + byte(g) + byte(b) + (a === undefined ? '' : byte(a))
export const colorHex = (c: RtObj) => hex(c.r, c.g, c.b, c.a)

// ── Bezier recovery ─────────────────────────────────────────────────────────

// The runtimes store each Bezier as 9 points at s = 0.1 … 0.9 (forward differences); least squares over all of them.
const S = Array.from({ length: 9 }, (_, j) => 0.1 * (j + 1))
const B1 = S.map(s => 3 * (1 - s) ** 2 * s)
const B2 = S.map(s => 3 * (1 - s) * s * s)
const B0 = S.map(s => (1 - s) ** 3)
const B3 = S.map(s => s ** 3)
const M11 = B1.reduce((a, b) => a + b * b, 0)
const M12 = B1.reduce((a, b, j) => a + b * B2[j], 0)
const M22 = B2.reduce((a, b) => a + b * b, 0)
const DET = M11 * M22 - M12 * M12

function solveAxis(samples: ArrayLike<number>, at: number, p0: number, p3: number): [number, number] {
  let r1 = 0, r2 = 0
  for (let j = 0; j < 9; j++) {
    const r = samples[at + j * 2] - B0[j] * p0 - B3[j] * p3
    r1 += B1[j] * r
    r2 += B2[j] * r
  }
  return [(M22 * r1 - M12 * r2) / DET, (M11 * r2 - M12 * r1) / DET]
}

/**
 * Handles of the cubic Bezier from (t1, v1) to (t2, v2) whose 9 samples (x, y interleaved) start at `curves[at]`.
 * 3.8 stores normalised curves: pass (0, 0) → (1, 1).
 */
export function recoverBezier(
  curves: ArrayLike<number>, at: number, t1: number, v1: number, t2: number, v2: number,
): [number, number, number, number] {
  const [cx1, cx2] = solveAxis(curves, at, t1, t2)
  const [cy1, cy2] = solveAxis(curves, at + 1, v1, v2)
  return [cx1, cy1, cx2, cy2]
}

/**
 * Recovered handles rounded to 7 significant digits of the segment's scale: removes the float32 sampling noise
 * (fixed 4 decimals drifted up to 0.07 px on real files).
 */
export function bezierHandles(
  curves: ArrayLike<number>, at: number, t1: number, v1: number, t2: number, v2: number,
): [number, number, number, number] {
  const snap = (v: number, ...ends: number[]) => {
    const m = Math.max(1e-6, ...ends.map(Math.abs))
    const digits = Math.min(12, Math.max(0, 6 - Math.floor(Math.log10(m))))
    const r = Math.round(v * 10 ** digits) / 10 ** digits
    return r === 0 ? 0 : r
  }
  const [cx1, cy1, cx2, cy2] = recoverBezier(curves, at, t1, v1, t2, v2)
  return [snap(cx1, t1, t2), snap(cy1, v1, v2, v2 - v1), snap(cx2, t1, t2), snap(cy2, v1, v2, v2 - v1)]
}

// ── Curve timelines ─────────────────────────────────────────────────────────

type Key = Record<string, unknown>

const frameCount = (tl: RtObj): number => tl.getFrameCount()
const entries = (tl: RtObj): number => tl.frames.length / frameCount(tl)

/** Writes `curve` on `key` for frame `f`: 4.x absolute handles per channel, 3.8 normalised `curve` + `c2..c4`. */
function writeCurve(key: Key, tl: RtObj, f: number, channels: number, dialect: SpineJsonDialect, deform: boolean) {
  const curves = tl.curves
  if (dialect === '3.8') {
    const i = f * 19
    const type = curves[i]
    if (type === 1) key.curve = 'stepped'
    else if (type === 2) {
      const [cx1, cy1, cx2, cy2] = bezierHandles(curves, i + 1, 0, 0, 1, 1)
      key.curve = cx1
      key.c2 = cy1
      key.c3 = cx2
      key.c4 = cy2
    }
    return
  }
  const type = curves[f]
  if (type === 1) { key.curve = 'stepped'; return }
  if (type < 2) return
  const E = entries(tl)
  const frames = tl.frames
  const t1 = frames[f * E], t2 = frames[(f + 1) * E]
  const out: number[] = []
  for (let k = 0; k < channels; k++) {
    const v1 = deform ? 0 : frames[f * E + 1 + k]
    const v2 = deform ? 1 : frames[(f + 1) * E + 1 + k]
    out.push(...bezierHandles(curves, type - 2 + k * 18, t1, v1, t2, v2))
  }
  key.curve = out
}

function withTime(t: number): Key {
  const time = num(t)
  return time === 0 ? {} : { time }
}

/** Keys of a curve timeline: `values(v, f)` maps the frame's values (after the time) to JSON fields. */
function curveKeys(
  tl: RtObj, channels: number, dialect: SpineJsonDialect, values: (v: number[], f: number) => Key, deform = false,
): Key[] {
  const n = frameCount(tl)
  const E = entries(tl)
  const frames = tl.frames
  const keys: Key[] = []
  for (let f = 0; f < n; f++) {
    const v: number[] = []
    for (let e = 1; e < E; e++) v.push(frames[f * E + e])
    const key = { ...withTime(frames[f * E]), ...values(v, f) }
    if (f < n - 1) writeCurve(key, tl, f, channels, dialect, deform)
    keys.push(key)
  }
  return keys
}

const xy = (v: number[]) => ({ x: num(v[0]), y: num(v[1]) })
const value = (v: number[]) => ({ value: num(v[0]) })

// ── Animations ──────────────────────────────────────────────────────────────

/** Nested object path, created on demand. */
function at(root: Key, ...path: string[]): Key {
  let o = root
  for (const p of path) o = (o[p] ??= {}) as Key
  return o
}

function put(ctx: SerializeContext, anim: string, parent: Key, name: string, keys: unknown) {
  if (name in parent) ctx.warnings.push(`Skipped duplicate '${name}' timeline in animation '${anim}'`)
  else parent[name] = keys
}

/** 4.3 indexes the unified constraint list, older runtimes the per-type list; -1 = all physics constraints. */
function constraintName(ctx: SerializeContext, tl: RtObj, list: string): string {
  const index = tl.constraintIndex ?? tl.ikConstraintIndex ?? tl.transformConstraintIndex ?? tl.pathConstraintIndex
  if (index === -1) return ''
  return (ctx.dialect === '4.3' ? ctx.data.constraints : ctx.data[list])[index].name
}

function placeOf(ctx: SerializeContext, attachment: unknown, slotIndex: number): AttachmentPlace | undefined {
  const places = ctx.places.get(attachment) ?? []
  return places.find(p => p.slotIndex === slotIndex) ?? places[0]
}

/** Unweighted deform keys hold absolute vertices; JSON stores offsets from setup, trimmed to the changed range. */
function deformKeys(ctx: SerializeContext, tl: RtObj): Key[] {
  const att = tl.attachment
  const weighted = !!att.bones
  const setup: ArrayLike<number> = att.vertices
  const frames: RtObj[] = tl.frameVertices ?? tl.vertices
  return curveKeys(tl, 1, ctx.dialect, (_v, f) => {
    const verts: ArrayLike<number> = frames[f]
    const key: Key = {}
    let first = -1, last = -1
    const delta: number[] = []
    for (let i = 0; i < verts.length; i++) {
      const d = num(weighted ? verts[i] : verts[i] - setup[i])
      delta.push(d)
      if (d !== 0) { if (first < 0) first = i; last = i }
    }
    if (first >= 0) {
      if (first > 0) key.offset = first
      key.vertices = delta.slice(first, last + 1)
    }
    return key
  }, true)
}

/** Draw order as Spine JSON offsets: each moved slot with its shift, in setup order. */
function drawOrderOffsets(order: ArrayLike<number> | null, names: (i: number) => string): Key {
  if (!order) return {}
  const pos: number[] = []
  for (let i = 0; i < order.length; i++) pos[order[i]] = i
  const offsets: Key[] = []
  for (let s = 0; s < pos.length; s++) if (pos[s] !== s) offsets.push({ slot: names(s), offset: pos[s] - s })
  return { offsets }
}

function serializeAnimation(ctx: SerializeContext, anim: RtObj): Key {
  const { kit, dialect, data } = ctx
  const is38 = dialect === '3.8'
  const out: Key = {}
  const name = anim.name
  const boneName = (tl: RtObj) => data.bones[tl.boneIndex].name as string
  const slotName = (i: number) => data.slots[i].name as string
  const bone = (tl: RtObj, key: string, keys: Key[]) => put(ctx, name, at(out, 'bones', boneName(tl)), key, keys)
  const slot = (tl: RtObj, key: string, keys: Key[]) => put(ctx, name, at(out, 'slots', slotName(tl.slotIndex)), key, keys)
  const c = (k: string, v: number[], f: number) => ({ [k]: hex(v[f], v[f + 1], v[f + 2], v[f + 3]) })
  const c3 = (k: string, v: number[], f: number) => ({ [k]: hex(v[f], v[f + 1], v[f + 2]) })

  const attachmentTimeline = (tl: RtObj, kind: 'deform' | 'sequence', keys: Key[]) => {
    const place = placeOf(ctx, tl.attachment, tl.slotIndex)
    if (!place) {
      ctx.warnings.push(`Skipped ${kind} timeline of an attachment outside every skin in animation '${name}'`)
      return
    }
    const slotKey = slotName(tl.slotIndex)
    if (dialect === '3.8' || dialect === '4.0') put(ctx, name, at(out, 'deform', place.skin, slotKey), place.key, keys)
    else put(ctx, name, at(out, 'attachments', place.skin, slotKey, place.key), kind, keys)
  }

  const handlers: Array<[string, (tl: RtObj) => void]> = [
    // bones (3.8 Scale and Shear extend Translate: leaf classes first)
    ['RotateTimeline', tl => bone(tl, 'rotate', curveKeys(tl, 1, dialect, v => (is38 ? { angle: num(v[0]) } : value(v))))],
    ['ScaleTimeline', tl => bone(tl, 'scale', curveKeys(tl, 2, dialect, xy))],
    ['ShearTimeline', tl => bone(tl, 'shear', curveKeys(tl, 2, dialect, xy))],
    ['TranslateTimeline', tl => bone(tl, 'translate', curveKeys(tl, 2, dialect, xy))],
    ['TranslateXTimeline', tl => bone(tl, 'translatex', curveKeys(tl, 1, dialect, value))],
    ['TranslateYTimeline', tl => bone(tl, 'translatey', curveKeys(tl, 1, dialect, value))],
    ['ScaleXTimeline', tl => bone(tl, 'scalex', curveKeys(tl, 1, dialect, value))],
    ['ScaleYTimeline', tl => bone(tl, 'scaley', curveKeys(tl, 1, dialect, value))],
    ['ShearXTimeline', tl => bone(tl, 'shearx', curveKeys(tl, 1, dialect, value))],
    ['ShearYTimeline', tl => bone(tl, 'sheary', curveKeys(tl, 1, dialect, value))],
    ['InheritTimeline', tl => {
      const keys: Key[] = []
      for (let f = 0; f < frameCount(tl); f++) {
        keys.push({ ...withTime(tl.frames[f * 2]), inherit: INHERIT_NAMES[tl.frames[f * 2 + 1]] })
      }
      bone(tl, 'inherit', keys)
    }],
    // slots
    ['AttachmentTimeline', tl => {
      const keys: Key[] = []
      for (let f = 0; f < frameCount(tl); f++) keys.push({ ...withTime(tl.frames[f]), name: tl.attachmentNames[f] ?? null })
      slot(tl, 'attachment', keys)
    }],
    ['ColorTimeline', tl => slot(tl, 'color', curveKeys(tl, 4, dialect, v => c('color', v, 0)))],
    ['TwoColorTimeline', tl => slot(tl, 'twoColor', curveKeys(tl, 7, dialect, v => ({ ...c('light', v, 0), ...c3('dark', v, 4) })))],
    ['RGBATimeline', tl => slot(tl, 'rgba', curveKeys(tl, 4, dialect, v => c('color', v, 0)))],
    ['RGBTimeline', tl => slot(tl, 'rgb', curveKeys(tl, 3, dialect, v => c3('color', v, 0)))],
    ['AlphaTimeline', tl => slot(tl, 'alpha', curveKeys(tl, 1, dialect, value))],
    ['RGBA2Timeline', tl => slot(tl, 'rgba2', curveKeys(tl, 7, dialect, v => ({ ...c('light', v, 0), ...c3('dark', v, 4) })))],
    ['RGB2Timeline', tl => slot(tl, 'rgb2', curveKeys(tl, 6, dialect, v => ({ ...c3('light', v, 0), ...c3('dark', v, 3) })))],
    // constraints
    ['IkConstraintTimeline', tl => {
      const keys = curveKeys(tl, 2, dialect, v => {
        const k: Key = { mix: num(v[0]), softness: num(v[1]) }
        if (v[2] < 0) k.bendPositive = false
        if (v[3]) k.compress = true
        if (v[4]) k.stretch = true
        return k
      })
      put(ctx, name, at(out, 'ik'), constraintName(ctx, tl, 'ikConstraints'), keys)
    }],
    ['TransformConstraintTimeline', tl => {
      const keys = is38
        ? curveKeys(tl, 4, dialect, v => ({
          rotateMix: num(v[0]), translateMix: num(v[1]), scaleMix: num(v[2]), shearMix: num(v[3]),
        }))
        : curveKeys(tl, 6, dialect, v => ({
          mixRotate: num(v[0]), mixX: num(v[1]), mixY: num(v[2]),
          mixScaleX: num(v[3]), mixScaleY: num(v[4]), mixShearY: num(v[5]),
        }))
      const cname = constraintName(ctx, tl, 'transformConstraints')
      // upstream bug: the 4.0–4.2 JSON readers never advance mixShearY past the first key
      if (!is38 && dialect !== '4.3' && keys.some(k => k.mixShearY !== keys[0].mixShearY)) {
        ctx.warnings.push(`Transform constraint '${cname}' in animation '${name}': the Spine ${dialect} JSON reader keeps only the first mixShearY key`)
      }
      put(ctx, name, at(out, 'transform'), cname, keys)
    }],
    ['PathConstraintSpacingTimeline', tl => put(ctx, name, at(out, 'path', constraintName(ctx, tl, 'pathConstraints')),
      'spacing', curveKeys(tl, 1, dialect, v => (is38 ? { spacing: num(v[0]) } : value(v))))],
    ['PathConstraintPositionTimeline', tl => put(ctx, name, at(out, 'path', constraintName(ctx, tl, 'pathConstraints')),
      'position', curveKeys(tl, 1, dialect, v => (is38 ? { position: num(v[0]) } : value(v))))],
    ['PathConstraintMixTimeline', tl => put(ctx, name, at(out, 'path', constraintName(ctx, tl, 'pathConstraints')),
      'mix', is38
        ? curveKeys(tl, 2, dialect, v => ({ rotateMix: num(v[0]), translateMix: num(v[1]) }))
        : curveKeys(tl, 3, dialect, v => ({ mixRotate: num(v[0]), mixX: num(v[1]), mixY: num(v[2]) })))],
    ['PhysicsConstraintResetTimeline', tl => {
      const keys: Key[] = []
      for (let f = 0; f < frameCount(tl); f++) keys.push(withTime(tl.frames[f]))
      put(ctx, name, at(out, 'physics', constraintName(ctx, tl, 'physicsConstraints')), 'reset', keys)
    }],
    ...(['Inertia', 'Strength', 'Damping', 'Mass', 'Wind', 'Gravity', 'Mix'].map(p =>
      [`PhysicsConstraint${p}Timeline`, (tl: RtObj) => put(ctx, name,
        at(out, 'physics', constraintName(ctx, tl, 'physicsConstraints')),
        p.toLowerCase(), curveKeys(tl, 1, dialect, value))] as [string, (tl: RtObj) => void])),
    ['SliderTimeline', tl => put(ctx, name, at(out, 'slider', constraintName(ctx, tl, 'constraints')),
      'time', curveKeys(tl, 1, dialect, value))],
    ['SliderMixTimeline', tl => put(ctx, name, at(out, 'slider', constraintName(ctx, tl, 'constraints')),
      'mix', curveKeys(tl, 1, dialect, value))],
    // attachments
    ['DeformTimeline', tl => attachmentTimeline(tl, 'deform', deformKeys(ctx, tl))],
    ['SequenceTimeline', tl => {
      const keys: Key[] = []
      for (let f = 0; f < frameCount(tl); f++) {
        const mode = tl.frames[f * 3 + 1]
        keys.push({
          ...withTime(tl.frames[f * 3]),
          mode: SEQUENCE_MODES[mode & 0xf], index: mode >> 4, delay: num(tl.frames[f * 3 + 2]),
        })
      }
      attachmentTimeline(tl, 'sequence', keys)
    }],
    // skeleton
    ['DrawOrderTimeline', tl => {
      const keys: Key[] = []
      for (let f = 0; f < frameCount(tl); f++) {
        keys.push({ ...withTime(tl.frames[f]), ...drawOrderOffsets(tl.drawOrders[f], slotName) })
      }
      put(ctx, name, out, 'drawOrder', keys)
    }],
    ['DrawOrderFolderTimeline', tl => {
      const slots: number[] = tl.slots
      const keys: Key[] = []
      for (let f = 0; f < frameCount(tl); f++) {
        keys.push({ ...withTime(tl.frames[f]), ...drawOrderOffsets(tl.drawOrders[f], i => slotName(slots[i])) })
      }
      ;((out.drawOrderFolder ??= []) as Key[]).push({ slots: slots.map(slotName), keys })
    }],
    ['EventTimeline', tl => {
      const keys: Key[] = []
      for (const e of tl.events as RtObj[]) {
        const d = e.data.setupPose ?? e.data
        const key: Key = { ...withTime(e.time), name: e.data.name }
        if (e.intValue !== d.intValue) key.int = e.intValue
        if (e.floatValue !== d.floatValue) key.float = num(e.floatValue)
        if (e.stringValue !== d.stringValue && e.stringValue != null) key.string = e.stringValue
        if (e.data.audioPath) { key.volume = num(e.volume); key.balance = num(e.balance) }
        keys.push(key)
      }
      put(ctx, name, out, 'events', keys)
    }],
  ]

  for (const tl of anim.timelines as RtObj[]) {
    const handler = handlers.find(([cls]) => is(kit, cls, tl))
    if (handler) handler[1](tl)
    else ctx.warnings.push(`Skipped unknown timeline in animation '${name}'`)
  }
  return out
}

/** `animations` of the Spine JSON document, in data order. */
export function serializeAnimations(ctx: SerializeContext): Record<string, Key> {
  const out: Record<string, Key> = {}
  for (const anim of ctx.data.animations as RtObj[]) out[anim.name] = serializeAnimation(ctx, anim)
  return out
}
