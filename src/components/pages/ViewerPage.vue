<template>
  <div class="viewer">
    <header class="toolbar">
      <button class="back-btn" @click="emit('back')">← Back</button>
      <span class="version-tag">
        Pixi {{ versionStore.pixiVersion }} · Spine {{ versionStore.spineVersion }}
      </span>
    </header>

    <div class="content">
      <aside class="side-panel">
        <n-tabs
          v-model:value="activeTab"
          type="line"
          size="small"
          :tabs-padding="8"
          class="side-tabs"
        >
          <n-tab-pane name="files" tab="Files" class="tab-pane">
            <LoaderPanel @load="onFilesLoaded" />
          </n-tab-pane>
          <n-tab-pane name="animation" tab="Animation" class="tab-pane">
            <AnimationPanel
              @set-animation="onSetAnimation"
              @add-animation="onAddAnimation"
              @set-track-loop="onSetTrackLoop"
              @remove-queue-entry="onRemoveQueueEntry"
              @clear-track="onClearTrack"
              @clear-tracks="onClearTracks"
              @seek-delta="onSeekDelta"
            />
          </n-tab-pane>
        </n-tabs>
      </aside>

      <div class="stage-area">
        <PreviewStage ref="stageRef" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PreviewStage from '@/components/stage/PreviewStage.vue'
import LoaderPanel from '@/components/panels/LoaderPanel.vue'
import AnimationPanel from '@/components/panels/AnimationPanel.vue'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import type { FileSet } from '@/core/types/FileSet'

const emit = defineEmits<{ back: [] }>()

const versionStore  = useVersionStore()
const skeletonStore = useSkeletonStore()
const stageRef      = ref<InstanceType<typeof PreviewStage> | null>(null)
const activeTab     = ref<'files' | 'animation'>('files')

// Auto-switch to animation tab when a skeleton loads
watch(() => skeletonStore.isLoaded, (loaded) => {
  if (loaded) activeTab.value = 'animation'
})

async function onFilesLoaded(fileSet: FileSet) {
  await stageRef.value?.loadSpine(fileSet)
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
</script>

<style scoped>
.viewer {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0d0d0f;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  border-bottom: 1px solid #1e1e24;
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: 1px solid #2a2a2e;
  color: #888;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.back-btn:hover {
  color: #ccc;
  border-color: #444;
}

.version-tag {
  font-size: 0.75rem;
  color: #555;
}

.content {
  display: flex;
  flex: 1;
  min-height: 0;
}

.side-panel {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid #1e1e24;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
