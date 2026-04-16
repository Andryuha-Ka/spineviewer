/**
 * @file spineValidator.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { FileSet } from '@/core/types/FileSet'

// ── Atlas parser ─────────────────────────────────────────────────────────────

const IMAGE_EXT_RE = /\.(png|jpg|jpeg|webp|avif)$/i

interface AtlasPage {
  name: string
  width: number
  height: number
}

interface AtlasRegionBound {
  name: string
  pageName: string
  /** Packed X in atlas */
  x: number
  /** Packed Y in atlas */
  y: number
  /** Packed width in atlas (accounts for rotate) */
  w: number
  /** Packed height in atlas (accounts for rotate) */
  h: number
}

interface AtlasInfo {
  pages: string[]
  regions: Set<string>
  pageMap: Map<string, AtlasPage>
  regionBounds: AtlasRegionBound[]
}

function parseKV(line: string): [string, string] | null {
  const i = line.indexOf(':')
  return i === -1 ? null : [line.slice(0, i).trim(), line.slice(i + 1).trim()]
}

/**
 * Parses a Spine atlas text file (v2 runtime format).
 * Extracts page names, page sizes, region names and their packed bounds.
 */
function parseAtlas(atlasText: string): AtlasInfo {
  const pages: string[] = []
  const regions = new Set<string>()
  const pageMap = new Map<string, AtlasPage>()
  const regionBounds: AtlasRegionBound[] = []

  let currentPage: string | null = null
  let currentPageW = 0
  let currentPageH = 0
  let currentRegion: string | null = null
  let currentRotate = false
  let currentX = 0
  let currentY = 0
  let currentSizeW = 0
  let currentSizeH = 0

  const finalizeRegion = () => {
    if (currentRegion === null || currentPage === null) return
    // When rotate:true the region is packed sideways — swap w/h for atlas-space bounds
    const packedW = currentRotate ? currentSizeH : currentSizeW
    const packedH = currentRotate ? currentSizeW : currentSizeH
    regionBounds.push({ name: currentRegion, pageName: currentPage, x: currentX, y: currentY, w: packedW, h: packedH })
    currentRegion = null
  }

  for (const raw of atlasText.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const isIndented = raw[0] === ' ' || raw[0] === '\t'

    if (!isIndented) {
      finalizeRegion()

      if (IMAGE_EXT_RE.test(line)) {
        currentPage = line
        currentPageW = 0
        currentPageH = 0
        pages.push(line)
      } else if (line.includes(':')) {
        // Root-level page property
        const kv = parseKV(line)
        if (kv && kv[0] === 'size' && currentPage) {
          const parts = kv[1].split(',')
          currentPageW = parseInt(parts[0], 10)
          currentPageH = parseInt(parts[1], 10)
          pageMap.set(currentPage, { name: currentPage, width: currentPageW, height: currentPageH })
        }
      } else {
        // Region name
        currentRegion = line
        currentRotate = false
        currentX = 0; currentY = 0; currentSizeW = 0; currentSizeH = 0
        regions.add(line)
      }
    } else if (currentRegion !== null && line.includes(':')) {
      // Indented region property
      const kv = parseKV(line)
      if (!kv) continue
      const [key, val] = kv
      if (key === 'rotate') {
        currentRotate = val === 'true'
      } else if (key === 'xy') {
        const parts = val.split(',')
        currentX = parseInt(parts[0], 10)
        currentY = parseInt(parts[1], 10)
      } else if (key === 'size') {
        const parts = val.split(',')
        currentSizeW = parseInt(parts[0], 10)
        currentSizeH = parseInt(parts[1], 10)
      }
    }
  }

  finalizeRegion()

  return { pages, regions, pageMap, regionBounds }
}

// ── Skeleton region extractor ─────────────────────────────────────────────────

const NON_REGION_TYPES = new Set([
  'clipping', 'point', 'boundingbox', 'path', 'linkedmesh',
])

/** Minimal shape of a Spine JSON skeleton file — used for static validation only */
interface SpineJsonSkeleton {
  skeleton?: { spine?: string }
  skins?: Array<{ attachments?: Array<{ type?: string; path?: string; name?: string }> }> | Record<string, unknown>
  animations?: Record<string, unknown>
  bones?: Array<{ name: string }>
  slots?: Array<{ name: string; bone?: string }>
}

/**
 * Extracts all atlas region names referenced by a Spine JSON skeleton.
 * Handles both Spine 3.8 (skins as object) and 4.0+ (skins as array) formats.
 * Returns null if the JSON cannot be parsed.
 */
function extractSkeletonRegions(skeletonText: string): Set<string> | null {
  try {
    const data = JSON.parse(skeletonText) as SpineJsonSkeleton
    const referenced = new Set<string>()

    if (Array.isArray(data.skins)) {
      // Spine 4.0+ array format
      for (const skin of data.skins) {
        for (const att of (skin.attachments ?? [])) {
          if (att.type && NON_REGION_TYPES.has(att.type)) continue
          const region: string | undefined = att.path ?? att.name
          if (region) referenced.add(region)
        }
      }
    } else if (data.skins && typeof data.skins === 'object') {
      // Spine 3.8 object format: { skinName: { slotName: { attName: { ... } } } }
      for (const slotMap of Object.values(data.skins as Record<string, Record<string, Record<string, unknown>>>)) {
        for (const attachments of Object.values(slotMap)) {
          for (const [attName, attData] of Object.entries(attachments)) {
            const d = attData as Record<string, unknown>
            if (d?.type && NON_REGION_TYPES.has(d.type as string)) continue
            const region: string = (d?.path ?? attName) as string
            if (region) referenced.add(region)
          }
        }
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
    atlasInfo = parseAtlas(fileSet.atlas.fileBody as string)
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
