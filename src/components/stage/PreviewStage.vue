<!--
 * @file PreviewStage.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div
    ref="containerRef"
    class="stage"
    :class="{ 'stage--pan': isPanning }"
    @mousedown="onPanStart"
    @mousemove="onPanMove"
    @mouseup="onPanEnd"
    @mouseleave="onPanEnd"
    @dblclick="onResetView"
  >
    <canvas ref="canvasRef" class="canvas" />

    <!-- Origin crosshair -->
    <div
      v-if="viewerStore.showOrigin && spineLoaded"
      class="origin-cross"
      :style="{ left: originScreenX + 'px', top: originScreenY + 'px' }"
    />

    <!-- Selected bone crosshair -->
    <div
      v-if="selectedBonePos"
      class="bone-cross"
      :style="{ left: selectedBonePos.x + 'px', top: selectedBonePos.y + 'px' }"
    />

    <!-- Selected slot bounds -->
    <div
      v-if="selectedSlotRect"
      class="slot-bounds"
      :style="{
        left:   selectedSlotRect.left   + 'px',
        top:    selectedSlotRect.top    + 'px',
        width:  selectedSlotRect.width  + 'px',
        height: selectedSlotRect.height + 'px',
      }"
    />

    <!-- Top-left overlay: origin toggle + bg color picker + ph list -->
    <div class="overlay-top-left">
      <div class="origin-toggle">
        <input
          id="origin-cb"
          type="checkbox"
          v-model="viewerStore.showOrigin"
          title="Show origin (0,0)"
        />
        <span class="origin-label" title="Center scene" @click="onResetView">origin</span>
        <input
          type="checkbox"
          v-model="viewerStore.showPlaceholders"
          title="Show placeholder labels"
          class="ph-toggle"
        />
        <span class="ph-label">ph</span>
        <input
          type="color"
          class="bg-color-input"
          :value="bgColorHex"
          title="Background color"
          @input="onBgColorInput"
        />
        <span class="bg-color-label">bg</span>
      </div>
      <div v-if="viewerStore.showPlaceholders && phItems.length > 0" class="ph-list">
        <label
          v-for="item in phItems"
          :key="item.name"
          class="ph-list-item"
        >
          <input
            type="checkbox"
            :checked="!viewerStore.disabledPlaceholders.has(item.name)"
            @change="viewerStore.togglePlaceholder(item.name)"
          />
          <span class="ph-list-name">{{ item.name }}</span>
        </label>
      </div>
    </div>

    <div class="overlay-top-right">
      <span class="fps" :class="fpsClass">{{ fps }} FPS</span>
    </div>

    <div v-if="spineError" class="error-banner">
      {{ spineError }}
    </div>

    <div v-if="loading" class="loading">
      <n-spin size="medium" />
      <p class="loading-text">{{ loadingText }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { createPixiApp, createSpineAdapter } from '@/core/AdapterFactory'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'

import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useInspectorStore } from '@/core/stores/useInspectorStore'
import { useEventsStore } from '@/core/stores/useEventsStore'
import { useAtlasStore }      from '@/core/stores/useAtlasStore'
import { useProfilerStore }   from '@/core/stores/useProfilerStore'
import { useComplexityStore } from '@/core/stores/useComplexityStore'
import { useLoaderStore }    from '@/core/stores/useLoaderStore'
import { useBackgroundStore } from '@/core/stores/useBackgroundStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import type { IPixiApp } from '@/core/types/IPixiApp'
import type { IProgressOverlay } from '@/core/types/IProgressOverlay'
import type { TrackDisplayState, MarkerDisplay } from '@/core/types/IProgressOverlay'
import type { ISpineAdapter, AnimationEventMarker } from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'
import { makeLoopState, computeNorm, resetLoopState, hitTestOverlay } from '@/core/overlay/overlayMath'

const versionStore   = useVersionStore()
const viewerStore    = useViewerStore()
const skeletonStore  = useSkeletonStore()
const animationStore = useAnimationStore()
const inspectorStore = useInspectorStore()
const eventsStore    = useEventsStore()
const atlasStore      = useAtlasStore()
const profilerStore   = useProfilerStore()
const complexityStore = useComplexityStore()
const loaderStore             = useLoaderStore()
const backgroundStore         = useBackgroundStore()
const placeholderImagesStore  = usePlaceholderImagesStore()

/** Minimal positional interface for the background Pixi sprite held by this component */
interface PixiSpriteObject {
  x: number
  y: number
  scale: { set(v: number): void }
  zIndex: number
  destroy?(opts?: { texture?: boolean }): void
}
let bgSprite: PixiSpriteObject | null = null

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef    = ref<HTMLCanvasElement | null>(null)

const fps         = ref(0)
const loading     = ref(true)
const loadingText = ref('Initializing Pixi…')
const spineError  = ref<string | null>(null)

const fpsClass = computed(() => {
  if (fps.value < 30) return 'fps--bad'
  if (fps.value < 55) return 'fps--ok'
  return 'fps--good'
})

let pixiApp: IPixiApp | null = null
let spineAdapter: ISpineAdapter | null = null
// All currently mounted adapters (active + pinned non-active), keyed by slotId
const mountedAdapters = new Map<string, ISpineAdapter>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mountedSpineObjects = new Map<string, any>()
// Suppresses the isPlaying watcher during slot transitions to prevent restarting/stopping
// live pinned adapters when animationStore state is written from saved snapshots.
let _suppressAnimPlay = false
// Seek positions to apply after isPlaying watch reconstructs animation queues via setAnimation.
// Set before play() so the watcher can seekTo after setAnimation resets track time to 0.
let _pendingSeekTimes: Record<number, number> | null = null

/** Reactive list of placeholder items in the currently loaded spine */
const phItems = ref<Array<{ name: string; kind: 'bone' | 'slot' | 'attachment' }>>([])

/** Placeholder items that are currently enabled (not individually hidden) */
const activePHItems = computed(() =>
  phItems.value.filter(i => !viewerStore.disabledPlaceholders.has(i.name)),
)

function applyPlaceholderLabels() {
  if (!spineAdapter) return
  if (viewerStore.showPlaceholders && activePHItems.value.length > 0) {
    spineAdapter.setPlaceholderLabels(activePHItems.value)
  } else {
    spineAdapter.clearPlaceholderLabels()
  }
}

watch(() => viewerStore.showPlaceholders, applyPlaceholderLabels)
watch(() => viewerStore.disabledPlaceholders, applyPlaceholderLabels)

watch(
  () => placeholderImagesStore.hasPendingActions,
  (has) => {
    if (!has || !spineAdapter) return
    const actions = placeholderImagesStore.drainActions()
    for (const action of actions) {
      if (action.slotId !== loaderStore.activeSlotId) continue
      if (action.type === 'add') {
        spineAdapter.addImageToPlaceholder(action.phName, action.dataURL!, action.imageId)
        const ctx = placeholderImagesStore.getImageContext(action.imageId)
        if (ctx && (ctx.entry.posX !== 0 || ctx.entry.posY !== 0 || ctx.entry.scale !== 1)) {
          spineAdapter.setImageTransform(action.imageId, ctx.entry.posX, ctx.entry.posY, ctx.entry.scale)
        }
      } else {
        spineAdapter.removeImageFromPlaceholder(action.phName, action.imageId)
      }
    }
  },
)

// ── Viewport ──────────────────────────────────────────────────────────────────
let spineObj: unknown = null   // reference to the mounted spine PIXI.Container
const baseX = ref(0)       // canvas center X — updated on resize / load
const baseY = ref(0)       // canvas center Y
const spineLoaded = ref(false)

const originScreenX = computed(() => baseX.value + viewerStore.posX)
const originScreenY = computed(() => baseY.value + viewerStore.posY)

// Selected bone screen position — bone worldX/Y are in Spine space (Y-up), convert to canvas (Y-down)
const selectedBonePos = computed(() => {
  const name = skeletonStore.selectedBone
  if (!name || !spineLoaded.value) return null
  const bt = inspectorStore.boneTransforms.find(b => b.name === name)
  if (!bt) return null
  return {
    x: baseX.value + viewerStore.posX + bt.x * viewerStore.zoom,
    y: baseY.value + viewerStore.posY - bt.y * viewerStore.zoom,
  }
})

// ── Selected slot bounds overlay ──────────────────────────────────────────────
const selectedSlotRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)

function updateSelectedSlotRect(): void {
  const name = skeletonStore.selectedSlot
  if (!name || !spineAdapter || !spineLoaded.value) { selectedSlotRect.value = null; return }
  const bounds = spineAdapter.getSlotBounds(name)
  if (!bounds) { selectedSlotRect.value = null; return }
  const sx = baseX.value + viewerStore.posX
  const sy = baseY.value + viewerStore.posY
  const z  = viewerStore.zoom
  selectedSlotRect.value = {
    left:   sx + bounds.minX * z,
    top:    sy - bounds.maxY * z,   // Y-flip: Spine Y-up → canvas Y-down
    width:  Math.max(1, (bounds.maxX - bounds.minX) * z),
    height: Math.max(1, (bounds.maxY - bounds.minY) * z),
  }
}

// Re-compute rect on viewport change or slot deselect (ticker covers animation updates)
watch(
  [
    () => skeletonStore.selectedSlot,
    () => viewerStore.posX,
    () => viewerStore.posY,
    () => viewerStore.zoom,
  ],
  updateSelectedSlotRect,
)

// ── Event markers per track ────────────────────────────────────────────────────
const eventMarkersMap = ref<Map<number, AnimationEventMarker[]>>(new Map())

// ── DC sparkline raw data (written every frame, no Vue reactivity) ─────────────
const DC_BUCKETS = 300
const _dcRaw = new Array<number | null>(DC_BUCKETS).fill(null)
let _lastDcNormPos = -1

// ── Loop state machine (per track, persistent across frames) ───────────────────
const loopStates = new Map<number, ReturnType<typeof makeLoopState>>()

// ── Overlay hover state ────────────────────────────────────────────────────────
let _overlayHoverTrackIndex = -1
const isPanning = ref(false)
let panStart = {
  x: 0, y: 0, px: 0, py: 0,
  imageId: '',
  imageMatrix: null as { a: number; b: number; c: number; d: number; tx: number; ty: number } | null,
}
type PanTarget = 'global' | 'background' | 'slot' | 'image'
let panTarget: PanTarget = 'global'
// ── Seek drag state ────────────────────────────────────────────────────────────
let _seekDragActive = false

function _onSeekDragMove(e: MouseEvent) {
  if (!_seekDragActive || !progressOverlay || !containerRef.value) return
  const rect = (containerRef.value as HTMLElement).getBoundingClientRect()
  const r = progressOverlay.handleSeekDrag(e.clientX - rect.left, e.clientY - rect.top)
  if (r) {
    const track = animationStore.tracks.find(t => t.trackIndex === r.trackIndex)
    if (track) {
      spineAdapter?.seekTo(r.trackIndex, r.pct * track.duration)
      const ls = loopStates.get(r.trackIndex)
      if (ls) resetLoopState(ls, r.pct)
    }
  }
}

function _onSeekDragEnd() {
  _seekDragActive = false
  window.removeEventListener('mousemove', _onSeekDragMove)
  window.removeEventListener('mouseup', _onSeekDragEnd)
}

function applyViewport() {
  const x = baseX.value + viewerStore.posX
  const y = baseY.value + viewerStore.posY
  const z = viewerStore.zoom
  for (const [slotId, obj] of mountedSpineObjects.entries()) {
    const slot = loaderStore.spineSlots.find(s => s.id === slotId)
    obj.x = x + (slot?.indPosX ?? 0) * z
    obj.y = y + (slot?.indPosY ?? 0) * z
    obj.scale.set(z * (slot?.indZoom ?? 1))
  }
  // Background sprite
  if (bgSprite) {
    if (backgroundStore.syncEnabled) {
      // Global viewport + personal offset in scene space
      bgSprite.x = x + backgroundStore.posX * z
      bgSprite.y = y + backgroundStore.posY * z
      bgSprite.scale.set(z * backgroundStore.zoom)
    } else {
      // Independent: absolute screen-space position
      bgSprite.x = baseX.value + backgroundStore.posX
      bgSprite.y = baseY.value + backgroundStore.posY
      bgSprite.scale.set(backgroundStore.zoom)
    }
  }
}

/** Apply skins directly to the active spineAdapter.
 *  Uses activeSkins from store if set (restored from savedState),
 *  otherwise falls back to the first non-default skin. */
function applySkins() {
  if (!spineAdapter) return
  const stored = skeletonStore.activeSkins
  const toApply = stored.length > 0
    ? [...stored]
    : (() => {
        const first = spineAdapter!.skins.find((s: string) => s !== 'default')
        return first ? [first] : []
      })()
  if (toApply.length === 0) return
  spineAdapter.setSkins(toApply)
  if (stored.length === 0) skeletonStore.activeSkins = toApply
}

/** Sync Pixi stage zIndex of all mounted spines based on list order.
 *  Slot at list index 0 (top of UI) gets the highest zIndex (rendered on top).
 *  Background sprite is inserted at bgStore.listIndex in the merged ordering. */
function syncZOrder() {
  if (!pixiApp) return
  const slots = loaderStore.spineSlots
  const n = slots.length
  const bgListIdx = Math.max(0, Math.min(n, backgroundStore.listIndex))

  // Assign z-indices to spine objects: adjust for bg position in merged list
  slots.forEach((slot, spineArrIdx) => {
    const obj = mountedSpineObjects.get(slot.id)
    if (!obj) return
    // merged position of this spine: if it's at or after bg insertion point, shift by 1
    const mergedPos = spineArrIdx < bgListIdx ? spineArrIdx : spineArrIdx + 1
    obj.zIndex = n - mergedPos
  })

  // Background sprite z-index
  if (bgSprite) {
    bgSprite.zIndex = n - bgListIdx
  }
}

function onWheel(e: WheelEvent) {
  if (!spineObj || !containerRef.value) return
  e.preventDefault()

  const rect = containerRef.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  // deltaMode 0 = pixels (touchpad), 1 = lines (mouse wheel)
  const dz = e.deltaMode === 0
    ? Math.exp(-e.deltaY * 0.004)
    : e.deltaY < 0 ? 1.15 : 1 / 1.15

  const activeSlot = loaderStore.activeSlot

  if (backgroundStore.isActive && !backgroundStore.syncEnabled) {
    // Zoom background independently, anchored to cursor
    const newZoom = Math.min(20, Math.max(0.05, backgroundStore.zoom * dz))
    if (newZoom === backgroundStore.zoom) return
    const spineX = (mx - baseX.value - backgroundStore.posX) / backgroundStore.zoom
    const spineY = (my - baseY.value - backgroundStore.posY) / backgroundStore.zoom
    backgroundStore.setTransform(
      mx - baseX.value - spineX * newZoom,
      my - baseY.value - spineY * newZoom,
      newZoom,
    )
  } else if ((() => {
    const aid = placeholderImagesStore.activeImageId
    if (!aid) return false
    const ctx = placeholderImagesStore.getImageContext(aid)
    return !!(ctx && !ctx.entry.syncEnabled && ctx.slotId === loaderStore.activeSlotId)
  })()) {
    // Zoom active desynced image, anchored to cursor
    const aid = placeholderImagesStore.activeImageId!
    const ctx = placeholderImagesStore.getImageContext(aid)!
    const curScale = ctx.entry.scale
    const curPosX  = ctx.entry.posX
    const curPosY  = ctx.entry.posY
    const newScale = Math.min(20, Math.max(0.05, curScale * dz))
    if (newScale === curScale) return
    const m = spineAdapter?.getImageContainerWorldTransform(aid)
    if (!m) {
      // Fallback: scale around sprite origin when matrix is unavailable
      placeholderImagesStore.updateImageTransform(ctx.slotId, ctx.phName, aid, curPosX, curPosY, newScale)
      spineAdapter?.setImageTransform(aid, curPosX, curPosY, newScale)
      return
    }
    const det = m.a * m.d - m.b * m.c
    if (Math.abs(det) < 1e-10) return
    // Cursor position in container-local space
    const cursorLocalX = (m.d * (mx - m.tx) - m.c * (my - m.ty)) / det
    const cursorLocalY = (-m.b * (mx - m.tx) + m.a * (my - m.ty)) / det
    // Cursor position in sprite-local space (before sprite's own position/scale)
    const spriteLocalX = curScale !== 0 ? (cursorLocalX - curPosX) / curScale : 0
    const spriteLocalY = curScale !== 0 ? (cursorLocalY - curPosY) / curScale : 0
    const newPosX = cursorLocalX - spriteLocalX * newScale
    const newPosY = cursorLocalY - spriteLocalY * newScale
    placeholderImagesStore.updateImageTransform(ctx.slotId, ctx.phName, aid, newPosX, newPosY, newScale)
    spineAdapter?.setImageTransform(aid, newPosX, newPosY, newScale)
  } else if (activeSlot && activeSlot.syncEnabled === false) {
    // Zoom active spine independently, anchored to cursor
    const curZoom = activeSlot.indZoom ?? 1
    const curPosX = activeSlot.indPosX ?? 0
    const curPosY = activeSlot.indPosY ?? 0
    const newZoom = Math.min(20, Math.max(0.05, curZoom * dz))
    if (newZoom === curZoom) return
    // p = scene-space point under cursor
    const pX = (mx - baseX.value - viewerStore.posX) / viewerStore.zoom
    const pY = (my - baseY.value - viewerStore.posY) / viewerStore.zoom
    // q = spine-local point under cursor
    const qX = (pX - curPosX) / curZoom
    const qY = (pY - curPosY) / curZoom
    activeSlot.indPosX = pX - qX * newZoom
    activeSlot.indPosY = pY - qY * newZoom
    activeSlot.indZoom = newZoom
  } else {
    // Global zoom (existing logic)
    const newZoom = Math.min(20, Math.max(0.05, viewerStore.zoom * dz))
    if (newZoom === viewerStore.zoom) return
    const spineX = (mx - baseX.value - viewerStore.posX) / viewerStore.zoom
    const spineY = (my - baseY.value - viewerStore.posY) / viewerStore.zoom
    viewerStore.posX = mx - baseX.value - spineX * newZoom
    viewerStore.posY = my - baseY.value - spineY * newZoom
    viewerStore.zoom = newZoom
  }
  applyViewport()
}

function onPanStart(e: MouseEvent) {
  if (e.button !== 0) return

  // Check if click hit the overlay seek zone
  if (progressOverlay && animationStore.tracks.length > 0 && containerRef.value) {
    const rect = (containerRef.value as HTMLElement).getBoundingClientRect()
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top
    const seekResult = progressOverlay.handleSeekClick(localX, localY)
    if (seekResult) {
      _seekDragActive = true
      const track = animationStore.tracks.find(t => t.trackIndex === seekResult.trackIndex)
      if (track) {
        spineAdapter?.seekTo(seekResult.trackIndex, seekResult.pct * track.duration)
        const ls = loopStates.get(seekResult.trackIndex)
        if (ls) resetLoopState(ls, seekResult.pct)
      }
      window.addEventListener('mousemove', _onSeekDragMove)
      window.addEventListener('mouseup', _onSeekDragEnd)
      return  // do NOT start pan
    }
  }

  isPanning.value = true

  // Canvas hit-test: activate a desynced image on click before resolving pan target
  if (!e.shiftKey && containerRef.value && spineAdapter) {
    const rect = (containerRef.value as HTMLElement).getBoundingClientRect()
    const hitId = spineAdapter.getImageAtCanvasPoint(e.clientX - rect.left, e.clientY - rect.top)
    if (hitId) {
      const hitCtx = placeholderImagesStore.getImageContext(hitId)
      if (hitCtx && !hitCtx.entry.syncEnabled && hitCtx.slotId === loaderStore.activeSlotId) {
        placeholderImagesStore.setActiveImage(hitId)
      }
    }
  }

  // Determine pan target at drag start
  const activeSlot = loaderStore.activeSlot
  if (e.shiftKey) {
    panTarget = 'global'
    panStart = { x: e.clientX, y: e.clientY, px: viewerStore.posX, py: viewerStore.posY, imageId: '', imageMatrix: null }
  } else if (backgroundStore.isActive && !backgroundStore.syncEnabled) {
    panTarget = 'background'
    panStart = { x: e.clientX, y: e.clientY, px: backgroundStore.posX, py: backgroundStore.posY, imageId: '', imageMatrix: null }
  } else {
    // Check for active desynced image before checking slot
    const aid = placeholderImagesStore.activeImageId
    const imgCtx = aid ? placeholderImagesStore.getImageContext(aid) : null
    if (imgCtx && !imgCtx.entry.syncEnabled && imgCtx.slotId === loaderStore.activeSlotId) {
      panTarget = 'image'
      panStart = {
        x: e.clientX, y: e.clientY,
        px: imgCtx.entry.posX, py: imgCtx.entry.posY,
        imageId: aid!,
        imageMatrix: spineAdapter?.getImageContainerWorldTransform(aid!) ?? null,
      }
    } else if (activeSlot && activeSlot.syncEnabled === false) {
      panTarget = 'slot'
      panStart = { x: e.clientX, y: e.clientY, px: activeSlot.indPosX ?? 0, py: activeSlot.indPosY ?? 0, imageId: '', imageMatrix: null }
    } else {
      panTarget = 'global'
      panStart = { x: e.clientX, y: e.clientY, px: viewerStore.posX, py: viewerStore.posY, imageId: '', imageMatrix: null }
    }
  }
}

function onPanMove(e: MouseEvent) {
  // Update overlay hover
  if (progressOverlay && animationStore.tracks.length > 0 && containerRef.value) {
    const rect = (containerRef.value as HTMLElement).getBoundingClientRect()
    const hasDC = _dcRaw.some(v => v !== null)
    const hit = hitTestOverlay(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      animationStore.tracks.length,
      hasDC,
    )
    _overlayHoverTrackIndex = hit.inOverlay ? hit.trackRowIndex : -1
  } else {
    _overlayHoverTrackIndex = -1
  }

  if (!isPanning.value) return

  const dx = e.clientX - panStart.x
  const dy = e.clientY - panStart.y

  if (panTarget === 'background') {
    backgroundStore.setTransform(panStart.px + dx, panStart.py + dy, backgroundStore.zoom)
  } else if (panTarget === 'image') {
    const m = panStart.imageMatrix
    if (!m) return
    const det = m.a * m.d - m.b * m.c
    if (Math.abs(det) < 1e-10) return
    const localDX = (m.d * dx - m.c * dy) / det
    const localDY = (-m.b * dx + m.a * dy) / det
    const newPosX = panStart.px + localDX
    const newPosY = panStart.py + localDY
    const ctx = placeholderImagesStore.getImageContext(panStart.imageId)
    if (!ctx) return
    placeholderImagesStore.updateImageTransform(ctx.slotId, ctx.phName, panStart.imageId, newPosX, newPosY, ctx.entry.scale)
    spineAdapter?.setImageTransform(panStart.imageId, newPosX, newPosY, ctx.entry.scale)
  } else if (panTarget === 'slot') {
    const slot = loaderStore.activeSlot
    if (slot) {
      const gz = viewerStore.zoom > 0 ? viewerStore.zoom : 1 // defensive: zoom is always ≥ 0.05
      slot.indPosX = panStart.px + dx / gz
      slot.indPosY = panStart.py + dy / gz
    }
  } else {
    viewerStore.posX = panStart.px + dx
    viewerStore.posY = panStart.py + dy
  }
  applyViewport()
}

function onPanEnd() {
  isPanning.value = false
}

function onResetView() {
  viewerStore.resetView()
  applyViewport()
}

const bgColorHex = computed(() =>
  '#' + viewerStore.bgColor.toString(16).padStart(6, '0'),
)

function onBgColorInput(e: Event) {
  const hex = (e.target as HTMLInputElement).value
  viewerStore.bgColor = parseInt(hex.slice(1), 16)
}
let progressOverlay: IProgressOverlay | null = null
let tickerFn: ((dt: number) => void) | null = null
let lastFrameTs    = 0
let lastInspectorTs = 0  // time-based throttle — avoids aliasing with short animation loops

onMounted(async () => {
  const canvas    = canvasRef.value!
  const container = containerRef.value!
  container.addEventListener('wheel', onWheel, { passive: false })
  const { width, height } = container.getBoundingClientRect()

  try {
    pixiApp = await createPixiApp(
      versionStore.pixiVersion!,
      canvas,
      Math.max(width, 1),
      Math.max(height, 1),
    )

    // Enable zIndex-based sorting on the stage for spine z-order control
    pixiApp.setSortableChildren(true)

    progressOverlay = pixiApp.createProgressOverlay(width, height)

    lastFrameTs = lastInspectorTs = performance.now()
    tickerFn = () => {
      const now = performance.now()
      const ms  = now - lastFrameTs
      lastFrameTs = now

      fps.value = Math.round(pixiApp!.ticker.FPS)
      profilerStore.recordFrame(fps.value, ms)
      if (spineAdapter) {
        spineAdapter.tickPlaceholderLabels()
        const states = spineAdapter.getTrackStates()
        animationStore.setTracks(states)

        // Keep disabled tracks frozen — applies to both looped and non-looped
        for (const state of states) {
          if (!animationStore.isTrackEnabled(state.trackIndex) && state.timeScale !== 0) {
            spineAdapter.setTrackTimeScale(state.trackIndex, 0)
          }
        }

        // Auto-stop when all active non-loop animations have reached their end.
        // Skip if any track still has queued animations — Spine will advance to them.
        if (animationStore.isPlaying && states.length > 0) {
          const hasLoop  = states.some(t => t.loop)
          const hasQueue = states.some(t => t.queue.length > 0)
          if (!hasLoop && !hasQueue && states.every(t => t.duration > 0 && t.time >= t.duration - 0.02)) {
            animationStore.stop()
          }
        }

        // Bone crosshair + slot bounds — every frame for smooth animation tracking.
        // Guards ensure no-op when nothing is selected.
        if (skeletonStore.selectedBone) inspectorStore.updateBones(spineAdapter.getBoneTransforms())
        if (skeletonStore.selectedSlot) updateSelectedSlotRect()

        // ── Loop state machine: build display states for overlay ─────────────
        // Sync loopStates map with current track set
        const activeTrackIds = new Set(states.map(s => s.trackIndex))
        for (const id of loopStates.keys()) {
          if (!activeTrackIds.has(id)) loopStates.delete(id)
        }
        const displayTracks: TrackDisplayState[] = states.map(s => {
          if (!loopStates.has(s.trackIndex)) loopStates.set(s.trackIndex, makeLoopState())
          const loopSt = loopStates.get(s.trackIndex)!
          const normPos = computeNorm(s.time, s.duration, s.loop, loopSt)
          return {
            trackIndex:    s.trackIndex,
            animationName: s.animationName,
            normPos,
            displayTime:   normPos * s.duration,
            duration:      s.duration,
          }
        })

        // ── Sample DC by average normalized position ─────────────────────────
        const frameStats = pixiApp!.getStats()
        if (typeof frameStats.drawCalls === 'number') {
          const validTracks = states.filter(t => t.duration > 0 && animationStore.isTrackEnabled(t.trackIndex))
          if (validTracks.length > 0) {
            let normSum = 0
            for (const t of validTracks) {
              const pos = t.loop ? t.time % t.duration : Math.min(t.time, t.duration)
              normSum += pos / t.duration
            }
            const normPos = normSum / validTracks.length
            if (_lastDcNormPos > 0.5 && normPos < 0.2) {
              _dcRaw.fill(null)
            }
            _lastDcNormPos = normPos
            const bucket  = Math.min(DC_BUCKETS - 1, Math.floor(normPos * DC_BUCKETS))
            _dcRaw[bucket] = frameStats.drawCalls
          }
        }

        // ── Update PIXI overlay every frame ───────────────────────────────────
        if (progressOverlay) {
          const { width: stageW, height: stageH } = (containerRef.value as HTMLElement).getBoundingClientRect()
          // Build MarkerDisplay map from eventMarkersMap
          const markersPerTrack = new Map<number, MarkerDisplay[]>()
          for (const [trackIdx, markers] of eventMarkersMap.value) {
            const track = states.find(s => s.trackIndex === trackIdx)
            if (!track || track.duration <= 0) continue
            markersPerTrack.set(trackIdx, markers.map(m => ({
              name:    m.name,
              normPos: m.time / track.duration,
            })))
          }
          progressOverlay.update({
            tracks:            displayTracks,
            markersPerTrack,
            dcBuckets:         _dcRaw,
            stageW,
            stageH,
            hoveredTrackIndex: _overlayHoverTrackIndex,
          })
        }

        // ── Inspector + Atlas + Profiler: throttled @ 100ms ───────────────────
        if (now - lastInspectorTs >= 100) {
          lastInspectorTs = now
          const attachments = spineAdapter.getActiveAttachments()
          inspectorStore.update(spineAdapter.getBoneTransforms(), attachments)
          atlasStore.markSeen(
            attachments
              .filter(a => a.type === 'region' || a.type === 'mesh')
              .map(a => a.attachmentName),
          )
          profilerStore.updateStats(frameStats, attachments)
        }
      }
    }
    pixiApp.ticker.add(tickerFn)

    watch(
      () => viewerStore.bgColor,
      (color) => pixiApp?.setBackground(color),
      { immediate: true },
    )

    // Background image: mount/replace/remove PIXI sprite when store image changes
    watch(
      () => backgroundStore.image,
      (img) => {
        if (bgSprite) {
          pixiApp!.removeFromStage(bgSprite)
          bgSprite.destroy?.({ texture: true })
          bgSprite = null
        }
        if (img) {
          bgSprite = pixiApp!.createSprite(img.dataUrl) as PixiSpriteObject
          pixiApp!.addToStage(bgSprite)
          applyViewport()
          syncZOrder()
        }
      },
    )

    // When background syncEnabled toggles, convert posX/Y/zoom between absolute and relative.
    // sync ON→OFF: relative offset → absolute position (visual stays the same)
    // sync OFF→ON: absolute position → relative offset (visual stays the same)
    watch(
      () => backgroundStore.syncEnabled,
      (newSync, oldSync) => {
        if (oldSync !== undefined && newSync !== oldSync) {
          if (oldSync && !newSync) {
            // Synced → Desynced: scene-space offset → absolute screen position
            backgroundStore.setTransform(
              viewerStore.posX + backgroundStore.posX * viewerStore.zoom,
              viewerStore.posY + backgroundStore.posY * viewerStore.zoom,
              viewerStore.zoom * backgroundStore.zoom,
            )
          } else if (!oldSync && newSync) {
            // Desynced → Synced: absolute screen position → scene-space offset
            const z = viewerStore.zoom > 0 ? viewerStore.zoom : 1
            backgroundStore.setTransform(
              (backgroundStore.posX - viewerStore.posX) / z,
              (backgroundStore.posY - viewerStore.posY) / z,
              backgroundStore.zoom / z,
            )
          }
        }
        applyViewport()
      },
    )

    // Re-apply viewport when background position/zoom changes (synced or desynced)
    watch(
      () => [backgroundStore.posX, backgroundStore.posY, backgroundStore.zoom],
      () => { if (bgSprite) applyViewport() },
    )

    // Re-sync z-order when background list index changes
    watch(
      () => backgroundStore.listIndex,
      () => syncZOrder(),
    )

    // Re-apply viewport when any slot's syncEnabled changes
    watch(
      () => loaderStore.spineSlots.map(s => ({ id: s.id, sync: s.syncEnabled !== false })),
      () => applyViewport(),
      { deep: false },
    )

    // Reset DC position buffer when the animation set changes
    watch(
      () => animationStore.tracks.map(t => `${t.trackIndex}:${t.animationName}`).join(','),
      () => {
        _dcRaw.fill(null)
      },
      { deep: false },
    )

    // Update event markers when track animation changes
    watch(
      () => animationStore.tracks.map(t => `${t.trackIndex}:${t.animationName}`),
      () => {
        if (!spineAdapter) return
        const next = new Map<number, AnimationEventMarker[]>()
        const flat: typeof eventsStore.animationMarkers[0][] = []
        for (const track of animationStore.tracks) {
          const markers = spineAdapter.getAnimationEvents(track.animationName)
          next.set(track.trackIndex, markers)
          for (const m of markers) flat.push({ ...m, trackIndex: track.trackIndex, animationName: track.animationName })
        }
        eventMarkersMap.value = next
        eventsStore.setAnimationMarkers(flat)
      },
      { deep: false },
    )

    watch(
      () => animationStore.speed,
      (newSpeed) => {
        if (spineAdapter && animationStore.isPlaying) spineAdapter.setTimeScale(newSpeed)
      },
    )

    // When any track is enabled/disabled during playback — freeze or resume it
    watch(
      () => animationStore.trackEnabled,
      (enabledMap) => {
        if (!spineAdapter || !animationStore.isPlaying) return
        for (const track of animationStore.tracks) {
          const enabled = enabledMap[track.trackIndex] !== false
          spineAdapter.setTrackTimeScale(track.trackIndex, enabled ? animationStore.speed : 0)
        }
      },
      { deep: true },
    )

    watch(
      () => animationStore.isPlaying,
      (playing) => {
        if (_suppressAnimPlay) return
        if (!spineAdapter) return
        if (playing) {
          if (!animationStore.isPaused) {
            // Reset DC sparkline on each fresh play (not on unpause)
            _dcRaw.fill(null)
            _lastDcNormPos = -1
            // Reconstruct full sequence for each enabled track from its master playlist.
            // This allows the full sequence to replay even after Spine has advanced through entries.
            for (const [idxStr, playlist] of Object.entries(animationStore.trackPlaylists)) {
              const trackIndex = Number(idxStr)
              if (!animationStore.isTrackEnabled(trackIndex) || playlist.length === 0) continue
              // playlist[0].loop is the authoritative source — updated atomically by setTrackLoop
              // and onCascaderSelect. animationStore.tracks is ticker-driven and may lag by one frame.
              spineAdapter.setAnimation(trackIndex, playlist[0].animationName, playlist[0].loop)
              for (let i = 1; i < playlist.length; i++) {
                spineAdapter.addAnimation(trackIndex, playlist[i].animationName, playlist[i].loop)
              }
            }
            // Apply pending seek times after setAnimation (which resets trackTime to 0).
            if (_pendingSeekTimes) {
              for (const [idxStr, time] of Object.entries(_pendingSeekTimes)) {
                spineAdapter.seekTo(Number(idxStr), time)
              }
              _pendingSeekTimes = null
            }
          }
          animationStore.isPaused = false
          spineAdapter.setTimeScale(animationStore.speed)
          // Re-apply freeze for all disabled tracks
          for (const t of animationStore.tracks) {
            if (!animationStore.isTrackEnabled(t.trackIndex)) {
              spineAdapter.setTrackTimeScale(t.trackIndex, 0)
            }
          }
        } else {
          spineAdapter.setTimeScale(0)
        }
      },
    )

    // Sync global Loop switch → all active Spine tracks + playlists
    watch(
      () => animationStore.loop,
      (newLoop) => {
        if (!spineAdapter) return
        for (const track of animationStore.tracks) {
          spineAdapter.setTrackLoop(track.trackIndex, newLoop)
        }
        for (const idxStr of Object.keys(animationStore.trackPlaylists)) {
          animationStore.updateTrackPlaylistFirstLoop(Number(idxStr), newLoop)
        }
      },
    )

    // Watch for active spine slot changes (multi-spine switching)
    watch(
      () => loaderStore.activeSlotId,
      async (newId, oldId) => {
        if (!newId || newId === oldId || loading.value) return

        // 1. Save full state of the slot we're leaving
        if (oldId) {
          const leavingSlot = loaderStore.spineSlots.find(s => s.id === oldId)
          const leavingTrackStates = spineAdapter?.getTrackStates() ?? []
          const trackTimes: Record<number, number> = {}
          for (const ts of leavingTrackStates) trackTimes[ts.trackIndex] = ts.time
          loaderStore.saveSlotState(oldId, {
            speed:              animationStore.speed,
            selectedAnimation:  animationStore.selectedAnimation,
            currentTrack:       animationStore.currentTrack,
            loop:               animationStore.loop,
            trackEnabled:       { ...animationStore.trackEnabled },
            trackPlaylists:       JSON.parse(JSON.stringify(animationStore.trackPlaylists)),
            wasPlaying:           animationStore.isPlaying,
            trackTimes,
            selectedSkins:        [...skeletonStore.activeSkins],
            showPlaceholders:     viewerStore.showPlaceholders,
            disabledPlaceholders: [...viewerStore.disabledPlaceholders],
            syncEnabled:          leavingSlot?.syncEnabled ?? true,
            indPosX:              leavingSlot?.indPosX ?? 0,
            indPosY:              leavingSlot?.indPosY ?? 0,
            indZoom:              leavingSlot?.indZoom ?? 1,
            placeholderImages:    placeholderImagesStore.getSlotImages(oldId),
          })
        }

        // 2. Handle old active adapter: park (if pinned) or destroy
        if (oldId && spineAdapter) {
          if (loaderStore.isPinned(oldId)) {
            // Park: keep on stage at current timeScale — adapter is already running correctly
            // Track adapter so it can be reused (path 5a), z-ordered, and destroyed on unpin
            mountedAdapters.set(oldId, spineAdapter)
            if (spineObj) mountedSpineObjects.set(oldId, spineObj)
          } else {
            spineAdapter.destroy()
            mountedAdapters.delete(oldId)
            mountedSpineObjects.delete(oldId)
          }
          spineAdapter = null
          spineObj = null
        }

        // 3. Clear active-specific stores
        skeletonStore.clear()
        animationStore.reset()
        inspectorStore.clear()
        eventsStore.clear()
        atlasStore.clear()
        profilerStore.clear()
        complexityStore.clear()
        placeholderImagesStore.setActiveImage(null)
        phItems.value = []
        viewerStore.showPlaceholders = localStorage.getItem('svp:viewer:showPlaceholders') !== 'false'
        viewerStore.clearDisabledPlaceholders()
        spineLoaded.value = false

        // 4. Get the new slot
        const slot = loaderStore.spineSlots.find(s => s.id === newId)
        if (!slot?.fileSet) return

        // Helper: restore saved state into active stores + viewport
        const restoreState = (s: typeof slot.savedState) => {
          if (!s) return
          animationStore.speed              = s.speed
          animationStore.selectedAnimation  = s.selectedAnimation
          animationStore.currentTrack       = s.currentTrack
          animationStore.loop               = s.loop
          animationStore.trackEnabled       = { ...s.trackEnabled }
          for (const [idxStr, playlist] of Object.entries(s.trackPlaylists)) {
            animationStore.setTrackPlaylist(Number(idxStr), playlist)
          }
          // Apply playlists directly to adapter so tracks are visible even when not playing.
          for (const [idxStr, playlist] of Object.entries(s.trackPlaylists)) {
            const trackIndex = Number(idxStr)
            if (playlist.length === 0) continue
            if (!animationStore.isTrackEnabled(trackIndex)) continue
            spineAdapter?.setAnimation(trackIndex, playlist[0].animationName, playlist[0].loop)
            for (let i = 1; i < playlist.length; i++) {
              spineAdapter?.addAnimation(trackIndex, playlist[i].animationName, playlist[i].loop)
            }
          }
          if (s.wasPlaying) {
            // Set pending seek times before play() so the isPlaying watch can seekTo
            // after its setAnimation calls (which reset trackTime to 0).
            if (s.trackTimes && Object.keys(s.trackTimes).length > 0) {
              _pendingSeekTimes = { ...s.trackTimes }
            }
            animationStore.isPaused = false
            animationStore.play()
          } else if (s.trackTimes) {
            // wasPlaying=false: isPlaying watch won't fire setAnimation, seek immediately.
            for (const [idxStr, time] of Object.entries(s.trackTimes)) {
              spineAdapter?.seekTo(Number(idxStr), time)
            }
          }
          // Restore selected skins — must be set before Vue flushes so AnimationPanel
          // watch(skins) picks them up instead of falling back to firstNonDefault
          if (s.selectedSkins?.length) {
            skeletonStore.activeSkins = [...s.selectedSkins]
          }
          // Restore placeholder toggle state
          if (s.showPlaceholders !== undefined) {
            viewerStore.showPlaceholders = s.showPlaceholders
          }
          // Restore individually disabled placeholders
          if (s.disabledPlaceholders?.length) {
            viewerStore.disabledPlaceholders = new Set(s.disabledPlaceholders)
          }
          // Restore independent movement state to the slot itself
          const target = slot
          if (target) {
            target.syncEnabled = s.syncEnabled ?? true
            target.indPosX     = s.indPosX ?? 0
            target.indPosY     = s.indPosY ?? 0
            target.indZoom     = s.indZoom ?? 1
          }
          applyViewport()
          // Restore placeholder images
          if (s.placeholderImages) {
            placeholderImagesStore.setSlotImages(slot.id, s.placeholderImages)
            for (const [phName, entries] of Object.entries(s.placeholderImages)) {
              for (const entry of entries) {
                spineAdapter?.addImageToPlaceholder(phName, entry.dataURL, entry.imageId)
                spineAdapter?.setImageTransform(entry.imageId, entry.posX ?? 0, entry.posY ?? 0, entry.scale ?? 1)
              }
            }
          } else {
            placeholderImagesStore.clearSlotImages(slot.id)
          }
        }

        // 5a. New slot is already mounted (was pinned on scene) → reuse adapter
        if (mountedAdapters.has(newId)) {
          loading.value = true
          try {
            spineAdapter = mountedAdapters.get(newId)!
            spineObj = mountedSpineObjects.get(newId) ?? null
            spineLoaded.value = true

            skeletonStore.attachAdapter(spineAdapter)
            skeletonStore.populate({
              animations: spineAdapter.animations,
              skins:      spineAdapter.skins,
              bones:      spineAdapter.bones,
              slots:      spineAdapter.slots,
              events:     spineAdapter.events,
              freeBones:  spineAdapter.getFreeBones(),
            })
            spineAdapter.onEvent(e => eventsStore.push(e))
            if (typeof slot.fileSet.atlas.fileBody === 'string') {
              atlasStore.load(slot.fileSet.atlas.fileBody, slot.fileSet.images)
            }
            complexityStore.analyze(spineAdapter, slot.fileSet, atlasStore.pages)
            // Re-populate ph-list (was cleared in step 3; loadSpine not called in this path)
            const PH_RE_5A = /placeholder/i
            const phSlots5A = new Set(spineAdapter.slots.filter(s => PH_RE_5A.test(s.name)).map(s => s.name))
            phItems.value = [
              ...[...phSlots5A].map(name => ({ name, kind: 'slot' as const })),
              ...spineAdapter.bones
                .filter(b => PH_RE_5A.test(b.name) && !phSlots5A.has(b.name))
                .map(b => ({ name: b.name, kind: 'bone' as const })),
            ]
            loaderStore.setSlotPlaceholders(
              slot.id,
              phItems.value
                .filter(p => p.kind !== 'attachment')
                .map(p => ({ name: p.name, kind: p.kind as 'bone' | 'slot' })),
            )
            // Pinned adapter is already live — sync stores from current state without touching it.
            // Do NOT call restoreState(): it calls setAnimation/play() which would restart the animation.
            {
              const liveStates = spineAdapter.getTrackStates()
              const livePlaylists: Record<number, Array<{ animationName: string; loop: boolean }>> = {}
              for (const ts of liveStates) {
                livePlaylists[ts.trackIndex] = [
                  { animationName: ts.animationName, loop: ts.loop },
                  ...ts.queue,
                ]
              }
              const ss = slot.savedState
              animationStore.speed             = ss?.speed ?? 1
              animationStore.selectedAnimation = ss?.selectedAnimation ?? null
              animationStore.currentTrack      = ss?.currentTrack ?? 0
              animationStore.loop              = ss?.loop ?? false
              animationStore.trackEnabled      = ss?.trackEnabled ? { ...ss.trackEnabled } : {}
              for (const [idxStr, playlist] of Object.entries(livePlaylists)) {
                animationStore.setTrackPlaylist(Number(idxStr), playlist)
              }
              // Suppress isPlaying watch for the entire microtask flush.
              // animationStore.reset() in step 3 deferred isPlaying=false; our isPlaying assignment
              // here also defers. Both watches fire AFTER this sync block and see spineAdapter already
              // pointing to the pinned adapter — without suppression they would setTimeScale(0) or
              // call setAnimation and restart the live adapter.
              _suppressAnimPlay = true
              animationStore.isPaused = false
              animationStore.isPlaying = ss?.wasPlaying ?? true
              if (ss?.selectedSkins?.length) skeletonStore.activeSkins = [...ss.selectedSkins]
              if (ss?.showPlaceholders !== undefined) viewerStore.showPlaceholders = ss.showPlaceholders
              if (ss?.disabledPlaceholders?.length) viewerStore.disabledPlaceholders = new Set(ss.disabledPlaceholders)
              const pinnedSlot = slot
              if (pinnedSlot) {
                pinnedSlot.syncEnabled = ss?.syncEnabled ?? true
                pinnedSlot.indPosX     = ss?.indPosX ?? 0
                pinnedSlot.indPosY     = ss?.indPosY ?? 0
                pinnedSlot.indZoom     = ss?.indZoom ?? 1
              }
              applyViewport()
              // Flush all deferred watches while suppressed, then set timeScale directly.
              await nextTick()
              _suppressAnimPlay = false
              spineAdapter?.setTimeScale((ss?.wasPlaying ?? true) ? (ss?.speed ?? 1) : 0)
            }
            applySkins()
            applyPlaceholderLabels()
            const ss5a = slot.savedState
            if (ss5a?.placeholderImages) {
              placeholderImagesStore.setSlotImages(newId, ss5a.placeholderImages)
              for (const [phName, entries] of Object.entries(ss5a.placeholderImages)) {
                for (const entry of entries) {
                  spineAdapter?.addImageToPlaceholder(phName, entry.dataURL, entry.imageId)
                  spineAdapter?.setImageTransform(entry.imageId, entry.posX ?? 0, entry.posY ?? 0, entry.scale ?? 1)
                }
              }
            }
          } catch (e) {
            spineError.value = e instanceof Error ? e.message : 'Failed to restore spine'
            console.error('[PreviewStage] restore pinned error:', e)
          } finally {
            loading.value = false
          }
        } else {
          // 5b. Load fresh — preserve current global viewport (resetViewport=false)
          await loadSpine(slot.fileSet, newId, false)
          restoreState(slot.savedState)
          applySkins()
          applyPlaceholderLabels()
        }
      },
    )

    // Watch for pin state changes — mount or unmount non-active pinned spines
    watch(
      () => loaderStore.pinnedSlotIds,
      async (newPinned) => {
        if (!pixiApp) return

        // Un-pinned non-active slots → destroy and remove from scene
        for (const [slotId, adapter] of [...mountedAdapters.entries()]) {
          if (slotId === loaderStore.activeSlotId) continue
          if (!newPinned.has(slotId)) {
            adapter.destroy()
            mountedAdapters.delete(slotId)
            mountedSpineObjects.delete(slotId)
          }
        }

        // Newly pinned non-active slots → load and mount them
        for (const slotId of newPinned) {
          if (slotId === loaderStore.activeSlotId) continue
          if (mountedAdapters.has(slotId)) continue
          const slot = loaderStore.spineSlots.find(s => s.id === slotId)
          if (!slot?.fileSet) continue
          try {
            const adapter = await createSpineAdapter(
              versionStore.pixiVersion!,
              versionStore.spineVersion!,
            )
            await adapter.load(slot.fileSet)
            adapter.mount(pixiApp.stage)
            // Restore animations from saved playlists
            const ss = slot.savedState
            if (ss) {
              for (const [idxStr, playlist] of Object.entries(ss.trackPlaylists)) {
                const trackIdx = Number(idxStr)
                if (playlist.length > 0) {
                  adapter.setAnimation(trackIdx, playlist[0].animationName, playlist[0].loop)
                  for (let i = 1; i < playlist.length; i++) {
                    adapter.addAnimation(trackIdx, playlist[i].animationName, playlist[i].loop)
                  }
                }
              }
              adapter.setTimeScale(ss.wasPlaying ? ss.speed : 0)
              if (ss.placeholderImages) {
                placeholderImagesStore.setSlotImages(slotId, ss.placeholderImages)
                for (const [phName, entries] of Object.entries(ss.placeholderImages)) {
                  for (const entry of entries) {
                    adapter.addImageToPlaceholder(phName, entry.dataURL, entry.imageId)
                    adapter.setImageTransform(entry.imageId, entry.posX ?? 0, entry.posY ?? 0, entry.scale ?? 1)
                  }
                }
              }
            }
            const obj = pixiApp.getLastStageChild()
            mountedAdapters.set(slotId, adapter)
            if (obj) mountedSpineObjects.set(slotId, obj)
            applyViewport()
            syncZOrder()
          } catch (e) {
            console.error('[PreviewStage] failed to mount pinned spine:', slotId, e)
            loaderStore.setPinned(slotId, false)
          }
        }
      },
    )

    // Watch for slot order changes → sync z-order of stage objects
    watch(
      () => loaderStore.spineSlots.map(s => s.id),
      () => syncZOrder(),
      { deep: false },
    )

    // Auto-load if files were pre-loaded from version picker
    if (loaderStore.activeSlot?.fileSet) {
      await loadSpine(loaderStore.activeSlot.fileSet, loaderStore.activeSlotId ?? undefined)
      applySkins()
    }
  } catch (e) {
    console.error('[PreviewStage] init error:', e)
    spineError.value = e instanceof Error ? e.message : 'Failed to initialize Pixi'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  containerRef.value?.removeEventListener('wheel', onWheel)
  window.removeEventListener('mousemove', _onSeekDragMove)
  window.removeEventListener('mouseup', _onSeekDragEnd)
  spineObj = null
  if (bgSprite) {
    bgSprite.destroy?.({ texture: true })
    bgSprite = null
  }
  backgroundStore.clearAll()
  if (pixiApp && tickerFn) pixiApp.ticker.remove(tickerFn)
  progressOverlay?.destroy()
  progressOverlay = null
  // Destroy all mounted adapters (active + pinned non-active)
  for (const adapter of mountedAdapters.values()) {
    adapter.destroy()
  }
  mountedAdapters.clear()
  mountedSpineObjects.clear()
  spineAdapter = null
  pixiApp?.destroy()
  pixiApp = null
  inspectorStore.clear()
  eventsStore.clear()
  atlasStore.clear()
  profilerStore.clear()
  complexityStore.clear()
})

useResizeObserver(containerRef, ([entry]) => {
  const { width, height } = entry.contentRect
  if (width > 0 && height > 0) {
    pixiApp?.resize(width, height)
    progressOverlay?.resize(width, height)
    baseX.value = width / 2
    baseY.value = height * 0.5
    applyViewport()
  }
})

// ── Public API ───────────────────────────────────────────────────────────────

async function loadSpine(fileSet: FileSet, slotId?: string, resetViewport = true): Promise<void> {
  if (!pixiApp) return
  spineError.value = null

  _dcRaw.fill(null)
  _lastDcNormPos = -1

  // Destroy previous ACTIVE adapter only (pinned non-active adapters stay mounted)
  if (spineAdapter) {
    const oldSlotId = [...mountedAdapters.entries()].find(([, a]) => a === spineAdapter)?.[0]
    if (oldSlotId) {
      mountedAdapters.delete(oldSlotId)
      mountedSpineObjects.delete(oldSlotId)
    }
    spineAdapter.destroy()
    spineAdapter = null
    spineObj = null
    skeletonStore.clear()
    animationStore.reset()
    inspectorStore.clear()
    eventsStore.clear()
    atlasStore.clear()
    profilerStore.clear()
    complexityStore.clear()
  }

  loading.value = true
  loadingText.value = 'Loading Spine…'

  try {
    spineAdapter = await createSpineAdapter(
      versionStore.pixiVersion!,
      versionStore.spineVersion!,
    )
    await spineAdapter.load(fileSet)

    // Center on canvas
    const container = containerRef.value!
    const { width, height } = container.getBoundingClientRect()

    spineAdapter.mount(pixiApp.stage)
    spineAdapter.setTimeScale(animationStore.isPlaying ? animationStore.speed : 0)

    // Grab the mounted spine object and initialise viewport
    spineObj = pixiApp.getLastStageChild()
    baseX.value = width / 2
    baseY.value = height * 0.5
    spineLoaded.value = true
    if (resetViewport) viewerStore.resetView()

    // Track in maps
    if (slotId) {
      mountedAdapters.set(slotId, spineAdapter)
      if (spineObj) mountedSpineObjects.set(slotId, spineObj)
    }

    applyViewport()
    syncZOrder()

    // Fill skeleton store
    skeletonStore.attachAdapter(spineAdapter)
    skeletonStore.populate({
      animations: spineAdapter.animations,
      skins:      spineAdapter.skins,
      bones:      spineAdapter.bones,
      slots:      spineAdapter.slots,
      events:     spineAdapter.events,
      freeBones:  spineAdapter.getFreeBones(),
    })

    // Placeholder labels: find bones/slots whose names contain "placeholder"
    // Prefer slot over bone when both share the same name (slot has its own container)
    const PH_RE = /placeholder/i
    const phSlotNames = new Set(spineAdapter.slots.filter(s => PH_RE.test(s.name)).map(s => s.name))
    phItems.value = [
      ...[...phSlotNames].map(name => ({ name, kind: 'slot' as const })),
      ...spineAdapter.bones
        .filter(b => PH_RE.test(b.name) && !phSlotNames.has(b.name))
        .map(b => ({ name: b.name, kind: 'bone' as const })),
    ]
    if (slotId) {
      loaderStore.setSlotPlaceholders(
        slotId,
        phItems.value
          .filter(p => p.kind !== 'attachment')
          .map(p => ({ name: p.name, kind: p.kind as 'bone' | 'slot' })),
      )
    }
    if (phItems.value.length > 0 && viewerStore.showPlaceholders) {
      spineAdapter.setPlaceholderLabels(phItems.value)
    }

    // Subscribe to Spine events (unsubscribed automatically via spineAdapter.destroy())
    spineAdapter.onEvent(e => eventsStore.push(e))

    // Load atlas for Atlas Inspector
    if (typeof fileSet.atlas.fileBody === 'string') {
      atlasStore.load(fileSet.atlas.fileBody, fileSet.images)
    }

    // Complexity analysis (runs once after load, synchronous for JSON)
    complexityStore.analyze(spineAdapter, fileSet, atlasStore.pages)
  } catch (e) {
    spineError.value = e instanceof Error ? e.message : 'Failed to load Spine'
    console.error('[PreviewStage] loadSpine error:', e)
  } finally {
    loading.value = false
  }
}

// ── Export helpers ────────────────────────────────────────────────────────────

async function captureCurrentFrame(): Promise<HTMLCanvasElement | null> {
  if (!pixiApp) return null
  return pixiApp.extractFrame()
}

/**
 * Seeks through an animation frame by frame.
 * Calls onFrame with each extracted canvas — caller decides what to do with it
 * (accumulate for sprite sheet, stream to gif encoder, etc.).
 * Returns false if aborted via signal, true on success.
 */
async function captureAnimFrames(
  track: number,
  frameCount: number,
  onFrame: (canvas: HTMLCanvasElement, index: number, total: number) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!pixiApp || !spineAdapter) return false
  const entry = animationStore.tracks.find(t => t.trackIndex === track)
  if (!entry || entry.duration <= 0) return false

  const wasPlaying = animationStore.isPlaying
  spineAdapter.setTimeScale(0)

  const duration = entry.duration

  try {
    for (let i = 0; i < frameCount; i++) {
      if (signal?.aborted) return false
      const t = frameCount === 1 ? 0 : (i / (frameCount - 1)) * duration
      spineAdapter.seekTo(track, t)
      // Wait one rAF so Pixi's ticker processes the new trackTime and renders
      await new Promise<void>(r => requestAnimationFrame(() => r()))
      if (signal?.aborted) return false
      const frame = await pixiApp!.extractFrame()
      onFrame(frame, i, frameCount)
    }
  } finally {
    // Always restore playback state
    if (wasPlaying) {
      spineAdapter.setTimeScale(animationStore.speed)
    }
    spineAdapter.seekTo(track, 0)
  }

  return true
}

defineExpose({
  loadSpine,
  setAnimation: (track: number, name: string, loop: boolean) => {
    animationStore.setTrackEnabled(track, true)
    animationStore.setTrackPlaylist(track, [{ animationName: name, loop }])
    spineAdapter?.setAnimation(track, name, loop)
  },
  addAnimation: (track: number, name: string, loop: boolean) => {
    animationStore.setTrackEnabled(track, true)
    animationStore.appendToTrackPlaylist(track, name, loop)
    spineAdapter?.addAnimation(track, name, loop)
  },
  setTrackLoop: (track: number, loop: boolean) => {
    spineAdapter?.setTrackLoop(track, loop)
    if (animationStore.trackPlaylists[track]?.length) {
      animationStore.updateTrackPlaylistFirstLoop(track, loop)
    } else {
      // Playlist may be absent if the track was set via an internal adapter path;
      // create it from the live Spine state so reconstruction works correctly on next Play.
      const liveTrack = animationStore.tracks.find(t => t.trackIndex === track)
      if (liveTrack) {
        animationStore.setTrackPlaylist(track, [{ animationName: liveTrack.animationName, loop }])
      }
    }
  },
  removeQueueEntry: (track: number, index: number) => {
    // index+1 because playlist[0] is the currently playing entry
    animationStore.removeFromTrackPlaylist(track, index + 1)
    spineAdapter?.removeQueueEntry(track, index)
  },
  clearTrack: (track: number) => {
    animationStore.clearTrackPlaylist(track)
    spineAdapter?.clearTrack(track)
    if (Object.keys(animationStore.trackPlaylists).length === 0) {
      spineAdapter?.setToSetupPose()
      animationStore.stop()
    }
  },
  clearTracks: () => {
    animationStore.clearAllTrackPlaylists()
    spineAdapter?.clearTracks()
    spineAdapter?.setToSetupPose()
    animationStore.stop()
  },
  seekDelta: (track: number, delta: number) => {
    const entry = animationStore.tracks.find(t => t.trackIndex === track)
    if (!entry || !spineAdapter) return
    // trackTime accumulates for looped animations, so normalise to [0, duration]
    const base = entry.loop && entry.duration > 0 ? entry.time % entry.duration : entry.time
    const clamped = Math.max(0, Math.min(base + delta, entry.duration))
    spineAdapter.seekTo(track, clamped)
  },
  seekTo: (track: number, time: number) => {
    spineAdapter?.seekTo(track, time)
  },
  setSkins: (names: string[]) => {
    if (names.length === 0) return
    spineAdapter?.setSkins(names)
  },
  captureCurrentFrame,
  captureAnimFrames,
  getBoneTransformsSnapshot: () => spineAdapter?.getBoneTransforms() ?? [],
})
</script>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0d0d0f;
  cursor: grab;
}

.stage--pan {
  cursor: grabbing;
}

.canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.overlay-top-left {
  position: absolute;
  top: 10px;
  left: 12px;
  pointer-events: all;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.origin-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.68rem;
  font-weight: 500;
  padding: 3px 7px;
  border-radius: 6px;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px);
}

.origin-toggle input {
  width: 11px;
  height: 11px;
  cursor: pointer;
  accent-color: #7c6af5;
  flex-shrink: 0;
}

.origin-label {
  color: rgba(255,255,255,0.45);
  cursor: pointer;
  user-select: none;
  transition: color 0.15s;
}

.origin-label:hover { color: rgba(255,255,255,0.85); }

.bg-color-input {
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  background: none;
  flex-shrink: 0;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.bg-color-input:hover { opacity: 1; }
.bg-color-input::-webkit-color-swatch-wrapper { padding: 0; }
.bg-color-input::-webkit-color-swatch { border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; }

.bg-color-label {
  color: rgba(255,255,255,0.45);
  font-size: inherit;
  user-select: none;
}

.ph-toggle {
  width: 12px;
  height: 12px;
  cursor: pointer;
  accent-color: #7c6af5;
}

.ph-label {
  color: rgba(255,255,255,0.45);
  font-size: inherit;
  user-select: none;
}

.ph-list {
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  border-radius: 6px;
  padding: 4px 7px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 180px;
  overflow-y: auto;
}

.ph-list-item {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  font-size: 0.68rem;
  font-weight: 500;
}

.ph-list-item input[type='checkbox'] {
  width: 10px;
  height: 10px;
  cursor: pointer;
  accent-color: #7c6af5;
  flex-shrink: 0;
}

.ph-list-name {
  color: rgba(255, 255, 255, 0.65);
  user-select: none;
  white-space: nowrap;
}

.overlay-top-right {
  position: absolute;
  top: 10px;
  right: 12px;
  pointer-events: none;
}

/* ── Origin crosshair ── */
.origin-cross {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.origin-cross::before,
.origin-cross::after {
  content: '';
  position: absolute;
  background: rgba(255, 80, 80, 0.9);
  border-radius: 1px;
}

/* horizontal bar */
.origin-cross::before {
  width: 14px;
  height: 1.5px;
  top: -0.75px;
  left: -7px;
}

/* vertical bar */
.origin-cross::after {
  width: 1.5px;
  height: 14px;
  left: -0.75px;
  top: -7px;
}

/* ── Selected bone crosshair ── */
.bone-cross {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.bone-cross::before,
.bone-cross::after {
  content: '';
  position: absolute;
  background: rgba(74, 222, 128, 0.9);
  border-radius: 1px;
}

/* horizontal bar */
.bone-cross::before {
  width: 10px;
  height: 1.5px;
  top: -0.75px;
  left: -5px;
}

/* vertical bar */
.bone-cross::after {
  width: 1.5px;
  height: 10px;
  left: -0.75px;
  top: -5px;
}

.fps {
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.fps--good { color: #4ade80; }
.fps--ok   { color: #facc15; }
.fps--bad  { color: #f87171; }

.error-banner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(220, 50, 50, 0.15);
  border: 1px solid #dc3232;
  border-radius: 10px;
  padding: 14px 24px;
  color: #f87171;
  font-size: 0.875rem;
  max-width: 400px;
  text-align: center;
}

.loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.loading-text {
  font-size: 0.8rem;
  color: var(--c-text-muted);
}

/* ── Selected slot bounds ── */
.slot-bounds {
  position: absolute;
  pointer-events: none;
  border: 1.5px solid rgba(96, 165, 250, 0.85);
  border-radius: 1px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
  background: rgba(96, 165, 250, 0.06);
}

</style>
