/**
 * @file spineValidator.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { FileSet } from '@/core/types/FileSet'
import { parseAtlas, type AtlasPage } from '@/core/utils/atlasTextParser'

// ── Atlas summary ────────────────────────────────────────────────────────────

interface AtlasRegionBound {
  name: string
  pageName: string
  x: number
  y: number
  /** Packed size in the atlas: w/h are swapped for rotated regions */
  w: number
  h: number
}

interface AtlasInfo {
  pages: string[]
  regions: Set<string>
  pageMap: Map<string, AtlasPage>
  regionBounds: AtlasRegionBound[]
}

function summarizeAtlas(atlasText: string): AtlasInfo {
  const parsed = parseAtlas(atlasText)
  const regions = new Set<string>()
  const pageMap = new Map<string, AtlasPage>()
  const regionBounds: AtlasRegionBound[] = []
  for (const page of parsed) {
    pageMap.set(page.name, page)
    for (const r of page.regions) {
      regions.add(r.name)
      regionBounds.push({
        name: r.name, pageName: page.name, x: r.x, y: r.y,
        w: r.rotate ? r.height : r.width,
        h: r.rotate ? r.width : r.height,
      })
    }
  }
  return { pages: parsed.map(p => p.name), regions, pageMap, regionBounds }
}

// ── Skeleton region extractor ─────────────────────────────────────────────────

const NON_REGION_TYPES = new Set(['clipping', 'point', 'boundingbox', 'path'])

interface JsonAttachment {
  type?: string
  name?: string
  path?: string
  sequence?: { count?: number; start?: number; digits?: number }
}

/** slotName → attachment key → attachment */
type JsonSkinAttachments = Record<string, Record<string, JsonAttachment>>

/** Minimal shape of a Spine JSON skeleton file — used for static validation only */
interface SpineJsonSkeleton {
  skeleton?: { spine?: string }
  skins?: Array<{ name?: string; attachments?: JsonSkinAttachments }> | Record<string, JsonSkinAttachments>
}

/** Region names the runtime looks up for one attachment (same rules as spine-core SkeletonJson / Sequence.getPath). */
function addAttachmentRegions(key: string, att: JsonAttachment, out: Set<string>): void {
  if (att.type && NON_REGION_TYPES.has(att.type)) return
  const path = att.path ?? att.name ?? key
  const seq = att.sequence
  if (!seq) {
    out.add(path)
    return
  }
  const start = seq.start ?? 1
  for (let i = 0; i < (seq.count ?? 0); i++) {
    out.add(path + String(start + i).padStart(seq.digits ?? 0, '0'))
  }
}

/**
 * Extracts all atlas region names referenced by a Spine JSON skeleton.
 * Skins are an array since Spine 3.8 and a name-keyed object in older exports.
 * Returns null if the JSON cannot be parsed.
 */
function extractSkeletonRegions(skeletonText: string): Set<string> | null {
  try {
    const data = JSON.parse(skeletonText) as SpineJsonSkeleton
    const skins = Array.isArray(data.skins)
      ? data.skins.map(s => s.attachments ?? {})
      : Object.values(data.skins ?? {})
    const referenced = new Set<string>()
    for (const slotMap of skins) {
      for (const attachments of Object.values(slotMap)) {
        for (const [key, att] of Object.entries(attachments)) addAttachmentRegions(key, att ?? {}, referenced)
      }
    }
    return referenced
  } catch {
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates a SpineFileSet statically (no Pixi/runtime needed).
 * Returns an array of error strings; empty array means the set is valid.
 *
 * Checks:
 *  1. Atlas image pages are present in the uploaded file set
 *  2. Atlas regions do not exceed their page dimensions (catches corrupt/truncated atlases)
 *  3. For JSON skeletons: JSON is parseable + basic structure
 *  4. For JSON skeletons: all referenced atlas regions exist in the atlas
 */
export function validateSpineFileSet(fileSet: FileSet): string[] {
  const errors: string[] = []

  // 1. Parse atlas
  let atlasInfo: AtlasInfo
  try {
    atlasInfo = summarizeAtlas(fileSet.atlas.fileBody as string)
  } catch {
    return ['Atlas parse error']
  }

  if (atlasInfo.pages.length === 0 && atlasInfo.regions.size === 0) {
    return ['Atlas appears to be empty or unrecognised format']
  }

  // 2. Check atlas image pages are uploaded
  const uploadedImages = new Set(
    fileSet.images.map(img => (img.filename.split('/').pop() ?? img.filename).toLowerCase()),
  )
  const missingImages: string[] = []
  for (const page of atlasInfo.pages) {
    const pageName = (page.split('/').pop() ?? page).toLowerCase()
    if (!uploadedImages.has(pageName)) {
      missingImages.push(page)
    }
  }
  if (missingImages.length > 0) {
    const preview = missingImages.slice(0, 2).join(', ')
    const extra   = missingImages.length > 2 ? ` (+${missingImages.length - 2} more)` : ''
    errors.push(`Missing image${missingImages.length > 1 ? 's' : ''}: ${preview}${extra}`)
  }

  // 3. Check region bounds vs page dimensions
  const outOfBounds: string[] = []
  for (const region of atlasInfo.regionBounds) {
    const page = atlasInfo.pageMap.get(region.pageName)
    if (!page || page.width === 0 || page.height === 0) continue
    if (region.x + region.w > page.width || region.y + region.h > page.height) {
      outOfBounds.push(region.name)
    }
  }
  if (outOfBounds.length > 0) {
    const preview = outOfBounds.slice(0, 3).join(', ')
    const extra   = outOfBounds.length > 3 ? ` (+${outOfBounds.length - 3} more)` : ''
    errors.push(`Atlas region${outOfBounds.length > 1 ? 's' : ''} exceed page bounds: ${preview}${extra}`)
  }

  // 4. JSON skeleton checks
  if (fileSet.skeleton.type === 'skeleton-json') {
    const text = fileSet.skeleton.fileBody as string
    let data: SpineJsonSkeleton
    try {
      data = JSON.parse(text) as SpineJsonSkeleton
    } catch {
      errors.push('Skeleton JSON parse error')
      return errors
    }

    if (!data || typeof data !== 'object' || !data.skeleton) {
      errors.push('Skeleton JSON missing "skeleton" section')
      return errors
    }

    // Check atlas region references
    if (atlasInfo.regions.size > 0) {
      const referenced = extractSkeletonRegions(text)
      if (referenced && referenced.size > 0) {
        const missingRegions: string[] = []
        for (const region of referenced) {
          if (!atlasInfo.regions.has(region)) {
            missingRegions.push(region)
          }
        }
        if (missingRegions.length > 0) {
          const preview = missingRegions.slice(0, 3).join(', ')
          const extra   = missingRegions.length > 3 ? ` (+${missingRegions.length - 3} more)` : ''
          errors.push(`Missing atlas region${missingRegions.length > 1 ? 's' : ''}: ${preview}${extra}`)
        }
      }
    }
  }

  return errors
}
