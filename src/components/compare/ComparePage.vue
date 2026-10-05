<!--
 * @file ComparePage.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="compare-page">
    <!-- Toolbar -->
    <CompareToolbar
      @back="onClickBack"
    />

    <!-- Main content area — layout depends on panel position -->
    <div
      class="compare-content"
      :class="`compare-content--${compareStore.diffPanelPos}`"
      :style="contentStyle"
    >
      <!-- Diff panel -->
      <div
        class="diff-panel-wrapper"
        :style="panelStyle"
        :class="`diff-panel-wrapper--${compareStore.diffPanelPos}`"
      >
        <CompareDiffPanel />
        <!-- Resize handle for panel -->
        <div
          class="panel-resize-handle"
          :class="`panel-resize-handle--${compareStore.diffPanelPos}`"
          @mousedown.prevent="onPanelResizeStart"
        />
      </div>

      <!-- Stage -->
      <div class="stage-wrapper">
        <CompareSplitStage ref="splitStageRef" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import CompareToolbar    from './CompareToolbar.vue'
import CompareSplitStage from './CompareSplitStage.vue'
import CompareDiffPanel  from './CompareDiffPanel.vue'
import { useCompareStore } from '@/core/stores/useCompareStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useExportStore } from '@/core/stores/useExportStore'

// ── Props ──────────────────────────────────────────────────────────────────────

const props = defineProps<{
  initLeftSlotId?:  string
  initRightSlotId?: string
}>()

const emit = defineEmits<{ back: [] }>()

// ── Stores ─────────────────────────────────────────────────────────────────────

const compareStore    = useCompareStore()
const fileLoaderStore = useFileLoaderStore()
const skeletonStore  = useSkeletonStore()
const animationStore = useAnimationStore()
const exportStore    = useExportStore()

// ── Refs ───────────────────────────────────────────────────────────────────────

const splitStageRef = ref<InstanceType<typeof CompareSplitStage> | null>(null)

// ── Panel size (persisted) ─────────────────────────────────────────────────────

const PANEL_MIN_SIDE   = 220
const PANEL_MAX_SIDE   = 600
const PANEL_MIN_BOTTOM = 120
const PANEL_MAX_BOTTOM = 500

const panelSideSize = ref(
  Math.min(PANEL_MAX_SIDE, Math.max(PANEL_MIN_SIDE,
    parseInt(localStorage.getItem('svp:compare:panelWidth') ?? '320'),
  )),
)

const panelBottomSize = ref(
  Math.min(PANEL_MAX_BOTTOM, Math.max(PANEL_MIN_BOTTOM,
    parseInt(localStorage.getItem('svp:compare:panelHeight') ?? '260'),
  )),
)

watch(panelSideSize,   v => localStorage.setItem('svp:compare:panelWidth', String(v)))
watch(panelBottomSize, v => localStorage.setItem('svp:compare:panelHeight', String(v)))

const panelStyle = computed(() => {
  const pos = compareStore.diffPanelPos
  if (pos === 'bottom') return { height: panelBottomSize.value + 'px', width: '100%' }
  return { width: panelSideSize.value + 'px', height: '100%' }
})

const contentStyle = computed(() => {
  const pos = compareStore.diffPanelPos
  if (pos === 'bottom') return { flexDirection: 'column-reverse' as const }
  if (pos === 'left')   return { flexDirection: 'row' as const }
  return { flexDirection: 'row-reverse' as const }
})

// ── Panel resize ───────────────────────────────────────────────────────────────

function onPanelResizeStart(e: MouseEvent) {
  const pos     = compareStore.diffPanelPos
  const startX  = e.clientX
  const startY  = e.clientY
  const startSz = pos === 'bottom' ? panelBottomSize.value : panelSideSize.value

  const onMove = (ev: MouseEvent) => {
    if (pos === 'bottom') {
      const delta = startY - ev.clientY           // drag up = bigger panel
      panelBottomSize.value = Math.min(PANEL_MAX_BOTTOM, Math.max(PANEL_MIN_BOTTOM, startSz + delta))
    } else if (pos === 'left') {
      const delta = ev.clientX - startX
      panelSideSize.value = Math.min(PANEL_MAX_SIDE, Math.max(PANEL_MIN_SIDE, startSz + delta))
    } else {
      const delta = startX - ev.clientX           // drag left = bigger panel (right-side panel)
      panelSideSize.value = Math.min(PANEL_MAX_SIDE, Math.max(PANEL_MIN_SIDE, startSz + delta))
    }
  }

  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ── Back ───────────────────────────────────────────────────────────────────────

function onClickBack() {
  if (!window.confirm('Reset and return to version picker?')) return
  compareStore.reset()
  skeletonStore.clear()
  animationStore.reset()
  fileLoaderStore.clear()
  exportStore.finish()
  emit('back')
}

// ── Initialize slots from props ────────────────────────────────────────────────

onMounted(() => {
  const left = fileLoaderStore.spineSlots.find(s => s.id === props.initLeftSlotId)
  if (left && !left.error) compareStore.setSide('left', { source: 'loaded', slotId: left.id, label: left.name })
  const right = fileLoaderStore.spineSlots.find(s => s.id === props.initRightSlotId)
  if (right && !right.error) compareStore.setSide('right', { source: 'loaded', slotId: right.id, label: right.name })
})

</script>

<style scoped>
.compare-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--c-bg);
  overflow: hidden;
}

.compare-content {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* ── Diff panel wrapper ───────────────────────────────────────────── */
.diff-panel-wrapper {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
}

.diff-panel-wrapper--left,
.diff-panel-wrapper--right {
  height: 100%;
}

.diff-panel-wrapper--bottom {
  width: 100%;
  flex-shrink: 0;
}

/* ── Stage wrapper ────────────────────────────────────────────────── */
.stage-wrapper {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* ── Panel resize handles ─────────────────────────────────────────── */
.panel-resize-handle {
  position: absolute;
  background: var(--c-border-dim);
  transition: background 0.15s;
  z-index: 10;
}

.panel-resize-handle:hover,
.panel-resize-handle:active {
  background: var(--c-accent);
}

.panel-resize-handle--left {
  top: 0; right: 0; bottom: 0;
  width: 4px;
  cursor: col-resize;
}

.panel-resize-handle--right {
  top: 0; left: 0; bottom: 0;
  width: 4px;
  cursor: col-resize;
}

.panel-resize-handle--bottom {
  top: 0; left: 0; right: 0;
  height: 4px;
  cursor: row-resize;
}
</style>
