/**
 * @file reskin.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type {
  AnimEventGroup, AnimEventOccurrence, AnimTableRow, AnyRecord, ConstraintRow, FreeBoneRow,
  GlobalEventRow, SkinRow, SliderRow, SpineData,
} from './types'
import {
  constraintTarget, getAnimationDuration, getJsonAnimations, getJsonConstraints, getJsonEvents,
  getJsonSkins, str,
} from './jsonAccess'

function presenceRows(
  namesA: Iterable<string>,
  namesB: Iterable<string>,
): { name: string; status: 'ok' | 'only-a' | 'only-b' }[] {
  const setA = new Set(namesA)
  const setB = new Set(namesB)
  return [...new Set([...setA, ...setB])].map(name => {
    if (!setA.has(name)) return { name, status: 'only-b' as const }
    if (!setB.has(name)) return { name, status: 'only-a' as const }
    return { name, status: 'ok' as const }
  })
}

export function buildSkinTable(dataA: SpineData, dataB: SpineData): SkinRow[] {
  const namesA = dataA.source === 'json'
    ? getJsonSkins(dataA.raw as AnyRecord).map(s => s.name as string)
    : dataA.adapter.skins
  const namesB = dataB.source === 'json'
    ? getJsonSkins(dataB.raw as AnyRecord).map(s => s.name as string)
    : dataB.adapter.skins
  return presenceRows(namesA, namesB)
}

export function buildGlobalEvents(dataA: SpineData, dataB: SpineData): GlobalEventRow[] {
  const namesA = dataA.source === 'json'
    ? Object.keys(getJsonEvents(dataA.raw as AnyRecord))
    : dataA.adapter.events.map(e => e.name)
  const namesB = dataB.source === 'json'
    ? Object.keys(getJsonEvents(dataB.raw as AnyRecord))
    : dataB.adapter.events.map(e => e.name)
  return presenceRows(namesA, namesB)
}

export function buildAnimTable(dataA: SpineData, dataB: SpineData): AnimTableRow[] {
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
    for (const name of namesA) {
      const d = dataA.adapter.getAnimationDuration(name)
      if (d !== null) durMapA.set(name, d)
    }
  }

  if (dataB.source === 'json') {
    const anims = getJsonAnimations(dataB.raw as AnyRecord)
    namesB = Object.keys(anims)
    for (const [name, anim] of Object.entries(anims))
      durMapB.set(name, getAnimationDuration(anim as AnyRecord))
  } else {
    namesB = dataB.adapter.animations
    for (const name of namesB) {
      const d = dataB.adapter.getAnimationDuration(name)
      if (d !== null) durMapB.set(name, d)
    }
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

export function buildAnimEvents(dataA: SpineData, dataB: SpineData): AnimEventGroup[] {
  const namesA = dataA.source === 'json'
    ? Object.keys(getJsonAnimations(dataA.raw as AnyRecord))
    : dataA.adapter.animations
  const namesB = dataB.source === 'json'
    ? Object.keys(getJsonAnimations(dataB.raw as AnyRecord))
    : dataB.adapter.animations

  const allAnimNames = [...new Set([...namesA, ...namesB])]
  const setA = new Set(namesA)
  const setB = new Set(namesB)

  const getEventsForAnim = (data: SpineData, animName: string): Array<{ name: string; time: number }> => {
    if (data.source === 'json') {
      const anim = getJsonAnimations(data.raw as AnyRecord)[animName] as AnyRecord | undefined
      return Array.isArray(anim?.events) ? anim.events as Array<{ name: string; time: number }> : []
    }
    return data.adapter.getAnimationEvents(animName)
  }

  const groups: AnimEventGroup[] = []

  for (const animName of allAnimNames) {
    const animStatus: AnimTableRow['status'] =
      !setA.has(animName) ? 'only-b' : !setB.has(animName) ? 'only-a' : 'ok'

    const eventsA = getEventsForAnim(dataA, animName)
    const eventsB = getEventsForAnim(dataB, animName)

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

// ── Constraint table (JSON-only) ────────────────────────────────────────────────

const CONSTRAINT_PARAM_KEYS = [
  'mix', 'bendDirection', 'bendPositive', 'softness', 'compress', 'stretch', 'uniform',
  'rotateMix', 'translateMix', 'scaleMix', 'shearMix',
  'mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY',
  'positionMode', 'spacingMode', 'rotateMode',
]

export function buildConstraintTable(dataA: SpineData, dataB: SpineData): ConstraintRow[] {
  if (dataA.source !== 'json' || dataB.source !== 'json') return []
  const rawA = dataA.raw as AnyRecord
  const rawB = dataB.raw as AnyRecord
  const rows: ConstraintRow[] = []
  const types = ['ik', 'transform', 'path'] as const

  for (const kind of types) {
    const listA = getJsonConstraints(rawA, kind)
    const listB = getJsonConstraints(rawB, kind)
    const mapA  = new Map(listA.map(c => [c.name as string, c]))
    const mapB  = new Map(listB.map(c => [c.name as string, c]))
    const allNames = [...new Set([...mapA.keys(), ...mapB.keys()])]

    for (const name of allNames) {
      const a = mapA.get(name)
      const b = mapB.get(name)
      if (!a) { rows.push({ name, kind, status: 'only-b', bonesChanged: false, targetChanged: false, paramsChanged: false }); continue }
      if (!b) { rows.push({ name, kind, status: 'only-a', bonesChanged: false, targetChanged: false, paramsChanged: false }); continue }

      const bonesA      = (Array.isArray(a.bones) ? (a.bones as string[]) : []).join(',')
      const bonesB      = (Array.isArray(b.bones) ? (b.bones as string[]) : []).join(',')
      const bonesChanged  = bonesA !== bonesB
      const targetChanged = str(constraintTarget(a)) !== str(constraintTarget(b))
      const paramsChanged = CONSTRAINT_PARAM_KEYS.some(k => a[k] !== undefined && str(a[k]) !== str(b[k]))
      const status = (bonesChanged || targetChanged || paramsChanged) ? 'changed' as const : 'ok' as const
      rows.push({ name, kind, status, bonesChanged, targetChanged, paramsChanged })
    }
  }

  rows.sort((a, b) => {
    if (a.status !== 'ok' && b.status === 'ok') return -1
    if (a.status === 'ok' && b.status !== 'ok') return 1
    return a.name.localeCompare(b.name)
  })
  return rows
}

// ── Slider table (JSON-only) ────────────────────────────────────────────────────

const SLIDER_DEFAULTS: Record<string, unknown> = {
  animation: undefined, loop: false, additive: false, bone: undefined, property: undefined, time: 0, mix: 1,
}

const issuesFirst = <T extends { name: string; status: string }>(a: T, b: T) =>
  Number(a.status === 'ok') - Number(b.status === 'ok') || a.name.localeCompare(b.name)

export function buildSliderTable(dataA: SpineData, dataB: SpineData): SliderRow[] {
  if (dataA.source !== 'json' || dataB.source !== 'json') return []
  const mapA = new Map(getJsonConstraints(dataA.raw as AnyRecord, 'slider').map(c => [c.name as string, c]))
  const mapB = new Map(getJsonConstraints(dataB.raw as AnyRecord, 'slider').map(c => [c.name as string, c]))
  const rows = presenceRows(mapA.keys(), mapB.keys()).map(({ name, status }): SliderRow => {
    if (status !== 'ok') return { name, status, changes: [] }
    const a = mapA.get(name)!
    const b = mapB.get(name)!
    const changes = Object.entries(SLIDER_DEFAULTS)
      .map(([key, def]) => ({ key, a: str(a[key] ?? def), b: str(b[key] ?? def) }))
      .filter(c => c.a !== c.b)
    return { name, status: changes.length ? 'changed' : 'ok', changes }
  })
  return rows.sort(issuesFirst)
}

export function buildFreeBoneTable(dataA: SpineData, dataB: SpineData): FreeBoneRow[] {
  if (dataA.source !== 'runtime' || dataB.source !== 'runtime') return []
  const rows = presenceRows(dataA.adapter.getFreeBones(), dataB.adapter.getFreeBones())
  rows.sort((a, b) => {
    if (a.status !== 'ok' && b.status === 'ok') return -1
    if (a.status === 'ok' && b.status !== 'ok') return 1
    return a.name.localeCompare(b.name)
  })
  return rows
}
