/**
 * @file placeholders.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { AnyRecord, PlaceholderDiff, SpineData } from './types'
import { getJsonBones, getJsonSkins, getJsonSlots } from './jsonAccess'

const PLACEHOLDER_RE = /placeholder/i

function collectPlaceholderNames(data: SpineData): { bones: string[]; slots: string[]; attachments: string[] } {
  const isPh = (n: string) => PLACEHOLDER_RE.test(n)
  if (data.source !== 'json') {
    return {
      bones:       data.adapter.bones.map(b => b.name).filter(isPh),
      slots:       data.adapter.slots.map(s => s.name).filter(isPh),
      attachments: [],
    }
  }
  const raw = data.raw as AnyRecord
  const attachments: string[] = []
  for (const skin of getJsonSkins(raw)) {
    for (const [slotName, atts] of Object.entries((skin.attachments ?? {}) as AnyRecord)) {
      for (const attName of Object.keys(atts as AnyRecord)) {
        if (isPh(attName)) attachments.push(`${slotName}::${attName}`)
      }
    }
  }
  return {
    bones: getJsonBones(raw).map(b => b.name as string).filter(isPh),
    slots: getJsonSlots(raw).map(s => s.name as string).filter(isPh),
    attachments,
  }
}

export function extractPlaceholders(dataA: SpineData, dataB: SpineData): PlaceholderDiff[] {
  const pA = collectPlaceholderNames(dataA)
  const pB = collectPlaceholderNames(dataB)
  const result: PlaceholderDiff[] = []
  for (const kind of ['bone', 'slot', 'attachment'] as const) {
    const a = new Set(pA[`${kind}s`])
    const b = new Set(pB[`${kind}s`])
    for (const key of new Set([...a, ...b])) {
      const status = !a.has(key) ? 'added' : !b.has(key) ? 'removed' : 'equal'
      if (kind !== 'attachment') { result.push({ name: key, kind, status }); continue }
      const sep = key.indexOf('::')
      result.push({ name: key.slice(sep + 2), kind, status, slot: key.slice(0, sep) })
    }
  }
  return result
}
