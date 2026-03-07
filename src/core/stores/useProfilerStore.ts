import { defineStore } from 'pinia'
import type { RendererStats } from '@/core/types/IPixiApp'
import type { AttachmentInfo } from '@/core/types/ISpineAdapter'

export interface FrameSnapshot {
  timestamp: number
  fps:       number
  frameMs:   number
  clipping:  number
  meshes:    number
}

export interface LongTaskEntry {
  timestamp: number
  duration:  number  // ms
}

const HISTORY_SIZE     = 120
const MAX_SLOW_FRAMES  = 50
const MAX_LONG_TASKS   = 50

export const useProfilerStore = defineStore('profiler', () => {
  /** Ring-buffer of FPS samples, last HISTORY_SIZE frames */
  const fpsHistory    = ref<number[]>([])
  const frameMs       = ref(0)
  const drawCalls     = ref<number | null>(null)
  const clippingCount = ref(0)
  const meshCount     = ref(0)
  /** Frames where fps < 30, capped at MAX_SLOW_FRAMES */
  const slowFrames    = ref<FrameSnapshot[]>([])
  /** Long tasks (main thread blocked >50ms), capped at MAX_LONG_TASKS */
  const longTasks     = ref<LongTaskEntry[]>([])

  /** Called every rendered frame with current FPS and measured frame delta. */
  function recordFrame(fps: number, ms: number): void {
    if (fpsHistory.value.length >= HISTORY_SIZE) fpsHistory.value.shift()
    fpsHistory.value.push(fps)
    frameMs.value = ms

    if (fps > 0 && fps < 30) {
      const snap: FrameSnapshot = {
        timestamp: performance.now(),
        fps,
        frameMs:  ms,
        clipping: clippingCount.value,
        meshes:   meshCount.value,
      }
      if (slowFrames.value.length >= MAX_SLOW_FRAMES) slowFrames.value.shift()
      slowFrames.value.push(snap)
    }
  }

  /** Called every N frames (throttled alongside inspector) with renderer stats + attachment list. */
  function updateStats(stats: RendererStats, attachments: AttachmentInfo[]): void {
    drawCalls.value     = stats.drawCalls
    clippingCount.value = attachments.filter(a => a.type === 'clipping').length
    meshCount.value     = attachments.filter(a => a.type === 'mesh').length
  }

  function recordLongTask(duration: number): void {
    const entry: LongTaskEntry = { timestamp: performance.now(), duration }
    if (longTasks.value.length >= MAX_LONG_TASKS) longTasks.value.shift()
    longTasks.value.push(entry)
  }

  function clearSlowFrames(): void {
    slowFrames.value = []
  }

  function clearLongTasks(): void {
    longTasks.value = []
  }

  function clear(): void {
    fpsHistory.value    = []
    frameMs.value       = 0
    drawCalls.value     = null
    clippingCount.value = 0
    meshCount.value     = 0
    slowFrames.value    = []
    longTasks.value     = []
  }

  return {
    fpsHistory,
    frameMs,
    drawCalls,
    clippingCount,
    meshCount,
    slowFrames,
    longTasks,
    recordFrame,
    recordLongTask,
    updateStats,
    clearSlowFrames,
    clearLongTasks,
    clear,
  }
})
