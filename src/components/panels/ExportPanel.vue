<!--
 * @file ExportPanel.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="export-panel">

    <div v-if="!skeletonStore.isLoaded" class="empty-hint">
      Load a skeleton to enable export
    </div>

    <template v-else>

      <!-- ── Error ───────────────────────────────────────────── -->
      <div v-if="exportStore.error" class="export-error">
        {{ exportStore.error }}
      </div>

      <!-- ── Progress ───────────────────────────────────────── -->
      <div v-if="exportStore.exporting" class="progress-wrap">
        <div class="progress-row">
          <span class="progress-label">{{ progressLabel }} {{ exportStore.progress }}%</span>
          <n-button size="tiny" type="error" @click="emit('cancel-export')">Stop</n-button>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: exportStore.progress + '%' }" />
        </div>
      </div>

      <!-- ── Screenshot ─────────────────────────────────────── -->
      <section class="section">
        <label class="label">Screenshot</label>
        <p class="hint">Captures the current frame as PNG</p>
        <n-button
          size="small"
          :disabled="exportStore.exporting"
          @click="emit('capture-png')"
        >
          Download PNG
        </n-button>
      </section>

      <div class="divider" />

      <!-- ── Pose JSON ──────────────────────────────────────── -->
      <section class="section">
        <label class="label">Pose JSON</label>
        <p class="hint">Exports current bone transforms</p>
        <n-button
          size="small"
          :disabled="exportStore.exporting"
          @click="emit('capture-pose')"
        >
          Download JSON
        </n-button>
      </section>

      <div class="divider" />

      <!-- ── Sprite Sheet ────────────────────────────────────── -->
      <section class="section">
        <label class="label">Sprite Sheet</label>
        <p class="hint">Renders N frames of an animation into a single PNG grid</p>

        <div class="field-row">
          <span class="field-label">Track</span>
          <n-select
            v-model:value="sheetTrack"
            size="small"
            :options="trackOptions"
            :disabled="trackOptions.length === 0 || exportStore.exporting"
            class="field-select"
          />
        </div>
        <div class="field-row">
          <span class="field-label">Frames</span>
          <n-input-number
            v-model:value="sheetFrameCount"
            size="small"
            :min="2"
            :max="128"
            :step="1"
            :disabled="exportStore.exporting"
            class="field-num"
          />
        </div>
        <div class="field-row">
          <span class="field-label">Columns</span>
          <n-input-number
            v-model:value="sheetCols"
            size="small"
            :min="1"
            :max="32"
            :step="1"
            :disabled="exportStore.exporting"
            class="field-num"
          />
        </div>

        <n-button
          size="small"
          :disabled="sheetTrack === null || exportStore.exporting"
          @click="emit('capture-sheet', { track: sheetTrack!, frameCount: sheetFrameCount, cols: sheetCols })"
        >
          Download Sheet
        </n-button>
      </section>

      <div class="divider" />

      <!-- ── GIF ────────────────────────────────────────────── -->
      <section class="section">
        <label class="label">GIF</label>
        <p class="hint">Records an animation loop as animated GIF</p>

        <div class="field-row">
          <span class="field-label">Track</span>
          <n-select
            v-model:value="gifTrack"
            size="small"
            :options="trackOptions"
            :disabled="trackOptions.length === 0 || exportStore.exporting"
            class="field-select"
          />
        </div>
        <div class="field-row">
          <span class="field-label">FPS</span>
          <n-input-number
            v-model:value="gifFps"
            size="small"
            :min="1"
            :max="30"
            :step="1"
            :disabled="exportStore.exporting"
            class="field-num"
          />
        </div>
        <div class="field-row">
          <span class="field-label">Quality</span>
          <n-input-number
            v-model:value="gifQuality"
            size="small"
            :min="1"
            :max="20"
            :step="1"
            :disabled="exportStore.exporting"
            class="field-num"
          />
          <span class="field-hint">1=best</span>
        </div>

        <n-button
          size="small"
          :disabled="gifTrack === null || exportStore.exporting"
          @click="emit('capture-gif', { track: gifTrack!, fps: gifFps, quality: gifQuality })"
        >
          Download GIF
        </n-button>
      </section>

    </template>
  </div>
</template>

<script setup lang="ts">
import { useExportStore } from '@/core/stores/useExportStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'

const emit = defineEmits<{
  'capture-png':   []
  'capture-pose':  []
  'capture-sheet': [opts: { track: number; frameCount: number; cols: number }]
  'capture-gif':   [opts: { track: number; fps: number; quality: number }]
  'cancel-export': []
}>()

const exportStore   = useExportStore()
const skeletonStore = useSkeletonStore()
const animationStore = useAnimationStore()

// Track options — built from active tracks, auto-selects if only one
const trackOptions = computed(() =>
  animationStore.tracks.map(t => ({
    label: `#${t.trackIndex} — ${t.animationName}`,
    value: t.trackIndex,
  })),
)

const sheetTrack      = ref<number | null>(null)
const sheetFrameCount = ref(16)
const sheetCols       = ref(8)

const gifTrack   = ref<number | null>(null)
const gifFps     = ref(12)
const gifQuality = ref(10)

// Auto-select track when there's only one active
watch(trackOptions, (opts) => {
  if (opts.length === 1) {
    sheetTrack.value = opts[0].value
    gifTrack.value   = opts[0].value
  } else if (opts.length === 0) {
    sheetTrack.value = null
    gifTrack.value   = null
  }
}, { immediate: true })

const progressLabel = computed(() => {
  switch (exportStore.exportType) {
    case 'sheet': return 'Capturing frames…'
    case 'gif':   return 'Encoding GIF…'
    default:      return 'Exporting…'
  }
})
</script>

<style scoped>
.export-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  font-size: 0.75rem;
  color: var(--c-text);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 10px 8px;
}

.divider {
  height: 1px;
  background: var(--c-border-dim);
  flex-shrink: 0;
}

.label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--c-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.hint {
  font-size: 0.7rem;
  color: var(--c-text-ghost);
  margin: 0;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-label {
  width: 52px;
  flex-shrink: 0;
  color: var(--c-text-dim);
  font-size: 0.72rem;
}

.field-select {
  flex: 1;
}

.field-num {
  width: 80px;
}

.field-hint {
  font-size: 0.65rem;
  color: var(--c-text-ghost);
}

/* ── Progress ── */
.progress-wrap {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: 1px solid var(--c-border-dim);
}

.progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.progress-label {
  font-size: 0.7rem;
  color: var(--c-text-dim);
}

.progress-bar {
  height: 4px;
  background: var(--c-raised);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #4ade80;
  transition: width 0.1s linear;
  border-radius: 2px;
}

/* ── Error ── */
.export-error {
  padding: 8px 10px;
  font-size: 0.7rem;
  color: #f87171;
  border-bottom: 1px solid var(--c-border-dim);
}

/* ── Empty ── */
.empty-hint {
  padding: 16px;
  text-align: center;
  color: var(--c-text-ghost);
  font-size: 0.75rem;
}
</style>
