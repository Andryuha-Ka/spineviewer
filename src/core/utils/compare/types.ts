/**
 * @file types.ts
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

export interface PlaceholderDiff {
  name: string
  kind: 'bone' | 'slot' | 'attachment'
  status: 'added' | 'removed' | 'equal'
  slot?: string
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

export interface GlobalEventRow {
  name:   string
  status: 'ok' | 'only-a' | 'only-b'
}

export interface SkinRow {
  name:   string
  status: 'ok' | 'only-a' | 'only-b'
}

export interface ConstraintRow {
  name:          string
  kind:          'ik' | 'transform' | 'path'
  status:        'ok' | 'only-a' | 'only-b' | 'changed'
  bonesChanged:  boolean  // which bones the constraint drives
  targetChanged: boolean  // target bone/slot
  paramsChanged: boolean  // mix, direction, mode, etc.
}

export interface FreeBoneRow {
  name:   string
  /** ok = free in both; only-a = free in A but NOT free in B (B has keyframes for it); only-b = vice-versa */
  status: 'ok' | 'only-a' | 'only-b'
}

export interface SpineDiff {
  source: 'json-full' | 'runtime-partial'
  summary: {
    added: number
    removed: number
    changed: number
    equal: number
  }
  animTable:       AnimTableRow[]
  skinTable:       SkinRow[]
  globalEvents:    GlobalEventRow[]   // available for both runtime and JSON
  animEvents:      AnimEventGroup[]   // per-animation timing; JSON-only
  constraintTable: ConstraintRow[]    // JSON-only
  freeBoneTable:   FreeBoneRow[]      // runtime-only (empty for JSON-only diffs)
  placeholders: PlaceholderDiff[]
  sections:     DiffSection[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRecord = Record<string, any>
