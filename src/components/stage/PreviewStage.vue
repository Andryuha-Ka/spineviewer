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

    <!-- Top-left overlay: origin toggle + bg color picker -->
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
          type="color"
          class="bg-color-input"
          :value="bgColorHex"
          title="Background color"
          @input="onBgColorInput"
        />
        <span class="bg-color-label">bg</span>
      </div>
    </div>

    <div class="overlay-top-right">
      <span class="fps" :class="fpsClass">{{ fps }} FPS</span>
    </div>

    <!-- Progress bars overlay -->
    <div v-if="animationStore.tracks.length > 0" class="progress-overlay">
      <div
        v-for="track in animationStore.tracks"
        :key="track.trackIndex"
        class="progress-track"
        @mousedown.stop.prevent="onProgressDragStart($event, track.trackIndex)"
      >
        <div class="progress-info">
          <span class="progress-name">
            <span class="progress-idx">#{{ track.trackIndex }}</span>
            {{ track.animationName }}
          </span>
          <span class="progress-time">{{ formatTrackTime(track) }}</span>
        </div>
        <div
          class="progress-bar-wrap"
          @mousemove.stop="onBarMouseMove($event, track)"
          @mouseleave.stop="hoveredMarker = null"
        >
          <div
            class="progress-bar-fill"
            :style="{ width: getTrackProgress(track) + '%' }"
          />
          <template v-for="marker in (eventMarkersMap.get(track.trackIndex) ?? [])" :key="marker.name + marker.time">
            <div
              class="progress-marker"
              :style="{ left: track.duration > 0 ? (marker.time / track.duration * 100) + '%' : '0%' }"
            />
            <div
              class="progress-marker-label"
              :style="{ left: track.duration > 0 ? (marker.time / track.duration * 100) + '%' : '0%' }"
            >{{ marker.name }} <span class="pml-time">{{ marker.time.toFixed(2) }}s</span></div>
          </template>
        </div>
      </div>
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
import type { IPixiApp, ITrackOverlay } from '@/core/types/IPixiApp'
import type { ISpineAdapter, TrackState, AnimationEventMarker } from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'

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
const hoveredMarker   = ref<{ name: string; time: number; trackIndex: number } | null>(null)

function onBarMouseMove(e: MouseEvent, track: TrackState) {
  if (track.duration <= 0) return
  const wrap = e.currentTarget as HTMLElement
  const rect = wrap.getBoundingClientRect()
  const pct  = (e.clientX - rect.left) / rect.width
  const hoverTime = pct * track.duration
  const markers = eventMarkersMap.value.get(track.trackIndex) ?? []
  const THRESH_PX = 8
  let best: AnimationEventMarker | null = null
  let bestDist = Infinity
  for (const m of markers) {
    const mPx = (m.time / track.duration) * rect.width
    const dist = Math.abs(e.clientX - rect.left - mPx)
    if (dist < bestDist && dist < THRESH_PX) { bestDist = dist; best = m }
  }
  void hoverTime
  hoveredMarker.value = best ? { name: best.name, time: best.time, trackIndex: track.trackIndex } : null
}
const isPanning = ref(false)
let panStart = { x: 0, y: 0, px: 0, py: 0 }

function applyViewport() {
  if (!spineObj) return
  spineObj.x = baseX.value + viewerStore.posX
  spineObj.y = baseY.value + viewerStore.posY
  spineObj.scale.set(viewerStore.zoom)
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
  isPanning.value = true
  panStart = { x: e.clientX, y: e.clientY, px: viewerStore.posX, py: viewerStore.posY }
}

function onPanMove(e: MouseEvent) {
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
let trackOverlay: ITrackOverlay | null = null
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

    trackOverlay = pixiApp.createTrackOverlay()
    trackOverlay.resize(width, height)

    lastFrameTs = lastInspectorTs = performance.now()
    tickerFn = () => {
      const now = performance.now()
      const ms  = now - lastFrameTs
      lastFrameTs = now

      fps.value = Math.round(pixiApp!.ticker.FPS)
      profilerStore.recordFrame(fps.value, ms)
      if (spineAdapter) {
        const states = spineAdapter.getTrackStates()
        animationStore.setTracks(states)
        trackOverlay?.updateText('')

        // Keep disabled looped tracks frozen even after queue advances (new entry resets timeScale=1)
        for (const state of states) {
          if (!animationStore.isTrackEnabled(state.trackIndex) && state.loop && state.timeScale !== 0) {
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

        // Inspector + Atlas + Profiler: time-based throttle ~10 fps (100 ms).
        // Time-based avoids aliasing with short animation loops whose length
        // happens to be a multiple of a fixed frame count.
        if (now - lastInspectorTs >= 100) {
          lastInspectorTs = now
          const attachments = spineAdapter.getActiveAttachments()
          inspectorStore.update(spineAdapter.getBoneTransforms(), attachments)
          atlasStore.markSeen(
            attachments
              .filter(a => a.type === 'region' || a.type === 'mesh')
              .map(a => a.attachmentName),
          )
          profilerStore.updateStats(pixiApp!.getStats(), attachments)
        }
      }
    }
    pixiApp.ticker.add(tickerFn)

    watch(
      () => viewerStore.bgColor,
      (color) => pixiApp?.setBackground(color),
      { immediate: true },
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

    // When a looped track is enabled/disabled during playback — freeze or resume it
    watch(
      () => animationStore.trackEnabled,
      (enabledMap) => {
        if (!spineAdapter || !animationStore.isPlaying) return
        for (const track of animationStore.tracks) {
          if (!track.loop) continue
          const enabled = enabledMap[track.trackIndex] !== false
          spineAdapter.setTrackTimeScale(track.trackIndex, enabled ? 1 : 0)
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
          // Re-apply freeze for disabled looped tracks
          for (const t of animationStore.tracks) {
            if (t.loop && !animationStore.isTrackEnabled(t.trackIndex)) {
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
        // Save full state of the slot we're leaving
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
            trackPlaylists:     JSON.parse(JSON.stringify(animationStore.trackPlaylists)),
            wasPlaying:         animationStore.isPlaying,
          })
        }
        // Load the new slot
        const slot = loaderStore.spineSlots.find(s => s.id === newId)
        if (slot?.fileSet) {
          await loadSpine(slot.fileSet)
          const s = slot.savedState
          if (s) {
            // Restore viewport
            viewerStore.posX = s.posX
            viewerStore.posY = s.posY
            viewerStore.zoom = s.zoom
            applyViewport()
            // Restore animation controls
            animationStore.speed              = s.speed
            animationStore.selectedAnimation  = s.selectedAnimation
            animationStore.currentTrack       = s.currentTrack
            animationStore.loop               = s.loop
            animationStore.trackEnabled       = { ...s.trackEnabled }
            // Restore playlists
            for (const [idxStr, playlist] of Object.entries(s.trackPlaylists)) {
              animationStore.setTrackPlaylist(Number(idxStr), playlist)
            }
            // Resume playback if it was running
            if (s.wasPlaying) {
              animationStore.isPaused = false
              animationStore.play()
            }
          }
        }
      },
    )

    // Auto-load if files were pre-loaded from version picker
    if (loaderStore.activeSlot?.fileSet) {
      await loadSpine(loaderStore.activeSlot.fileSet)
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
  spineObj = null
  if (pixiApp && tickerFn) pixiApp.ticker.remove(tickerFn)
  trackOverlay?.destroy()
  spineAdapter?.destroy()
  pixiApp?.destroy()
  pixiApp = null
  spineAdapter = null
  trackOverlay = null
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
    trackOverlay?.resize(width, height)
    baseX.value = width / 2
    baseY.value = height * 0.5
    applyViewport()
  }
})

// ── Progress bar helpers ──────────────────────────────────────────────────────

function getTrackProgress(track: TrackState): number {
  if (track.duration <= 0) return 0
  const t = track.loop ? track.time % track.duration : Math.min(track.time, track.duration)
  return Math.min(100, (t / track.duration) * 100)
}

function formatTrackTime(track: TrackState): string {
  const t = track.loop ? track.time % track.duration : Math.min(track.time, track.duration)
  return `${t.toFixed(2)}s / ${track.duration.toFixed(2)}s`
}

function onProgressDragStart(e: MouseEvent, trackIndex: number) {
  const wrap = (e.currentTarget as HTMLElement).querySelector('.progress-bar-wrap') as HTMLElement
  if (!wrap) return

  function seek(ev: MouseEvent) {
    const rect = wrap.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
    const track = animationStore.tracks.find(t => t.trackIndex === trackIndex)
    if (track && track.duration > 0) spineAdapter?.seekTo(trackIndex, pct * track.duration)
  }

  seek(e)
  const onMove = (ev: MouseEvent) => seek(ev)
  const onUp   = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ── Public API ───────────────────────────────────────────────────────────────

async function loadSpine(fileSet: FileSet): Promise<void> {
  if (!pixiApp) return
  spineError.value = null

  // Destroy previous adapter
  if (spineAdapter) {
    spineAdapter.destroy()
    spineAdapter = null
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
    applyViewport()

    // Fill skeleton store
    skeletonStore.populate({
      animations: spineAdapter.animations,
      skins:      spineAdapter.skins,
      bones:      spineAdapter.bones,
      slots:      spineAdapter.slots,
      events:     spineAdapter.events,
    })

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

/* ── Progress overlay ── */
.progress-overlay {
  position: absolute;
  bottom: 0;
  left: 12px;
  right: 12px;
  padding-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  z-index: 20;
  pointer-events: all;
}

.progress-track {
  display: flex;
  flex-direction: column;
  gap: 3px;
  cursor: pointer;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0 2px;
}

.progress-name {
  font-size: 0.68rem;
  color: rgba(255,255,255,0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}

.progress-idx {
  color: rgba(255,255,255,0.3);
  margin-right: 4px;
  font-variant-numeric: tabular-nums;
}

.progress-time {
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
  color: rgba(255,255,255,0.35);
  flex-shrink: 0;
}

.progress-bar-wrap {
  position: relative;
  height: 4px;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  overflow: visible;
  transition: height 0.15s;
}

.progress-track:hover .progress-bar-wrap {
  height: 6px;
}

.progress-bar-fill {
  height: 100%;
  background: rgba(124,106,245,0.85);
  border-radius: 2px;
  transition: width 0.05s linear;
}

.progress-marker {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 1.5px;
  background: rgba(250,204,21,0.85);
  transform: translateX(-50%);
  border-radius: 1px;
  pointer-events: none;
}

.progress-marker-label {
  position: absolute;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 3px;
  pointer-events: none;
  white-space: nowrap;
  font-size: 0.65rem;
  font-weight: 600;
  color: rgba(250,204,21,0.95);
  line-height: 1;
}

.pml-time {
  font-size: 0.6rem;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: rgba(255,255,255,0.45);
}
</style>
