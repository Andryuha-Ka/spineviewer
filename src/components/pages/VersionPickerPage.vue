<!--
 * @file VersionPickerPage.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="picker">
    <div class="picker-top-bar">
      <SettingsPopover />
    </div>

    <header class="picker-header">
      <h1 class="title">
        <span class="t-spine">Spine</span>
        <span class="t-viewer"> Viewer</span>
        <span class="t-pro"> Pro</span>
      </h1>
      <p class="hint">Select render engine and Spine runtime version</p>
    </header>

    <div class="cards">
      <div
        v-for="pixi in ([7, 8] as PixiVersion[])"
        :key="pixi"
        class="card"
        :class="{ 'card--selected': store.pixiVersion === pixi }"
        @click="store.selectVersion(pixi)"
      >
        <div class="card-head">
          <div class="card-engine-label">
            <span class="card-engine">Pixi.js</span>
            <span class="card-ver">{{ pixi }}</span>
          </div>
          <span v-if="pixi === 8" class="badge">recommended</span>
        </div>

        <p class="card-desc">
          {{ pixi === 7 ? 'Stable · broad compatibility' : 'Latest · WebGPU-ready' }}
        </p>

        <n-divider class="divider" />

        <p class="spine-label">Spine runtime</p>

        <div @click.stop>
          <n-radio-group
            :value="store.pixiVersion === pixi ? store.spineVersion : null"
            @update:value="(v: SpineVersion) => store.selectVersion(pixi, v)"
          >
            <n-space vertical :size="10">
              <n-radio
                v-for="v in store.spineOptionsMap[pixi]"
                :key="v"
                :value="v"
              >
                <span class="spine-ver">{{ v }}</span>
              </n-radio>
            </n-space>
          </n-radio-group>
        </div>
      </div>
    </div>

    <!-- Drop zone -->
    <div class="drop-section">
      <div
        class="drop-zone"
        :class="{
          'drop-zone--over':      isDragging,
          'drop-zone--ok':        loaderStore.isLoaded,
          'drop-zone--error':     !!classifyError,
        }"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <template v-if="loaderStore.isLoaded">
          <span class="drop-state-icon">✓</span>
          <p class="drop-text-ok">{{ loaderStore.pendingFileInfos.length }} files ready</p>
          <p class="drop-hint">Drop again to replace</p>
        </template>
        <template v-else-if="classifyError">
          <span class="drop-state-icon drop-state-icon--err">!</span>
          <p class="drop-text-err">{{ classifyError }}</p>
          <p class="drop-hint">Drop again to retry</p>
        </template>
        <template v-else>
          <div class="drop-icon">⬇</div>
          <p class="drop-text">Drop Spine files or folder here</p>
          <p class="drop-hint">skeleton.json · skeleton.atlas · images</p>
        </template>
      </div>

      <div v-if="versionUnknown" class="version-unknown-hint">
        Version not detected — please select the runtime above manually
      </div>

      <div class="picker-row">
        <n-button size="small" ghost @click="fileInputRef?.click()">Choose files</n-button>
        <n-button size="small" ghost @click="folderInputRef?.click()">Choose folder</n-button>
        <n-button
          v-if="loaderStore.hasFiles"
          size="small"
          @click="onClear"
        >Clear</n-button>
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

      <div v-if="loaderStore.pendingFileInfos.length > 0" class="file-list">
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
    </div>

    <n-button
      type="primary"
      size="large"
      class="open-btn"
      :disabled="!store.isReady || !loaderStore.isLoaded"
      @click="emit('open')"
    >
      Open Viewer
    </n-button>

    <div class="shortcuts-hint">
      <span class="shortcuts-title">Keyboard shortcuts</span>
      <div class="shortcuts-list">
        <span class="shortcut-item"><kbd>Space</kbd><span>Play / Pause</span></span>
        <span class="shortcut-item"><kbd>Left</kbd><kbd>Right</kbd><span>Frame step</span></span>
        <span class="shortcut-item"><kbd>R</kbd><span>Reset pose</span></span>
        <span class="shortcut-item"><kbd>L</kbd><span>Toggle loop</span></span>
        <span class="shortcut-item"><kbd>Shift</kbd><kbd>L</kbd><span>Loop all tracks</span></span>
        <span class="shortcut-item"><kbd>0–9</kbd><span>Track</span></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVersionStore, type PixiVersion, type SpineVersion } from '@/core/stores/useVersionStore'
import { useLoaderStore } from '@/core/stores/useLoaderStore'
import { classifyFiles, getFilesFromDataTransfer } from '@/core/utils/fileLoader'
import { detectSpineVersion, detectSpineVersionFromSkel } from '@/core/utils/versionDetector'
import SettingsPopover from '@/components/ui/SettingsPopover.vue'
import type { SpineFileType } from '@/core/types/FileSet'

const emit = defineEmits<{ open: [] }>()

const store       = useVersionStore()
const loaderStore = useLoaderStore()

const isDragging       = ref(false)
const classifyError    = ref<string | null>(null)
const versionUnknown   = ref(false)
const fileInputRef     = ref<HTMLInputElement | null>(null)
const folderInputRef   = ref<HTMLInputElement | null>(null)

const TYPE_LABELS: Record<SpineFileType, string> = {
  'skeleton-json': 'JSON',
  'skeleton-skel': 'SKEL',
  atlas:           'ATLAS',
  image:           'IMG',
}

async function handleFiles(files: File[]) {
  if (files.length === 0) return
  isDragging.value      = false
  classifyError.value   = null
  versionUnknown.value  = false

  // Show file names immediately while classifying
  loaderStore.setPendingFiles(files)

  const result = await classifyFiles(files)
  if (!result.ok) {
    classifyError.value = result.error
    // fileSet stays null → Open Viewer stays disabled
    return
  }

  const { skeleton } = result.fileSet
  const version =
    skeleton.type === 'skeleton-json'
      ? detectSpineVersion(skeleton.fileBody as string)
      : detectSpineVersionFromSkel(skeleton.fileBody as ArrayBuffer)

  loaderStore.setFileSet(result.fileSet, version)

  if (version && version !== 'unknown') {
    autoSelectVersion(version)
  } else {
    versionUnknown.value = true
  }
}

function autoSelectVersion(version: string) {
  if      (version === '3.8') store.selectVersion(7, '3.8' as SpineVersion)
  else if (version === '4.0') store.selectVersion(7, '4.0' as SpineVersion)
  else if (version === '4.1') store.selectVersion(7, '4.1' as SpineVersion)
  else if (version === '4.2') store.selectVersion(8, '4.2' as SpineVersion)
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
  input.value = ''
}

function onClear() {
  loaderStore.clear()
  classifyError.value  = null
  versionUnknown.value = false
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  gap: 32px;
  padding: 40px 20px;
  background: var(--c-bg);
}

.picker-top-bar {
  position: absolute;
  top: 16px;
  right: 20px;
}

/* ── Header ─────────────────────────────────────────── */
.picker-header {
  text-align: center;
}

.title {
  font-size: 2.8rem;
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1;
  margin-bottom: 10px;
}

.t-spine  { color: #7c6af5; }
.t-viewer { color: var(--c-text); }
.t-pro    { color: #4e9af1; }

.hint {
  color: var(--c-text-faint);
  font-size: 0.875rem;
  letter-spacing: 0.04em;
}

/* ── Cards ───────────────────────────────────────────── */
.cards {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  justify-content: center;
}

.card {
  width: 240px;
  padding: 28px 24px;
  border-radius: 16px;
  border: 1.5px solid var(--c-border);
  background: var(--c-surface);
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, transform 0.12s;
  user-select: none;
}

.card:hover {
  border-color: var(--c-text-ghost);
  background: var(--c-raised);
  transform: translateY(-2px);
}

.card--selected {
  border-color: #7c6af5;
  background: var(--c-card-sel-bg);
}

.card--selected:hover {
  border-color: #9d8fff;
}

/* ── Card head ───────────────────────────────────────── */
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.card-engine-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.card-engine {
  font-size: 1rem;
  color: var(--c-text-muted);
  font-weight: 500;
}

.card-ver {
  font-size: 2rem;
  font-weight: 800;
  color: var(--c-text);
  line-height: 1;
}

.card--selected .card-ver {
  color: #9d8fff;
}

.badge {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #4e9af1;
  border: 1px solid #2a4a70;
  border-radius: 6px;
  padding: 2px 7px;
  background: #0d1e30;
}

.card-desc {
  font-size: 0.78rem;
  color: var(--c-text-faint);
  margin-bottom: 4px;
}

.divider {
  margin: 16px 0 !important;
}

/* ── Spine radios ────────────────────────────────────── */
.spine-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--c-text-ghost);
  margin-bottom: 12px;
}

.spine-ver {
  font-size: 0.9rem;
  color: var(--c-text-dim);
}

/* ── Drop section ────────────────────────────────────── */
.drop-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 504px;
}

.drop-zone {
  border: 1.5px dashed var(--c-border);
  border-radius: 10px;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  cursor: default;
  transition: border-color 0.15s, background 0.15s;
  text-align: center;
}

.drop-zone--over {
  border-color: #7c6af5;
  background: rgba(124, 106, 245, 0.06);
}

.drop-zone--ok {
  border-color: #2a6e3e;
  background: rgba(74, 222, 128, 0.04);
}

.drop-zone--error {
  border-color: #7f1d1d;
  background: rgba(248, 113, 113, 0.04);
}

.drop-icon {
  font-size: 1.4rem;
  line-height: 1;
  color: var(--c-text-ghost);
}

.drop-state-icon {
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1;
  color: #4ade80;
}

.drop-state-icon--err {
  color: #f87171;
}

.drop-text {
  font-size: 0.85rem;
  color: var(--c-text-muted);
  font-weight: 500;
}

.drop-text-ok {
  font-size: 0.85rem;
  color: #4ade80;
  font-weight: 600;
}

.drop-text-err {
  font-size: 0.8rem;
  color: #f87171;
  font-weight: 500;
}

.drop-hint {
  font-size: 0.72rem;
  color: var(--c-text-ghost);
}

/* ── Version unknown hint ───────────────────────────── */
.version-unknown-hint {
  font-size: 0.75rem;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 6px;
  padding: 6px 10px;
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
  gap: 3px;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  padding: 2px 0;
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

/* ── Open button ─────────────────────────────────────── */
.open-btn {
  min-width: 180px;
}

/* ── Shortcuts hint ──────────────────────────────────── */
.shortcuts-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding-bottom: 24px;
}

.shortcuts-title {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--c-text-ghost);
}

.shortcuts-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 14px;
}

.shortcut-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--c-text-faint);
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-family: inherit;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  color: var(--c-text-muted);
  min-width: 28px;
  white-space: nowrap;
}
</style>
