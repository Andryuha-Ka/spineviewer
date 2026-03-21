/**
 * @file spineCompare.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { ISpineAdapter } from '@/core/types/ISpineAdapter'

// ── Input types ────────────────────────────────────────────────────────────────

export interface SpineJsonData {
  source: 'json'
  raw: Record<string, unknown>
}

export interface SpineRuntimeData {
  source: 'runtime'
  adapter: ISpineAdapter
}

export type SpineData = SpineJsonData | SpineRuntimeData

// ── Output types ───────────────────────────────────────────────────────────────

export interface PlaceholderParam {
  key: string
  valueA?: string
  valueB?: string
  changed: boolean
  critical: boolean
}

export interface PlaceholderDiff {
  name: string
  kind: 'bone' | 'slot' | 'attachment'
  status: 'added' | 'removed' | 'changed' | 'equal'
  params: PlaceholderParam[]
}

export interface DiffItem {
  key: string
  status: 'added' | 'removed' | 'changed' | 'equal'
  valueA?: string
  valueB?: string
  children?: DiffItem[]
}

export interface DiffSection {
  id: string
  label: string
  status: 'equal' | 'changed'
  counts: { a: number; b: number }
  items: DiffItem[]
}

// ── Reskin-focused types ───────────────────────────────────────────────────────

export interface AnimTableRow {
  name:   string
  durA:   number | null   // null = not present
  durB:   number | null
  status: 'ok' | 'delta' | 'only-a' | 'only-b'
}

export interface AnimEventOccurrence {
  eventName: string
  idx:       number        // occurrence index within animation (0-based)
  timeA:     number | null
  timeB:     number | null
  status:    'ok' | 'delta' | 'only-a' | 'only-b'
}

export interface AnimEventGroup {
  animName:   string
  animStatus: AnimTableRow['status']
  events:     AnimEventOccurrence[]
  hasChanges: boolean
}

export interface SpineDiff {
  source: 'json-full' | 'runtime-partial'
  summary: {
    added: number
    removed: number
    changed: number
    equal: number
  }
  animTable:  AnimTableRow[]
  animEvents: AnimEventGroup[]   // JSON-only; empty for runtime
  placeholders: PlaceholderDiff[]
  sections: DiffSection[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PLACEHOLDER_RE = /placeholder/i

const BLEND_MODE_NAMES: Record<number, string> = { 0: 'Normal', 1: 'Additive', 2: 'Multiply', 3: 'Screen' }

function blendName(v: string | number | undefined): string {
  if (v === undefined || v === null) return 'Normal'
  if (typeof v === 'number') return BLEND_MODE_NAMES[v] ?? String(v)
  return String(v).charAt(0).toUpperCase() + String(v).slice(1).toLowerCase()
}

function str(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'number') return String(Math.round(v * 10000) / 10000)
  return String(v)
}

function itemStatus(a: unknown, b: unknown): 'added' | 'removed' | 'changed' | 'equal' {
  if (a === undefined && b !== undefined) return 'added'
  if (a !== undefined && b === undefined) return 'removed'
  if (str(a) !== str(b)) return 'changed'
  return 'equal'
}

interface NameSets {
  added:   string[]
  removed: string[]
  common:  string[]
}

function compareNameSets(namesA: string[], namesB: string[]): NameSets {
  const setA = new Set(namesA)
  const setB = new Set(namesB)
  return {
    added:   namesB.filter(n => !setA.has(n)),
    removed: namesA.filter(n => !setB.has(n)),
    common:  namesA.filter(n => setB.has(n)),
  }
}

function countSummaryChange(items: DiffItem[]): { added: number; removed: number; changed: number; equal: number } {
  const counts = { added: 0, removed: 0, changed: 0, equal: 0 }
  for (const item of items) {
    counts[item.status]++
    if (item.children) {
      for (const c of item.children) counts[c.status]++
    }
  }
  return counts
}

function sectionStatus(items: DiffItem[]): 'equal' | 'changed' {
  return items.some(i => i.status !== 'equal') ? 'changed' : 'equal'
}

// ── JSON-specific helpers ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

function getJsonBones(raw: AnyRecord): AnyRecord[] {
  return Array.isArray(raw.bones) ? raw.bones : []
}

function getJsonSlots(raw: AnyRecord): AnyRecord[] {
  return Array.isArray(raw.slots) ? raw.slots : []
}

function getJsonSkins(raw: AnyRecord): AnyRecord[] {
  if (Array.isArray(raw.skins)) return raw.skins
  // Older format: skins is object
  if (raw.skins && typeof raw.skins === 'object') {
    return Object.entries(raw.skins as AnyRecord).map(([name, attachments]) => ({ name, attachments }))
  }
  return []
}

function getJsonAnimations(raw: AnyRecord): AnyRecord {
  return (raw.animations && typeof raw.animations === 'object') ? raw.animations as AnyRecord : {}
}

function getJsonEvents(raw: AnyRecord): AnyRecord {
  return (raw.events && typeof raw.events === 'object') ? raw.events as AnyRecord : {}
}

function getJsonConstraints(raw: AnyRecord, type: 'ik' | 'transform' | 'path'): AnyRecord[] {
  return Array.isArray(raw[type]) ? raw[type] : []
}

function getAnimationDuration(anim: AnyRecord): number {
  let max = 0
  const checkFrames = (frames: unknown) => {
    if (!Array.isArray(frames) || frames.length === 0) return
    const last = frames[frames.length - 1]
    if (last && typeof last.time === 'number' && last.time > max) max = last.time
  }
  for (const boneTimelines of Object.values(anim.bones ?? {})) {
    for (const frames of Object.values(boneTimelines as AnyRecord)) checkFrames(frames)
  }
  for (const slotTimelines of Object.values(anim.slots ?? {})) {
    for (const frames of Object.values(slotTimelines as AnyRecord)) checkFrames(frames)
  }
  checkFrames(anim.events)
  checkFrames(anim.deform ? Object.values(anim.deform).flatMap(s => Object.values(s as AnyRecord).flatMap(a => Object.values(a as AnyRecord))) : [])
  return Math.round(max * 1000) / 1000
}

function getSkinAttachmentCount(skin: AnyRecord): number {
  const atts = skin.attachments
  if (!atts || typeof atts !== 'object') return 0
  let count = 0
  for (const slot of Object.values(atts)) count += Object.keys(slot as AnyRecord).length
  return count
}

// ── Section comparisons — JSON ─────────────────────────────────────────────────

function compareSkeletonMeta(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const skelA = (rawA.skeleton ?? {}) as AnyRecord
  const skelB = (rawB.skeleton ?? {}) as AnyRecord
  const fields = ['spine', 'hash', 'width', 'height', 'fps', 'images', 'audio']
  const items: DiffItem[] = fields.map(f => ({
    key:    f,
    status: itemStatus(skelA[f], skelB[f]),
    valueA: skelA[f] !== undefined ? str(skelA[f]) : undefined,
    valueB: skelB[f] !== undefined ? str(skelB[f]) : undefined,
  })).filter(i => i.valueA !== undefined || i.valueB !== undefined)

  return {
    id:     'skeleton',
    label:  'Skeleton',
    status: sectionStatus(items),
    counts: { a: 1, b: 1 },
    items,
  }
}

function compareBonesJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const bonesA = getJsonBones(rawA)
  const bonesB = getJsonBones(rawB)
  const mapA = new Map(bonesA.map(b => [b.name as string, b]))
  const mapB = new Map(bonesB.map(b => [b.name as string, b]))
  const allNames = [...new Set([...mapA.keys(), ...mapB.keys()])]
  const boneFields = ['parent', 'x', 'y', 'rotation', 'length', 'scaleX', 'scaleY', 'shearX', 'shearY']

  const items: DiffItem[] = allNames.map(name => {
    const a = mapA.get(name)
    const b = mapB.get(name)
    if (!a) return { key: name, status: 'added' as const }
    if (!b) return { key: name, status: 'removed' as const }

    const children: DiffItem[] = boneFields
      .map(f => ({ key: f, status: itemStatus(a[f], b[f]), valueA: str(a[f]), valueB: str(b[f]) }))
      .filter(c => c.status !== 'equal' || (a[c.key] !== undefined || b[c.key] !== undefined))

    const hasChange = children.some(c => c.status !== 'equal')
    return {
      key:      name,
      status:   hasChange ? 'changed' as const : 'equal' as const,
      children: children.filter(c => c.status !== 'equal'),
    }
  })

  return {
    id:     'bones',
    label:  'Bones',
    status: sectionStatus(items),
    counts: { a: bonesA.length, b: bonesB.length },
    items,
  }
}

function compareSlotsJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const slotsA = getJsonSlots(rawA)
  const slotsB = getJsonSlots(rawB)
  const mapA = new Map(slotsA.map(s => [s.name as string, s]))
  const mapB = new Map(slotsB.map(s => [s.name as string, s]))
  const allNames = [...new Set([...mapA.keys(), ...mapB.keys()])]
  const orderMapA = new Map(slotsA.map((s, i) => [s.name as string, i]))
  const orderMapB = new Map(slotsB.map((s, i) => [s.name as string, i]))

  const items: DiffItem[] = allNames.map(name => {
    const a = mapA.get(name)
    const b = mapB.get(name)
    if (!a) return { key: name, status: 'added' as const }
    if (!b) return { key: name, status: 'removed' as const }

    const children: DiffItem[] = []
    // bone
    if (a.bone !== b.bone) children.push({ key: 'bone', status: 'changed', valueA: str(a.bone), valueB: str(b.bone) })
    // blend
    const blA = blendName(a.blend ?? 'normal')
    const blB = blendName(b.blend ?? 'normal')
    if (blA !== blB) children.push({ key: 'blend', status: 'changed', valueA: blA, valueB: blB })
    // attachment (default)
    if (a.attachment !== b.attachment) children.push({ key: 'attachment', status: 'changed', valueA: str(a.attachment), valueB: str(b.attachment) })
    // draw order
    const orderA = orderMapA.get(name) ?? 0
    const orderB = orderMapB.get(name) ?? 0
    if (orderA !== orderB) children.push({ key: 'drawOrder', status: 'changed', valueA: String(orderA), valueB: String(orderB) })

    return {
      key:      name,
      status:   children.length > 0 ? 'changed' as const : 'equal' as const,
      children: children.length > 0 ? children : undefined,
    }
  })

  return {
    id:     'slots',
    label:  'Slots',
    status: sectionStatus(items),
    counts: { a: slotsA.length, b: slotsB.length },
    items,
  }
}

function compareSkinsJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const skinsA = getJsonSkins(rawA)
  const skinsB = getJsonSkins(rawB)
  const mapA = new Map(skinsA.map(s => [s.name as string, s]))
  const mapB = new Map(skinsB.map(s => [s.name as string, s]))
  const allNames = [...new Set([...mapA.keys(), ...mapB.keys()])]

  const items: DiffItem[] = allNames.map(name => {
    const a = mapA.get(name)
    const b = mapB.get(name)
    if (!a) return { key: name, status: 'added' as const }
    if (!b) return { key: name, status: 'removed' as const }

    const countA = getSkinAttachmentCount(a)
    const countB = getSkinAttachmentCount(b)
    const changed = countA !== countB
    const children: DiffItem[] = changed
      ? [{ key: 'attachments', status: 'changed', valueA: String(countA), valueB: String(countB) }]
      : []

    return {
      key:      name,
      status:   changed ? 'changed' as const : 'equal' as const,
      children: children.length > 0 ? children : undefined,
    }
  })

  return {
    id:     'skins',
    label:  'Skins',
    status: sectionStatus(items),
    counts: { a: skinsA.length, b: skinsB.length },
    items,
  }
}

function compareAnimationsJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const animsA = getJsonAnimations(rawA)
  const animsB = getJsonAnimations(rawB)
  const namesA = Object.keys(animsA)
  const namesB = Object.keys(animsB)
  const allNames = [...new Set([...namesA, ...namesB])]

  const items: DiffItem[] = allNames.map(name => {
    const a = animsA[name]
    const b = animsB[name]
    if (!a) return { key: name, status: 'added' as const }
    if (!b) return { key: name, status: 'removed' as const }

    const durA = getAnimationDuration(a)
    const durB = getAnimationDuration(b)
    const children: DiffItem[] = []
    if (Math.abs(durA - durB) > 0.001) {
      children.push({ key: 'duration', status: 'changed', valueA: `${durA}s`, valueB: `${durB}s` })
    }

    return {
      key:      name,
      status:   children.length > 0 ? 'changed' as const : 'equal' as const,
      children: children.length > 0 ? children : undefined,
    }
  })

  return {
    id:     'animations',
    label:  'Animations',
    status: sectionStatus(items),
    counts: { a: namesA.length, b: namesB.length },
    items,
  }
}

function compareEventsJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const eventsA = getJsonEvents(rawA)
  const eventsB = getJsonEvents(rawB)
  const namesA = Object.keys(eventsA)
  const namesB = Object.keys(eventsB)
  const allNames = [...new Set([...namesA, ...namesB])]

  const items: DiffItem[] = allNames.map(name => {
    const a = eventsA[name]
    const b = eventsB[name]
    if (!a) return { key: name, status: 'added' as const }
    if (!b) return { key: name, status: 'removed' as const }

    const children: DiffItem[] = []
    const fields = [['int', 'int'], ['float', 'float'], ['string', 'string']]
    for (const [fA, fB] of fields) {
      const va = a[fA] ?? (fA === 'string' ? '' : 0)
      const vb = b[fB] ?? (fB === 'string' ? '' : 0)
      if (str(va) !== str(vb)) children.push({ key: fA, status: 'changed', valueA: str(va), valueB: str(vb) })
    }

    return {
      key:      name,
      status:   children.length > 0 ? 'changed' as const : 'equal' as const,
      children: children.length > 0 ? children : undefined,
    }
  })

  return {
    id:     'events',
    label:  'Events',
    status: sectionStatus(items),
    counts: { a: namesA.length, b: namesB.length },
    items,
  }
}

function compareConstraintsJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const types = ['ik', 'transform', 'path'] as const
  const allItems: DiffItem[] = []
  let countA = 0
  let countB = 0

  for (const type of types) {
    const listA = getJsonConstraints(rawA, type)
    const listB = getJsonConstraints(rawB, type)
    countA += listA.length
    countB += listB.length

    const mapA = new Map(listA.map(c => [c.name as string, c]))
    const mapB = new Map(listB.map(c => [c.name as string, c]))
    const allNames = [...new Set([...mapA.keys(), ...mapB.keys()])]

    for (const name of allNames) {
      const a = mapA.get(name)
      const b = mapB.get(name)
      if (!a) { allItems.push({ key: `[${type}] ${name}`, status: 'added' }); continue }
      if (!b) { allItems.push({ key: `[${type}] ${name}`, status: 'removed' }); continue }

      const children: DiffItem[] = []
      // target
      if (str(a.target) !== str(b.target))
        children.push({ key: 'target', status: 'changed', valueA: str(a.target), valueB: str(b.target) })
      // mix
      if (a.mix !== undefined && str(a.mix) !== str(b.mix))
        children.push({ key: 'mix', status: 'changed', valueA: str(a.mix), valueB: str(b.mix) })
      // bendDirection
      if (a.bendDirection !== undefined && str(a.bendDirection) !== str(b.bendDirection))
        children.push({ key: 'bendDirection', status: 'changed', valueA: str(a.bendDirection), valueB: str(b.bendDirection) })

      allItems.push({
        key:      `[${type}] ${name}`,
        status:   children.length > 0 ? 'changed' : 'equal',
        children: children.length > 0 ? children : undefined,
      })
    }
  }

  return {
    id:     'constraints',
    label:  'Constraints',
    status: sectionStatus(allItems),
    counts: { a: countA, b: countB },
    items:  allItems,
  }
}

// ── Section comparisons — Runtime ──────────────────────────────────────────────

function compareBonesRuntime(adapterA: ISpineAdapter, adapterB: ISpineAdapter): DiffSection {
  const bonesA = adapterA.bones
  const bonesB = adapterB.bones
  const mapA = new Map(bonesA.map(b => [b.name, b]))
  const mapB = new Map(bonesB.map(b => [b.name, b]))
  const allNames = [...new Set([...mapA.keys(), ...mapB.keys()])]

  const items: DiffItem[] = allNames.map(name => {
    const a = mapA.get(name)
    const b = mapB.get(name)
    if (!a) return { key: name, status: 'added' as const }
    if (!b) return { key: name, status: 'removed' as const }

    const children: DiffItem[] = []
    if (a.parent !== b.parent)
      children.push({ key: 'parent', status: 'changed', valueA: a.parent ?? '—', valueB: b.parent ?? '—' })

    return {
      key:      name,
      status:   children.length > 0 ? 'changed' as const : 'equal' as const,
      children: children.length > 0 ? children : undefined,
    }
  })

  return {
    id:     'bones',
    label:  'Bones',
    status: sectionStatus(items),
    counts: { a: bonesA.length, b: bonesB.length },
    items,
  }
}

function compareSlotsRuntime(adapterA: ISpineAdapter, adapterB: ISpineAdapter): DiffSection {
  const slotsA = adapterA.slots
  const slotsB = adapterB.slots
  const mapA = new Map(slotsA.map(s => [s.name, s]))
  const mapB = new Map(slotsB.map(s => [s.name, s]))
  const allNames = [...new Set([...mapA.keys(), ...mapB.keys()])]

  const items: DiffItem[] = allNames.map(name => {
    const a = mapA.get(name)
    const b = mapB.get(name)
    if (!a) return { key: name, status: 'added' as const }
    if (!b) return { key: name, status: 'removed' as const }

    const children: DiffItem[] = []
    if (a.bone !== b.bone) children.push({ key: 'bone', status: 'changed', valueA: a.bone, valueB: b.bone })
    const blA = blendName(a.blendMode)
    const blB = blendName(b.blendMode)
    if (blA !== blB) children.push({ key: 'blend', status: 'changed', valueA: blA, valueB: blB })

    return {
      key:      name,
      status:   children.length > 0 ? 'changed' as const : 'equal' as const,
      children: children.length > 0 ? children : undefined,
    }
  })

  return {
    id:     'slots',
    label:  'Slots',
    status: sectionStatus(items),
    counts: { a: slotsA.length, b: slotsB.length },
    items,
  }
}

function compareNamesOnlySection(
  id: string,
  label: string,
  namesA: string[],
  namesB: string[],
): DiffSection {
  const { added, removed, common } = compareNameSets(namesA, namesB)
  const items: DiffItem[] = [
    ...removed.map(n => ({ key: n, status: 'removed' as const })),
    ...added.map(n => ({ key: n, status: 'added' as const })),
    ...common.map(n => ({ key: n, status: 'equal' as const })),
  ]
  return {
    id,
    label,
    status: sectionStatus(items),
    counts: { a: namesA.length, b: namesB.length },
    items,
  }
}

function compareEventsRuntime(adapterA: ISpineAdapter, adapterB: ISpineAdapter): DiffSection {
  const eventsA = adapterA.events
  const eventsB = adapterB.events
  const mapA = new Map(eventsA.map(e => [e.name, e]))
  const mapB = new Map(eventsB.map(e => [e.name, e]))
  const allNames = [...new Set([...mapA.keys(), ...mapB.keys()])]

  const items: DiffItem[] = allNames.map(name => {
    const a = mapA.get(name)
    const b = mapB.get(name)
    if (!a) return { key: name, status: 'added' as const }
    if (!b) return { key: name, status: 'removed' as const }

    const children: DiffItem[] = []
    if (a.intValue    !== b.intValue)    children.push({ key: 'int',    status: 'changed', valueA: str(a.intValue),    valueB: str(b.intValue) })
    if (a.floatValue  !== b.floatValue)  children.push({ key: 'float',  status: 'changed', valueA: str(a.floatValue),  valueB: str(b.floatValue) })
    if (a.stringValue !== b.stringValue) children.push({ key: 'string', status: 'changed', valueA: str(a.stringValue), valueB: str(b.stringValue) })

    return {
      key:      name,
      status:   children.length > 0 ? 'changed' as const : 'equal' as const,
      children: children.length > 0 ? children : undefined,
    }
  })

  return {
    id:     'events',
    label:  'Events',
    status: sectionStatus(items),
    counts: { a: eventsA.length, b: eventsB.length },
    items,
  }
}

// ── Placeholder extraction ─────────────────────────────────────────────────────

interface RawBoneEntry  { name: string; parent?: string }
interface RawSlotEntry  { name: string; bone: string; blend?: string }
interface RawAttachment { slotName: string; name: string; blend?: string }

function collectPlaceholderNames(data: SpineData): {
  bones:       RawBoneEntry[]
  slots:       RawSlotEntry[]
  attachments: RawAttachment[]
} {
  const bones:       RawBoneEntry[]  = []
  const slots:       RawSlotEntry[]  = []
  const attachments: RawAttachment[] = []

  if (data.source === 'json') {
    const raw = data.raw as AnyRecord
    for (const b of getJsonBones(raw)) {
      if (PLACEHOLDER_RE.test(b.name)) bones.push({ name: b.name, parent: b.parent })
    }
    for (const s of getJsonSlots(raw)) {
      if (PLACEHOLDER_RE.test(s.name)) slots.push({ name: s.name, bone: s.bone, blend: s.blend })
    }
    for (const skin of getJsonSkins(raw)) {
      for (const [slotName, atts] of Object.entries((skin.attachments ?? {}) as AnyRecord)) {
        for (const attName of Object.keys(atts as AnyRecord)) {
          if (PLACEHOLDER_RE.test(attName)) {
            const attData = (atts as AnyRecord)[attName] as AnyRecord
            attachments.push({ slotName, name: attName, blend: attData?.blend })
          }
        }
      }
    }
  } else {
    for (const b of data.adapter.bones) {
      if (PLACEHOLDER_RE.test(b.name)) bones.push({ name: b.name, parent: b.parent ?? undefined })
    }
    for (const s of data.adapter.slots) {
      if (PLACEHOLDER_RE.test(s.name)) slots.push({ name: s.name, bone: s.bone, blend: blendName(s.blendMode) })
    }
  }

  return { bones, slots, attachments }
}

function extractPlaceholders(dataA: SpineData, dataB: SpineData): PlaceholderDiff[] {
  const pA = collectPlaceholderNames(dataA)
  const pB = collectPlaceholderNames(dataB)
  const result: PlaceholderDiff[] = []

  // Bones
  const boneNamesA = new Map(pA.bones.map(b => [b.name, b]))
  const boneNamesB = new Map(pB.bones.map(b => [b.name, b]))
  const allBoneNames = [...new Set([...boneNamesA.keys(), ...boneNamesB.keys()])]
  for (const name of allBoneNames) {
    const a = boneNamesA.get(name)
    const b = boneNamesB.get(name)
    if (!a) { result.push({ name, kind: 'bone', status: 'added', params: [] }); continue }
    if (!b) { result.push({ name, kind: 'bone', status: 'removed', params: [] }); continue }
    const params: PlaceholderParam[] = []
    const parentChanged = a.parent !== b.parent
    params.push({ key: 'parent', valueA: a.parent ?? '—', valueB: b.parent ?? '—', changed: parentChanged, critical: parentChanged })
    const changed = params.some(p => p.changed)
    result.push({ name, kind: 'bone', status: changed ? 'changed' : 'equal', params })
  }

  // Slots
  const slotNamesA = new Map(pA.slots.map(s => [s.name, s]))
  const slotNamesB = new Map(pB.slots.map(s => [s.name, s]))
  const slotOrderA = new Map((dataA.source === 'json' ? getJsonSlots(dataA.raw as AnyRecord) : dataA.adapter.slots).map((s, i) => [s.name as string, i]))
  const slotOrderB = new Map((dataB.source === 'json' ? getJsonSlots(dataB.raw as AnyRecord) : dataB.adapter.slots).map((s, i) => [s.name as string, i]))
  const allSlotNames = [...new Set([...slotNamesA.keys(), ...slotNamesB.keys()])]

  for (const name of allSlotNames) {
    const a = slotNamesA.get(name)
    const b = slotNamesB.get(name)
    if (!a) { result.push({ name, kind: 'slot', status: 'added', params: [] }); continue }
    if (!b) { result.push({ name, kind: 'slot', status: 'removed', params: [] }); continue }

    const params: PlaceholderParam[] = []
    const boneChanged = a.bone !== b.bone
    params.push({ key: 'bone', valueA: a.bone, valueB: b.bone, changed: boneChanged, critical: boneChanged })

    const blA = blendName(a.blend ?? 'normal')
    const blB = blendName(b.blend ?? 'normal')
    const blendChanged = blA !== blB
    params.push({ key: 'blend', valueA: blA, valueB: blB, changed: blendChanged, critical: blendChanged })

    const oA = slotOrderA.get(name) ?? 0
    const oB = slotOrderB.get(name) ?? 0
    const orderShift = Math.abs(oA - oB)
    const orderCritical = orderShift > 2
    params.push({ key: 'drawOrder', valueA: String(oA), valueB: String(oB), changed: oA !== oB, critical: orderCritical })

    const changed = params.some(p => p.changed)
    result.push({ name, kind: 'slot', status: changed ? 'changed' : 'equal', params })
  }

  // Attachments
  const attNamesA = new Map(pA.attachments.map(a => [`${a.slotName}::${a.name}`, a]))
  const attNamesB = new Map(pB.attachments.map(a => [`${a.slotName}::${a.name}`, a]))
  const allAttKeys = [...new Set([...attNamesA.keys(), ...attNamesB.keys()])]
  for (const key of allAttKeys) {
    const a = attNamesA.get(key)
    const b = attNamesB.get(key)
    const displayName = a?.name ?? b?.name ?? key
    if (!a) { result.push({ name: displayName, kind: 'attachment', status: 'added', params: [] }); continue }
    if (!b) { result.push({ name: displayName, kind: 'attachment', status: 'removed', params: [] }); continue }
    const blA = blendName(a.blend ?? 'normal')
    const blB = blendName(b.blend ?? 'normal')
    const blendChanged = blA !== blB
    const params: PlaceholderParam[] = [
      { key: 'blend', valueA: blA, valueB: blB, changed: blendChanged, critical: blendChanged },
    ]
    result.push({ name: displayName, kind: 'attachment', status: blendChanged ? 'changed' : 'equal', params })
  }

  return result
}

// ── Reskin-focused builders ────────────────────────────────────────────────────

function buildAnimTable(dataA: SpineData, dataB: SpineData): AnimTableRow[] {
  const durMapA = new Map<string, number>()
  const durMapB = new Map<string, number>()
  let namesA: string[]
  let namesB: string[]

  if (dataA.source === 'json') {
    const anims = getJsonAnimations(dataA.raw as AnyRecord)
    namesA = Object.keys(anims)
    for (const [name, anim] of Object.entries(anims))
      durMapA.set(name, getAnimationDuration(anim as AnyRecord))
  } else {
    namesA = dataA.adapter.animations
  }

  if (dataB.source === 'json') {
    const anims = getJsonAnimations(dataB.raw as AnyRecord)
    namesB = Object.keys(anims)
    for (const [name, anim] of Object.entries(anims))
      durMapB.set(name, getAnimationDuration(anim as AnyRecord))
  } else {
    namesB = dataB.adapter.animations
  }

  const setA = new Set(namesA)
  const setB = new Set(namesB)
  const all  = [...new Set([...namesA, ...namesB])]

  return all.map(name => {
    const inA = setA.has(name)
    const inB = setB.has(name)
    const durA = durMapA.get(name) ?? null
    const durB = durMapB.get(name) ?? null
    if (!inA) return { name, durA: null, durB, status: 'only-b' as const }
    if (!inB) return { name, durA, durB: null, status: 'only-a' as const }
    const hasDelta = durA !== null && durB !== null && Math.abs(durA - durB) > 0.001
    return { name, durA, durB, status: hasDelta ? 'delta' as const : 'ok' as const }
  })
}

function buildAnimEvents(dataA: SpineData, dataB: SpineData): AnimEventGroup[] {
  if (dataA.source !== 'json' || dataB.source !== 'json') return []

  const animsA = getJsonAnimations(dataA.raw as AnyRecord)
  const animsB = getJsonAnimations(dataB.raw as AnyRecord)
  const allAnimNames = [...new Set([...Object.keys(animsA), ...Object.keys(animsB)])]

  const groups: AnimEventGroup[] = []

  for (const animName of allAnimNames) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const animA = animsA[animName] as AnyRecord | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const animB = animsB[animName] as AnyRecord | undefined

    const animStatus: AnimTableRow['status'] =
      !animA ? 'only-b' : !animB ? 'only-a' : 'ok'

    const eventsA: Array<{ name: string; time: number }> = Array.isArray(animA?.events) ? animA.events : []
    const eventsB: Array<{ name: string; time: number }> = Array.isArray(animB?.events) ? animB.events : []

    if (eventsA.length === 0 && eventsB.length === 0) continue

    // Group by event name with occurrence index
    const timesA = new Map<string, number[]>()
    const timesB = new Map<string, number[]>()
    for (const ev of eventsA) {
      if (!timesA.has(ev.name)) timesA.set(ev.name, [])
      timesA.get(ev.name)!.push(ev.time)
    }
    for (const ev of eventsB) {
      if (!timesB.has(ev.name)) timesB.set(ev.name, [])
      timesB.get(ev.name)!.push(ev.time)
    }

    const allEventNames = [...new Set([...timesA.keys(), ...timesB.keys()])]
    const occurrences: AnimEventOccurrence[] = []

    for (const eventName of allEventNames) {
      const tA = timesA.get(eventName) ?? []
      const tB = timesB.get(eventName) ?? []
      const maxLen = Math.max(tA.length, tB.length)
      for (let i = 0; i < maxLen; i++) {
        const timeA = tA[i] ?? null
        const timeB = tB[i] ?? null
        let status: AnimEventOccurrence['status']
        if (timeA === null)                          status = 'only-b'
        else if (timeB === null)                     status = 'only-a'
        else if (Math.abs(timeA - timeB) > 0.001)   status = 'delta'
        else                                         status = 'ok'
        occurrences.push({ eventName, idx: i, timeA, timeB, status })
      }
    }

    // Sort by earliest time
    occurrences.sort((a, b) => (a.timeA ?? a.timeB ?? 0) - (b.timeA ?? b.timeB ?? 0))

    const hasChanges = occurrences.some(o => o.status !== 'ok')
    groups.push({ animName, animStatus, events: occurrences, hasChanges })
  }

  // Changed animations first, then alphabetically
  groups.sort((a, b) => {
    if (a.hasChanges !== b.hasChanges) return a.hasChanges ? -1 : 1
    return a.animName.localeCompare(b.animName)
  })

  return groups
}

// ── Main comparison entry point ────────────────────────────────────────────────

export async function compareSpines(dataA: SpineData, dataB: SpineData): Promise<SpineDiff> {
  const isJsonFull = dataA.source === 'json' && dataB.source === 'json'
  const sections: DiffSection[] = []

  if (isJsonFull) {
    const rawA = dataA.raw as AnyRecord
    const rawB = dataB.raw as AnyRecord

    sections.push(compareSkeletonMeta(rawA, rawB))
    sections.push(compareBonesJson(rawA, rawB))
    sections.push(compareSlotsJson(rawA, rawB))
    sections.push(compareSkinsJson(rawA, rawB))
    sections.push(compareAnimationsJson(rawA, rawB))
    sections.push(compareEventsJson(rawA, rawB))
    sections.push(compareConstraintsJson(rawA, rawB))
  } else {
    // Runtime-partial: both sides must be runtime adapters
    if (dataA.source !== 'runtime' || dataB.source !== 'runtime') {
      throw new Error('Runtime comparison requires both sides to use runtime adapters')
    }
    const aA = dataA.adapter
    const aB = dataB.adapter

    sections.push(compareBonesRuntime(aA, aB))
    sections.push(compareSlotsRuntime(aA, aB))
    sections.push(compareNamesOnlySection('skins', 'Skins', aA.skins, aB.skins))
    sections.push(compareNamesOnlySection('animations', 'Animations', aA.animations, aB.animations))
    sections.push(compareEventsRuntime(aA, aB))
  }

  const placeholders = extractPlaceholders(dataA, dataB)
  const animTable    = buildAnimTable(dataA, dataB)
  const animEvents   = buildAnimEvents(dataA, dataB)

  // Build summary
  const summary = { added: 0, removed: 0, changed: 0, equal: 0 }
  for (const section of sections) {
    const counts = countSummaryChange(section.items)
    summary.added   += counts.added
    summary.removed += counts.removed
    summary.changed += counts.changed
    summary.equal   += counts.equal
  }

  return {
    source:       isJsonFull ? 'json-full' : 'runtime-partial',
    summary,
    animTable,
    animEvents,
    placeholders,
    sections,
  }
}
