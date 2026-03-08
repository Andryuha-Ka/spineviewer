<!--
 * @file ProfilerPanel.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="profiler-panel">

    <!-- FPS Graph -->
    <div class="graph-wrap">
      <canvas ref="graphRef" class="fps-graph" />
      <span class="graph-label graph-label--60">60</span>
      <span class="graph-label graph-label--30">30</span>
    </div>

    <!-- Stats grid -->
    <div class="stats-grid">
      <div class="stat-cell">
        <span class="stat-label">FPS</span>
        <span class="stat-value" :class="fpsClass">{{ currentFps }}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">Frame</span>
        <span class="stat-value">{{ frameMsDisplay }}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">Draw calls</span>
        <span class="stat-value stat-value--dim">{{ drawCallsDisplay }}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">Clipping</span>
        <span class="stat-value" :class="clippingClass">{{ profilerStore.clippingCount }}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">Meshes</span>
        <span class="stat-value">{{ profilerStore.meshCount }}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">VRAM est.</span>
        <span class="stat-value">{{ vramDisplay }}</span>
      </div>
    </div>

    <!-- Long Tasks (main thread jank >50ms) -->
    <div class="slow-section">
      <div class="slow-header">
        <span class="slow-title">
          Long tasks
          <span class="slow-count">({{ profilerStore.longTasks.length }})</span>
          <span v-if="!longTasksSupported" class="unsupported-tag">not supported</span>
        </span>
        <n-button size="tiny" quaternary @click="profilerStore.clearLongTasks()">Clear</n-button>
      </div>

      <div v-if="profilerStore.longTasks.length === 0" class="no-slow">
        {{ longTasksSupported ? 'No long tasks (main thread blocked >50ms) recorded' : 'PerformanceObserver longtask not supported in this browser' }}
      </div>
      <div v-else class="slow-list">
        <div
          v-for="task in longTasksReversed"
          :key="task.timestamp"
          class="slow-row"
        >
          <span class="slow-fps" :style="{ color: longTaskColor(task.duration) }">{{ task.duration.toFixed(0) }}&thinsp;ms</span>
          <span class="slow-ms">jank</span>
          <span class="slow-meta">{{ formatAgo(task.timestamp) }}</span>
        </div>
      </div>
    </div>

    <!-- Slow frames -->
    <div class="slow-section">
      <div class="slow-header">
        <span class="slow-title">Slow frames <span class="slow-count">({{ profilerStore.slowFrames.length }})</span></span>
        <n-button size="tiny" quaternary @click="profilerStore.clearSlowFrames()">Clear</n-button>
      </div>

      <div v-if="profilerStore.slowFrames.length === 0" class="no-slow">
        No slow frames (&lt;30 fps) recorded
      </div>
      <div v-else class="slow-list">
        <div
          v-for="frame in slowFramesReversed"
          :key="frame.timestamp"
          class="slow-row"
        >
          <span class="slow-fps" :style="{ color: fpsColor(frame.fps) }">{{ frame.fps }}&thinsp;fps</span>
          <span class="slow-ms">{{ frame.frameMs.toFixed(1) }}&thinsp;ms</span>
          <span class="slow-meta">clip:{{ frame.clipping }} mesh:{{ frame.meshes }}</span>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { useProfilerStore } from '@/core/stores/useProfilerStore'
import { useAtlasStore }    from '@/core/stores/useAtlasStore'

const profilerStore = useProfilerStore()
const atlasStore    = useAtlasStore()

// ── Graph canvas ──────────────────────────────────────────────────────────────

const graphRef = ref<HTMLCanvasElement | null>(null)
const MAX_FPS  = 90  // upper bound for graph y-axis

let rafHandle = 0

function drawGraph() {
  const canvas = graphRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const w   = canvas.offsetWidth
  const h   = canvas.offsetHeight
  if (w === 0 || h === 0) return

  // Resize backing store if needed
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width  = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.clearRect(0, 0, w, h)

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(0, 0, w, h)

  // Threshold lines
  const y60 = h - (60 / MAX_FPS) * h
  const y30 = h - (30 / MAX_FPS) * h

  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.25)'
  ctx.beginPath(); ctx.moveTo(0, y60); ctx.lineTo(w, y60); ctx.stroke()
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.25)'
  ctx.beginPath(); ctx.moveTo(0, y30); ctx.lineTo(w, y30); ctx.stroke()

  // Bars
  const history = profilerStore.fpsHistory
  const barW    = w / 120  // always 120-slot grid
  const offset  = 120 - history.length

  for (let i = 0; i < history.length; i++) {
    const fps  = history[i]
    const barH = Math.min(fps / MAX_FPS, 1) * h
    const x    = (offset + i) * barW

    ctx.fillStyle = fps >= 55 ? '#4ade80' : fps >= 30 ? '#facc15' : '#f87171'
    ctx.fillRect(Math.round(x) + 0.5, h - barH, Math.max(barW - 1, 0.5), barH)
  }
}

function loop() {
  drawGraph()
  rafHandle = requestAnimationFrame(loop)
}

onMounted(() => { rafHandle = requestAnimationFrame(loop) })
onUnmounted(() => {
  cancelAnimationFrame(rafHandle)
  longTaskObserver?.disconnect()
})

// ── Long Task observer ────────────────────────────────────────────────────────

const longTasksSupported = ref(false)
let longTaskObserver: PerformanceObserver | null = null

try {
  longTaskObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      profilerStore.recordLongTask(entry.duration)
    }
  })
  longTaskObserver.observe({ type: 'longtask', buffered: false })
  longTasksSupported.value = true
} catch {
  // longtask not supported in this browser (Firefox, Safari)
}

// ── Computed display values ───────────────────────────────────────────────────

const currentFps = computed(() => {
  const h = profilerStore.fpsHistory
  return h.length > 0 ? h[h.length - 1] : 0
})

const frameMsDisplay = computed(() => `${profilerStore.frameMs.toFixed(1)} ms`)

const drawCallsDisplay = computed(() =>
  profilerStore.drawCalls !== null ? String(profilerStore.drawCalls) : '—'
)

/** VRAM estimate from atlas page sizes (width × height × 4 bytes per page) */
const vramDisplay = computed(() => {
  let bytes = 0
  for (const p of atlasStore.pages) {
    bytes += p.width * p.height * 4
  }
  if (bytes === 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
})

const fpsClass = computed(() => {
  const fps = currentFps.value
  if (fps === 0)   return ''
  if (fps >= 55)   return 'fps--good'
  if (fps >= 30)   return 'fps--ok'
  return 'fps--bad'
})

const clippingClass = computed(() =>
  profilerStore.clippingCount >= 3 ? 'fps--bad'
    : profilerStore.clippingCount >= 1 ? 'fps--ok'
    : ''
)

function fpsColor(fps: number): string {
  return fps >= 55 ? '#4ade80' : fps >= 30 ? '#facc15' : '#f87171'
}

const slowFramesReversed  = computed(() => [...profilerStore.slowFrames].reverse())
const longTasksReversed   = computed(() => [...profilerStore.longTasks].reverse())

function longTaskColor(duration: number): string {
  return duration >= 200 ? '#f87171' : duration >= 100 ? '#facc15' : '#fb923c'
}

function formatAgo(timestamp: number): string {
  const secs = Math.round((performance.now() - timestamp) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  return `${mins}m ago`
}
</script>

<style scoped>
.profiler-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  gap: 0;
}

/* ── FPS Graph ── */
.graph-wrap {
  position: relative;
  flex-shrink: 0;
  height: 64px;
  margin: 8px 8px 0;
  border-radius: 6px;
  overflow: hidden;
}

.fps-graph {
  display: block;
  width: 100%;
  height: 100%;
}

.graph-label {
  position: absolute;
  right: 4px;
  font-size: 0.65rem;
  color: var(--c-text-faint);
  line-height: 1;
  pointer-events: none;
}

.graph-label--60 { top: calc((1 - 60/90) * 100% - 1px); }
.graph-label--30 { top: calc((1 - 30/90) * 100% - 1px); }

/* ── Stats grid ── */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1px;
  margin: 8px 8px 0;
  border: 1px solid var(--c-border-dim);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.stat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  background: var(--c-raised);
}

.stat-label {
  font-size: 0.65rem;
  color: var(--c-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-value {
  font-size: 0.85rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--c-text);
}

.stat-value--dim {
  color: var(--c-text-muted);
}

/* FPS colour classes */
.fps--good { color: #4ade80; }
.fps--ok   { color: #facc15; }
.fps--bad  { color: #f87171; }

/* ── Slow frames ── */
.slow-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  margin: 8px 8px 8px;
}

.slow-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.slow-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--c-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.slow-count {
  font-weight: 400;
  color: var(--c-text-muted);
}

.no-slow {
  font-size: 0.75rem;
  color: var(--c-text-faint);
  text-align: center;
  padding: 16px 0;
}

.slow-list {
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.slow-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 4px;
  background: var(--c-raised);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.slow-fps {
  font-weight: 700;
  min-width: 42px;
}

.slow-ms {
  color: var(--c-text-muted);
  min-width: 50px;
}

.slow-meta {
  color: var(--c-text-faint);
  flex: 1;
}

.unsupported-tag {
  font-size: 0.6rem;
  font-weight: 400;
  color: var(--c-text-ghost);
  text-transform: none;
  letter-spacing: 0;
  margin-left: 4px;
}
</style>
