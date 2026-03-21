<!--
 * @file CompareCanvasSlot.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div
    ref="containerRef"
    class="canvas-slot"
    :class="{
      'canvas-slot--empty': !hasFileSet,
      'canvas-slot--drag':  isDragging,
      'canvas-slot--pan':   isPanning,
    }"
    @mousedown="onPanStart"
    @mousemove="onPanMove"
    @mouseup="onPanEnd"
    @mouseleave="onPanEnd"
    @dblclick="onResetView"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="onDrop"
  >
    <!-- Canvas -->
    <canvas ref="canvasRef" class="slot-canvas" />

    <!-- Empty state -->
    <div v-if="!hasFileSet && !isLoading" class="empty-state">
      <span class="empty-icon">{{ isDragging ? '⬇' : '○' }}</span>
      <span class="empty-label">{{ isDragging ? 'Drop Spine files' : 'No file loaded' }}</span>
      <span class="empty-hint">Drop files here or use the toolbar selector</span>
    </div>

    <!-- Loading indicator -->
    <div v-if="isLoading" class="loading-overlay">
      <span class="loading-text">Loading…</span>
    </div>

    <!-- Error state -->
    <div v-if="loadError" class="error-overlay">
      <span class="error-text">{{ loadError }}</span>
    </div>

    <!-- Anim not found toast -->
    <Transition name="anim-toast">
      <div v-if="animNotFound" class="anim-not-found-toast">
        "{{ animNotFound }}" not found
      </div>
    </Transition>

    <!-- Top-left overlay: bg color + center button -->
    <div v-if="hasFileSet" class="overlay-tl">
      <input
        type="color"
        class="bg-input"
        :value="bgColorHex"
        title="Background color"
        @input="onBgColorInput"
        @click.stop
      />
      <span class="overlay-hint" title="Double-click canvas to center">bg</span>
    </div>

    <!-- Top-right: FPS -->
    <div class="overlay-tr">
      <span class="fps-badge" :class="fpsClass">{{ fps }} FPS</span>
    </div>

    <!-- Control bar -->
    <div class="control-bar" @mousedown.stop @dblclick.stop>
      <span class="slot-side-badge">{{ side === 'left' ? 'A' : 'B' }}</span>

      <template v-if="adapter">
        <select class="anim-select" :value="currentAnimName ?? ''" @change="onAnimChange">
          <option v-if="!currentAnimName" value="" disabled>— select —</option>
          <option v-for="name in animationNames" :key="name" :value="name">{{ name }}</option>
        </select>

        <!-- Play/Pause: master only -->
        <template v-if="isMaster">
          <button class="ctrl-btn" @click="togglePlay">
            {{ isPlaying ? '⏸' : '▶' }}
          </button>
        </template>
        <template v-else>
          <span class="sync-badge" :class="{ 'sync-badge--on': syncEnabled }">
            {{ syncEnabled ? '↔' : '—' }}
          </span>
        </template>

        <span class="time-display">{{ timeDisplay }}</span>
        <span class="fps-inline">{{ fps }} FPS</span>
      </template>
      <template v-else>
        <span class="empty-bar-hint">—</span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import type { IPixiApp } from '@/core/types/IPixiApp'
import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'
import { createPixiApp, createSpineAdapter } from '@/core/AdapterFactory'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useCompareStore } from '@/core/stores/useCompareStore'

// ── Props ──────────────────────────────────────────────────────────────────────

const props = defineProps<{
  side:    'left' | 'right'
  fileSet: FileSet | null
}>()

const emit = defineEmits<{
  'viewport-change': [vp: { posX: number; posY: number; zoom: number }]
  'anim-change':     [name: string]
}>()

// ── DOM refs ───────────────────────────────────────────────────────────────────

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef    = ref<HTMLCanvasElement | null>(null)

// ── Internal state (non-reactive for perf) ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let spineObj: any   = null
let pixiAppInst: IPixiApp | null = null
let adapterInst: ISpineAdapter | null = null
let tickerFn: (() => void) | null = null

// ── Reactive state ────────────────────────────────────────────────────────────

const adapter  = ref<ISpineAdapter | null>(null)
const pixiApp  = ref<IPixiApp | null>(null)

const isLoading = ref(false)
const loadError = ref<string | null>(null)
const isDragging = ref(false)
const isPanning  = ref(false)

// Viewport
const baseX = ref(0)
const baseY = ref(0)
const posX  = ref(0)
const posY  = ref(0)
const zoom  = ref(1)
const bgColor = ref(0x111113)

// Animation controls
const currentAnimName = ref<string | null>(null)
const isPlaying       = ref(false)
const fps             = ref(0)
const currentTime     = ref(0)
const animDuration    = ref(0)
const animNotFound    = ref<string | null>(null)

let animNotFoundTimer: ReturnType<typeof setTimeout> | null = null

function showAnimNotFound(name: string) {
  if (animNotFoundTimer) clearTimeout(animNotFoundTimer)
  animNotFound.value = name
  animNotFoundTimer = setTimeout(() => { animNotFound.value = null }, 2500)
}

// Pan state
let panStart = { x: 0, y: 0, px: 0, py: 0 }

// ── Stores ─────────────────────────────────────────────────────────────────────

const versionStore = useVersionStore()
const compareStore = useCompareStore()

// ── Computed ───────────────────────────────────────────────────────────────────

const hasFileSet     = computed(() => props.fileSet !== null)
const animationNames = computed(() => adapter.value?.animations ?? [])
const isMaster       = computed(() => compareStore.masterSide === props.side)
const syncEnabled    = computed(() => compareStore.syncEnabled)

const bgColorHex = computed(() => '#' + bgColor.value.toString(16).padStart(6, '0'))

const fpsClass = computed(() => {
  if (fps.value < 30) return 'fps--bad'
  if (fps.value < 55) return 'fps--ok'
  return 'fps--good'
})

const timeDisplay = computed(() => {
  const t = currentTime.value
  const d = animDuration.value
  return `${t.toFixed(2)}s${d > 0 ? ` / ${d.toFixed(2)}s` : ''}`
})

// ── Expose ─────────────────────────────────────────────────────────────────────

defineExpose({
  adapter,
  pixiApp,
  getTrackTime,
  seekTo:             seekToTime,
  setAnimationByName,
  setViewport,
  getAnimationNames:  () => animationNames.value,
})

// ── Pixi app lifecycle ─────────────────────────────────────────────────────────

onMounted(async () => {
  const canvas    = canvasRef.value!
  const container = containerRef.value!
  container.addEventListener('wheel', onWheel, { passive: false })

  try {
    if (!versionStore.pixiVersion) return
    const { width, height } = container.getBoundingClientRect()
    pixiAppInst = await createPixiApp(
      versionStore.pixiVersion,
      canvas,
      Math.max(width, 1),
      Math.max(height, 1),
    )
    pixiApp.value = pixiAppInst

    // Apply initial bg
    pixiAppInst.setBackground(bgColor.value)

    // FPS + time ticker
    tickerFn = () => {
      fps.value = Math.round(pixiAppInst!.ticker.FPS)
      if (adapterInst) {
        const states = adapterInst.getTrackStates()
        const t0 = states.find(s => s.trackIndex === 0)
        if (t0) {
          currentTime.value  = t0.time
          animDuration.value = t0.duration
        }
      }
    }
    pixiAppInst.ticker.add(tickerFn)

    // Load initial fileSet if already provided (handles async init race)
    if (props.fileSet) {
      await loadFileSet(props.fileSet)
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to initialize canvas'
  }
})

onUnmounted(() => {
  containerRef.value?.removeEventListener('wheel', onWheel)
  if (animNotFoundTimer) clearTimeout(animNotFoundTimer)
  destroyAdapter()
  if (pixiAppInst && tickerFn) pixiAppInst.ticker.remove(tickerFn)
  pixiAppInst?.destroy()
  pixiAppInst = null
  pixiApp.value = null
})

useResizeObserver(containerRef, ([entry]) => {
  const { width, height } = entry.contentRect
  if (width > 0 && height > 0) {
    pixiAppInst?.resize(width, height)
    baseX.value = width / 2
    baseY.value = height * 0.5
    applyViewport()
  }
})

// ── Watch fileSet prop ─────────────────────────────────────────────────────────

watch(
  () => props.fileSet,
  async (fileSet, oldFileSet) => {
    if (fileSet === oldFileSet) return
    if (!fileSet) { destroyAdapter(); return }
    await loadFileSet(fileSet)
  },
)

// ── Load / destroy ─────────────────────────────────────────────────────────────

async function loadFileSet(fileSet: FileSet) {
  if (!pixiAppInst) return
  destroyAdapter()

  isLoading.value = true
  loadError.value = null

  try {
    if (!versionStore.pixiVersion || !versionStore.spineVersion) return
    const newAdapter = await createSpineAdapter(versionStore.pixiVersion, versionStore.spineVersion)
    await newAdapter.load(fileSet)
    newAdapter.mount(pixiAppInst.stage)
    adapterInst   = newAdapter
    adapter.value = newAdapter

    // Grab spine container reference
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spineObj = (pixiAppInst.stage as any).children?.at(-1) ?? null

    // Center viewport
    const { width, height } = containerRef.value!.getBoundingClientRect()
    baseX.value = width  / 2
    baseY.value = height * 0.5
    resetView()

    // Start first animation
    const anims = newAdapter.animations
    if (anims.length > 0) {
      currentAnimName.value = anims[0]
      newAdapter.setAnimation(0, anims[0], true)
      isPlaying.value = true
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load spine'
  } finally {
    isLoading.value = false
  }
}

function destroyAdapter() {
  if (!adapterInst) return
  adapterInst.destroy()
  adapterInst   = null
  adapter.value = null
  spineObj      = null
  currentAnimName.value = null
  isPlaying.value       = false
  currentTime.value     = 0
  animDuration.value    = 0
}

// ── Viewport ──────────────────────────────────────────────────────────────────

function applyViewport() {
  if (!spineObj) return
  spineObj.x = baseX.value + posX.value
  spineObj.y = baseY.value + posY.value
  spineObj.scale.set(zoom.value)
}

function resetView() {
  posX.value = 0
  posY.value = 0
  zoom.value = 1
  applyViewport()
}

function onResetView() {
  resetView()
  emitViewport()
}

function onWheel(e: WheelEvent) {
  if (!spineObj || !containerRef.value) return
  e.preventDefault()

  const rect = containerRef.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  const dz = e.deltaMode === 0
    ? Math.exp(-e.deltaY * 0.004)
    : e.deltaY < 0 ? 1.15 : 1 / 1.15

  const newZoom = Math.min(20, Math.max(0.05, zoom.value * dz))
  if (newZoom === zoom.value) return

  // Zoom towards cursor
  const spX = (mx - baseX.value - posX.value) / zoom.value
  const spY = (my - baseY.value - posY.value) / zoom.value
  posX.value = mx - baseX.value - spX * newZoom
  posY.value = my - baseY.value - spY * newZoom
  zoom.value = newZoom
  applyViewport()
  emitViewport()
}

function onPanStart(e: MouseEvent) {
  if (e.button !== 0) return
  isPanning.value = true
  panStart = { x: e.clientX, y: e.clientY, px: posX.value, py: posY.value }
}

function onPanMove(e: MouseEvent) {
  if (!isPanning.value) return
  posX.value = panStart.px + e.clientX - panStart.x
  posY.value = panStart.py + e.clientY - panStart.y
  applyViewport()
  emitViewport()
}

function onPanEnd() {
  isPanning.value = false
}

function onBgColorInput(e: Event) {
  const hex = (e.target as HTMLInputElement).value
  bgColor.value = parseInt(hex.slice(1), 16)
  pixiAppInst?.setBackground(bgColor.value)
}

function emitViewport() {
  emit('viewport-change', { posX: posX.value, posY: posY.value, zoom: zoom.value })
}

// ── Public: setViewport (called by parent for sync) ────────────────────────────

function setViewport(vp: { posX: number; posY: number; zoom: number }) {
  posX.value = vp.posX
  posY.value = vp.posY
  zoom.value = vp.zoom
  applyViewport()
}

// ── Control handlers ───────────────────────────────────────────────────────────

function togglePlay() {
  if (!adapterInst || !isMaster.value) return
  isPlaying.value = !isPlaying.value
  adapterInst.setTimeScale(isPlaying.value ? 1 : 0)
}

function onAnimChange(e: Event) {
  const name = (e.target as HTMLSelectElement).value
  if (!adapterInst || !name) return
  currentAnimName.value = name
  adapterInst.setAnimation(0, name, true)
  isPlaying.value = true
  emit('anim-change', name)
}

// ── Public methods (exposed) ───────────────────────────────────────────────────

function getTrackTime(): number {
  if (!adapterInst) return 0
  return adapterInst.getTrackStates().find(s => s.trackIndex === 0)?.time ?? 0
}

function seekToTime(time: number) {
  adapterInst?.seekTo(0, time)
}

function setAnimationByName(name: string) {
  if (!adapterInst) return
  if (adapterInst.animations.includes(name)) {
    currentAnimName.value = name
    adapterInst.setAnimation(0, name, true)
  } else {
    showAnimNotFound(name)
  }
}

// ── Drag-and-drop (direct file load) ──────────────────────────────────────────

async function onDrop(e: DragEvent) {
  isDragging.value = false
  if (!e.dataTransfer) return
  const files = Array.from(e.dataTransfer.files)
  if (files.length === 0) return
  const { error } = await compareStore.loadDirect(props.side, files)
  if (error) loadError.value = error
}
</script>

<style scoped>
.canvas-slot {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #111113;
  overflow: hidden;
  cursor: grab;
  user-select: none;
}

.canvas-slot--pan   { cursor: grabbing; }
.canvas-slot--empty { cursor: default; }
.canvas-slot--drag  { outline: 2px dashed #7c6af5; outline-offset: -2px; }

.slot-canvas {
  flex: 1;
  min-height: 0;
  display: block;
  width: 100%;
  height: 100%;
}

/* ── Empty state ─────────────────────────────────────────────────── */
.empty-state {
  position: absolute;
  inset: 0 0 36px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  pointer-events: none;
}

.empty-icon  { font-size: 2rem; color: rgba(255,255,255,0.12); line-height: 1; }
.empty-label { font-size: 0.85rem; color: rgba(255,255,255,0.3); font-weight: 500; }
.empty-hint  { font-size: 0.72rem; color: rgba(255,255,255,0.15); }

/* ── Overlays ─────────────────────────────────────────────────────── */
.loading-overlay,
.error-overlay {
  position: absolute;
  inset: 0 0 36px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  pointer-events: none;
}

.loading-text { color: rgba(255,255,255,0.4); }
.error-text   { color: #f87171; }

.overlay-tl {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border-radius: 6px;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(4px);
  pointer-events: all;
  z-index: 10;
}

.bg-input {
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  background: none;
  flex-shrink: 0;
  opacity: 0.75;
  transition: opacity 0.15s;
}
.bg-input:hover { opacity: 1; }
.bg-input::-webkit-color-swatch-wrapper { padding: 0; }
.bg-input::-webkit-color-swatch { border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; }

.overlay-hint {
  font-size: 0.65rem;
  color: rgba(255,255,255,0.35);
  user-select: none;
  cursor: default;
  title: 'Double-click to center';
}

.overlay-tr {
  position: absolute;
  top: 10px;
  right: 10px;
  pointer-events: none;
  z-index: 10;
}

.fps-badge {
  font-size: 0.72rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(4px);
}

.fps--good { color: #4ade80; }
.fps--ok   { color: #facc15; }
.fps--bad  { color: #f87171; }

/* ── Control bar ─────────────────────────────────────────────────── */
.control-bar {
  flex-shrink: 0;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  z-index: 5;
  cursor: default;
}

.slot-side-badge {
  font-size: 0.7rem;
  font-weight: 700;
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.45);
  border-radius: 4px;
  padding: 1px 6px;
  flex-shrink: 0;
}

.anim-select {
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  background: #1e1e24;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  color: #d4d4d8;
  padding: 2px 6px;
  height: 24px;
  cursor: pointer;
}

.anim-select option {
  background: #1e1e24;
  color: #d4d4d8;
}

.ctrl-btn {
  background: none;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  color: rgba(255,255,255,0.6);
  font-size: 0.75rem;
  padding: 2px 8px;
  cursor: pointer;
  height: 24px;
  flex-shrink: 0;
  transition: border-color 0.12s, color 0.12s;
}
.ctrl-btn:hover { border-color: #7c6af5; color: #9d8fff; }

.sync-badge {
  font-size: 0.72rem;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  flex-shrink: 0;
  color: rgba(255,255,255,0.3);
}
.sync-badge--on { color: #4ade80; border-color: rgba(74, 222, 128, 0.2); }

.time-display {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.4);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.fps-inline {
  font-size: 0.65rem;
  color: rgba(255,255,255,0.25);
  flex-shrink: 0;
}

.empty-bar-hint {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.2);
}

/* ── Anim not-found toast ─────────────────────────────────────────── */
.anim-not-found-toast {
  position: absolute;
  bottom: 46px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 20, 26, 0.88);
  border: 1px solid rgba(248, 113, 113, 0.4);
  color: #f87171;
  font-size: 0.72rem;
  padding: 5px 12px;
  border-radius: 6px;
  backdrop-filter: blur(6px);
  pointer-events: none;
  white-space: nowrap;
  z-index: 20;
}

.anim-toast-enter-active,
.anim-toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.anim-toast-enter-from,
.anim-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}
</style>
