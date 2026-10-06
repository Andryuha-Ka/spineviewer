<!--
 * @file ViewerPage.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="viewer">
    <header class="toolbar">
      <button class="back-btn" @click="onClickBack">← Back</button>
      <span class="version-tag">
        Pixi {{ versionStore.pixiVersion }} · Spine {{ activeSpineVersion }}
      </span>
      <span v-if="slotSelectionStore.activeSlot?.fileSet" class="spine-name-tag" :class="`spine-name-tag--${slotSelectionStore.activeSlot.fileSet.skeleton.type}`">
        <span
          class="spine-type-badge"
          :class="`spine-type-badge--${slotSelectionStore.activeSlot.fileSet.skeleton.type}`"
        >{{ slotSelectionStore.activeSlot.fileSet.skeleton.type === 'skeleton-json' ? 'JSON' : 'SKEL' }}</span>
        {{ slotSelectionStore.activeSlot.fileSet.skeleton.filename }}
      </span>
      <div class="toolbar-spacer" />
      <ToolbarTrackControls
        @set-animation="onSetAnimation"
        @set-track-loop="onSetTrackLoop"
        @clear-track="onClearTrack"
        @set-skins="onSetSkins"
      />
      <n-button
        size="small"
        :type="animationStore.isPlaying ? 'default' : 'primary'"
        :disabled="!skeletonStore.isLoaded || animationStore.tracks.length === 0"
        class="toolbar-play-btn"
        @click="animationStore.isPlaying ? animationStore.pause() : animationStore.play()"
      >{{ animationStore.isPlaying ? '⏸' : (animationStore.isPaused ? '▶ Resume' : '▶ Play') }}</n-button>
      <n-button
        size="small"
        class="compare-toolbar-btn"
        @click="emit('open-compare', { left: slotSelectionStore.activeSlot?.parentSlotId ?? slotSelectionStore.activeSlotId ?? undefined })"
        title="Open Compare mode"
      >⇄ Compare</n-button>
      <SettingsPopover />
      <HelpModal />
    </header>

    <div class="content">
      <aside class="side-panel" :style="{ width: panelWidth + 'px' }">
        <n-tabs
          v-model:value="activeTab"
          type="line"
          size="small"
          :tabs-padding="8"
          class="side-tabs"
        >
          <n-tab-pane name="spines" tab="Spines" class="tab-pane">
            <SpinesPanel />
          </n-tab-pane>
          <n-tab-pane name="animation" tab="Anim" class="tab-pane">
            <AnimationPanel
              @set-animation="onSetAnimation"
              @add-animation="onAddAnimation"
              @set-track-loop="onSetTrackLoop"
              @set-track-mix-options="onSetTrackMixOptions"
              @remove-queue-entry="onRemoveQueueEntry"
              @clear-track="onClearTrack"
              @clear-tracks="onClearTracks"
              @seek-delta="onSeekDelta"
              @set-skins="onSetSkins"
            />
          </n-tab-pane>
          <n-tab-pane name="inspector" tab="Insp" class="tab-pane">
            <SkeletonPanel />
          </n-tab-pane>
          <n-tab-pane v-if="skeletonStore.freeBones.length > 0 || skeletonStore.sliders.length > 0" name="bones" tab="Bones" class="tab-pane">
            <FreeBonePanel />
          </n-tab-pane>
          <n-tab-pane name="atlas" tab="Atlas" class="tab-pane">
            <AtlasInspector />
          </n-tab-pane>
          <n-tab-pane name="perf" tab="Perf" class="tab-pane">
            <ProfilerPanel />
          </n-tab-pane>
          <n-tab-pane name="compl" tab="Compl" class="tab-pane">
            <ComplexityPanel />
          </n-tab-pane>
          <n-tab-pane name="export" tab="Export" class="tab-pane">
            <ExportPanel
              @capture-png="onCapturePng"
              @capture-pose="onCapturePose"
              @capture-sheet="onCaptureSheet"
              @capture-gif="onCaptureGif"
              @cancel-export="onCancelExport"
            />
          </n-tab-pane>
        </n-tabs>
      </aside>

      <div
        class="resize-handle"
        @mousedown.prevent="onResizeStart"
      />

      <div
        class="stage-area"
        @dragover.prevent
        @drop.prevent="onCanvasDrop"
      >
        <PreviewStage ref="stageRef" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PreviewStage from '@/components/stage/PreviewStage.vue'
import AnimationPanel from '@/components/panels/AnimationPanel.vue'
import SkeletonPanel from '@/components/panels/SkeletonPanel.vue'
import FreeBonePanel from '@/components/panels/FreeBonePanel.vue'
import SpinesPanel from '@/components/panels/SpinesPanel.vue'
import AtlasInspector from '@/components/panels/AtlasInspector.vue'
import ProfilerPanel    from '@/components/panels/ProfilerPanel.vue'
import ComplexityPanel from '@/components/panels/ComplexityPanel.vue'
import ExportPanel from '@/components/panels/ExportPanel.vue'
import SettingsPopover from '@/components/ui/SettingsPopover.vue'
import HelpModal from '@/components/ui/HelpModal.vue'
import ToolbarTrackControls from '@/components/ui/ToolbarTrackControls.vue'
import { usePanelResize } from '@/core/composables/usePanelResize'
import { useViewerKeyboard } from '@/core/composables/useViewerKeyboard'
import { useExportHandlers } from '@/core/composables/useExportHandlers'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useSlotUIStore } from '@/core/stores/useSlotUIStore'
import { useExportStore } from '@/core/stores/useExportStore'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'
import { groupSpineFiles, readFileAsDataURL } from '@/core/utils/fileLoader'
import { validateSpineFileSet } from '@/core/utils/spineValidator'
import { runtimeSpineVersion, spineVersionProblem } from '@/core/utils/versionDetector'
import type { TrackMixOptions } from '@/core/types/ISpineAdapter'

const emit = defineEmits<{
  back:           []
  'open-compare': [payload?: { left?: string }]
}>()

const versionStore     = useVersionStore()
const skeletonStore    = useSkeletonStore()
const animationStore   = useAnimationStore()
const fileLoaderStore    = useFileLoaderStore()
const slotSelectionStore = useSlotSelectionStore()
const slotUIStore        = useSlotUIStore()
const exportStore      = useExportStore()
const layersStore      = useImageLayersStore()
const stageRef         = ref<InstanceType<typeof PreviewStage> | null>(null)
const activeSpineVersion = computed(() => {
  const fileSet = slotSelectionStore.activeSlot?.fileSet
  const { pixiVersion: pixi, spineVersion: selected } = versionStore
  return fileSet && pixi && selected ? runtimeSpineVersion(fileSet, pixi, selected) : selected
})
const activeTab        = ref<'spines' | 'animation' | 'inspector' | 'bones' | 'atlas' | 'perf' | 'compl' | 'export'>('animation')

// Auto-pin active slot when it gets its first animation track and globalPinEnabled is on.
// Lives here (not SpinesPanel) so it stays active even when Spines tab is not open.
watch(() => animationStore.tracks.length, (newLen, oldLen) => {
  if (oldLen === 0 && newLen > 0 && slotUIStore.globalPinEnabled) {
    const id = slotSelectionStore.activeSlotId
    if (id) slotSelectionStore.setPinned(id, true)
  }
})

const { panelWidth, onResizeStart } = usePanelResize()
useViewerKeyboard(stageRef)
const { onCapturePng, onCapturePose, onCaptureSheet, onCaptureGif, onCancelExport } = useExportHandlers(stageRef)

function onClickBack() {
  if (!window.confirm('Reset viewer and return to version picker?')) return
  skeletonStore.clear()
  animationStore.reset()
  fileLoaderStore.clear()
  exportStore.finish()
  emit('back')
}

async function onCanvasDrop(e: DragEvent) {
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (files.length === 0) return

  const imageExts = /\.(png|jpe?g|webp|gif|avif)$/i
  const spineExts = /\.(json|skel|atlas)$/i
  const hasImages = files.some(f => imageExts.test(f.name))
  const hasSpine  = files.some(f => spineExts.test(f.name))

  if (!hasSpine && hasImages) {
    const imgFile = files.find(f => imageExts.test(f.name))!
    const dataUrl = await readFileAsDataURL(imgFile)
    layersStore.addLayer({ name: imgFile.name, dataUrl, scale: 1 })
    activeTab.value = 'spines'
    return
  }

  if (hasSpine) {
    const result = await groupSpineFiles(files)
    if (result.globalError) {
      window.alert(result.globalError)
      return
    }
    const added: string[] = []
    for (const slot of result.slots) {
      if (!slot.error && slot.fileSet) {
        const errs = validateSpineFileSet(slot.fileSet)
        const versionProblem = versionStore.spineVersion && spineVersionProblem(slot.fileSet, versionStore.spineVersion)
        if (versionProblem) errs.push(versionProblem)
        if (errs.length > 0) slot.validationErrors = errs
      }
      fileLoaderStore.addSlot(slot)
      added.push(slot.id)
    }
    layersStore.placeOnTop(added.filter(id => fileLoaderStore.spineSlots.some(s => s.id === id)))
  }
}

function onSetAnimation(track: number, name: string, loop: boolean) {
  stageRef.value?.setAnimation(track, name, loop)
}

function onAddAnimation(track: number, name: string, loop: boolean) {
  stageRef.value?.addAnimation(track, name, loop)
}

function onSetTrackLoop(track: number, loop: boolean) {
  stageRef.value?.setTrackLoop(track, loop)
}

function onSetTrackMixOptions(track: number, patch: Partial<TrackMixOptions>) {
  stageRef.value?.setTrackMixOptions(track, patch)
}

function onRemoveQueueEntry(track: number, index: number) {
  stageRef.value?.removeQueueEntry(track, index)
}

function onClearTrack(track: number) {
  stageRef.value?.clearTrack(track)
}

function onClearTracks() {
  stageRef.value?.clearTracks()
}

function onSeekDelta(track: number, delta: number) {
  stageRef.value?.seekDelta(track, delta)
}

function onSetSkins(names: string[]) {
  stageRef.value?.setSkins(names)
}
</script>

<style scoped>
.viewer {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--c-bg);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--c-border-dim);
  flex-shrink: 0;
}

.toolbar-spacer { flex: 1; }

.toolbar-play-btn    { min-width: 80px; }
.compare-toolbar-btn { flex-shrink: 0; }

.back-btn {
  background: none;
  border: 1px solid var(--c-border);
  color: var(--c-text-muted);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.back-btn:hover {
  color: var(--c-text-dim);
  border-color: var(--c-text-ghost);
}

.version-tag {
  font-size: 0.75rem;
  color: var(--c-text-faint);
}

.spine-name-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.spine-name-tag--skeleton-json,
.spine-name-tag--skeleton-skel { color: var(--c-info); }

.spine-type-badge {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 4px;
  border-radius: 3px;
  min-width: 38px;
  text-align: center;
}

.spine-type-badge--skeleton-json,
.spine-type-badge--skeleton-skel { background: var(--c-info-soft); color: var(--c-info); }

.content {
  display: flex;
  flex: 1;
  min-height: 0;
}

.side-panel {
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.resize-handle {
  width: 4px;
  flex-shrink: 0;
  background: var(--c-border-dim);
  cursor: col-resize;
  transition: background 0.15s;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--c-accent);
}

.stage-area {
  flex: 1;
  min-width: 0;
}

/* ── NTabs full-height layout ─────────────── */
.side-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.side-tabs .n-tabs-nav) {
  flex-shrink: 0;
}

/* Compact tab labels — reduce horizontal padding */
:deep(.side-tabs .n-tabs-tab) {
  padding: 0 8px;
}

:deep(.side-tabs .n-tabs-tab-pad) {
  width: 4px !important;
}

:deep(.side-tabs .n-tab-pane) {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

:deep(.side-tabs .n-tabs-pane-wrapper) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
