/**
 * @file boneEdits.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { SvpError } from '@/core/api/svpErrors'
import type { BoneLocalTransform } from '@/core/types/ISpineAdapter'
import { num } from './serializeAnimations'

/** Bone timelines differ only between 3.8 and 4.x; bone setup fields are the same in every version. */
export type SpineDialect = '3.8' | '4'

export interface SpineJsonBone {
  name: string
  [field: string]: unknown
}

/** Parsed Spine JSON; every field the viewer does not edit is kept as is. */
export interface SpineJsonDoc {
  skeleton?: { spine?: string; [field: string]: unknown }
  bones?: SpineJsonBone[]
  animations?: Record<string, Record<string, unknown>>
  [field: string]: unknown
}

export const BONE_PROPS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const

const SETUP_DEFAULTS: BoneLocalTransform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 }

/** `skeleton.spine` decides; a document without it falls back to the slot's runtime version. */
export function detectDialect(doc: SpineJsonDoc, fallbackVersion?: string | null): SpineDialect {
  const version = typeof doc.skeleton?.spine === 'string' && doc.skeleton.spine !== '' ? doc.skeleton.spine : fallbackVersion
  return version?.startsWith('3.') ? '3.8' : '4'
}

export function findBone(doc: SpineJsonDoc, bone: string): SpineJsonBone {
  const found = doc.bones?.find(b => b.name === bone)
  if (!found) throw new SvpError('NOT_FOUND', `Bone "${bone}" not found`)
  return found
}

/** Setup pose of one bone as the runtimes read it (missing fields take their defaults). */
export function boneSetup(doc: SpineJsonDoc, bone: string): BoneLocalTransform {
  const b = findBone(doc, bone)
  const out = { ...SETUP_DEFAULTS }
  for (const p of BONE_PROPS) if (typeof b[p] === 'number') out[p] = b[p] as number
  return out
}

/** Writes setup values of one bone; a default value is written only when the field is already present. */
export function setBoneSetup(doc: SpineJsonDoc, bone: string, values: Partial<BoneLocalTransform>): SpineJsonDoc {
  const target = findBone(doc, bone)
  for (const [key, value] of Object.entries(values)) {
    if (!(BONE_PROPS as readonly string[]).includes(key)) throw new SvpError('INVALID_ARGUMENT', `Unknown bone property "${key}"`)
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new SvpError('INVALID_ARGUMENT', `${bone}.${key} must be a finite number`)
  }
  for (const [key, value] of Object.entries(values) as Array<[keyof BoneLocalTransform, number]>) {
    if (value === SETUP_DEFAULTS[key] && !(key in target)) continue
    target[key] = value
  }
  return doc
}

// --- Bone keyframes ---

export const BONE_TIMELINE_TYPES = [
  'rotate', 'translate', 'scale', 'shear', 'translatex', 'translatey', 'scalex', 'scaley', 'shearx', 'sheary',
] as const
export type BoneTimelineType = typeof BONE_TIMELINE_TYPES[number]

/** Easing of the segment that starts at a key; a bezier is `[cx1, cy1, cx2, cy2]` normalised to the segment. */
export type KeyEasing = 'linear' | 'stepped' | [number, number, number, number]
export type KeyValue = Partial<BoneLocalTransform>
export interface BoneKey { time: number; value: KeyValue; easing: KeyEasing }
export interface BoneTimeline { bone: string; type: BoneTimelineType; keys: BoneKey[] }

/** Keys closer than this count as the same key. */
export const SAME_KEY_SECONDS = 0.001

type Prop = keyof BoneLocalTransform
type Raw = Record<string, unknown>
type BoneTimelines = Record<string, Record<string, Raw[]>>

const CHANNELS: Record<BoneTimelineType, Prop[]> = {
  rotate: ['rotation'], translate: ['x', 'y'], scale: ['scaleX', 'scaleY'], shear: ['shearX', 'shearY'],
  translatex: ['x'], translatey: ['y'], scalex: ['scaleX'], scaley: ['scaleY'], shearx: ['shearX'], sheary: ['shearY'],
}

const isSplit = (type: BoneTimelineType) => type !== 'rotate' && CHANNELS[type].length === 1
const isType = (type: string): type is BoneTimelineType => (BONE_TIMELINE_TYPES as readonly string[]).includes(type)
const fieldsOf = (type: BoneTimelineType, dialect: SpineDialect) =>
  CHANNELS[type].length === 2 ? ['x', 'y'] : [dialect === '3.8' ? 'angle' : 'value']
const defaultOf = (type: BoneTimelineType) => (type.startsWith('scale') ? 1 : 0)
const numOr = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback)
const tidy = (v: number) => Number(v.toPrecision(9))

/** A key with its easing normalised per value channel, so it survives changes of the neighbouring keys. */
interface NormKey { raw: Raw; time: number; v: number[]; ease: 'linear' | 'stepped' | number[][] }

// 4.x stores absolute handles; the last key has no segment, so a unit one keeps its curve, as does a flat channel
function segment(key: NormKey, next: NormKey | undefined, ch: number) {
  const dt = next ? next.time - key.time : 1
  const dv = next ? next.v[ch] - key.v[ch] : 1
  return { t: key.time, v: key.v[ch], dt: dt || 1, dv: dv || 1 }
}

function decode(raws: Raw[], type: BoneTimelineType, dialect: SpineDialect): NormKey[] {
  const fields = fieldsOf(type, dialect)
  const def = defaultOf(type)
  const keys: NormKey[] = raws.map(raw => ({ raw, time: numOr(raw.time, 0), v: fields.map(f => numOr(raw[f], def)), ease: 'linear' }))
  keys.forEach((k, i) => {
    const c = k.raw.curve
    if (c === 'stepped') k.ease = 'stepped'
    else if (dialect === '3.8' && typeof c === 'number') {
      const e = [c, numOr(k.raw.c2, 0), numOr(k.raw.c3, 1), numOr(k.raw.c4, 1)]
      k.ease = fields.map(() => [...e])
    } else if (dialect === '4' && Array.isArray(c) && c.length > 0) {
      const ease = fields.map((_, ch) => {
        const s = segment(k, keys[i + 1], ch)
        const h = (c.length >= ch * 4 + 4 ? c.slice(ch * 4, ch * 4 + 4) : c.slice(0, 4)) as number[]
        return [(h[0] - s.t) / s.dt, (h[1] - s.v) / s.dv, (h[2] - s.t) / s.dt, (h[3] - s.v) / s.dv]
      })
      if (ease.flat().every(Number.isFinite)) k.ease = ease
    }
  })
  return keys
}

function encode(keys: NormKey[], type: BoneTimelineType, dialect: SpineDialect): Raw[] {
  const fields = fieldsOf(type, dialect)
  return keys.map((k, i) => {
    const rest: Raw = { ...k.raw }
    for (const f of ['time', 'curve', 'c2', 'c3', 'c4', ...fields]) delete rest[f]
    const out: Raw = { time: k.time }
    fields.forEach((f, ch) => { out[f] = k.v[ch] })
    Object.assign(out, rest)
    if (k.ease === 'stepped') out.curve = 'stepped'
    else if (k.ease !== 'linear' && dialect === '3.8') [out.curve, out.c2, out.c3, out.c4] = k.ease[0]
    else if (k.ease !== 'linear') {
      out.curve = (k.ease as number[][]).flatMap((n, ch) => {
        const s = segment(k, keys[i + 1], ch)
        return [num(s.t + n[0] * s.dt), num(s.v + n[1] * s.dv), num(s.t + n[2] * s.dt), num(s.v + n[3] * s.dv)]
      })
    }
    return out
  })
}

function view(bone: string, type: BoneTimelineType, keys: NormKey[]): BoneTimeline {
  return {
    bone,
    type,
    keys: keys.map(k => ({
      time: k.time,
      value: Object.fromEntries(CHANNELS[type].map((p, ch) => [p, k.v[ch]])),
      easing: typeof k.ease === 'string' ? k.ease : k.ease[0].map(tidy) as KeyEasing,
    })),
  }
}

// --- Validation ---

function findAnimation(doc: SpineJsonDoc, animation: unknown): Record<string, unknown> {
  if (typeof animation !== 'string') throw new SvpError('INVALID_ARGUMENT', 'animation must be a string')
  const anims = doc.animations
  if (!anims || !Object.hasOwn(anims, animation)) throw new SvpError('NOT_FOUND', `Animation "${animation}" not found`)
  return anims[animation]
}

function checkBone(doc: SpineJsonDoc, bone: unknown): string {
  if (typeof bone !== 'string') throw new SvpError('INVALID_ARGUMENT', 'bone must be a string')
  return findBone(doc, bone).name
}

function checkType(type: unknown, dialect: SpineDialect): BoneTimelineType {
  if (typeof type !== 'string' || !isType(type)) {
    throw new SvpError('INVALID_ARGUMENT', `type must be one of ${BONE_TIMELINE_TYPES.join(', ')}`)
  }
  if (dialect === '3.8' && isSplit(type)) throw new SvpError('UNSUPPORTED', `Timeline type "${type}" needs Spine 4.0 or later`)
  return type
}

function checkTime(time: unknown): number {
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
    throw new SvpError('INVALID_ARGUMENT', 'time must be a finite number of seconds, not negative')
  }
  return time
}

export function checkEasing(easing: unknown): KeyEasing {
  if (easing === 'linear' || easing === 'stepped') return easing
  if (Array.isArray(easing) && easing.length === 4 && easing.every(n => typeof n === 'number' && Number.isFinite(n))
    && easing[0] >= 0 && easing[0] <= 1 && easing[2] >= 0 && easing[2] <= 1) {
    return [...easing] as KeyEasing
  }
  throw new SvpError('INVALID_ARGUMENT', 'easing must be "linear", "stepped" or [cx1, cy1, cx2, cy2] with cx1 and cx2 in [0, 1]')
}

function checkValue(type: BoneTimelineType, value: unknown): KeyValue {
  const allowed = CHANNELS[type]
  const shape = `{ ${allowed.join(', ')} }`
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new SvpError('INVALID_ARGUMENT', `value must be ${shape}`)
  const entries = Object.entries(value)
  if (entries.length === 0) throw new SvpError('INVALID_ARGUMENT', `value must be ${shape}`)
  for (const [k, v] of entries) {
    if (!(allowed as string[]).includes(k)) throw new SvpError('INVALID_ARGUMENT', `"${k}" is not a ${type} value; expected ${shape}`)
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new SvpError('INVALID_ARGUMENT', `value.${k} must be a finite number`)
  }
  return value as KeyValue
}

const toEase = (easing: KeyEasing, channels: number): NormKey['ease'] =>
  typeof easing === 'string' ? easing : Array.from({ length: channels }, () => [...easing])

function nearestKey(keys: NormKey[], time: number): number {
  let best = -1
  keys.forEach((k, i) => {
    const d = Math.abs(k.time - time)
    if (d < SAME_KEY_SECONDS && (best < 0 || d < Math.abs(keys[best].time - time))) best = i
  })
  return best
}

interface KeyRef { animation: string; bone: string; type: BoneTimelineType | string; time: number }

/** Validated location of one timeline; `keys` is empty when the timeline does not exist yet. */
function locate(doc: SpineJsonDoc, ref: Omit<KeyRef, 'time'>, dialect: SpineDialect) {
  const anim = findAnimation(doc, ref.animation)
  const bone = checkBone(doc, ref.bone)
  const type = checkType(ref.type, dialect)
  const raws = (anim.bones as BoneTimelines | undefined)?.[bone]?.[type]
  return { anim, bone, type, keys: Array.isArray(raws) ? decode(raws, type, dialect) : [] }
}

function store(anim: Record<string, unknown>, bone: string, type: BoneTimelineType, keys: NormKey[], dialect: SpineDialect) {
  const bones = (anim.bones ??= {}) as BoneTimelines
  const timelines = (bones[bone] ??= {})
  if (keys.length > 0) {
    timelines[type] = encode(keys, type, dialect)
    return
  }
  delete timelines[type]
  if (Object.keys(timelines).length === 0) delete bones[bone]
  if (Object.keys(bones).length === 0) delete anim.bones
}

// --- Keyframe edits ---

/** Bone timelines of an animation (of one bone when given), each read under the type it is stored as. */
export function getBoneKeys(doc: SpineJsonDoc, args: { animation: string; bone?: string }, dialect = detectDialect(doc)): BoneTimeline[] {
  const anim = findAnimation(doc, args.animation)
  const only = args.bone === undefined ? undefined : checkBone(doc, args.bone)
  const out: BoneTimeline[] = []
  for (const [bone, timelines] of Object.entries((anim.bones ?? {}) as BoneTimelines)) {
    if (only !== undefined && bone !== only) continue
    for (const [type, raws] of Object.entries(timelines)) {
      if (isType(type) && Array.isArray(raws) && raws.length > 0) out.push(view(bone, type, decode(raws, type, dialect)))
    }
  }
  return out
}

/**
 * Sets the key at `time` (an existing key within 0.001 s is updated and keeps its easing unless one is given) or inserts it
 * in time order; a missing timeline is created. Values are Spine key values: offsets from setup, scale as a factor.
 */
export function upsertBoneKey(
  doc: SpineJsonDoc,
  args: KeyRef & { value: KeyValue; easing?: KeyEasing },
  dialect = detectDialect(doc),
): BoneTimeline {
  const { anim, bone, type, keys } = locate(doc, args, dialect)
  const time = checkTime(args.time)
  const value = checkValue(type, args.value)
  const easing = args.easing === undefined ? undefined : checkEasing(args.easing)
  const channels = CHANNELS[type]
  const at = nearestKey(keys, time)
  if (at >= 0) {
    channels.forEach((p, ch) => { if (value[p] !== undefined) keys[at].v[ch] = value[p] })
    if (easing) keys[at].ease = toEase(easing, channels.length)
  } else {
    const missing = channels.filter(p => value[p] === undefined)
    if (missing.length > 0) throw new SvpError('INVALID_ARGUMENT', `A new ${type} key needs ${missing.join(' and ')}`)
    const key: NormKey = { raw: {}, time, v: channels.map(p => value[p]!), ease: toEase(easing ?? 'linear', channels.length) }
    const after = keys.findIndex(k => k.time > time)
    keys.splice(after < 0 ? keys.length : after, 0, key)
  }
  store(anim, bone, type, keys, dialect)
  return view(bone, type, keys)
}

export function setBoneKeyCurve(doc: SpineJsonDoc, args: KeyRef & { easing: KeyEasing }, dialect = detectDialect(doc)): BoneTimeline {
  const { anim, bone, type, keys } = locate(doc, args, dialect)
  const at = nearestKey(keys, checkTime(args.time))
  const easing = checkEasing(args.easing)
  if (at < 0) throw new SvpError('NOT_FOUND', `No ${type} key of "${bone}" at ${args.time} s`)
  keys[at].ease = toEase(easing, CHANNELS[type].length)
  store(anim, bone, type, keys, dialect)
  return view(bone, type, keys)
}

/** Deleting the last key removes the timeline, then the bone entry when it is empty. */
export function deleteBoneKey(doc: SpineJsonDoc, args: KeyRef, dialect = detectDialect(doc)): BoneTimeline {
  const { anim, bone, type, keys } = locate(doc, args, dialect)
  const at = nearestKey(keys, checkTime(args.time))
  if (at < 0) throw new SvpError('NOT_FOUND', `No ${type} key of "${bone}" at ${args.time} s`)
  keys.splice(at, 1)
  store(anim, bone, type, keys, dialect)
  return view(bone, type, keys)
}

/** An empty animation; the runtime loads it with duration 0. */
export function createAnimation(doc: SpineJsonDoc, name: unknown): SpineJsonDoc {
  if (typeof name !== 'string' || name.trim() === '') throw new SvpError('INVALID_ARGUMENT', 'Animation name must not be empty')
  if (doc.animations && Object.hasOwn(doc.animations, name)) throw new SvpError('INVALID_ARGUMENT', `Animation "${name}" already exists`)
  ;(doc.animations ??= {})[name] = {}
  return doc
}

/** Removes every bone timeline of an animation, keeping its other timelines. */
export function replaceBoneTimelines(doc: SpineJsonDoc, animation: string): SpineJsonDoc {
  delete findAnimation(doc, animation).bones
  return doc
}

/** Key value of a timeline from live local values: `v − setup`, scale `v / setup`. */
export function keyValueFromLocal(type: BoneTimelineType, live: BoneLocalTransform, setup: BoneLocalTransform, bone = 'bone'): KeyValue {
  return Object.fromEntries(CHANNELS[type].map(p => {
    if (!p.startsWith('scale')) return [p, live[p] - setup[p]]
    if (setup[p] === 0) throw new SvpError('INVALID_ARGUMENT', `Setup ${p} of "${bone}" is 0; a scale key cannot reach ${live[p]}`)
    return [p, live[p] / setup[p]]
  }))
}

/**
 * Timeline types that key the given properties of a bone: rotation → rotate; a translate / scale / shear property → the
 * combined type, or its own separate-axis type when the animation keys that kind of the bone only on separate axes.
 */
export function poseKeyTypes(
  doc: SpineJsonDoc,
  args: { animation: string; bone: string },
  props: readonly Prop[],
  dialect = detectDialect(doc),
): BoneTimelineType[] {
  const stored = Object.keys((findAnimation(doc, args.animation).bones as BoneTimelines | undefined)?.[args.bone] ?? {})
  const out: BoneTimelineType[] = props.includes('rotation') ? ['rotate'] : []
  for (const kind of ['translate', 'scale', 'shear'] as const) {
    const [px, py] = CHANNELS[kind]
    const wanted = [px, py].filter(p => props.includes(p))
    if (wanted.length === 0) continue
    const splitOnly = dialect === '4' && !stored.includes(kind) && (stored.includes(`${kind}x`) || stored.includes(`${kind}y`))
    if (splitOnly) for (const p of wanted) out.push(`${kind}${p === px ? 'x' : 'y'}` as BoneTimelineType)
    else out.push(kind)
  }
  return out
}
