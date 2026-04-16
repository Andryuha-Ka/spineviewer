<!--
 * @file AtlasInspector.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <!-- ── Mini panel in sidebar ─────────────────────────────── -->
  <div class="atlas-mini">
    <div v-if="!skeletonStore.isLoaded" class="empty-hint">
      Load a skeleton to inspect the atlas
    </div>

    <div v-else-if="atlasStore.pages.length === 0" class="empty-hint">
      Atlas not parsed
    </div>

    <template v-else>
      <!-- ── Source Files ─────────────────────────────────── -->
      <div v-if="atlasFiles.length > 0" class="files-section">
        <div
          v-for="info in atlasFiles"
          :key="info.name"
          class="file-row"
        >
          <span class="file-type-badge" :class="`file-type-badge--${info.type}`">
            {{ TYPE_LABELS[info.type] }}
          </span>
          <span class="file-name" :class="`file-name--${info.type}`" :title="info.name">{{ info.name }}</span>
          <span class="file-size">{{ formatSize(info.size) }}</span>
        </div>
      </div>

      <div class="mini-stats">
        <div class="stat-row">
          <span class="stat-label">Pages</span>
          <span class="stat-val">{{ atlasStore.pages.length }}</span>
        </div>
        <div v-for="(p, i) in atlasStore.pages" :key="i" class="stat-row indent">
          <span class="stat-label">{{ p.name }}</span>
          <span class="stat-val">{{ p.width }}×{{ p.height }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Regions</span>
          <span class="stat-val">{{ totalRegions }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Seen</span>
          <span class="stat-val">{{ totalSeen }} / {{ totalRegions }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Utilization</span>
          <span class="stat-val">{{ avgUtil }}%</span>
        </div>
      </div>

      <div class="open-btn-wrap">
        <n-button block size="small" @click="openModal">⛶  Open Atlas Viewer</n-button>
      </div>
    </template>
  </div>

  <!-- ── Full-screen modal ─────────────────────────────────── -->
  <n-modal v-model:show="modalOpen" :mask-closable="true" :style="{ width: '90vw', height: '85vh' }">
    <div class="atlas-modal">

      <!-- Header -->
      <div class="modal-header">
        <span class="modal-title">Atlas Inspector</span>

        <div v-if="atlasStore.pages.length > 1" class="page-tabs">
          <button
            v-for="(p, i) in atlasStore.pages"
            :key="p.name"
            class="page-tab"
            :class="{ 'page-tab--active': pageIndex === i }"
            :title="p.name"
            @click="setPage(i)"
          >{{ p.name }}</button>
        </div>

        <!-- spacer only when page-tabs is absent; tabs themselves fill remaining space -->
        <div v-if="atlasStore.pages.length <= 1" class="header-spacer" />
        <button class="close-btn" @click="modalOpen = false">✕</button>
      </div>

      <!-- Body -->
      <div class="modal-body">

        <!-- Canvas area -->
        <div
          ref="canvasWrapRef"
          class="canvas-area"
          @wheel.prevent="onWheel"
          @mousedown.left="onPanStart"
          @mousemove="onMouseMove"
          @mouseleave="onMouseLeave"
          @click="onCanvasClick"
        >
          <canvas ref="canvasRef" class="atlas-canvas" />

          <div v-if="loadingBitmap" class="canvas-overlay">Loading…</div>
          <div v-else-if="!currentBitmap && !loadingBitmap && page" class="canvas-overlay dim">No image</div>

          <!-- Hover tooltip -->
          <div
            v-if="hoveredRegion && tooltipPos && !hoverFromList"
            class="canvas-tooltip"
            :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
          >
            <strong>{{ hoveredRegion.name }}</strong>
            <span>{{ regionW(hoveredRegion) }}×{{ regionH(hoveredRegion) }}</span>
            <span class="tt-meta">{{ hoveredRegion.x }}, {{ hoveredRegion.y }}</span>
            <span v-if="hoveredRegion.rotate" class="tt-tag tt-tag--rot">rot</span>
            <span :class="['tt-tag', isSeen(hoveredRegion.name) ? 'tt-tag--used' : 'tt-tag--unseen']">
              {{ isSeen(hoveredRegion.name) ? 'used' : 'unseen' }}
            </span>
          </div>
        </div>

        <!-- Right sidebar -->
        <div class="region-sidebar">
          <div class="sidebar-info">
            <span>{{ page?.width }}×{{ page?.height }}px</span>
            <span>{{ page?.regions.length }} regions</span>
            <span>{{ utilPct }}% util</span>
          </div>

          <div class="sidebar-filter">
            <n-input
              v-model:value="regionFilter"
              size="small"
              placeholder="Filter regions…"
              clearable
            />
          </div>

          <div class="sidebar-list" ref="sidebarListRef">
            <div
              v-for="r in filteredRegions"
              :key="r.name"
              :data-name="r.name"
              class="region-row"
              :class="{
                'region-row--active':  r.name === highlightedRegion,
                'region-row--hover':   r === hoveredRegion,
              }"
              @click="onListClick(r.name)"
              @mouseenter="onListHoverEnter(r)"
              @mouseleave="onListHoverLeave"
            >
              <span class="seen-dot" :class="isSeen(r.name) ? 'seen-dot--used' : 'seen-dot--unseen'" />
              <span class="rname" :title="r.name">{{ r.name }}</span>
              <span class="rsize">{{ regionW(r) }}×{{ regionH(r) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button class="foot-btn" @click="fitToScreen">Fit</button>
        <button class="foot-btn" @click="zoom1x">1:1</button>
        <span class="foot-zoom">{{ Math.round(zoomDisplay * 100) }}%</span>
        <div class="foot-sep" />
        <span class="foot-coords" v-if="mouseAtlasPos">{{ mouseAtlasPos.x }}, {{ mouseAtlasPos.y }}</span>
        <span class="foot-coords muted" v-else>—, —</span>
        <div class="foot-spacer" />
        <span class="foot-page">{{ page?.name }}</span>
      </div>

    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { useAtlasStore }   from '@/core/stores/useAtlasStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useLoaderStore }   from '@/core/stores/useLoaderStore'
import type { AtlasRegion, AtlasPage } from '@/core/utils/atlasTextParser'
import type { SpineFileType } from '@/core/types/FileSet'

const atlasStore    = useAtlasStore()
const skeletonStore = useSkeletonStore()
const loaderStore   = useLoaderStore()

const TYPE_LABELS: Record<SpineFileType, string> = {
  'skeleton-json': 'JSON',
  'skeleton-skel': 'SKEL',
  atlas:           'ATLAS',
  image:           'IMG',
}

const atlasFiles = computed(() => {
  const fileSet = loaderStore.activeSlot?.fileSet
  if (!fileSet) return []
  const sizeOf = (body: string | ArrayBuffer): number =>
    typeof body === 'string'
      ? Math.round(Math.max(0, body.length - body.indexOf(',') - 1) * 0.75)
      : body.byteLength
  return [
    { name: fileSet.atlas.filename, size: sizeOf(fileSet.atlas.fileBody), type: 'atlas' as SpineFileType },
    ...fileSet.images.map(img => ({ name: img.filename, size: sizeOf(img.fileBody), type: 'image' as SpineFileType })),
  ]
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Modal state ───────────────────────────────────────────────────────────────
const modalOpen   = ref(false)
const pageIndex   = ref(0)
const regionFilter    = ref('')
const highlightedRegion = ref<string | null>(null)
const hoveredRegion     = ref<AtlasRegion | null>(null)
const hoverFromList     = ref(false)

// ── Canvas refs ───────────────────────────────────────────────────────────────
const canvasRef     = ref<HTMLCanvasElement | null>(null)
const canvasWrapRef = ref<HTMLDivElement | null>(null)
const sidebarListRef = ref<HTMLDivElement | null>(null)

// ── Render state (plain vars for perf — no Vue overhead during drag/wheel) ──
let zoom = 1
let panX = 0
let panY = 0
let cw   = 0   // logical canvas width
let ch   = 0   // logical canvas height

const zoomDisplay   = ref(1)
const mouseAtlasPos = ref<{ x: number; y: number } | null>(null)
const tooltipPos    = ref<{ x: number; y: number } | null>(null)

// ── Image bitmap cache ────────────────────────────────────────────────────────
const bitmapCache    = new Map<string, ImageBitmap>()
const currentBitmap  = ref<ImageBitmap | null>(null)
const loadingBitmap  = ref(false)

// ── rAF scheduler ─────────────────────────────────────────────────────────────
let rafId: number | null = null
function scheduleDraw() {
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    rafId = null
    draw()
  })
}

// ── Computed ──────────────────────────────────────────────────────────────────
const page = computed<AtlasPage | null>(() => atlasStore.pages[pageIndex.value] ?? null)

const totalRegions = computed(() =>
  atlasStore.pages.reduce((s, p) => s + p.regions.length, 0),
)

const totalSeen = computed(() => {
  let n = 0
  for (const p of atlasStore.pages)
    for (const r of p.regions)
      if (atlasStore.seenRegions.has(r.name)) n++
  return n
})

const avgUtil = computed(() => {
  if (!atlasStore.pages.length) return 0
  let total = 0, used = 0
  for (const p of atlasStore.pages) {
    total += p.width * p.height
    used  += p.regions.reduce((s, r) => s + r.width * r.height, 0)
  }
  return total ? Math.min(100, Math.round(used / total * 100)) : 0
})

const utilPct = computed(() => {
  const p = page.value
  if (!p || !p.width || !p.height) return 0
  const total = p.width * p.height
  const used  = p.regions.reduce((s, r) => s + r.width * r.height, 0)
  return Math.min(100, Math.round(used / total * 100))
})

const filteredRegions = computed(() => {
  const p = page.value
  if (!p) return []
  const q = regionFilter.value.toLowerCase()
  const list = q ? p.regions.filter(r => r.name.toLowerCase().includes(q)) : p.regions
  return [...list].sort((a, b) => a.name.localeCompare(b.name))
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function regionW(r: AtlasRegion) { return r.rotate ? r.height : r.width }
function regionH(r: AtlasRegion) { return r.rotate ? r.width  : r.height }
function isSeen(name: string)    { return atlasStore.seenRegions.has(name) }

function getImageUrl(pageName: string): string {
  const urls = atlasStore.imageUrls
  if (urls[pageName]) return urls[pageName]
  const lower = pageName.toLowerCase()
  for (const [k, v] of Object.entries(urls))
    if (k.toLowerCase() === lower) return v
  const base = pageName.split('/').pop()?.toLowerCase()
  for (const [k, v] of Object.entries(urls))
    if (k.split('/').pop()?.toLowerCase() === base) return v
  return ''
}

// ── Bitmap loading ────────────────────────────────────────────────────────────
async function loadPage(index: number) {
  const pg  = atlasStore.pages[index]
  if (!pg) { currentBitmap.value = null; return }

  const url = getImageUrl(pg.name)
  if (!url)  { currentBitmap.value = null; return }

  if (bitmapCache.has(url)) {
    currentBitmap.value = bitmapCache.get(url)!
    scheduleDraw()
    return
  }

  loadingBitmap.value = true
  try {
    const img = new Image()
    img.src   = url
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej() })
    const bm  = await createImageBitmap(img)
    bitmapCache.set(url, bm)
    currentBitmap.value = bm
  } catch {
    currentBitmap.value = null
  } finally {
    loadingBitmap.value = false
  }
  scheduleDraw()
}

// ── Canvas resize ─────────────────────────────────────────────────────────────
function resizeCanvas() {
  const canvas = canvasRef.value
  const wrap   = canvasWrapRef.value
  if (!canvas || !wrap) return
  const dpr     = window.devicePixelRatio || 1
  const rect    = wrap.getBoundingClientRect()
  cw = rect.width
  ch = rect.height
  canvas.width  = Math.round(cw * dpr)
  canvas.height = Math.round(ch * dpr)
}

useResizeObserver(canvasWrapRef, () => {
  if (!modalOpen.value) return
  resizeCanvas()
  scheduleDraw()
})

// ── Fit helpers ───────────────────────────────────────────────────────────────
function fitToScreen() {
  const p = page.value
  if (!p || !cw || !ch) return
  const scale = Math.min(cw / p.width, ch / p.height)
  zoom  = Math.min(scale, 1)
  panX  = (cw - p.width  * zoom) / 2
  panY  = (ch - p.height * zoom) / 2
  zoomDisplay.value = zoom
  scheduleDraw()
}

function zoom1x() {
  const p = page.value
  if (!p) return
  zoom  = 1
  panX  = cw / 2 - p.width  / 2
  panY  = ch / 2 - p.height / 2
  zoomDisplay.value = zoom
  scheduleDraw()
}

function panToRegion(name: string) {
  const r = page.value?.regions.find(r => r.name === name)
  if (!r) return
  panX = cw / 2 - (r.x + regionW(r) / 2) * zoom
  panY = ch / 2 - (r.y + regionH(r) / 2) * zoom
}

// ── Canvas draw ───────────────────────────────────────────────────────────────
function draw() {
  const canvas = canvasRef.value
  const p      = page.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1

  // Full reset + clear
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!p) return

  // Atlas-space transform: physical = (dpr*zoom)*atlasCoord + dpr*pan
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, Math.round(dpr * panX), Math.round(dpr * panY))

  // Draw atlas texture
  if (currentBitmap.value) {
    ctx.imageSmoothingEnabled = zoom < 1
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(currentBitmap.value, 0, 0)
  } else {
    ctx.fillStyle = '#111113'
    ctx.fillRect(0, 0, p.width, p.height)
  }

  // Atlas bounds outline
  ctx.strokeStyle = 'rgba(160,160,180,0.5)'
  ctx.lineWidth   = 1 / zoom
  ctx.strokeRect(0, 0, p.width, p.height)

  // Line width in atlas coords for 1 CSS pixel
  const lw1 = 1 / zoom

  // Draw region rects
  for (const r of p.regions) {
    const rw = regionW(r)
    const rh = regionH(r)
    const isHover = r === hoveredRegion.value
    const isHL    = r.name === highlightedRegion.value
    const seen    = isSeen(r.name)

    if (isHL || isHover) {
      ctx.fillStyle   = 'rgba(96,165,250,0.18)'
      ctx.strokeStyle = '#60a5fa'
      ctx.lineWidth   = 1.5 * lw1
    } else if (seen) {
      ctx.fillStyle   = 'rgba(74,222,128,0.07)'
      ctx.strokeStyle = 'rgba(74,222,128,0.7)'
      ctx.lineWidth   = lw1
    } else {
      ctx.fillStyle   = 'transparent'
      ctx.strokeStyle = 'rgba(130,130,155,0.5)'
      ctx.lineWidth   = lw1
    }

    ctx.beginPath()
    ctx.rect(r.x, r.y, rw, rh)
    ctx.fill()
    ctx.stroke()
  }

  // Region name labels at zoom >= 3
  if (zoom >= 3) {
    const fsize = Math.max(9, Math.min(13, 11 / zoom))
    ctx.font          = `${fsize}px monospace`
    ctx.textBaseline  = 'top'

    for (const r of p.regions) {
      const rw = regionW(r)
      const rh = regionH(r)
      const isHover = r === hoveredRegion.value
      const isHL    = r.name === highlightedRegion.value

      ctx.fillStyle = isHL || isHover
        ? '#60a5fa'
        : isSeen(r.name)
          ? 'rgba(74,222,128,0.9)'
          : 'rgba(180,180,200,0.75)'

      ctx.save()
      ctx.beginPath()
      ctx.rect(r.x + lw1, r.y + lw1, Math.max(0, rw - 2 * lw1), Math.max(0, rh - 2 * lw1))
      ctx.clip()
      ctx.fillText(r.name, r.x + 2 * lw1, r.y + 2 * lw1)
      ctx.restore()
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

// Redraw when seenRegions changes
watch(() => atlasStore.seenRegions, scheduleDraw)

// ── Modal open/close ──────────────────────────────────────────────────────────
async function openModal() {
  modalOpen.value = true
  await nextTick()
  resizeCanvas()
  await loadPage(pageIndex.value)
  fitToScreen()
  scheduleDraw()
}

async function setPage(i: number) {
  pageIndex.value         = i
  highlightedRegion.value = null
  hoveredRegion.value     = null
  currentBitmap.value     = null
  await loadPage(i)
  fitToScreen()
  scheduleDraw()
}

// Reset when skeleton changes
watch(() => atlasStore.pages, () => {
  for (const bm of bitmapCache.values()) bm.close()
  bitmapCache.clear()
  currentBitmap.value     = null
  pageIndex.value         = 0
  highlightedRegion.value = null
  hoveredRegion.value     = null
  regionFilter.value      = ''
})

// ── Zoom / pan ────────────────────────────────────────────────────────────────
function onWheel(e: WheelEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect   = canvas.getBoundingClientRect()
  const mx     = e.clientX - rect.left
  const my     = e.clientY - rect.top
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  const nz     = Math.max(0.02, Math.min(30, zoom * factor))
  panX  = mx - (mx - panX) * (nz / zoom)
  panY  = my - (my - panY) * (nz / zoom)
  zoom  = nz
  zoomDisplay.value = zoom
  scheduleDraw()
}

let _sx = 0, _sy = 0, _spx = 0, _spy = 0, _dragged = false

function onPanStart(e: MouseEvent) {
  _sx = e.clientX; _sy = e.clientY; _spx = panX; _spy = panY; _dragged = false
  window.addEventListener('mousemove', onPanMove)
  window.addEventListener('mouseup',   onPanEnd, { once: true })
}

function onPanMove(e: MouseEvent) {
  const dx = e.clientX - _sx
  const dy = e.clientY - _sy
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) _dragged = true
  panX = _spx + dx; panY = _spy + dy
  scheduleDraw()
}

function onPanEnd() {
  window.removeEventListener('mousemove', onPanMove)
}

// ── Mouse interaction ─────────────────────────────────────────────────────────
function onMouseMove(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas || !page.value) return
  const rect = canvas.getBoundingClientRect()
  const lx   = e.clientX - rect.left
  const ly   = e.clientY - rect.top
  const ax   = Math.round((lx - panX) / zoom)
  const ay   = Math.round((ly - panY) / zoom)

  mouseAtlasPos.value = { x: ax, y: ay }
  tooltipPos.value    = { x: lx + 16, y: ly + 12 }
  hoverFromList.value = false

  // Hit-test (last region wins — higher index = drawn on top)
  let found: AtlasRegion | null = null
  const regions = page.value.regions
  for (let i = regions.length - 1; i >= 0; i--) {
    const r  = regions[i]
    const rw = regionW(r)
    const rh = regionH(r)
    if (ax >= r.x && ax < r.x + rw && ay >= r.y && ay < r.y + rh) { found = r; break }
  }

  if (found !== hoveredRegion.value) {
    hoveredRegion.value = found
    scheduleDraw()
  }
}

function onMouseLeave() {
  mouseAtlasPos.value = null
  tooltipPos.value    = null
  if (hoveredRegion.value) { hoveredRegion.value = null; scheduleDraw() }
}

function onCanvasClick() {
  if (_dragged) return
  // Click on canvas without dragging — deselect
  if (!hoveredRegion.value) {
    highlightedRegion.value = null
    scheduleDraw()
    return
  }
  const name = hoveredRegion.value.name
  highlightedRegion.value = highlightedRegion.value === name ? null : name
  scheduleDraw()
  if (highlightedRegion.value) scrollListToRegion(name)
}

// ── Sidebar interactions ──────────────────────────────────────────────────────
function onListClick(name: string) {
  highlightedRegion.value = highlightedRegion.value === name ? null : name
  if (highlightedRegion.value) {
    panToRegion(name)
    scheduleDraw()
  }
}

function onListHoverEnter(r: AtlasRegion) {
  hoverFromList.value = true
  hoveredRegion.value = r
  scheduleDraw()
}

function onListHoverLeave() {
  hoverFromList.value = false
  hoveredRegion.value = null
  scheduleDraw()
}

function scrollListToRegion(name: string) {
  const list = sidebarListRef.value
  if (!list) return
  const el = list.querySelector<HTMLElement>(`[data-name="${CSS.escape(name)}"]`)
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  window.removeEventListener('mousemove', onPanMove)
  for (const bm of bitmapCache.values()) bm.close()
  bitmapCache.clear()
})
</script>

<style scoped>
/* ── Mini panel ── */
.atlas-mini {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  height: 100%;
  font-size: 0.75rem;
}

/* ── Source files ── */
.files-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--c-border-dim);
}

.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
}

.file-type-badge {
  flex-shrink: 0;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 4px;
  border-radius: 3px;
  min-width: 34px;
  text-align: center;
}

.file-type-badge--atlas { background: #3b2d5a; color: #c4b5fd; }
.file-type-badge--image { background: #1e3d2e; color: #86efac; }

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-name--atlas { color: #c4b5fd; }
.file-name--image { color: #86efac; }

:global(html.theme-light .file-name--atlas) { color: #6d28d9; }
:global(html.theme-light .file-name--image) { color: #15803d; }

.file-size {
  flex-shrink: 0;
  color: var(--c-text-faint);
  font-variant-numeric: tabular-nums;
}

.mini-stats {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.stat-row.indent { padding-left: 10px; }

.stat-label {
  color: var(--c-text-muted);
  font-size: 0.7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-val {
  color: var(--c-text-dim);
  font-variant-numeric: tabular-nums;
  font-size: 0.7rem;
  flex-shrink: 0;
}

.open-btn-wrap { margin-top: 4px; }

.empty-hint {
  padding: 20px;
  text-align: center;
  color: var(--c-text-ghost);
  font-size: 0.75rem;
}

/* ── Modal shell ── */
.atlas-modal {
  width: 90vw;
  height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  outline: 1px solid rgba(255,255,255,0.1);
}

/* ── Modal header ── */
.modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  height: 44px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--c-border-dim);
}

.modal-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--c-text-dim);
  flex-shrink: 0;
}

.page-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--c-scroll) transparent;
}

.page-tabs::-webkit-scrollbar { height: 4px; }
.page-tabs::-webkit-scrollbar-track { background: transparent; }
.page-tabs::-webkit-scrollbar-thumb { background: var(--c-scroll); border-radius: 2px; }
.page-tabs::-webkit-scrollbar-thumb:hover { background: var(--c-scroll-hov); }

.page-tab {
  background: var(--c-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-muted);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.7rem;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
}

.page-tab--active { border-color: #60a5fa; color: #60a5fa; }
.page-tab:not(.page-tab--active):hover { border-color: var(--c-text-ghost); }

.header-spacer { flex: 1; }

.close-btn {
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 6px;
  border-radius: 4px;
  line-height: 1;
  transition: color 0.12s, background 0.12s;
}

.close-btn:hover { color: var(--c-text-dim); background: var(--c-raised); }

/* ── Modal body ── */
.modal-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* ── Canvas area ── */
.canvas-area {
  flex: 1;
  position: relative;
  overflow: hidden;
  /* Checkerboard: distinguishes canvas from modal bg in both themes */
  background-color: #111318;
  background-image:
    repeating-conic-gradient(#1a1b22 0% 25%, #111318 0% 50%);
  background-size: 20px 20px;
  cursor: crosshair;
  border-right: 1px solid var(--c-border-dim);
}

:global(html.theme-light) .canvas-area {
  background-color: #e8e8ee;
  background-image:
    repeating-conic-gradient(#d8d8e0 0% 25%, #e8e8ee 0% 50%);
}

.atlas-canvas {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.canvas-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  color: var(--c-text-muted);
  pointer-events: none;
}

.canvas-overlay.dim { color: var(--c-text-ghost); }

.canvas-tooltip {
  position: absolute;
  background: var(--c-raised);
  border: 1px solid var(--c-border);
  border-radius: 5px;
  padding: 5px 9px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 0.7rem;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
  color: var(--c-text-dim);
  max-width: 200px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.canvas-tooltip strong {
  color: var(--c-text);
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tt-meta { color: var(--c-text-ghost); font-variant-numeric: tabular-nums; }

.tt-tag {
  display: inline-block;
  font-size: 0.6rem;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
  text-transform: uppercase;
  margin-top: 2px;
  align-self: flex-start;
}

.tt-tag--rot    { background: rgba(250,204,21,0.15); color: #facc15; }
.tt-tag--used   { background: rgba(74,222,128,0.15); color: #4ade80; }
.tt-tag--unseen { background: rgba(130,130,150,0.15); color: var(--c-text-faint); }

/* ── Region sidebar ── */
.region-sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--c-border-dim);
  font-size: 0.72rem;
  color: var(--c-text);
}

.sidebar-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px 6px;
  flex-shrink: 0;
  font-size: 0.68rem;
  color: var(--c-text-faint);
  border-bottom: 1px solid var(--c-border-dim);
}

.sidebar-filter {
  padding: 6px 8px;
  flex-shrink: 0;
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 4px 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--c-scroll) transparent;
}

.sidebar-list::-webkit-scrollbar { width: 4px; }
.sidebar-list::-webkit-scrollbar-track { background: transparent; }
.sidebar-list::-webkit-scrollbar-thumb { background: var(--c-scroll); border-radius: 2px; }

.region-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}

.region-row:hover,
.region-row--hover   { background: var(--c-raised); }
.region-row--active  { background: rgba(96,165,250,0.08); }

.seen-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.seen-dot--used   { background: #4ade80; }
.seen-dot--unseen { background: var(--c-border); }

.rname {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.7rem;
  color: var(--c-text-dim);
}

.rsize {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
  color: var(--c-text-ghost);
}

/* ── Modal footer ── */
.modal-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 32px;
  flex-shrink: 0;
  border-top: 1px solid var(--c-border-dim);
  font-size: 0.7rem;
}

.foot-btn {
  background: var(--c-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-muted);
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 0.68rem;
  cursor: pointer;
  transition: all 0.1s;
}

.foot-btn:hover { border-color: var(--c-text-ghost); color: var(--c-text-dim); }

.foot-zoom {
  font-variant-numeric: tabular-nums;
  color: var(--c-text-faint);
  min-width: 38px;
}

.foot-sep {
  width: 1px;
  height: 14px;
  background: var(--c-border-dim);
}

.foot-coords {
  font-variant-numeric: tabular-nums;
  color: var(--c-text-faint);
  min-width: 80px;
  font-size: 0.68rem;
}

.foot-coords.muted { color: var(--c-text-ghost); }

.foot-spacer { flex: 1; }

.foot-page {
  color: var(--c-text-ghost);
  font-size: 0.65rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}
</style>
