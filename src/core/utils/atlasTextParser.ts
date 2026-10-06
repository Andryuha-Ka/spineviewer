/**
 * @file atlasTextParser.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

// Spine atlas text format parser — supports both 3.x and 4.x
//
// 3.x layout:
//   image.png            ← page filename (not indented)
//   size: 2048,1024      ← page property (not indented, colon)
//   format: RGBA8888
//   filter: Linear,Linear
//   repeat: none
//   RegionName           ← region name (not indented, NO colon)
//     rotate: true       ← region property (indented, colon)
//     xy: 10, 20
//     size: 64, 64
//     orig: 64, 64
//     offset: 0, 0
//     index: -1
//
// 4.x layout:
//   image.png            ← page filename (not indented)
//   size:2048,1024       ← page property (not indented, colon)
//   filter:Linear,Linear
//   RegionName           ← region name (not indented, NO colon)
//   bounds:10,20,64,64   ← region property (not indented, colon) ← KEY DIFFERENCE from 3.x
//   rotate:90
//
// Official 4.x exports indent every property and put spaces after ':' / ','
// (e.g. "\tsize: 1024, 512") — indentation and spacing carry no meaning.
//
// Rule:  line with NO colon                       → region name
//        line WITH colon, before first region     → page property
//        line WITH colon, after first region      → region property

export interface AtlasRegion {
  name: string
  x: number
  y: number
  width: number
  height: number
  rotate: boolean      // true = stored 90° CW in atlas (swaps w/h visually)
  origWidth: number
  origHeight: number
  offsetX: number
  offsetY: number
  index: number
}

export interface AtlasPage {
  name: string         // image filename as written in the atlas
  width: number
  height: number
  regions: AtlasRegion[]
}

/** Estimated GPU memory of all pages, RGBA8 (width × height × 4 bytes each). */
export function atlasVramBytes(pages: AtlasPage[]): number {
  return pages.reduce((s, p) => s + p.width * p.height * 4, 0)
}

/** Region area / page area across all pages; 0 when there is no page area. Not clamped. */
export function atlasUtilization(pages: AtlasPage[]): number {
  let used = 0, total = 0
  for (const page of pages) {
    total += page.width * page.height
    for (const r of page.regions) used += r.width * r.height
  }
  return total > 0 ? used / total : 0
}

function ints(value: string): number[] {
  return value.split(',').map(s => parseInt(s.trim(), 10))
}

export function parseAtlas(text: string): AtlasPage[] {
  const pages: AtlasPage[] = []
  const lines = text.replace(/\r/g, '').split('\n')

  let currentPage: AtlasPage | null = null
  let currentRegion: Partial<AtlasRegion> & { name?: string } | null = null
  let inRegion = false  // true once we've seen the first region name in this page

  function commitRegion() {
    if (!currentRegion?.name || !currentPage) return
    currentPage.regions.push({
      name:        currentRegion.name,
      x:           currentRegion.x           ?? 0,
      y:           currentRegion.y           ?? 0,
      width:       currentRegion.width       ?? 0,
      height:      currentRegion.height      ?? 0,
      rotate:      currentRegion.rotate      ?? false,
      origWidth:   currentRegion.origWidth   ?? currentRegion.width  ?? 0,
      origHeight:  currentRegion.origHeight  ?? currentRegion.height ?? 0,
      offsetX:     currentRegion.offsetX     ?? 0,
      offsetY:     currentRegion.offsetY     ?? 0,
      index:       currentRegion.index       ?? -1,
    })
  }

  function applyPageProp(key: string, val: string) {
    if (!currentPage) return
    if (key === 'size') {
      const [w, h] = ints(val)
      currentPage.width  = w
      currentPage.height = h
    }
    // format / filter / repeat / pma — not needed for rendering
  }

  function applyRegionProp(key: string, val: string) {
    if (!currentRegion) return
    switch (key) {
      case 'xy': {
        const [x, y] = ints(val)
        currentRegion.x = x; currentRegion.y = y
        break
      }
      case 'size': {
        const [w, h] = ints(val)
        currentRegion.width = w; currentRegion.height = h
        break
      }
      case 'bounds': {
        // 4.x: x, y, w, h
        const [x, y, w, h] = ints(val)
        currentRegion.x = x; currentRegion.y = y
        currentRegion.width = w; currentRegion.height = h
        break
      }
      case 'orig': {
        const [ow, oh] = ints(val)
        currentRegion.origWidth = ow; currentRegion.origHeight = oh
        break
      }
      case 'offset': {
        const [ox, oy] = ints(val)
        currentRegion.offsetX = ox; currentRegion.offsetY = oy
        break
      }
      case 'offsets': {
        // 4.x: ox, oy, origW, origH
        const [ox, oy, ow, oh] = ints(val)
        currentRegion.offsetX = ox; currentRegion.offsetY = oy
        currentRegion.origWidth = ow; currentRegion.origHeight = oh
        break
      }
      case 'rotate': {
        // 3.x: true/false  |  4.x: degrees (90 / 270 are sideways)
        const deg = parseInt(val, 10)
        currentRegion.rotate = val === 'true' || (!Number.isNaN(deg) && deg % 180 !== 0)
        break
      }
      case 'index':
        currentRegion.index = parseInt(val, 10)
        break
    }
  }

  for (const raw of lines) {
    // Blank line — end of page block (multi-page atlases)
    if (raw.trim() === '') {
      commitRegion()
      currentRegion = null
      currentPage   = null
      inRegion      = false
      continue
    }

    const trimmed    = raw.trim()
    const colonIdx   = trimmed.indexOf(':')
    const hasColon   = colonIdx > 0

    // ── No page yet → this line is the page image filename ────────────────
    if (!currentPage) {
      currentPage = { name: trimmed, width: 0, height: 0, regions: [] }
      pages.push(currentPage)
      inRegion = false
      continue
    }

    // ── Line with NO colon → region name ──────────────────────────────────
    if (!hasColon) {
      commitRegion()
      currentRegion = { name: trimmed }
      inRegion      = true
      continue
    }

    // ── Line WITH colon: indentation is irrelevant (official 4.x atlases indent page props too)
    const key = trimmed.slice(0, colonIdx).trim()
    const val = trimmed.slice(colonIdx + 1).trim()

    if (!inRegion) applyPageProp(key, val)
    else applyRegionProp(key, val)
  }

  commitRegion()
  return pages
}
