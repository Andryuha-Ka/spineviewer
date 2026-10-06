/**
 * @file jsonAccess.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { AnyRecord } from './types'

export function str(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'number') return String(Math.round(v * 10000) / 10000)
  return String(v)
}

export function getJsonBones(raw: AnyRecord): AnyRecord[] {
  return Array.isArray(raw.bones) ? raw.bones : []
}

export function getJsonSlots(raw: AnyRecord): AnyRecord[] {
  return Array.isArray(raw.slots) ? raw.slots : []
}

export function getJsonSkins(raw: AnyRecord): AnyRecord[] {
  if (Array.isArray(raw.skins)) return raw.skins
  // Older format: skins is object
  if (raw.skins && typeof raw.skins === 'object') {
    return Object.entries(raw.skins as AnyRecord).map(([name, attachments]) => ({ name, attachments }))
  }
  return []
}

export function getJsonAnimations(raw: AnyRecord): AnyRecord {
  return (raw.animations && typeof raw.animations === 'object') ? raw.animations as AnyRecord : {}
}

export function getJsonEvents(raw: AnyRecord): AnyRecord {
  return (raw.events && typeof raw.events === 'object') ? raw.events as AnyRecord : {}
}

export type JsonConstraintType = 'ik' | 'transform' | 'path' | 'slider'

/** 4.3 keeps one `constraints` list tagged by `type`; 3.8–4.2 keep one list per type. */
export function getJsonConstraints(raw: AnyRecord, type: JsonConstraintType): AnyRecord[] {
  if (Array.isArray(raw.constraints)) return raw.constraints.filter((c: AnyRecord) => c?.type === type)
  return Array.isArray(raw[type]) ? raw[type] : []
}

/** 4.3 renamed the transform `target` to `source` and the path `target` to `slot`. */
export function constraintTarget(c: AnyRecord): unknown {
  return c.target ?? c.source ?? c.slot
}

export function getAnimationDuration(anim: AnyRecord): number {
  let max = 0
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const el of node) {
        if (el && typeof el.time === 'number' && el.time > max) max = el.time
        walk(el)
      }
    } else if (node && typeof node === 'object') {
      for (const v of Object.values(node)) walk(v)
    }
  }
  walk(anim)
  return Math.round(max * 1000) / 1000
}

export function getSkinAttachmentCount(skin: AnyRecord): number {
  const atts = skin.attachments
  if (!atts || typeof atts !== 'object') return 0
  let count = 0
  for (const slot of Object.values(atts)) count += Object.keys(slot as AnyRecord).length
  return count
}
