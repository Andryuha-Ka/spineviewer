/**
 * @file serializeSkeletonData.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import {
  INHERIT_NAMES, colorHex, hex, is, num, serializeAnimations,
  type AttachmentPlace, type RtObj, type SerializeContext, type SpineJsonDialect, type SpineKit,
} from './serializeAnimations'

export type { SpineJsonDialect, SpineKit } from './serializeAnimations'

type Key = Record<string, unknown>

const BLEND_NAMES = ['normal', 'additive', 'multiply', 'screen']
const POSITION_NAMES = ['fixed', 'percent']
const SPACING_NAMES = ['length', 'fixed', 'percent', 'proportional']
const ROTATE_NAMES = ['tangent', 'chain', 'chainScale']
const SCALE_Y_NAMES = ['none', 'uniform', 'volume']
const PROPERTY_CLASSES: Array<[string, string]> = [
  ['Rotate', 'rotate'], ['X', 'x'], ['Y', 'y'], ['ScaleX', 'scaleX'], ['ScaleY', 'scaleY'], ['ShearY', 'shearY'],
]

/** Dialect of a data version string (`3.8.99`, `4.2.40`…), else the runtime's own. */
export function dialectOf(version: string | null | undefined, runtime: SpineJsonDialect): SpineJsonDialect {
  const mm = /^(\d+\.\d+)/.exec(version ?? '')?.[1]
  return mm === '3.8' || mm === '4.0' || mm === '4.1' || mm === '4.2' || mm === '4.3' ? mm : runtime
}

/** 4.3 keeps setup values in `setupPose`; older runtimes keep them on the data object. */
const setup = (o: RtObj): RtObj => o.setupPose ?? o

/** Sets `key` unless the value equals the reader's default. */
function opt(o: Key, key: string, v: unknown, def: unknown) {
  if (v !== def && v !== undefined && v !== null) o[key] = typeof v === 'number' ? num(v) : v
}

const names = (list: RtObj[] | undefined) => (list ?? []).map(x => x.name as string)

function vertices(att: RtObj): number[] {
  const verts: ArrayLike<number> = att.vertices
  if (!att.bones) return Array.from(verts, num)
  const out: number[] = []
  const bones: number[] = att.bones
  for (let b = 0, w = 0; b < bones.length;) {
    const count = bones[b++]
    out.push(count)
    for (let i = 0; i < count; i++, b++, w += 3) out.push(bones[b], num(verts[w]), num(verts[w + 1]), num(verts[w + 2]))
  }
  return out
}

function propertyName(kit: SpineKit, side: 'From' | 'To', p: unknown): string | undefined {
  return PROPERTY_CLASSES.find(([cls]) => is(kit, side + cls, p))?.[1]
}

function sequence(o: Key, att: RtObj, dialect: SpineJsonDialect) {
  const s = att.sequence
  if (!s || (dialect === '4.3' && !s.pathSuffix)) return
  const out: Key = { count: s.regions.length }
  opt(out, 'start', s.start, 1)
  opt(out, 'digits', s.digits, 0)
  opt(out, 'setup', s.setupIndex, 0)
  o.sequence = out
}

function attachmentJson(ctx: SerializeContext, att: RtObj, key: string, slotIndex: number, skinName: string): Key | null {
  const { kit, dialect, data } = ctx
  const o: Key = {}
  if (att.name !== key) o.name = att.name
  const color = (def: string) => { if (att.color && colorHex(att.color) !== def) o.color = colorHex(att.color) }
  const path = () => { if (att.path && att.path !== att.name) o.path = att.path }

  if (is(kit, 'RegionAttachment', att)) {
    path()
    for (const [k, def] of [['x', 0], ['y', 0], ['scaleX', 1], ['scaleY', 1], ['rotation', 0]] as const) opt(o, k, att[k], def)
    o.width = num(att.width)
    o.height = num(att.height)
    color('ffffffff')
    sequence(o, att, dialect)
    return o
  }
  if (is(kit, 'MeshAttachment', att)) {
    const parent = att.getSourceMesh?.() ?? att.getParentMesh?.() ?? att.parentMesh
    const link = parent ? linkOf(ctx, att, parent, slotIndex, skinName) : null
    o.type = link ? 'linkedmesh' : 'mesh'
    path()
    color('ffffffff')
    opt(o, 'width', att.width, 0)
    opt(o, 'height', att.height, 0)
    sequence(o, att, dialect)
    if (link) return { ...o, ...link }
    o.uvs = Array.from(att.regionUVs as ArrayLike<number>, num)
    o.triangles = Array.from(att.triangles as ArrayLike<number>)
    o.vertices = vertices(att)
    o.hull = att.hullLength / 2
    if (att.edges?.length) o.edges = Array.from(att.edges as ArrayLike<number>)
    return o
  }
  // ClippingAttachment and PathAttachment are vertex attachments too: checked before BoundingBox
  if (is(kit, 'ClippingAttachment', att)) {
    o.type = 'clipping'
    if (att.endSlot) o.end = att.endSlot.name
    if (att.convex) o.convex = true
    if (att.inverse) o.inverse = true
    o.vertexCount = att.worldVerticesLength / 2
    o.vertices = vertices(att)
    color('')
    return o
  }
  if (is(kit, 'PathAttachment', att)) {
    o.type = 'path'
    if (att.closed) o.closed = true
    if (!att.constantSpeed) o.constantSpeed = false
    o.lengths = Array.from(att.lengths as ArrayLike<number>, num)
    o.vertexCount = att.worldVerticesLength / 2
    o.vertices = vertices(att)
    color('')
    return o
  }
  if (is(kit, 'BoundingBoxAttachment', att)) {
    o.type = 'boundingbox'
    o.vertexCount = att.worldVerticesLength / 2
    o.vertices = vertices(att)
    color('')
    return o
  }
  if (is(kit, 'PointAttachment', att)) {
    o.type = 'point'
    for (const k of ['x', 'y', 'rotation'] as const) opt(o, k, att[k], 0)
    color('')
    return o
  }
  ctx.warnings.push(`Skipped unknown attachment type in slot '${data.slots[slotIndex]?.name}'`)
  return null
}

/** Linked-mesh reference fields, or null when the source cannot be addressed (the mesh is then written in full). */
function linkOf(ctx: SerializeContext, mesh: RtObj, parent: RtObj, slotIndex: number, skinName: string): Key | null {
  const { dialect, data } = ctx
  const places = ctx.places.get(parent) ?? []
  // up to 4.2 the source must sit in the same slot; 4.3 names its slot
  const usable = dialect === '4.3' ? places : places.filter(p => p.slotIndex === slotIndex)
  const place = usable.find(p => p.skin === skinName && p.slotIndex === slotIndex)
    ?? usable.find(p => p.skin === 'default') ?? usable[0]
  if (!place) {
    ctx.warnings.push(`Linked mesh '${mesh.name}' in slot '${data.slots[slotIndex].name}' written as a full mesh: its source mesh is not in a skin`)
    return null
  }
  const o: Key = {}
  if (place.skin !== 'default') o.skin = place.skin
  o[dialect === '4.3' ? 'source' : 'parent'] = place.key
  if (dialect === '4.3' && place.slotIndex !== slotIndex) o.slot = data.slots[place.slotIndex].name
  const inherits = (mesh.timelineAttachment ?? mesh.deformAttachment) !== mesh
  if (!inherits) o[dialect === '3.8' || dialect === '4.0' ? 'deform' : 'timelines'] = false
  return o
}

function skeletonHeader(data: RtObj, dialect: SpineJsonDialect): Key {
  const o: Key = {}
  if (data.hash) o.hash = data.hash
  o.spine = data.version || `${dialect}.0`
  for (const k of ['x', 'y', 'width', 'height'] as const) o[k] = num(data[k] ?? 0)
  if (dialect === '4.2' || dialect === '4.3') opt(o, 'referenceScale', data.referenceScale, 100)
  opt(o, 'fps', data.fps, 0)
  opt(o, 'images', data.imagesPath, '')
  if (dialect === '4.2' || dialect === '4.3') opt(o, 'audio', data.audioPath, '')
  return o
}

function bonesJson(data: RtObj, dialect: SpineJsonDialect): Key[] {
  return (data.bones as RtObj[]).map(b => {
    const p = setup(b)
    const o: Key = { name: b.name }
    if (b.parent) o.parent = b.parent.name
    opt(o, 'length', b.length, 0)
    for (const [k, def] of [['x', 0], ['y', 0], ['rotation', 0], ['scaleX', 1], ['scaleY', 1], ['shearX', 0], ['shearY', 0]] as const) {
      opt(o, k, p[k], def)
    }
    const inherit = p.inherit ?? b.transformMode ?? 0
    if (inherit) o[dialect === '4.2' || dialect === '4.3' ? 'inherit' : 'transform'] = INHERIT_NAMES[inherit]
    if (b.skinRequired) o.skin = true
    return o
  })
}

function slotsJson(data: RtObj): Key[] {
  return (data.slots as RtObj[]).map(s => {
    const p = setup(s)
    const o: Key = { name: s.name, bone: s.boneData.name }
    if (p.color && colorHex(p.color) !== 'ffffffff') o.color = colorHex(p.color)
    if (p.darkColor) o.dark = hex(p.darkColor.r, p.darkColor.g, p.darkColor.b)
    if (s.attachmentName) o.attachment = s.attachmentName
    if (s.blendMode) o.blend = BLEND_NAMES[s.blendMode]
    if (s.visible === false) o.visible = false
    return o
  })
}

function ikJson(c: RtObj, dialect: SpineJsonDialect): Key {
  const p = setup(c)
  const o: Key = { name: c.name }
  if (dialect !== '4.3') o.order = c.order
  if (c.skinRequired) o.skin = true
  o.bones = names(c.bones)
  o.target = c.target.name
  opt(o, 'mix', p.mix, 1)
  opt(o, 'softness', p.softness, 0)
  if (p.bendDirection < 0) o.bendPositive = false
  if (p.compress) o.compress = true
  if (p.stretch) o.stretch = true
  if (c.uniform && dialect !== '4.3') o.uniform = true
  if (dialect === '4.3' && c.scaleYMode) o.scaleY = SCALE_Y_NAMES[c.scaleYMode]
  return o
}

function transformJson(ctx: SerializeContext, c: RtObj): Key {
  const { dialect, kit } = ctx
  const p = setup(c)
  const o: Key = { name: c.name }
  if (dialect !== '4.3') o.order = c.order
  if (c.skinRequired) o.skin = true
  o.bones = names(c.bones)
  if (dialect === '4.3') {
    o.source = c.source.name
    if (c.localSource) o.localSource = true
    if (c.localTarget) o.localTarget = true
    if (c.additive) o.additive = true
    if (c.clamp) o.clamp = true
    const props: Key = {}
    for (const from of c.properties as RtObj[]) {
      const fromName = propertyName(kit, 'From', from)
      if (!fromName) { ctx.warnings.push(`Skipped unknown property of transform constraint '${c.name}'`); continue }
      const to: Key = {}
      for (const t of from.to as RtObj[]) {
        const toName = propertyName(kit, 'To', t)
        if (!toName) { ctx.warnings.push(`Skipped unknown property of transform constraint '${c.name}'`); continue }
        const tj: Key = {}
        opt(tj, 'offset', t.offset, 0)
        tj.max = num(t.max)
        tj.scale = num(t.scale)
        to[toName] = tj
      }
      const fj: Key = {}
      opt(fj, 'offset', from.offset, 0)
      fj.to = to
      props[fromName] = fj
    }
    o.properties = props
    const offsets: number[] = c.offsets
    ;['rotation', 'x', 'y', 'scaleX', 'scaleY', 'shearY'].forEach((k, i) => opt(o, k, offsets[i], 0))
  } else {
    o.target = c.target.name
    if (c.local) o.local = true
    if (c.relative) o.relative = true
    opt(o, 'rotation', c.offsetRotation, 0)
    opt(o, 'x', c.offsetX, 0)
    opt(o, 'y', c.offsetY, 0)
    opt(o, 'scaleX', c.offsetScaleX, 0)
    opt(o, 'scaleY', c.offsetScaleY, 0)
    opt(o, 'shearY', c.offsetShearY, 0)
  }
  if (dialect === '3.8') {
    for (const k of ['rotateMix', 'translateMix', 'scaleMix', 'shearMix']) o[k] = num(c[k])
  } else {
    for (const k of ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY']) o[k] = num(p[k])
  }
  return o
}

function pathJson(c: RtObj, dialect: SpineJsonDialect): Key {
  const p = setup(c)
  const o: Key = { name: c.name }
  if (dialect !== '4.3') o.order = c.order
  if (c.skinRequired) o.skin = true
  o.bones = names(c.bones)
  o[dialect === '4.3' ? 'slot' : 'target'] = (c.slot ?? c.target).name
  o.positionMode = POSITION_NAMES[c.positionMode]
  o.spacingMode = SPACING_NAMES[c.spacingMode]
  o.rotateMode = ROTATE_NAMES[c.rotateMode]
  opt(o, 'rotation', c.offsetRotation, 0)
  opt(o, 'position', p.position, 0)
  opt(o, 'spacing', p.spacing, 0)
  if (dialect === '3.8') {
    o.rotateMix = num(p.rotateMix)
    o.translateMix = num(p.translateMix)
  } else {
    o.mixRotate = num(p.mixRotate)
    o.mixX = num(p.mixX)
    o.mixY = num(p.mixY)
  }
  return o
}

function physicsJson(c: RtObj, dialect: SpineJsonDialect): Key {
  const p = setup(c)
  const o: Key = { name: c.name }
  if (dialect !== '4.3') o.order = c.order
  if (c.skinRequired) o.skin = true
  o.bone = c.bone.name
  for (const k of ['x', 'y', 'rotate', 'scaleX', 'shearX'] as const) opt(o, k, c[k], 0)
  if (dialect === '4.3' && c.scaleYMode) o.scaleY = SCALE_Y_NAMES[c.scaleYMode]
  o.limit = num(c.limit)
  o.fps = num(1 / c.step)
  for (const k of ['inertia', 'strength', 'damping', 'wind', 'gravity', 'mix'] as const) o[k] = num(p[k])
  o.mass = num(1 / p.massInverse)
  for (const k of ['inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix']) {
    if (c[`${k}Global`]) o[`${k}Global`] = true
  }
  return o
}

function sliderJson(ctx: SerializeContext, c: RtObj): Key {
  const p = setup(c)
  const o: Key = { name: c.name }
  if (c.skinRequired) o.skin = true
  if (c.additive) o.additive = true
  if (c.loop) o.loop = true
  opt(o, 'mix', p.mix, 1)
  if (c.animation) o.animation = c.animation.name
  if (c.bone) {
    o.bone = c.bone.name
    const property = propertyName(ctx.kit, 'From', c.property)
    if (!property) ctx.warnings.push(`Skipped unknown property of slider '${c.name}'`)
    else o.property = property
    opt(o, 'from', c.property?.offset, 0)
    opt(o, 'to', c.offset, 0)
    opt(o, 'scale', c.scale, 1)
    opt(o, 'max', c.max, 0)
    if (c.local) o.local = true
  } else opt(o, 'time', p.time, 0)
  return o
}

/** 4.3 unified `constraints[]`, in data order. */
function constraints43(ctx: SerializeContext): Key[] {
  const out: Key[] = []
  for (const c of ctx.data.constraints as RtObj[]) {
    const { kit, dialect } = ctx
    if (is(kit, 'IkConstraintData', c)) out.push({ type: 'ik', ...ikJson(c, dialect) })
    else if (is(kit, 'TransformConstraintData', c)) out.push({ type: 'transform', ...transformJson(ctx, c) })
    else if (is(kit, 'PathConstraintData', c)) out.push({ type: 'path', ...pathJson(c, dialect) })
    else if (is(kit, 'PhysicsConstraintData', c)) out.push({ type: 'physics', ...physicsJson(c, dialect) })
    else if (is(kit, 'SliderData', c)) out.push({ type: 'slider', ...sliderJson(ctx, c) })
    else ctx.warnings.push(`Skipped unknown constraint '${c.name}'`)
  }
  return out
}

function skinsJson(ctx: SerializeContext): Key[] {
  const { data, kit } = ctx
  return (data.skins as RtObj[]).map(skin => {
    const o: Key = { name: skin.name }
    if (skin.bones?.length) o.bones = names(skin.bones)
    const groups: Array<[string, string]> = [
      ['IkConstraintData', 'ik'], ['TransformConstraintData', 'transform'], ['PathConstraintData', 'path'],
      ['PhysicsConstraintData', 'physics'], ['SliderData', 'slider'],
    ]
    for (const [cls, key] of groups) {
      const list = (skin.constraints as RtObj[]).filter(c => is(kit, cls, c))
      if (list.length) o[key] = names(list)
    }
    const attachments: Record<string, Key> = {}
    for (const e of skin.getAttachments() as RtObj[]) {
      const key = e.placeholder ?? e.name
      const json = attachmentJson(ctx, e.attachment, key, e.slotIndex, skin.name)
      if (json) (attachments[data.slots[e.slotIndex].name] ??= {})[key] = json
    }
    o.attachments = attachments
    return o
  })
}

function eventsJson(data: RtObj): Record<string, Key> {
  const out: Record<string, Key> = {}
  for (const e of data.events as RtObj[]) {
    const p = setup(e)
    const o: Key = {}
    opt(o, 'int', p.intValue, 0)
    opt(o, 'float', p.floatValue, 0)
    opt(o, 'string', p.stringValue, '')
    if (e.audioPath) {
      o.audio = e.audioPath
      o.volume = num(p.volume)
      o.balance = num(p.balance)
    }
    out[e.name] = o
  }
  return out
}

/**
 * Writes runtime skeleton data (as loaded, never a live pose) as a Spine JSON document of `dialect`.
 * `kit` is the runtime module the data was read with. Objects the serializer does not know are left out
 * and named in `warnings`.
 */
export function serializeSkeletonData(data: RtObj, kit: SpineKit, dialect: SpineJsonDialect): { json: object; warnings: string[] } {
  const places = new Map<unknown, AttachmentPlace[]>()
  for (const skin of data.skins as RtObj[]) {
    for (const e of skin.getAttachments() as RtObj[]) {
      const list = places.get(e.attachment) ?? []
      list.push({ skin: skin.name, slotIndex: e.slotIndex, key: e.placeholder ?? e.name })
      places.set(e.attachment, list)
    }
  }
  const ctx: SerializeContext = { data, kit, dialect, warnings: [], places }

  const json: Key = { skeleton: skeletonHeader(data, dialect), bones: bonesJson(data, dialect), slots: slotsJson(data) }
  if (dialect === '4.3') json.constraints = constraints43(ctx)
  else {
    if (data.ikConstraints?.length) json.ik = (data.ikConstraints as RtObj[]).map(c => ikJson(c, dialect))
    if (data.transformConstraints?.length) json.transform = (data.transformConstraints as RtObj[]).map(c => transformJson(ctx, c))
    if (data.pathConstraints?.length) json.path = (data.pathConstraints as RtObj[]).map(c => pathJson(c, dialect))
    if (data.physicsConstraints?.length) json.physics = (data.physicsConstraints as RtObj[]).map(c => physicsJson(c, dialect))
  }
  json.skins = skinsJson(ctx)
  const events = eventsJson(data)
  if (Object.keys(events).length) json.events = events
  json.animations = serializeAnimations(ctx)
  return { json, warnings: ctx.warnings }
}
