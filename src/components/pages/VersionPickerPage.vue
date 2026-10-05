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
        <button class="reload-hint-btn" @click="fileInputRef?.click(); clearReloadHint()">Choose files</button>
        <button class="reload-hint-close" @click="clearReloadHint()">✕</button>
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
          'drop-zone--ok':        fileLoaderStore.isLoaded,
          'drop-zone--error':     !!classifyError,
        }"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <template v-if="fileLoaderStore.spineSlots.length > 0 && (fileLoaderStore.isLoaded || issueCount > 0)">
          <span class="drop-state-icon" :class="{ 'drop-state-icon--warn': issueCount > 0 }">
            {{ fileLoaderStore.validSlots.length > 0 ? '✓' : '!' }}
          </span>
          <p class="drop-text-ok" :class="{ 'drop-text-warn': fileLoaderStore.validSlots.length === 0 }">
            <template v-if="fileLoaderStore.validSlots.length > 0">
              {{ fileLoaderStore.validSlots.length }}
              spine{{ fileLoaderStore.validSlots.length !== 1 ? 's' : '' }} ready
            </template>
            <template v-else>No valid spines</template>
            <template v-if="issueCount > 0">
              &middot;
              {{ issueCount }}
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
        v-if="fileLoaderStore.spineSlots.length > 0 && issueCount > 0"
        class="spine-validation-list"
      >
        <div
          v-for="slot in fileLoaderStore.spineSlots"
          :key="slot.id"
          class="spine-vrow"
          :class="slotHasIssue(slot) ? 'spine-vrow--err' : 'spine-vrow--ok'"
        >
          <span class="spine-vicon">{{ slotHasIssue(slot) ? '✗' : '✓' }}</span>
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
      <div v-if="unsupportedHint" class="version-unknown-hint">{{ unsupportedHint }}</div>

      <div class="picker-row">
        <n-button size="small" ghost @click="onChooseFiles">Choose files</n-button>
        <n-button size="small" ghost @click="onChooseFolder">Choose folder</n-button>
        <n-button
          v-if="fileLoaderStore.hasFiles"
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

      <div v-if="fileLoaderStore.pendingFileInfos.length > 0" class="file-list">
        <div
          v-for="info in fileLoaderStore.pendingFileInfos"
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
        :disabled="!store.isReady || !fileLoaderStore.isLoaded"
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
import { useVersionStore, type PixiVersion } from '@/core/stores/useVersionStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useFilePickerLogic, TYPE_LABELS, formatSize, type PickerEmits } from '@/core/composables/useFilePickerLogic'
import { usePickerHistory as _usePickerHistory } from '@/core/composables/usePickerHistory'
import type { SpineSlot } from '@/core/types/FileSet'
import SettingsPopover from '@/components/ui/SettingsPopover.vue'
import HelpModal from '@/components/ui/HelpModal.vue'

const emit = defineEmits<PickerEmits>()

const appVersion = __APP_VERSION__

const store           = useVersionStore()
const fileLoaderStore = useFileLoaderStore()

const slotHasIssue = (s: SpineSlot) => !!(s.error || s.validationErrors?.length)
const issueCount = computed(() => fileLoaderStore.spineSlots.filter(slotHasIssue).length)

// Forward-reference pattern: picker is created first; history callback captures `history` by closure.
// By the time any user interaction triggers onHistorySaved(), history is fully initialised.
const picker  = useFilePickerLogic(emit, () => history.refresh())
const history = _usePickerHistory(picker.handleFiles, () => emit('open'))

const {
  isDragging, classifyError, versionUnknown, unsupportedHint,
  fileInputRef, folderInputRef,
  onDrop, onChooseFiles, onChooseFolder, onFileInput, onClear, onOpenCompare,
} = picker

const {
  historySessions, reloadingId, reloadHint, groupedHistory,
  formatSessionTime, clearReloadHint,
  onSessionClick, onDeleteSession, onClearHistory,
} = history
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

.t-spine  { color: var(--c-accent); }
.t-viewer { color: var(--c-text); }
.t-pro    { color: var(--c-text-muted); }

.hint {
  color: var(--c-text-faint);
  font-size: 0.875rem;
  letter-spacing: 0.04em;
}

.app-version {
  font-size: 0.6875rem;
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
  border-color: var(--c-accent);
  background: var(--c-card-sel-bg);
}

.card--selected:hover {
  border-color: var(--c-accent-hover);
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
  color: var(--c-accent);
}

.badge {
  font-size: 0.6875rem;
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
  font-size: 0.8125rem;
  color: var(--c-text-faint);
  margin-bottom: 4px;
}

.divider {
  margin: 16px 0 !important;
}

/* ── Spine options ───────────────────────────────────── */
.spine-label {
  font-size: 0.75rem;
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
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
}

.spine-option-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--c-text-dim);
  line-height: 1;
}

.spine-option--active .spine-option-label {
  color: var(--c-accent);
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
  border-color: var(--c-accent);
  background: var(--c-accent);
  box-shadow: 0 0 0 3px var(--c-accent-soft);
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
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
}

.drop-zone--ok {
  border-color: var(--c-success);
  background: var(--c-success-soft);
}

.drop-zone--error {
  border-color: var(--c-error);
  background: var(--c-error-soft);
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
  color: var(--c-success);
}

.drop-state-icon--err {
  color: var(--c-error);
}

.drop-text {
  font-size: 0.875rem;
  color: var(--c-text-muted);
  font-weight: 500;
}

.drop-text-ok {
  font-size: 0.875rem;
  color: var(--c-success);
  font-weight: 600;
}

.drop-text-err {
  font-size: 0.8125rem;
  color: var(--c-error);
  font-weight: 500;
}

.drop-hint {
  font-size: 0.75rem;
  color: var(--c-text-ghost);
}

/* ── Version unknown hint ───────────────────────────── */
.version-unknown-hint {
  font-size: 0.75rem;
  color: var(--c-warning);
  background: var(--c-warning-soft);
  border: 1px solid var(--c-warning);
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
  font-size: 0.8125rem;
  padding: 2px 0;
}

.file-type-badge {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 4px;
  min-width: 36px;
  text-align: center;
}

.file-type-badge--skeleton-json { background: var(--c-info-soft); color: var(--c-info); }
.file-type-badge--skeleton-skel { background: var(--c-info-soft); color: var(--c-info); }
.file-type-badge--atlas          { background: var(--c-accent-soft); color: var(--c-accent); }
.file-type-badge--image          { background: var(--c-success-soft); color: var(--c-success); }

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
.drop-state-icon--warn { color: var(--c-warning); }
.drop-text-warn        { color: var(--c-warning) !important; }

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
  font-size: 0.8125rem;
  padding: 3px 6px;
  border-radius: 5px;
}

.spine-vrow--ok  { background: var(--c-success-soft); }
.spine-vrow--err {
  background: var(--c-error-soft);
  flex-wrap: wrap;
  align-items: flex-start;
}

.spine-vicon {
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
  width: 12px;
}

.spine-vrow--ok  .spine-vicon { color: var(--c-success); }
.spine-vrow--err .spine-vicon { color: var(--c-error); }

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
  color: var(--c-error);
  font-size: 0.75rem;
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
  font-size: 0.6875rem;
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
  font-size: 0.6875rem;
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
  font-size: 0.75rem;
  color: var(--c-text-faint);
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6875rem;
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
  font-size: 0.6875rem;
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
  font-size: 0.6875rem;
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
  font-size: 0.6875rem;
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
  font-size: 0.6875rem;
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
  font-size: 0.6875rem;
  color: var(--c-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 170px;
}

.session-more {
  font-size: 0.6875rem;
  color: var(--c-text-ghost);
}

.session-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 0.75rem;
  color: var(--c-accent);
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
  font-size: 0.6875rem;
  color: var(--c-text-ghost);
  line-height: 1;
  padding: 2px 4px;
  border-radius: 3px;
}
.session-delete:hover { color: var(--c-text); background: var(--c-hover); }
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
  background: var(--c-accent-soft);
  position: relative;
}

.reload-hint-title {
  font-size: 0.6875rem;
  color: var(--c-text-ghost);
  font-weight: 600;
}

.reload-hint-file {
  font-size: 0.6875rem;
  color: var(--c-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reload-hint-btn {
  margin-top: 4px;
  background: var(--c-accent-soft);
  border: 1px solid var(--c-border-strong);
  color: var(--c-accent);
  border-radius: 4px;
  font-size: 0.6875rem;
  padding: 3px 8px;
  cursor: pointer;
  transition: background 0.12s;
}
.reload-hint-btn:hover { background: var(--c-selection); }

.reload-hint-close {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  font-size: 0.6875rem;
  padding: 2px 4px;
}
.reload-hint-close:hover { color: var(--c-text-muted); }

.hidden-input { display: none; }
</style>
