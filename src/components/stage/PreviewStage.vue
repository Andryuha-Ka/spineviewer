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
import type { IPixiApp, ITrackOverlay } from '@/core/types/IPixiApp'
import type { ISpineAdapter, TrackState } from '@/core/types/ISpineAdapter'
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
let baseX = 0              // canvas center X — updated on resize / load
let baseY = 0              // canvas center Y
const isPanning = ref(false)
let panStart = { x: 0, y: 0, px: 0, py: 0 }

function applyViewport() {
  if (!spineObj) return
  spineObj.x = baseX + viewerStore.posX
  spineObj.y = baseY + viewerStore.posY
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
  const spineX = (mx - baseX - viewerStore.posX) / viewerStore.zoom
  const spineY = (my - baseY - viewerStore.posY) / viewerStore.zoom
  viewerStore.posX = mx - baseX - spineX * newZoom
  viewerStore.posY = my - baseY - spineY * newZoom
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
        trackOverlay?.updateText(states.length > 0 ? buildOverlayText(states, animationStore.trackEnabled) : '')

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
              // Prefer live Spine track loop state — it's set directly when user toggles per-track Loop checkbox
              // and may differ from playlist if the ticker hasn't propagated the update yet
              const liveLoop = animationStore.tracks.find(t => t.trackIndex === trackIndex)?.loop
              const firstLoop = liveLoop ?? playlist[0].loop
              spineAdapter.setAnimation(trackIndex, playlist[0].animationName, firstLoop)
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
    // Auto-load if files were pre-loaded from version picker
    if (loaderStore.isLoaded && loaderStore.fileSet) {
      await loadSpine(loaderStore.fileSet)
    }
  } catch (e) {
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
    baseX = width / 2
    baseY = height * 0.75
    applyViewport()
  }
})

// ── Track overlay helpers ─────────────────────────────────────────────────────

function buildBar(pct: number, len = 10): string {
  const filled = Math.round(Math.max(0, Math.min(1, pct)) * len)
  return '█'.repeat(filled) + '░'.repeat(len - filled)
}

function buildOverlayText(states: TrackState[], enabledMap: Record<number, boolean>): string {
  return states.map(t => {
    const enabled = enabledMap[t.trackIndex] !== false
    const time = t.loop ? t.time % t.duration : Math.min(t.time, t.duration)
    const pct = t.duration > 0 ? time / t.duration : 0
    const bar = buildBar(pct)
    const tags = [t.loop ? 'loop' : '', !enabled ? 'paused' : ''].filter(Boolean).join(' ')
    const name = t.animationName.length > 22 ? t.animationName.slice(0, 21) + '…' : t.animationName.padEnd(22)
    return `#${t.trackIndex}  ${name}  ${time.toFixed(2)}s/${t.duration.toFixed(2)}s  [${bar}]${tags ? '  ' + tags : ''}`
  }).join('\n')
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
    baseX = width / 2
    baseY = height * 0.75
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

.overlay-top-right {
  position: absolute;
  top: 10px;
  right: 12px;
  pointer-events: none;
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
</style>
