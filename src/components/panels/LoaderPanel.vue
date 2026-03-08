<!--
 * @file LoaderPanel.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="loader-panel">
    <!-- Drop zone -->
    <div
      class="drop-zone"
      :class="{
        'drop-zone--over': isDragging,
        'drop-zone--has-files': loaderStore.hasFiles,
      }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <template v-if="!loaderStore.hasFiles">
        <div class="drop-icon">⬇</div>
        <p class="drop-text">Drop Spine files or folder here</p>
        <p class="drop-hint">skeleton.json · skeleton.atlas · images</p>
      </template>
      <template v-else>
        <p class="drop-text-small">{{ loaderStore.pendingFileInfos.length }} files ready</p>
        <p class="drop-hint">Drop again to replace</p>
      </template>
    </div>

    <!-- File pickers -->
    <div class="picker-row">
      <n-button size="small" ghost @click="fileInputRef?.click()">
        Choose files
      </n-button>
      <n-button size="small" ghost @click="folderInputRef?.click()">
        Choose folder
      </n-button>
      <input
        ref="fileInputRef"
        type="file"
        multiple
        style="display:none"
        accept=".json,.skel,.atlas,.png,.jpg,.jpeg,.webp,.avif"
        @change="onFileInput"
      />
      <input
        ref="folderInputRef"
        type="file"
        style="display:none"
        webkitdirectory
        @change="onFileInput"
      />
    </div>

    <!-- File list -->
    <div v-if="loaderStore.hasFiles" class="file-list">
      <div
        v-for="info in loaderStore.pendingFileInfos"
        :key="info.name"
        class="file-row"
      >
        <span class="file-type-badge" :class="`file-type-badge--${info.type}`">
          {{ TYPE_LABELS[info.type] }}
        </span>
        <span class="file-name" :title="info.name">{{ info.name }}</span>
        <span class="file-size">{{ formatSize(info.size) }}</span>
      </div>
    </div>

    <!-- Version mismatch warning -->
    <n-alert
      v-if="versionMismatch"
      type="warning"
      :bordered="false"
      class="version-alert"
    >
      Detected <strong>Spine {{ loaderStore.detectedVersion }}</strong>,
      selected <strong>{{ versionStore.spineVersion }}</strong>.
      Loading may fail.
    </n-alert>

    <!-- Load error -->
    <n-alert
      v-if="loadError"
      type="error"
      :bordered="false"
      class="version-alert"
      closable
      @close="loadError = null"
    >
      {{ loadError }}
    </n-alert>

    <!-- Actions -->
    <div class="actions">
      <n-button
        size="small"
        :disabled="!loaderStore.hasFiles"
        @click="loaderStore.clear()"
      >
        Clear
      </n-button>
      <n-button
        type="primary"
        size="small"
        :disabled="!loaderStore.hasFiles"
        :loading="isLoading"
        @click="onLoad"
      >
        Load →
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { classifyFiles, getFilesFromDataTransfer } from '@/core/utils/fileLoader'
import { detectSpineVersion, isCompatible } from '@/core/utils/versionDetector'
import { useLoaderStore } from '@/core/stores/useLoaderStore'
import { useVersionStore } from '@/core/stores/useVersionStore'
import type { FileSet, SpineFileType } from '@/core/types/FileSet'

const emit = defineEmits<{ load: [fileSet: FileSet] }>()

const loaderStore  = useLoaderStore()
const versionStore = useVersionStore()

const isDragging = ref(false)
const isLoading  = ref(false)
const loadError  = ref<string | null>(null)
const fileInputRef   = ref<HTMLInputElement | null>(null)
const folderInputRef = ref<HTMLInputElement | null>(null)

const TYPE_LABELS: Record<SpineFileType, string> = {
  'skeleton-json': 'JSON',
  'skeleton-skel': 'SKEL',
  atlas:           'ATLAS',
  image:           'IMG',
}

const versionMismatch = computed(() => {
  const det = loaderStore.detectedVersion
  const sel = versionStore.spineVersion
  if (!det || !sel) return false
  return !isCompatible(det, sel)
})

async function handleFiles(files: File[]) {
  if (files.length === 0) return
  isDragging.value  = false
  loadError.value   = null
  loaderStore.setPendingFiles(files)
}

async function onDrop(e: DragEvent) {
  if (!e.dataTransfer) return
  const files = await getFilesFromDataTransfer(e.dataTransfer)
  await handleFiles(files)
}

function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  handleFiles(Array.from(input.files))
  input.value = '' // allow re-selecting the same files
}

async function onLoad() {
  isLoading.value = true
  loadError.value = null

  const result = await classifyFiles(loaderStore.pendingFiles)

  if (!result.ok) {
    loadError.value = result.error
    isLoading.value = false
    return
  }

  const version = result.fileSet.skeleton.type === 'skeleton-json'
    ? detectSpineVersion(result.fileSet.skeleton.fileBody as string)
    : null

  loaderStore.setFileSet(result.fileSet, version)
  isLoading.value = false
  emit('load', result.fileSet)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style scoped>
.loader-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  height: 100%;
  overflow-y: auto;
}

/* ── Drop zone ──────────────────────────────────────── */
.drop-zone {
  border: 1.5px dashed var(--c-border);
  border-radius: 10px;
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: default;
  transition: border-color 0.15s, background 0.15s;
  text-align: center;
}

.drop-zone--over {
  border-color: #7c6af5;
  background: rgba(124, 106, 245, 0.06);
}

.drop-zone--has-files {
  border-color: #2a6e3e;
  background: rgba(74, 222, 128, 0.04);
  padding: 14px 12px;
}

.drop-icon {
  font-size: 1.6rem;
  line-height: 1;
  color: var(--c-text-ghost);
}

.drop-text {
  font-size: 0.85rem;
  color: var(--c-text-muted);
  font-weight: 500;
}

.drop-text-small {
  font-size: 0.85rem;
  color: #4ade80;
  font-weight: 600;
}

.drop-hint {
  font-size: 0.72rem;
  color: var(--c-text-ghost);
}

/* ── File pickers ───────────────────────────────────── */
.picker-row {
  display: flex;
  gap: 8px;
}

/* ── File list ──────────────────────────────────────── */
.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  padding: 3px 0;
}

.file-type-badge {
  flex-shrink: 0;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 4px;
  min-width: 36px;
  text-align: center;
}

.file-type-badge--skeleton-json { background: #1e3a5f; color: #60a5fa; }
.file-type-badge--skeleton-skel { background: #1e3a5f; color: #93c5fd; }
.file-type-badge--atlas          { background: #3b2d5a; color: #c4b5fd; }
.file-type-badge--image          { background: #1e3d2e; color: #86efac; }

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-text-dim);
}

.file-size {
  flex-shrink: 0;
  color: var(--c-text-faint);
  font-variant-numeric: tabular-nums;
}

/* ── Alerts ─────────────────────────────────────────── */
.version-alert {
  font-size: 0.8rem;
}

/* ── Actions ────────────────────────────────────────── */
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: auto;
  padding-top: 4px;
}
</style>
