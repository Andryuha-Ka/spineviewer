/**
 * @file useProfilerStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import type { RendererStats } from '@/core/types/IPixiApp'
import type { AttachmentInfo } from '@/core/types/ISpineAdapter'
import { FPS_OK } from '@/core/utils/fpsTier'

interface FrameSnapshot {
  timestamp: number
  fps:       number
  frameMs:   number
  clipping:  number
  meshes:    number
}

interface LongTaskEntry {
  timestamp: number
  duration:  number  // ms
}

const HISTORY_SIZE     = 120
const WARMUP_FRAMES    = 30
const MAX_SLOW_FRAMES  = 50
const MAX_LONG_TASKS   = 50

export const useProfilerStore = defineStore('profiler', () => {
  /** Ring buffer of the last HISTORY_SIZE FPS samples; non-reactive, `version` signals writes */
  const ring: number[] = new Array(HISTORY_SIZE).fill(0)
  let head = 0
  let size = 0
  let framesSinceReset = 0
  const version       = ref(0)
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
    ring[head] = fps
    head = (head + 1) % HISTORY_SIZE
    if (size < HISTORY_SIZE) size++
    version.value++
    frameMs.value = ms
    framesSinceReset++

    if (framesSinceReset > WARMUP_FRAMES && fps > 0 && fps < FPS_OK) {
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

  /** FPS samples, oldest → newest (snapshot, at most HISTORY_SIZE). */
  function getFpsHistory(): number[] {
    const start = (head - size + HISTORY_SIZE) % HISTORY_SIZE
    const out = new Array<number>(size)
    for (let i = 0; i < size; i++) out[i] = ring[(start + i) % HISTORY_SIZE]
    return out
  }

  const latestFps = computed(() => {
    void version.value
    return size > 0 ? ring[(head - 1 + HISTORY_SIZE) % HISTORY_SIZE] : 0
  })

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

  function restartWarmup(): void {
    framesSinceReset = 0
  }

  function clear(): void {
    restartWarmup()
    head = 0
    size = 0
    version.value++
    frameMs.value       = 0
    drawCalls.value     = null
    clippingCount.value = 0
    meshCount.value     = 0
    slowFrames.value    = []
    longTasks.value     = []
  }

  return {
    latestFps,
    getFpsHistory,
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
    restartWarmup,
    clear,
  }
})
