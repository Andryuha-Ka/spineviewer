/**
 * @file spineCompare.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { AnyRecord, DiffItem, DiffSection, SpineData, SpineDiff } from './compare/types'
import {
  compareAnimationsJson, compareBonesJson, compareBonesRuntime, compareConstraintsJson,
  compareEventsJson, compareEventsRuntime, compareNamesOnlySection, compareSkeletonMeta,
  compareSkinsJson, compareSlotsJson, compareSlotsRuntime,
} from './compare/sections'
import { extractPlaceholders } from './compare/placeholders'
import {
  buildAnimEvents, buildAnimTable, buildConstraintTable, buildFreeBoneTable, buildGlobalEvents,
  buildSkinTable, buildSliderTable,
} from './compare/reskin'

export type { SpineJsonData, SpineRuntimeData, SpineData, PlaceholderDiff, DiffItem, DiffSection,
  AnimEventGroup, GlobalEventRow, SkinRow, ConstraintRow, SliderRow,
  FreeBoneRow, SpineDiff } from './compare/types'

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

  const placeholders    = extractPlaceholders(dataA, dataB)
  const animTable       = buildAnimTable(dataA, dataB)
  const skinTable       = buildSkinTable(dataA, dataB)
  const globalEvents    = buildGlobalEvents(dataA, dataB)
  const animEvents      = buildAnimEvents(dataA, dataB)
  const constraintTable = buildConstraintTable(dataA, dataB)
  const sliderTable     = buildSliderTable(dataA, dataB)
  const freeBoneTable   = buildFreeBoneTable(dataA, dataB)

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
    skinTable,
    globalEvents,
    animEvents,
    constraintTable,
    sliderTable,
    freeBoneTable,
    placeholders,
    sections,
  }
}
