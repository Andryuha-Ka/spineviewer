/**
 * @file complexityAnalyzer.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'
import type { AtlasPage } from '@/core/utils/atlasTextParser'

// ── Public types ──────────────────────────────────────────────────────────────

export type MetricStatus = 'ok' | 'warn' | 'crit'

export interface ComplexityMetric {
  name:         string
  value:        number
  displayValue: string
  status:       MetricStatus
  warnAt:       number
  critAt:       number
  /** If true: lower value is worse (e.g. atlas utilization) */
  inverse:      boolean
  /** Optional unit suffix appended to threshold value in hint (e.g. ' MB') */
  thresholdSuffix?: string
}

export interface AnimKeyframes {
  name:      string
  duration:  number
  keyframes: number
  /** keyframes per second */
  density:   number
  redundant: number
}

export interface BlendStats {
  normal:   number
  additive: number
  multiply: number
  screen:   number
}

export interface ComplexityReport {
  metrics:         ComplexityMetric[]
  recommendations: string[]
  animations:      AnimKeyframes[]
  blendStats:      BlendStats
  /** false when skeleton is binary (.skel) — keyframe analysis unavailable; mesh stats still available via runtime */
  fromJson:        boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes === 0)               return '0 B'
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function mkMetric(
  name: string,
  value: number,
  warnAt: number,
  critAt: number,
  opts: { displayValue?: string; inverse?: boolean; thresholdSuffix?: string } = {},
): ComplexityMetric {
  const inverse = opts.inverse ?? false
  let status: MetricStatus
  if (inverse) {
    status = value < critAt ? 'crit' : value < warnAt ? 'warn' : 'ok'
  } else {
    status = value >= critAt ? 'crit' : value >= warnAt ? 'warn' : 'ok'
  }
  return {
    name,
    value,
    displayValue: opts.displayValue ?? String(value),
    status,
    warnAt,
    critAt,
    inverse,
    thresholdSuffix: opts.thresholdSuffix,
  }
}

// ── Attachment scanning (JSON only) ──────────────────────────────────────────

interface AttachmentStats {
  regionCount:   number
  meshCount:     number
  clippingCount: number
  totalVertices: number
}

function walkSkinSlots(skinAtts: unknown, stats: AttachmentStats): void {
  if (typeof skinAtts !== 'object' || !skinAtts) return
  for (const slotAtts of Object.values(skinAtts as object)) {
    if (typeof slotAtts !== 'object' || !slotAtts) continue
    for (const att of Object.values(slotAtts as object)) {
      const a    = att as Record<string, unknown>
      const type = (a.type as string | undefined) ?? 'region'
      if (type === 'region' || type === undefined) {
        stats.regionCount++
      } else if (type === 'mesh') {
        stats.meshCount++
        const uvs = a.uvs
        if (Array.isArray(uvs)) stats.totalVertices += uvs.length / 2
      } else if (type === 'clipping') {
        stats.clippingCount++
      }
    }
  }
}

function scanAttachments(json: Record<string, unknown>): AttachmentStats {
  const stats: AttachmentStats = { regionCount: 0, meshCount: 0, clippingCount: 0, totalVertices: 0 }
  const skins = json.skins
  if (Array.isArray(skins)) {
    // Spine 4.x: array of { name, attachments: { slotName: { attName: {...} } } }
    for (const skin of skins) walkSkinSlots((skin as Record<string, unknown>).attachments, stats)
  } else if (typeof skins === 'object' && skins) {
    // Spine 3.x: { skinName: { slotName: { attName: {...} } } }
    for (const skinAtts of Object.values(skins as object)) walkSkinSlots(skinAtts, stats)
  }
  return stats
}

// ── Attachment stats from runtime adapter (works for .skel too) ───────────────

function collectFromRuntime(adapter: ISpineAdapter): AttachmentStats {
  const stats: AttachmentStats = { regionCount: 0, meshCount: 0, clippingCount: 0, totalVertices: 0 }
  const seen = new Set<string>()
  for (const att of adapter.getAllAttachments()) {
    const key = `${att.slotName}::${att.attachmentName}`
    if (seen.has(key)) continue
    seen.add(key)
    if (att.type === 'region') {
      stats.regionCount++
    } else if (att.type === 'mesh') {
      stats.meshCount++
      if (att.vertexCount != null) stats.totalVertices += att.vertexCount
    } else if (att.type === 'clipping') {
      stats.clippingCount++
    }
  }
  return stats
}

// ── Blend mode stats from adapter slots ──────────────────────────────────────

function collectBlendStats(adapter: ISpineAdapter): BlendStats {
  const stats: BlendStats = { normal: 0, additive: 0, multiply: 0, screen: 0 }
  for (const slot of adapter.slots) {
    if      (slot.blendMode === 1) stats.additive++
    else if (slot.blendMode === 2) stats.multiply++
    else if (slot.blendMode === 3) stats.screen++
    else                           stats.normal++
  }
  return stats
}

// ── Keyframe counting (JSON only) ─────────────────────────────────────────────

interface KfResult { count: number; redundant: number; maxTime: number }

function framesEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  const SKIP = new Set(['time', 'curve'])
  const ae   = Object.entries(a as object).filter(([k]) => !SKIP.has(k))
  const be   = Object.entries(b as object).filter(([k]) => !SKIP.has(k))
  if (ae.length !== be.length) return false
  const bm = new Map(be)
  for (const [k, v] of ae) {
    if (JSON.stringify(v) !== JSON.stringify(bm.get(k))) return false
  }
  return true
}

function countKf(obj: unknown): KfResult {
  const r: KfResult = { count: 0, redundant: 0, maxTime: 0 }
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null && 'time' in (obj[0] as object)) {
      // Keyframe array
      r.count   = obj.length
      r.maxTime = ((obj[obj.length - 1] as Record<string, unknown>).time as number) ?? 0
      for (let i = 1; i < obj.length; i++) {
        if (framesEqual(obj[i - 1], obj[i])) r.redundant++
      }
    } else {
      for (const item of obj) {
        const sub = countKf(item)
        r.count    += sub.count
        r.redundant += sub.redundant
        r.maxTime   = Math.max(r.maxTime, sub.maxTime)
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const val of Object.values(obj as object)) {
      const sub = countKf(val)
      r.count    += sub.count
      r.redundant += sub.redundant
      r.maxTime   = Math.max(r.maxTime, sub.maxTime)
    }
  }
  return r
}

function analyzeKeyframes(json: Record<string, unknown>): AnimKeyframes[] {
  const anims = json.animations as Record<string, unknown> | undefined
  if (!anims) return []
  return Object.entries(anims).map(([name, data]) => {
    const { count, redundant, maxTime } = countKf(data)
    return {
      name,
      duration:  Math.round(maxTime * 100) / 100,
      keyframes: count,
      density:   maxTime > 0 ? Math.round((count / maxTime) * 10) / 10 : 0,
      redundant,
    }
  })
}

// ── Atlas helpers ─────────────────────────────────────────────────────────────

function atlasUtilization(pages: AtlasPage[]): number {
  let used = 0, total = 0
  for (const page of pages) {
    total += page.width * page.height
    for (const r of page.regions) used += r.width * r.height
  }
  return total > 0 ? used / total : 0
}

function atlasVram(pages: AtlasPage[]): number {
  return pages.reduce((s, p) => s + p.width * p.height * 4, 0)
}

// ── Recommendations ───────────────────────────────────────────────────────────

function buildRecommendations(
  adapter:       ISpineAdapter,
  stats:         AttachmentStats | null,
  blendStats:    BlendStats,
  utilization:   number,
  skeletonBytes: number,
  vramBytes:     number,
): string[] {
  const recs: string[] = []

  const bones = adapter.bones.length
  const slots = adapter.slots.length

  if (bones >= 100)
    recs.push('Critical bone count (≥100) — significantly increases per-frame CPU cost.')
  else if (bones >= 50)
    recs.push('High bone count (≥50) — consider merging or removing unused bones.')

  if (slots >= 120)
    recs.push('Critical slot count (≥120) — review and remove slots without attachments.')
  else if (slots >= 60)
    recs.push('High slot count (≥60) — slots without attachments can often be removed.')

  if (stats) {
    if (stats.clippingCount >= 3)
      recs.push('Multiple mask attachments (≥3) — each adds a GPU draw call; consider baking masks into textures.')
    else if (stats.clippingCount >= 1)
      recs.push('Mask attachment detected — test performance on low-end and mobile devices.')

    if (stats.meshCount >= 50)
      recs.push('Critical mesh count (≥50) — use region attachments for simple shapes.')
    else if (stats.meshCount >= 20)
      recs.push('High mesh count (≥20) — prefer region attachments where possible.')

    if (stats.totalVertices >= 3000)
      recs.push('Critical mesh vertex count (≥3000) — simplify mesh geometry.')
    else if (stats.totalVertices >= 1000)
      recs.push('High mesh vertex count (≥1000) — review mesh complexity for mobile targets.')
  }

  const nonNormal = blendStats.additive + blendStats.multiply + blendStats.screen
  if (nonNormal >= 30)
    recs.push(`Very high non-normal blend count (${nonNormal}) — each non-normal blend breaks batching and adds draw calls.`)
  else if (nonNormal >= 10)
    recs.push(`High non-normal blend count (${nonNormal}) — additive/multiply/screen slots prevent sprite batching.`)

  if (utilization > 0 && utilization < 0.3)
    recs.push(`Very low atlas utilization (${(utilization * 100).toFixed(0)}%) — repack the atlas to reduce VRAM usage significantly.`)
  else if (utilization > 0 && utilization < 0.5)
    recs.push(`Atlas utilization below 50% (${(utilization * 100).toFixed(0)}%) — repacking may reduce VRAM.`)

  if (vramBytes >= 4 * 1024 * 1024)
    recs.push(`Large atlas VRAM footprint (${fmtBytes(vramBytes)}) — reduce texture resolution or split into smaller atlases.`)

  if (skeletonBytes >= 2_000_000)
    recs.push(`Very large skeleton file (${fmtBytes(skeletonBytes)}) — reduce keyframe density or split into multiple skeletons.`)
  else if (skeletonBytes >= 500_000)
    recs.push(`Large skeleton file (${fmtBytes(skeletonBytes)}) — consider reducing animation keyframe density.`)

  return recs
}

// ── Main export ───────────────────────────────────────────────────────────────

export function analyzeComplexity(
  adapter:    ISpineAdapter,
  fileSet:    FileSet,
  atlasPages: AtlasPage[],
): ComplexityReport {
  const fromJson = fileSet.skeleton.type === 'skeleton-json'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: Record<string, any> | null = fromJson
    ? JSON.parse(fileSet.skeleton.fileBody as string)
    : null

  const attStats    = json ? scanAttachments(json) : collectFromRuntime(adapter)
  const blendStats  = collectBlendStats(adapter)
  const utilization = atlasUtilization(atlasPages)
  const vramBytes   = atlasVram(atlasPages)
  const skelBytes   = typeof fileSet.skeleton.fileBody === 'string'
    ? fileSet.skeleton.fileBody.length
    : (fileSet.skeleton.fileBody as ArrayBuffer).byteLength

  const nonNormalBlends = blendStats.additive + blendStats.multiply + blendStats.screen

  const metrics: ComplexityMetric[] = [
    mkMetric('Bones',             adapter.bones.length,          50,        100),
    mkMetric('Slots',             adapter.slots.length,          60,        120),
    mkMetric('Regions',           attStats?.regionCount   ?? 0,  100,       200),
    mkMetric('Mask',              attStats?.clippingCount ?? 0,  1,         3),
    mkMetric('Meshes',            attStats?.meshCount     ?? 0,  20,        50),
    mkMetric('Mesh vertices',     attStats?.totalVertices ?? 0,  1000,      3000),
    mkMetric('Non-normal blends', nonNormalBlends,               10,        30),
    mkMetric('Atlas VRAM',        vramBytes / (1024 * 1024),     1,         4,
      { displayValue: fmtBytes(vramBytes), thresholdSuffix: ' MB' }),
    mkMetric('Atlas utilization', utilization,                   0.5,       0.3,
      { displayValue: `${(utilization * 100).toFixed(0)}%`, inverse: true }),
    mkMetric('Skeleton size',     skelBytes / (1024 * 1024),     0.5,       2,
      { displayValue: fmtBytes(skelBytes), thresholdSuffix: ' MB' }),
  ]

  return {
    metrics,
    recommendations: buildRecommendations(adapter, attStats, blendStats, utilization, skelBytes, vramBytes),
    animations:      json ? analyzeKeyframes(json) : [],
    blendStats,
    fromJson,
  }
}
