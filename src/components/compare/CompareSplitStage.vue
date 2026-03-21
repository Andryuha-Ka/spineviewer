<!--
 * @file CompareSplitStage.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="split-stage">
    <!-- Left canvas slot -->
    <CompareCanvasSlot
      ref="leftSlotRef"
      side="left"
      :file-set="leftFileSet"
      @viewport-change="onLeftViewportChange"
      @anim-change="onLeftAnimChange"
    />

    <!-- Resize handle -->
    <div
      class="split-handle"
      @mousedown.prevent="onResizeStart"
      title="Drag to resize"
    >
      <div class="split-handle-inner" />
    </div>

    <!-- Right canvas slot -->
    <CompareCanvasSlot
      ref="rightSlotRef"
      side="right"
      :file-set="rightFileSet"
      @viewport-change="onRightViewportChange"
      @anim-change="onRightAnimChange"
    />
  </div>
</template>

<script setup lang="ts">
import CompareCanvasSlot from './CompareCanvasSlot.vue'
import { useCompareStore } from '@/core/stores/useCompareStore'
import { useLoaderStore } from '@/core/stores/useLoaderStore'
import type { FileSet } from '@/core/types/FileSet'
import { compareSpines, type SpineData } from '@/core/utils/spineCompare'

// ── Refs ───────────────────────────────────────────────────────────────────────

const leftSlotRef  = ref<InstanceType<typeof CompareCanvasSlot> | null>(null)
const rightSlotRef = ref<InstanceType<typeof CompareCanvasSlot> | null>(null)

// ── Stores ─────────────────────────────────────────────────────────────────────

const compareStore = useCompareStore()
const loaderStore  = useLoaderStore()

// ── Resolve FileSets from compare slots ────────────────────────────────────────

function resolveFileSet(slot: typeof compareStore.leftSlot): FileSet | null {
  if (!slot) return null
  if (slot.source === 'direct') return slot.fileSet
  // source === 'loaded'
  const spineSlot = loaderStore.spineSlots[slot.slotIndex]
  return spineSlot?.fileSet ?? null
}

const leftFileSet  = computed(() => resolveFileSet(compareStore.leftSlot))
const rightFileSet = computed(() => resolveFileSet(compareStore.rightSlot))

// ── Viewport sync ──────────────────────────────────────────────────────────────

let isSyncingViewport = false

type Viewport = { posX: number; posY: number; zoom: number }

function onLeftViewportChange(vp: Viewport) {
  if (!compareStore.syncViewport || isSyncingViewport) return
  isSyncingViewport = true
  rightSlotRef.value?.setViewport(vp)
  isSyncingViewport = false
}

function onRightViewportChange(vp: Viewport) {
  if (!compareStore.syncViewport || isSyncingViewport) return
  isSyncingViewport = true
  leftSlotRef.value?.setViewport(vp)
  isSyncingViewport = false
}

// ── Animation sync ─────────────────────────────────────────────────────────────

function onLeftAnimChange(name: string) {
  if (!compareStore.syncEnabled) return
  rightSlotRef.value?.setAnimationByName(name)
}

function onRightAnimChange(name: string) {
  if (!compareStore.syncEnabled) return
  leftSlotRef.value?.setAnimationByName(name)
}

// ── Playback sync ──────────────────────────────────────────────────────────────

let syncTickerFn: (() => void) | null = null

function startSyncTicker() {
  stopSyncTicker()
  syncTickerFn = () => {
    if (!compareStore.syncEnabled) return
    const masterRef   = compareStore.masterSide === 'left' ? leftSlotRef.value  : rightSlotRef.value
    const secondaryRef = compareStore.masterSide === 'left' ? rightSlotRef.value : leftSlotRef.value
    if (!masterRef?.adapter || !secondaryRef?.adapter) return
    const t = masterRef.getTrackTime()
    secondaryRef.seekTo(t)
  }

  // Attach to master's ticker
  const masterRef = compareStore.masterSide === 'left' ? leftSlotRef.value : rightSlotRef.value
  if (masterRef?.pixiApp) {
    masterRef.pixiApp.ticker.add(syncTickerFn)
  }
}

function stopSyncTicker() {
  if (!syncTickerFn) return
  leftSlotRef.value?.pixiApp?.ticker.remove(syncTickerFn)
  rightSlotRef.value?.pixiApp?.ticker.remove(syncTickerFn)
  syncTickerFn = null
}

// Start sync after both slots are mounted
onMounted(() => {
  setTimeout(startSyncTicker, 500) // brief delay to let canvas slots initialize
})

onUnmounted(() => {
  stopSyncTicker()
})

// Re-attach ticker when master side changes or sync toggled
watch(
  () => [compareStore.masterSide, compareStore.syncEnabled] as const,
  () => startSyncTicker(),
)

// ── Diff trigger ───────────────────────────────────────────────────────────────

async function runDiff() {
  const leftSlot  = compareStore.leftSlot
  const rightSlot = compareStore.rightSlot
  if (!leftSlot || !rightSlot) return

  const leftFileSet  = resolveFileSet(leftSlot)
  const rightFileSet = resolveFileSet(rightSlot)

  const bothJson =
    leftFileSet?.skeleton.type  === 'skeleton-json' &&
    rightFileSet?.skeleton.type === 'skeleton-json'

  let dataA: SpineData
  let dataB: SpineData

  if (bothJson && leftFileSet && rightFileSet) {
    try {
      dataA = { source: 'json', raw: JSON.parse(leftFileSet.skeleton.fileBody as string) }
      dataB = { source: 'json', raw: JSON.parse(rightFileSet.skeleton.fileBody as string) }
    } catch {
      compareStore.setDiffStatus('error', 'Failed to parse JSON')
      return
    }
  } else {
    const adA = leftSlotRef.value?.adapter
    const adB = rightSlotRef.value?.adapter
    if (!adA || !adB) {
      compareStore.setDiffStatus('error', 'Adapters not ready — load files first')
      return
    }
    dataA = { source: 'runtime', adapter: adA }
    dataB = { source: 'runtime', adapter: adB }
  }

  compareStore.setDiffStatus('running')
  try {
    const result = await compareSpines(dataA, dataB)
    compareStore.setDiff(result)
  } catch (e) {
    compareStore.setDiffStatus('error', e instanceof Error ? e.message : 'Comparison failed')
  }
}

defineExpose({ runDiff })

// ── Horizontal resize handle ────────────────────────────────────────────────────

const splitRatio = ref(0.5)

function onResizeStart(e: MouseEvent) {
  const startX = e.clientX
  const container = (e.target as HTMLElement).closest('.split-stage') as HTMLElement | null
  if (!container) return
  const totalW = container.clientWidth

  const onMove = (ev: MouseEvent) => {
    const delta = ev.clientX - startX
    const newRatio = Math.min(0.85, Math.max(0.15, splitRatio.value + delta / totalW))
    splitRatio.value = newRatio
    container.style.setProperty('--split-ratio', String(newRatio))
  }

  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  container.style.setProperty('--split-ratio', String(splitRatio.value))
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.split-stage {
  --split-ratio: 0.5;
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Force left/right to respect the ratio */
.split-stage > :deep(.canvas-slot:first-child) {
  flex: 0 0 calc(var(--split-ratio) * 100%);
  width: calc(var(--split-ratio) * 100%);
}

.split-stage > :deep(.canvas-slot:last-child) {
  flex: 1;
  min-width: 0;
}

.split-handle {
  flex-shrink: 0;
  width: 8px;
  background: var(--c-border-dim);
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  z-index: 1;
}

.split-handle:hover,
.split-handle:active {
  background: #7c6af5;
}

.split-handle-inner {
  width: 2px;
  height: 32px;
  border-radius: 2px;
  background: var(--c-text-ghost);
  pointer-events: none;
}

.split-handle:hover .split-handle-inner,
.split-handle:active .split-handle-inner {
  background: white;
}
</style>
