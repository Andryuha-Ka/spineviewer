/**
 * @file sections.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import type { AnyRecord, DiffItem, DiffSection } from './types'
import {
  getAnimationDuration, getJsonAnimations, getJsonBones, getJsonConstraints, getJsonEvents,
  getJsonSkins, getJsonSlots, getSkinAttachmentCount, str,
} from './jsonAccess'

// ── Helpers ────────────────────────────────────────────────────────────────────

const BLEND_MODE_NAMES: Record<number, string> = { 0: 'Normal', 1: 'Additive', 2: 'Multiply', 3: 'Screen' }

function blendName(v: string | number | undefined): string {
  if (v === undefined || v === null) return 'Normal'
  if (typeof v === 'number') return BLEND_MODE_NAMES[v] ?? String(v)
  return String(v).charAt(0).toUpperCase() + String(v).slice(1).toLowerCase()
}

function itemStatus(a: unknown, b: unknown): 'added' | 'removed' | 'changed' | 'equal' {
  if (a === undefined && b !== undefined) return 'added'
  if (a !== undefined && b === undefined) return 'removed'
  if (str(a) !== str(b)) return 'changed'
  return 'equal'
}

function sectionStatus(items: DiffItem[]): 'equal' | 'changed' {
  return items.some(i => i.status !== 'equal') ? 'changed' : 'equal'
}

function changedItem(key: string, children: DiffItem[]): DiffItem {
  return {
    key,
    status:   children.length > 0 ? 'changed' : 'equal',
    children: children.length > 0 ? children : undefined,
  }
}

function diffByName<T>(
  mapA: Map<string, T>,
  mapB: Map<string, T>,
  diffCommon: (name: string, a: T, b: T) => DiffItem,
): DiffItem[] {
  const allNames = [...new Set([...mapA.keys(), ...mapB.keys()])]
  return allNames.map(name => {
    const a = mapA.get(name)
    const b = mapB.get(name)
    if (!a) return { key: name, status: 'added' as const }
    if (!b) return { key: name, status: 'removed' as const }
    return diffCommon(name, a, b)
  })
}

function lcsNames(a: string[], b: string[]): Set<string> {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out = new Set<string>()
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.add(a[i]); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return out
}

// ── Section comparisons — JSON ─────────────────────────────────────────────────

export function compareSkeletonMeta(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
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

export function compareBonesJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const bonesA = getJsonBones(rawA)
  const bonesB = getJsonBones(rawB)
  const mapA = new Map(bonesA.map(b => [b.name as string, b]))
  const mapB = new Map(bonesB.map(b => [b.name as string, b]))
  const boneFields = ['parent', 'x', 'y', 'rotation', 'length', 'scaleX', 'scaleY', 'shearX', 'shearY']

  const items = diffByName(mapA, mapB, (name, a, b) => {
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

export function compareSlotsJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const slotsA = getJsonSlots(rawA)
  const slotsB = getJsonSlots(rawB)
  const mapA = new Map(slotsA.map(s => [s.name as string, s]))
  const mapB = new Map(slotsB.map(s => [s.name as string, s]))
  const orderMapA = new Map(slotsA.map((s, i) => [s.name as string, i]))
  const orderMapB = new Map(slotsB.map((s, i) => [s.name as string, i]))
  const sharedA = slotsA.map(s => s.name as string).filter(n => mapB.has(n))
  const sharedB = slotsB.map(s => s.name as string).filter(n => mapA.has(n))
  const inOrder = lcsNames(sharedA, sharedB)

  const items = diffByName(mapA, mapB, (name, a, b) => {
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
    if (!inOrder.has(name)) children.push({ key: 'drawOrder', status: 'changed', valueA: String(orderA), valueB: String(orderB) })
    return changedItem(name, children)
  })

  return {
    id:     'slots',
    label:  'Slots',
    status: sectionStatus(items),
    counts: { a: slotsA.length, b: slotsB.length },
    items,
  }
}

export function compareSkinsJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const skinsA = getJsonSkins(rawA)
  const skinsB = getJsonSkins(rawB)
  const mapA = new Map(skinsA.map(s => [s.name as string, s]))
  const mapB = new Map(skinsB.map(s => [s.name as string, s]))

  const items = diffByName(mapA, mapB, (name, a, b) => {
    const countA = getSkinAttachmentCount(a)
    const countB = getSkinAttachmentCount(b)
    return changedItem(name, countA !== countB
      ? [{ key: 'attachments', status: 'changed', valueA: String(countA), valueB: String(countB) }]
      : [])
  })

  return {
    id:     'skins',
    label:  'Skins',
    status: sectionStatus(items),
    counts: { a: skinsA.length, b: skinsB.length },
    items,
  }
}

export function compareAnimationsJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const animsA = getJsonAnimations(rawA)
  const animsB = getJsonAnimations(rawB)

  const items = diffByName(new Map(Object.entries(animsA)), new Map(Object.entries(animsB)), (name, a, b) => {
    const durA = getAnimationDuration(a)
    const durB = getAnimationDuration(b)
    const children: DiffItem[] = []
    if (Math.abs(durA - durB) > 0.001) {
      children.push({ key: 'duration', status: 'changed', valueA: `${durA}s`, valueB: `${durB}s` })
    }
    return changedItem(name, children)
  })

  return {
    id:     'animations',
    label:  'Animations',
    status: sectionStatus(items),
    counts: { a: Object.keys(animsA).length, b: Object.keys(animsB).length },
    items,
  }
}

export function compareEventsJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
  const eventsA = getJsonEvents(rawA)
  const eventsB = getJsonEvents(rawB)

  const items = diffByName(new Map(Object.entries(eventsA)), new Map(Object.entries(eventsB)), (name, a, b) => {
    const children: DiffItem[] = []
    for (const f of ['int', 'float', 'string']) {
      const va = a[f] ?? (f === 'string' ? '' : 0)
      const vb = b[f] ?? (f === 'string' ? '' : 0)
      if (str(va) !== str(vb)) children.push({ key: f, status: 'changed', valueA: str(va), valueB: str(vb) })
    }
    return changedItem(name, children)
  })

  return {
    id:     'events',
    label:  'Events',
    status: sectionStatus(items),
    counts: { a: Object.keys(eventsA).length, b: Object.keys(eventsB).length },
    items,
  }
}

export function compareConstraintsJson(rawA: AnyRecord, rawB: AnyRecord): DiffSection {
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
      // bones
      const bonesA = (Array.isArray(a.bones) ? (a.bones as string[]) : []).join(', ')
      const bonesB = (Array.isArray(b.bones) ? (b.bones as string[]) : []).join(', ')
      if (bonesA !== bonesB)
        children.push({ key: 'bones', status: 'changed', valueA: bonesA, valueB: bonesB })
      // target
      if (str(a.target) !== str(b.target))
        children.push({ key: 'target', status: 'changed', valueA: str(a.target), valueB: str(b.target) })
      // mix
      if (a.mix !== undefined && str(a.mix) !== str(b.mix))
        children.push({ key: 'mix', status: 'changed', valueA: str(a.mix), valueB: str(b.mix) })
      // bendDirection / bendPositive
      if (a.bendDirection !== undefined && str(a.bendDirection) !== str(b.bendDirection))
        children.push({ key: 'bendDirection', status: 'changed', valueA: str(a.bendDirection), valueB: str(b.bendDirection) })
      if (a.bendPositive !== undefined && str(a.bendPositive) !== str(b.bendPositive))
        children.push({ key: 'bendPositive', status: 'changed', valueA: str(a.bendPositive), valueB: str(b.bendPositive) })
      // transform mixes
      for (const k of ['rotateMix', 'translateMix', 'scaleMix', 'shearMix'] as const) {
        if (a[k] !== undefined && str(a[k]) !== str(b[k]))
          children.push({ key: k, status: 'changed', valueA: str(a[k]), valueB: str(b[k]) })
      }
      // path modes
      for (const k of ['positionMode', 'spacingMode', 'rotateMode'] as const) {
        if (a[k] !== undefined && str(a[k]) !== str(b[k]))
          children.push({ key: k, status: 'changed', valueA: str(a[k]), valueB: str(b[k]) })
      }

      allItems.push(changedItem(`[${type}] ${name}`, children))
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

export function compareBonesRuntime(adapterA: ISpineAdapter, adapterB: ISpineAdapter): DiffSection {
  const bonesA = adapterA.bones
  const bonesB = adapterB.bones

  const items = diffByName(new Map(bonesA.map(b => [b.name, b])), new Map(bonesB.map(b => [b.name, b])), (name, a, b) => {
    const children: DiffItem[] = []
    if (a.parent !== b.parent)
      children.push({ key: 'parent', status: 'changed', valueA: a.parent ?? '—', valueB: b.parent ?? '—' })
    return changedItem(name, children)
  })

  return {
    id:     'bones',
    label:  'Bones',
    status: sectionStatus(items),
    counts: { a: bonesA.length, b: bonesB.length },
    items,
  }
}

export function compareSlotsRuntime(adapterA: ISpineAdapter, adapterB: ISpineAdapter): DiffSection {
  const slotsA = adapterA.slots
  const slotsB = adapterB.slots

  const items = diffByName(new Map(slotsA.map(s => [s.name, s])), new Map(slotsB.map(s => [s.name, s])), (name, a, b) => {
    const children: DiffItem[] = []
    if (a.bone !== b.bone) children.push({ key: 'bone', status: 'changed', valueA: a.bone, valueB: b.bone })
    const blA = blendName(a.blendMode)
    const blB = blendName(b.blendMode)
    if (blA !== blB) children.push({ key: 'blend', status: 'changed', valueA: blA, valueB: blB })
    return changedItem(name, children)
  })

  return {
    id:     'slots',
    label:  'Slots',
    status: sectionStatus(items),
    counts: { a: slotsA.length, b: slotsB.length },
    items,
  }
}

export function compareNamesOnlySection(
  id: string,
  label: string,
  namesA: string[],
  namesB: string[],
): DiffSection {
  const setA = new Set(namesA)
  const setB = new Set(namesB)
  const items: DiffItem[] = [
    ...namesA.filter(n => !setB.has(n)).map(n => ({ key: n, status: 'removed' as const })),
    ...namesB.filter(n => !setA.has(n)).map(n => ({ key: n, status: 'added' as const })),
    ...namesA.filter(n => setB.has(n)).map(n => ({ key: n, status: 'equal' as const })),
  ]
  return {
    id,
    label,
    status: sectionStatus(items),
    counts: { a: namesA.length, b: namesB.length },
    items,
  }
}

export function compareEventsRuntime(adapterA: ISpineAdapter, adapterB: ISpineAdapter): DiffSection {
  const eventsA = adapterA.events
  const eventsB = adapterB.events

  const items = diffByName(new Map(eventsA.map(e => [e.name, e])), new Map(eventsB.map(e => [e.name, e])), (name, a, b) => {
    const children: DiffItem[] = []
    if (a.intValue    !== b.intValue)    children.push({ key: 'int',    status: 'changed', valueA: str(a.intValue),    valueB: str(b.intValue) })
    if (a.floatValue  !== b.floatValue)  children.push({ key: 'float',  status: 'changed', valueA: str(a.floatValue),  valueB: str(b.floatValue) })
    if (a.stringValue !== b.stringValue) children.push({ key: 'string', status: 'changed', valueA: str(a.stringValue), valueB: str(b.stringValue) })
    return changedItem(name, children)
  })

  return {
    id:     'events',
    label:  'Events',
    status: sectionStatus(items),
    counts: { a: eventsA.length, b: eventsB.length },
    items,
  }
}
