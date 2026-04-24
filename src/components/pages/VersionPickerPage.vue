<!--
 * @file VersionPickerPage.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="picker">
    <!-- ── History sidebar (left, fixed) ──────────────────────── -->
    <aside v-if="historySessions.length > 0" class="history-sidebar">
      <div class="history-hdr">
        <span class="history-title">History</span>
        <button class="history-clear" title="Clear history" @click="onClearHistory">✕</button>
      </div>
      <div class="history-list">
        <template v-for="(group, gi) in groupedHistory" :key="group.dateLabel">
          <div v-if="gi > 0" class="history-day-sep" />
          <div class="history-day-label">{{ group.dateLabel }}</div>
          <div
            v-for="session in group.sessions"
            :key="session.id"
            class="history-session"
            :class="{ 'history-session--loading': reloadingId === session.id }"
            :title="session.fileNames.join('\n')"
            @click="onSessionClick(session)"
          >
            <span class="session-time">{{ formatSessionTime(session.timestamp) }}</span>
            <div class="session-files">
              <span
                v-for="name in session.fileNames.slice(0, 3)"
                :key="name"
                class="session-file"
              >{{ name }}</span>
              <span v-if="session.fileNames.length > 3" class="session-more">
                +{{ session.fileNames.length - 3 }}
              </span>
            </div>
            <span v-if="reloadingId === session.id" class="session-loading">…</span>
            <span v-else-if="session.hasHandles" class="session-badge" title="Click to reload automatically">↺</span>
            <button
              class="session-delete"
              title="Remove from history"
              @click.stop="onDeleteSession(session)"
            >✕</button>
          </div>
        </template>
      </div>
      <!-- Variant A hint: show when no handles and user clicked a session -->
      <div v-if="reloadHint.length > 0" class="reload-hint">
        <span class="reload-hint-title">Open these files again:</span>
        <span v-for="name in reloadHint" :key="name" class="reload-hint-file">{{ name }}</span>
        <button class="reload-hint-btn" @click="fileInputRef?.click(); reloadHint = []">Choose files</button>
        <button class="reload-hint-close" @click="reloadHint = []">✕</button>
      </div>
    </aside>

    <div class="picker-top-bar">
      <HelpModal />
      <SettingsPopover />
    </div>

    <header class="picker-header">
      <h1 class="title">
        <span class="t-spine">Spine</span>
        <span class="t-viewer"> Viewer</span>
        <span class="t-pro"> Pro</span>
      </h1>
      <p class="hint">Select render engine and Spine runtime version</p>
      <span class="app-version">v{{ appVersion }}</span>
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

        <div class="spine-options" @click.stop>
          <div
            v-for="v in store.spineOptionsMap[pixi]"
            :key="v"
            class="spine-option"
            :class="{ 'spine-option--active': store.pixiVersion === pixi && store.spineVersion === v }"
            @click="store.selectVersion(pixi, v)"
          >
            <span class="spine-option-label">{{ v }}</span>
            <span class="spine-option-dot"></span>
          </div>
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
        <template v-if="loaderStore.spineSlots.length > 0 && (loaderStore.isLoaded || loaderStore.spineSlots.some(s => s.error || s.validationErrors?.length))">
          <span class="drop-state-icon" :class="{ 'drop-state-icon--warn': loaderStore.spineSlots.some(s => s.error || s.validationErrors?.length) }">
            {{ loaderStore.validSlots.length > 0 ? '✓' : '!' }}
          </span>
          <p class="drop-text-ok" :class="{ 'drop-text-warn': loaderStore.validSlots.length === 0 }">
            <template v-if="loaderStore.validSlots.length > 0">
              {{ loaderStore.validSlots.length }}
              spine{{ loaderStore.validSlots.length !== 1 ? 's' : '' }} ready
            </template>
            <template v-else>No valid spines</template>
            <template v-if="loaderStore.spineSlots.some(s => s.error || s.validationErrors?.length)">
              &middot;
              {{ loaderStore.spineSlots.filter(s => s.error || s.validationErrors?.length).length }}
              invalid
            </template>
          </p>
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

      <!-- Per-spine validation list -->
      <div
        v-if="loaderStore.spineSlots.length > 0 && loaderStore.spineSlots.some(s => s.error || s.validationErrors?.length)"
        class="spine-validation-list"
      >
        <div
          v-for="slot in loaderStore.spineSlots"
          :key="slot.id"
          class="spine-vrow"
          :class="(slot.error || slot.validationErrors?.length) ? 'spine-vrow--err' : 'spine-vrow--ok'"
        >
          <span class="spine-vicon">{{ (slot.error || slot.validationErrors?.length) ? '✗' : '✓' }}</span>
          <span class="spine-vname">{{ slot.name }}</span>
          <span v-if="slot.error" class="spine-verr">{{ slot.error }}</span>
          <template v-else-if="slot.validationErrors?.length">
            <span v-for="(err, i) in slot.validationErrors" :key="i" class="spine-verr">{{ err }}</span>
          </template>
        </div>
      </div>

      <div v-if="versionUnknown" class="version-unknown-hint">
        Version not detected — please select the runtime above manually
      </div>

      <div class="picker-row">
        <n-button size="small" ghost @click="onChooseFiles">Choose files</n-button>
        <n-button size="small" ghost @click="onChooseFolder">Choose folder</n-button>
        <n-button
          v-if="loaderStore.hasFiles"
          size="small"
          @click="onClear"
        >Clear</n-button>
        <input
          ref="fileInputRef"
          type="file"
          multiple
          class="hidden-input"
          accept=".json,.skel,.atlas,.png,.jpg,.jpeg,.webp,.avif"
          @change="onFileInput"
        />
        <input
          ref="folderInputRef"
          type="file"
          class="hidden-input"
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

    <div class="action-btns">
      <n-button
        type="primary"
        size="large"
        class="open-btn"
        :disabled="!store.isReady || !loaderStore.isLoaded"
        @click="emit('open')"
      >
        Open Viewer
      </n-button>
      <n-button
        size="large"
        class="compare-btn"
        :disabled="!store.isReady"
        @click="onOpenCompare"
      >
        ⇄ Compare
      </n-button>
    </div>

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

    <footer class="copyright">
      &copy; 2026 Andrii Karpus &mdash; Spine Viewer Pro
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useVersionStore, type PixiVersion, type SpineVersion } from '@/core/stores/useVersionStore'
import { useLoaderStore } from '@/core/stores/useLoaderStore'
import { groupSpineFiles, getFilesFromDataTransfer } from '@/core/utils/fileLoader'
import { detectSpineVersion, detectSpineVersionFromSkel } from '@/core/utils/versionDetector'
import { validateSpineFileSet } from '@/core/utils/spineValidator'
import {
  saveSession, getSessions, reloadSession, getSessionHandles, deleteSession, clearHistory,
  isFileSystemAccessSupported, pickFilesViaFSAA, pickFolderViaFSAA,
  type HistorySession,
} from '@/core/utils/fileHistory'
import SettingsPopover from '@/components/ui/SettingsPopover.vue'
import HelpModal from '@/components/ui/HelpModal.vue'
import type { SpineFileType } from '@/core/types/FileSet'

const emit = defineEmits<{
  open:         []
  'open-compare': [payload: { left?: number; right?: number }]
}>()

const appVersion = __APP_VERSION__

const store       = useVersionStore()
const loaderStore = useLoaderStore()

const isDragging       = ref(false)
const classifyError    = ref<string | null>(null)
const versionUnknown   = ref(false)
const fileInputRef     = ref<HTMLInputElement | null>(null)
const folderInputRef   = ref<HTMLInputElement | null>(null)

// ── File history state ────────────────────────────────────────────────────────

const historySessions  = ref<HistorySession[]>(getSessions())
const reloadingId      = ref<string | null>(null)
const reloadHint       = ref<string[]>([])
const hintStartHandle  = ref<FileSystemHandle | null>(null)

const groupedHistory = computed(() => {
  const groups = new Map<string, HistorySession[]>()
  for (const s of historySessions.value) {
    const key = new Date(s.timestamp).toDateString()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }
  const today     = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86_400_000).toDateString()
  return [...groups.entries()].map(([key, sessions]) => ({
    dateLabel: key === today ? 'Today' : key === yesterday ? 'Yesterday' : key,
    sessions,
  }))
})

function formatSessionTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function onSessionClick(session: HistorySession) {
  reloadHint.value = []
  hintStartHandle.value = null

  if (isFileSystemAccessSupported()) {
    reloadingId.value = session.id
    try {
      // Variant B: try silent auto-reload from stored handles
      if (session.hasHandles) {
        const files = await reloadSession(session)
        if (files && files.length > 0) {
          await handleFiles(files, undefined, true)
          emit('open')
          return
        }
      }
      // Variant B fallback: open picker starting in the session's directory
      const handles = await getSessionHandles(session.id)
      const startHandle = handles?.[0] ?? undefined
      const result = await pickFilesViaFSAA(true, startHandle)
      if (result) {
        await handleFiles(result.files, result.handles, true)
        emit('open')
        return
      }
    } finally {
      reloadingId.value = null
    }
    return
  }

  // Variant A (no FSAA): show file list hint only, user must pick files manually
  reloadHint.value = session.fileNames
}

async function onDeleteSession(session: HistorySession) {
  await deleteSession(session.id)
  historySessions.value = getSessions()
  if (reloadHint.value.length > 0 && reloadHint.value.join() === session.fileNames.join()) {
    reloadHint.value = []
  }
}

async function onClearHistory() {
  await clearHistory()
  historySessions.value = []
  reloadHint.value = []
}

// ── File picking ──────────────────────────────────────────────────────────────

async function onChooseFiles() {
  if (isFileSystemAccessSupported()) {
    const result = await pickFilesViaFSAA(true)
    if (result) { await handleFiles(result.files, result.handles); return }
  }
  fileInputRef.value?.click()
}

async function onChooseFolder() {
  if (isFileSystemAccessSupported()) {
    const result = await pickFolderViaFSAA()
    if (result) { await handleFiles(result.files, result.handles); return }
  }
  folderInputRef.value?.click()
}

// ── Core file handler ─────────────────────────────────────────────────────────

const TYPE_LABELS: Record<SpineFileType, string> = {
  'skeleton-json': 'JSON',
  'skeleton-skel': 'SKEL',
  atlas:           'ATLAS',
  image:           'IMG',
}

async function handleFiles(files: File[], handles?: FileSystemFileHandle[], skipHistory = false) {
  if (files.length === 0) return
  isDragging.value     = false
  classifyError.value  = null
  versionUnknown.value = false
  reloadHint.value     = []

  loaderStore.setPendingFiles(files)

  const result = await groupSpineFiles(files)

  if (result.globalError) {
    classifyError.value = result.globalError
    return
  }
  if (result.slots.length === 0) {
    classifyError.value = 'No valid Spine files found'
    return
  }

  const firstValid = result.slots.find(s => !s.error && s.fileSet)
  let version: string | null = null
  if (firstValid?.fileSet) {
    const { skeleton } = firstValid.fileSet
    version = skeleton.type === 'skeleton-json'
      ? detectSpineVersion(skeleton.fileBody as string)
      : detectSpineVersionFromSkel(skeleton.fileBody as ArrayBuffer)
  }

  for (const slot of result.slots) {
    if (slot.fileSet) {
      const errs = validateSpineFileSet(slot.fileSet)
      if (errs.length > 0) slot.validationErrors = errs
    }
  }

  loaderStore.setSlots(result.slots, version)

  if (version && version !== 'unknown') {
    autoSelectVersion(version)
  } else {
    versionUnknown.value = true
  }

  // Save to history only for manual loads, not session reloads
  if (!skipHistory && result.slots.some(s => !s.error && !s.validationErrors?.length)) {
    await saveSession(files.map(f => f.name), handles)
    historySessions.value = getSessions()
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
  // Capture FSAA handle promises synchronously BEFORE any await —
  // browsers clear DataTransfer.items after the first event-loop tick.
  const handlePromises: Promise<FileSystemHandle | null>[] = isFileSystemAccessSupported()
    ? Array.from(e.dataTransfer.items).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // TODO: remove cast when File System Access API types are stable in TypeScript lib
        item => (((item as any).getAsFileSystemHandle?.() ?? Promise.resolve(null)) as Promise<FileSystemHandle | null>),
      )
    : []

  const files = await getFilesFromDataTransfer(e.dataTransfer)

  // Resolve the handles captured synchronously above
  const handles: FileSystemFileHandle[] = []
  for (const p of handlePromises) {
    try {
      const handle = await p
      if (handle?.kind === 'file') {
        handles.push(handle as FileSystemFileHandle)
      } else if (handle?.kind === 'directory') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // TODO: remove cast when File System Access API types are stable in TypeScript lib
        for await (const entry of (handle as any).values()) {
          if (entry.kind === 'file') handles.push(entry as FileSystemFileHandle)
        }
      }
    } catch {}
  }

  await handleFiles(files, handles.length > 0 ? handles : undefined)
}

function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  // No handles available from <input type="file"> — variant A only
  handleFiles(Array.from(input.files))
  input.value = ''
}

function onClear() {
  loaderStore.clear()
  classifyError.value  = null
  versionUnknown.value = false
}

function onOpenCompare() {
  const slots = loaderStore.spineSlots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s.error && !(s.validationErrors?.length))
  if (slots.length >= 2) {
    emit('open-compare', { left: slots[0].i, right: slots[1].i })
  } else if (slots.length === 1) {
    emit('open-compare', { left: slots[0].i })
  } else {
    emit('open-compare', {})
  }
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
  display: flex;
  align-items: center;
  gap: 6px;
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

.app-version {
  font-size: 0.65rem;
  color: var(--c-text-ghost);
  letter-spacing: 0.06em;
  margin-top: 2px;
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
  flex-wrap: wrap;
  row-gap: 6px;
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
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-radius: 6px;
  padding: 2px 7px;
  white-space: nowrap;
  color: var(--c-badge-text);
  border: 1px solid var(--c-badge-border);
  background: var(--c-badge-bg);
}

.card-desc {
  font-size: 0.78rem;
  color: var(--c-text-faint);
  margin-bottom: 4px;
}

.divider {
  margin: 16px 0 !important;
}

/* ── Spine options ───────────────────────────────────── */
.spine-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--c-text-ghost);
  margin-bottom: 10px;
}

.spine-options {
  display: flex;
  gap: 8px;
}

.spine-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  transition: border-color 0.15s, background 0.15s;
}

.spine-option:hover {
  border-color: var(--c-text-ghost);
  background: var(--c-raised);
}

.spine-option--active {
  border-color: #7c6af5;
  background: rgba(124, 106, 245, 0.08);
}

.spine-option-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--c-text-dim);
  line-height: 1;
}

.spine-option--active .spine-option-label {
  color: #9d8fff;
}

.spine-option-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid var(--c-border);
  background: transparent;
  transition: border-color 0.15s, background 0.15s;
  flex-shrink: 0;
}

.spine-option:hover .spine-option-dot {
  border-color: var(--c-text-ghost);
}

.spine-option--active .spine-option-dot {
  border-color: #7c6af5;
  background: #7c6af5;
  box-shadow: 0 0 0 3px rgba(124, 106, 245, 0.2);
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

/* ── Drop zone states (warn) ─────────────────────────────── */
.drop-state-icon--warn { color: #f59e0b; }
.drop-text-warn        { color: #f59e0b !important; }

/* ── Spine validation list ───────────────────────────────── */
.spine-validation-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.spine-vrow {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 0.78rem;
  padding: 3px 6px;
  border-radius: 5px;
}

.spine-vrow--ok  { background: rgba(74, 222, 128, 0.06); }
.spine-vrow--err {
  background: rgba(248, 113, 113, 0.08);
  flex-wrap: wrap;
  align-items: flex-start;
}

.spine-vicon {
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
  width: 12px;
}

.spine-vrow--ok  .spine-vicon { color: #4ade80; }
.spine-vrow--err .spine-vicon { color: #f87171; }

.spine-vname {
  font-weight: 600;
  flex-shrink: 0;
  color: var(--c-text-dim);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spine-verr {
  color: #f87171;
  font-size: 0.72rem;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spine-vrow--err .spine-verr {
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
  width: 100%;
  flex: none;
  padding-left: 18px;
  line-height: 1.4;
}

/* ── Action buttons ──────────────────────────────────── */
.action-btns {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}

.open-btn    { min-width: 160px; }
.compare-btn { min-width: 120px; }

/* ── Copyright ───────────────────────────────────────── */
.copyright {
  font-size: 0.62rem;
  color: var(--c-text-ghost);
  letter-spacing: 0.04em;
  text-align: center;
  padding-bottom: 4px;
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

/* ── History sidebar ─────────────────────────────────── */

.history-sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: 210px;
  height: 100vh;
  background: var(--c-surface);
  border-right: 1px solid var(--c-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10;
}

.history-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--c-border-dim);
}

.history-title {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--c-text-ghost);
}

.history-clear {
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  font-size: 0.65rem;
  padding: 2px 4px;
  border-radius: 3px;
  line-height: 1;
  transition: color 0.12s, background 0.12s;
}
.history-clear:hover { color: var(--c-text-muted); background: var(--c-raised); }

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0 12px;
}

.history-day-sep {
  height: 1px;
  background: var(--c-border-dim);
  margin: 6px 10px;
}

.history-day-label {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--c-text-ghost);
  padding: 2px 12px 4px;
}

.history-session {
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.1s;
  position: relative;
}
.history-session:hover { background: var(--c-raised); }
.history-session--loading { opacity: 0.6; pointer-events: none; }

.session-time {
  font-size: 0.65rem;
  color: var(--c-text-ghost);
  font-variant-numeric: tabular-nums;
  display: block;
  margin-bottom: 3px;
}

.session-files {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.session-file {
  font-size: 0.68rem;
  color: var(--c-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 170px;
}

.session-more {
  font-size: 0.62rem;
  color: var(--c-text-ghost);
}

.session-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 0.75rem;
  color: #7c6af5;
  opacity: 0.7;
}

.session-delete {
  position: absolute;
  top: 4px;
  right: 6px;
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.65rem;
  color: var(--c-text-ghost);
  line-height: 1;
  padding: 2px 4px;
  border-radius: 3px;
}
.session-delete:hover { color: var(--c-text); background: rgba(255,255,255,0.08); }
.history-session:hover .session-delete { display: block; }
.history-session:hover .session-badge  { display: none; }

.session-loading {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 0.75rem;
  color: var(--c-text-ghost);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 1; }
}

/* Variant A hint */
.reload-hint {
  flex-shrink: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--c-border-dim);
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(124, 106, 245, 0.06);
  position: relative;
}

.reload-hint-title {
  font-size: 0.62rem;
  color: var(--c-text-ghost);
  font-weight: 600;
}

.reload-hint-file {
  font-size: 0.65rem;
  color: var(--c-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reload-hint-btn {
  margin-top: 4px;
  background: rgba(124,106,245,0.15);
  border: 1px solid rgba(124,106,245,0.3);
  color: #9d8fff;
  border-radius: 4px;
  font-size: 0.68rem;
  padding: 3px 8px;
  cursor: pointer;
  transition: background 0.12s;
}
.reload-hint-btn:hover { background: rgba(124,106,245,0.25); }

.reload-hint-close {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  font-size: 0.65rem;
  padding: 2px 4px;
}
.reload-hint-close:hover { color: var(--c-text-muted); }

.hidden-input { display: none; }
</style>
