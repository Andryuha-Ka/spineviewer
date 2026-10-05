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

export function getJsonConstraints(raw: AnyRecord, type: 'ik' | 'transform' | 'path'): AnyRecord[] {
  return Array.isArray(raw[type]) ? raw[type] : []
}

export function getAnimationDuration(anim: AnyRecord): number {
  let max = 0
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      const last = node[node.length - 1]
      if (last && typeof last.time === 'number' && last.time > max) max = last.time
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
