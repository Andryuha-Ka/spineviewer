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
const loaderStore     = useLoaderStore()

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

// ── Viewport ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let spineObj: any = null   // reference to the mounted spine PIXI.Container
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
let panStart = { x: 0, y: 0, px: 0, py: 0 }

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
  for (const obj of mountedSpineObjects.values()) {
    obj.x = x
    obj.y = y
    obj.scale.set(z)
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
 *  Slot at list index 0 (top of UI) gets the highest zIndex (rendered on top). */
function syncZOrder() {
  if (!pixiApp) return
  const slots = loaderStore.spineSlots
  const n = slots.length
  slots.forEach((slot, i) => {
    const obj = mountedSpineObjects.get(slot.id)
    if (obj) obj.zIndex = n - 1 - i
  })
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

  const newZoom = Math.min(20, Math.max(0.05, viewerStore.zoom * dz))
  if (newZoom === viewerStore.zoom) return

  // Zoom towards cursor: keep point under cursor fixed in spine-space
  const spineX = (mx - baseX.value - viewerStore.posX) / viewerStore.zoom
  const spineY = (my - baseY.value - viewerStore.posY) / viewerStore.zoom
  viewerStore.posX = mx - baseX.value - spineX * newZoom
  viewerStore.posY = my - baseY.value - spineY * newZoom
  viewerStore.zoom = newZoom
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
  panStart = { x: e.clientX, y: e.clientY, px: viewerStore.posX, py: viewerStore.posY }
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
  viewerStore.posX = panStart.px + e.clientX - panStart.x
  viewerStore.posY = panStart.py + e.clientY - panStart.y
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
    ;(pixiApp.stage as any).sortableChildren = true

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
          loaderStore.saveSlotState(oldId, {
            speed:              animationStore.speed,
            posX:               viewerStore.posX,
            posY:               viewerStore.posY,
            zoom:               viewerStore.zoom,
            selectedAnimation:  animationStore.selectedAnimation,
            currentTrack:       animationStore.currentTrack,
            loop:               animationStore.loop,
            trackEnabled:       { ...animationStore.trackEnabled },
            trackPlaylists:       JSON.parse(JSON.stringify(animationStore.trackPlaylists)),
            wasPlaying:           animationStore.isPlaying,
            selectedSkins:        [...skeletonStore.activeSkins],
            showPlaceholders:     viewerStore.showPlaceholders,
            disabledPlaceholders: [...viewerStore.disabledPlaceholders],
          })
        }

        // 2. Handle old active adapter: park (if pinned) or destroy
        if (oldId && spineAdapter) {
          if (loaderStore.isPinned(oldId)) {
            // Park: keep on stage, freeze/play based on wasPlaying
            const ss = loaderStore.spineSlots.find(s => s.id === oldId)?.savedState
            spineAdapter.setTimeScale(ss?.wasPlaying ? (ss.speed ?? 1) : 0)
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
          viewerStore.posX = s.posX
          viewerStore.posY = s.posY
          viewerStore.zoom = s.zoom
          applyViewport()
          animationStore.speed              = s.speed
          animationStore.selectedAnimation  = s.selectedAnimation
          animationStore.currentTrack       = s.currentTrack
          animationStore.loop               = s.loop
          animationStore.trackEnabled       = { ...s.trackEnabled }
          for (const [idxStr, playlist] of Object.entries(s.trackPlaylists)) {
            animationStore.setTrackPlaylist(Number(idxStr), playlist)
          }
          if (s.wasPlaying) {
            animationStore.isPaused = false
            animationStore.play()
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
            restoreState(slot.savedState)
            applySkins()
            applyPlaceholderLabels()
          } catch (e) {
            spineError.value = e instanceof Error ? e.message : 'Failed to restore spine'
            console.error('[PreviewStage] restore pinned error:', e)
          } finally {
            loading.value = false
          }
        } else {
          // 5b. Load fresh
          await loadSpine(slot.fileSet, newId)
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
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obj = (pixiApp.stage as any).children?.at(-1) ?? null
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

async function loadSpine(fileSet: FileSet, slotId?: string): Promise<void> {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spineObj = (pixiApp.stage as any).children?.at(-1) ?? null
    baseX.value = width / 2
    baseY.value = height * 0.5
    spineLoaded.value = true
    viewerStore.resetView()

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
