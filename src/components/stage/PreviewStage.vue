<template>
  <div ref="containerRef" class="stage">
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
import type { IPixiApp } from '@/core/types/IPixiApp'
import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'

const versionStore   = useVersionStore()
const viewerStore    = useViewerStore()
const skeletonStore  = useSkeletonStore()
const animationStore = useAnimationStore()

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
let tickerFn: ((dt: number) => void) | null = null

onMounted(async () => {
  const canvas    = canvasRef.value!
  const container = containerRef.value!
  const { width, height } = container.getBoundingClientRect()

  try {
    pixiApp = await createPixiApp(
      versionStore.pixiVersion!,
      canvas,
      Math.max(width, 1),
      Math.max(height, 1),
    )

    tickerFn = () => {
      fps.value = Math.round(pixiApp!.ticker.FPS)
      if (spineAdapter) {
        const states = spineAdapter.getTrackStates()
        animationStore.setTracks(states)

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
  } catch (e) {
    spineError.value = e instanceof Error ? e.message : 'Failed to initialize Pixi'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  if (pixiApp && tickerFn) pixiApp.ticker.remove(tickerFn)
  spineAdapter?.destroy()
  pixiApp?.destroy()
  pixiApp = null
  spineAdapter = null
})

useResizeObserver(containerRef, ([entry]) => {
  const { width, height } = entry.contentRect
  if (width > 0 && height > 0) pixiApp?.resize(width, height)
})

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

    // Position at center — cast to any since stage type is 'unknown'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spineObj = (pixiApp.stage as any).children?.at(-1)
    if (spineObj) {
      spineObj.x = width / 2
      spineObj.y = height * 0.75 // slightly below center — typical for characters
    }

    // Fill skeleton store
    skeletonStore.populate({
      animations: spineAdapter.animations,
      skins:      spineAdapter.skins,
      bones:      spineAdapter.bones,
      slots:      spineAdapter.slots,
      events:     spineAdapter.events,
    })
  } catch (e) {
    spineError.value = e instanceof Error ? e.message : 'Failed to load Spine'
    console.error('[PreviewStage] loadSpine error:', e)
  } finally {
    loading.value = false
  }
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
  setTrackLoop: (track: number, loop: boolean) => spineAdapter?.setTrackLoop(track, loop),
  removeQueueEntry: (track: number, index: number) => {
    // index+1 because playlist[0] is the currently playing entry
    animationStore.removeFromTrackPlaylist(track, index + 1)
    spineAdapter?.removeQueueEntry(track, index)
  },
  clearTrack: (track: number) => {
    animationStore.clearTrackPlaylist(track)
    spineAdapter?.clearTrack(track)
    if (Object.keys(animationStore.trackPlaylists).length === 0) {
      animationStore.stop()
    }
  },
  clearTracks: () => {
    animationStore.clearAllTrackPlaylists()
    spineAdapter?.clearTracks()
    animationStore.stop()
  },
  seekDelta:    (track: number, delta: number) => {
    const entry = animationStore.tracks.find(t => t.trackIndex === track)
    if (!entry || !spineAdapter) return
    const clamped = Math.max(0, Math.min(entry.time + delta, entry.duration))
    spineAdapter.seekTo(track, clamped)
  },
})
</script>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0d0d0f;
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
  color: #666;
}
</style>
