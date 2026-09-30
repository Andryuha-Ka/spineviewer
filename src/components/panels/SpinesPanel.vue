<!--
 * @file SpinesPanel.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="spines-panel">
    <!-- Global actions toolbar -->
    <div class="spines-toolbar">
      <span class="spines-toolbar-label">All spines</span>
      <button
        class="spine-expand-btn"
        :class="{ 'spine-expand-btn--open': globalExpandEnabled }"
        :disabled="!hasAnyPlaceholders"
        :title="globalExpandEnabled ? 'Collapse all placeholders' : 'Expand all placeholders'"
        @click="toggleAllExpand"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      <button
        class="spine-sync-btn"
        :class="{ 'spine-sync-btn--desynced': !globalSyncEnabled }"
        :title="globalSyncEnabled ? 'Desync all spines from global viewport' : 'Sync all spines to global viewport'"
        @click="toggleAllSync"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7a5 5 0 0 1 0-10h2"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </button>
      <button
        class="spine-pin-btn"
        :class="{ 'spine-pin-btn--pinned': globalPinEnabled }"
        :title="globalPinEnabled ? 'Unpin all spines' : 'Pin all spines on scene'"
        @click="toggleAllPin"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M17 4h-1V3a1 1 0 0 0-2 0v1H10V3a1 1 0 0 0-2 0v1H7a3 3 0 0 0-2.12 5.12L6 17v.5a.5.5 0 0 0 .5.5H11v2.5a1 1 0 0 0 2 0V18h4.5a.5.5 0 0 0 .5-.5V17l1.12-7.88A3 3 0 0 0 17 4z"/>
        </svg>
      </button>
    </div>
    <div class="spines-list">
      <template v-for="{ id, slot, layer } in listRows" :key="id">
        <template v-if="slot">
        <div
          class="spine-item"
          :class="{
            'spine-item--active':       slot.id === slotSelectionStore.activeSlotId,
            'spine-item--pinned':       slotSelectionStore.isPinned(slot.id) && slot.id !== slotSelectionStore.activeSlotId,
            'spine-item--error':        isSlotError(slot),
            'spine-item--modified':     isModified(slot),
            'spine-item--dragging':     dragSrcKey === id,
            'spine-item--drop-top':     dragOverKey === id && dropPosition === 'top',
            'spine-item--drop-bottom':  dragOverKey === id && dropPosition === 'bottom',
          }"
          :title="slot.error ?? (slot.validationErrors?.length ? slot.validationErrors[0] : slot.name)"
          :draggable="!isSlotError(slot)"
          @click="!isSlotError(slot) && (slotSelectionStore.setActiveSlot(slot.id), layersStore.deactivateItems())"
          @dragstart="onDragStart($event, id, SPINE_SLOT_MIME)"
          @dragover="onDragOver($event, id)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, id)"
          @dragend="onDragEnd"
        >
          <span
            v-if="!isSlotError(slot)"
            class="spine-drag-handle"
            title="Drag to reorder (top = higher z-index)"
          >
            <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
              <circle cx="2" cy="2"  r="1.2"/>
              <circle cx="6" cy="2"  r="1.2"/>
              <circle cx="2" cy="6"  r="1.2"/>
              <circle cx="6" cy="6"  r="1.2"/>
              <circle cx="2" cy="10" r="1.2"/>
              <circle cx="6" cy="10" r="1.2"/>
            </svg>
          </span>
          <span v-else class="spine-drag-handle spine-drag-handle--placeholder" />
          <span class="spine-dot" />
          <span v-if="slot.parentSlotId" class="spine-child-prefix">↳</span>
          <span class="spine-name">{{ slot.name }}</span>
          <span
            v-if="isModified(slot) && !isSlotError(slot)"
            class="spine-modified-dot"
            :title="modifiedHint(slot)"
          />
          <span
            v-if="slot.error"
            class="spine-err-badge"
            :title="slot.error"
          >!</span>
          <span
            v-else-if="slot.validationErrors?.length"
            class="spine-err-badge spine-err-badge--validation"
            :title="slot.validationErrors.join('\n')"
          >!</span>
          <!-- Expand placeholders chevron -->
          <button
            v-if="!isSlotError(slot) && slot.placeholders?.some(p => p.kind === 'slot')"
            class="spine-expand-btn"
            :class="{ 'spine-expand-btn--open': expandedSlots.has(slot.id) }"
            :title="expandedSlots.has(slot.id) ? 'Collapse placeholders' : 'Expand placeholders'"
            @click.stop="onExpandBtnClick(slot.id)"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <!-- Sync toggle -->
          <button
            v-if="!isSlotError(slot)"
            class="spine-sync-btn"
            :class="{ 'spine-sync-btn--desynced': slot.syncEnabled === false }"
            title="Sync with global viewport"
            @click.stop="fileLoaderStore.setSyncEnabled(slot.id, slot.syncEnabled !== false ? false : true)"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7a5 5 0 0 1 0-10h2"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </button>
          <!-- Clone button -->
          <button
            v-if="!isSlotError(slot)"
            class="spine-clone-btn"
            :disabled="fileLoaderStore.spineSlots.length >= SPINE_SLOTS_LIMIT"
            title="Clone this spine slot"
            @click.stop="onClone(slot.id)"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <!-- Pin button -->
          <button
            v-if="!isSlotError(slot)"
            class="spine-pin-btn"
            :class="{
              'spine-pin-btn--pinned':  slotSelectionStore.isPinned(slot.id),
              'spine-pin-btn--pending': globalPinEnabled && !slotHasTracks(slot),
            }"
            title="Keep on scene when switching"
            @click.stop="slotSelectionStore.setPinned(slot.id, !slotSelectionStore.isPinned(slot.id))"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M17 4h-1V3a1 1 0 0 0-2 0v1H10V3a1 1 0 0 0-2 0v1H7a3 3 0 0 0-2.12 5.12L6 17v.5a.5.5 0 0 0 .5.5H11v2.5a1 1 0 0 0 2 0V18h4.5a.5.5 0 0 0 .5-.5V17l1.12-7.88A3 3 0 0 0 17 4z"/>
            </svg>
          </button>
        </div>

        <!-- Placeholder tree -->
        <SpinesPlaceholderTree
          v-if="!isSlotError(slot) && expandedSlots.has(slot.id) && slot.placeholders?.some(p => p.kind === 'slot')"
          :spine-slot="slot"
          @thumb-click="onImageThumbClick"
        />
        </template>
        <div
          v-else-if="layer"
          class="spine-item"
          :class="{
            'spine-item--active':      layer.id === layersStore.activeLayerId,
            'spine-item--dragging':    dragSrcKey === id,
            'spine-item--drop-top':    dragOverKey === id && dropPosition === 'top',
            'spine-item--drop-bottom': dragOverKey === id && dropPosition === 'bottom',
          }"
          :title="layer.name"
          :draggable="!layer.background"
          @click="layersStore.setActive(layer.id)"
          @dragstart="layer.background ? $event.preventDefault() : onDragStart($event, id, IMAGE_LAYER_MIME)"
          @dragover="onDragOver($event, id)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, id)"
          @dragend="onDragEnd"
        >
          <span v-if="layer.background" class="spine-drag-handle spine-drag-handle--placeholder" />
          <span v-else class="spine-drag-handle" title="Drag to reorder or into a placeholder">
            <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
              <circle cx="2" cy="2"  r="1.2"/>
              <circle cx="6" cy="2"  r="1.2"/>
              <circle cx="2" cy="6"  r="1.2"/>
              <circle cx="6" cy="6"  r="1.2"/>
              <circle cx="2" cy="10" r="1.2"/>
              <circle cx="6" cy="10" r="1.2"/>
            </svg>
          </span>
          <img :src="layer.dataUrl" class="spine-layer-thumb" alt="" />
          <span class="spine-name">{{ layer.name }}</span>
          <label class="spine-bg-check" @click.stop>
            <input type="checkbox" :checked="layer.background" @change="layersStore.setBackground(layer.background ? null : layer.id)">Background
          </label>
          <button
            class="spine-sync-btn"
            :class="{ 'spine-sync-btn--desynced': !layer.syncEnabled }"
            title="Sync with global viewport"
            @click.stop="layersStore.setSync(layer.id, !layer.syncEnabled)"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7a5 5 0 0 1 0-10h2"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </button>
          <button
            class="spine-layer-remove"
            title="Remove layer"
            @click.stop="layersStore.removeLayer(layer.id)"
          >×</button>
        </div>
      </template>
    </div>

    <!-- Drop zone for images and spine file sets -->
    <div
      class="spines-dropzone"
      :class="{ 'spines-dropzone--over': dropzoneActive }"
      @dragover.prevent="dropzoneActive = true"
      @dragleave="dropzoneActive = false"
      @drop.prevent="onDropzoneFiles"
    >
      Drop image or spine files here
    </div>

    <div class="spines-footer">
      {{ validCount }} spine{{ validCount !== 1 ? 's' : '' }} loaded
      <template v-if="errorCount > 0">
        &middot; {{ errorCount }} error{{ errorCount !== 1 ? 's' : '' }}
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFileLoaderStore, SPINE_SLOTS_LIMIT } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useSlotUIStore } from '@/core/stores/useSlotUIStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import SpinesPlaceholderTree from '@/components/panels/SpinesPlaceholderTree.vue'
import { groupSpineFiles, readFileAsDataURL } from '@/core/utils/fileLoader'
import { validateSpineFileSet } from '@/core/utils/spineValidator'
import { spineVersionProblem } from '@/core/utils/versionDetector'
import { useVersionStore } from '@/core/stores/useVersionStore'
import type { SpineSlot } from '@/core/types/FileSet'
import { buildSlotSavedState, trackTimesOf } from '@/core/utils/slotState'
import { usePlaceholderActions, SPINE_SLOT_MIME, PH_IMAGE_MIME, PH_SPINE_MIME, IMAGE_LAYER_MIME, type PlaceholderChildRef } from '@/core/composables/usePlaceholderActions'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'

const fileLoaderStore    = useFileLoaderStore()
const slotSelectionStore = useSlotSelectionStore()
const slotUIStore        = useSlotUIStore()
const animationStore  = useAnimationStore()
const viewerStore     = useViewerStore()
const skeletonStore   = useSkeletonStore()
const phImagesStore   = usePlaceholderImagesStore()
const versionStore    = useVersionStore()
const layersStore     = useImageLayersStore()
const actions         = usePlaceholderActions()

// ── Placeholder image activation ────────────────────────────────────────────
const pendingImageToActivate = ref<string | null>(null)

function onImageThumbClick(slotId: string, imageId: string): void {
  layersStore.deactivateItems()
  if (slotId !== slotSelectionStore.activeSlotId) {
    pendingImageToActivate.value = imageId
    slotSelectionStore.setActiveSlot(slotId)
    const s = new Set(expandedSlots.value)
    s.add(slotId)
    expandedSlots.value = s
  } else {
    phImagesStore.setActiveImage(imageId)
  }
}

watch(() => slotSelectionStore.activeSlotId, (newId) => {
  if (!pendingImageToActivate.value || !newId) return
  const slotImages = phImagesStore.getSlotImages(newId)
  const exists = Object.values(slotImages).flat().some(e => e.imageId === pendingImageToActivate.value)
  if (exists) phImagesStore.setActiveImage(pendingImageToActivate.value!)
  pendingImageToActivate.value = null
})

// ── Global toolbar ───────────────────────────────────────────────────────────
const listRows = computed(() => layersStore.rows.map(r => ({
  id:    r.id,
  slot:  r.kind === 'slot' ? fileLoaderStore.spineSlots.find(s => s.id === r.id) : undefined,
  layer: r.kind === 'layer' ? layersStore.layers.find(l => l.id === r.id) : undefined,
})))

const validSlots = computed(() =>
  fileLoaderStore.spineSlots.filter(s => !s.error && !(s.validationErrors?.length)),
)

const { globalSyncEnabled, globalPinEnabled, globalExpandEnabled } = storeToRefs(slotUIStore)

function slotHasTracks(slot: SpineSlot): boolean {
  if (slot.id === slotSelectionStore.activeSlotId) return animationStore.tracks.length > 0
  const s = slot.savedState
  if (!s) return false
  if (s.selectedAnimation) return true
  return Object.values(s.trackPlaylists).some(pl => pl.length > 0)
}

const slotsWithTracks = computed(() => validSlots.value.filter(s => slotHasTracks(s)))

const hasAnyPlaceholders = computed(() =>
  validSlots.value.some(s => s.placeholders?.some(p => p.kind === 'slot')),
)


function toggleAllSync(): void {
  globalSyncEnabled.value = !globalSyncEnabled.value
  for (const slot of validSlots.value) fileLoaderStore.setSyncEnabled(slot.id, globalSyncEnabled.value)
  phImagesStore.setAllImagesSync(globalSyncEnabled.value)
  layersStore.setAllSync(globalSyncEnabled.value)
}

function toggleAllPin(): void {
  globalPinEnabled.value = !globalPinEnabled.value
  for (const slot of slotsWithTracks.value) slotSelectionStore.setPinned(slot.id, globalPinEnabled.value)
}

function toggleAllExpand(): void {
  globalExpandEnabled.value = !globalExpandEnabled.value
  const withPh = validSlots.value.filter(s => s.placeholders?.some(p => p.kind === 'slot'))
  const s = new Set(expandedSlots.value)
  if (globalExpandEnabled.value) {
    for (const slot of withPh) s.add(slot.id)
  } else {
    for (const slot of withPh) s.delete(slot.id)
  }
  expandedSlots.value = s
}


// ── Placeholder tree expand/collapse ────────────────────────────────────────
const expandedSlots = ref<Set<string>>(new Set())

function toggleExpand(id: string): void {
  const s = new Set(expandedSlots.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expandedSlots.value = s
}

function onExpandBtnClick(id: string): void {
  if (id !== slotSelectionStore.activeSlotId) {
    slotSelectionStore.setActiveSlot(id)
    layersStore.deactivateItems()
    const s = new Set(expandedSlots.value)
    s.add(id)
    expandedSlots.value = s
  } else {
    toggleExpand(id)
  }
}

/** True for both classification errors (slot.error) and content validation errors (slot.validationErrors). */
function isSlotError(slot: SpineSlot): boolean {
  return !!slot.error || !!(slot.validationErrors?.length)
}

const validCount = computed(() => fileLoaderStore.spineSlots.filter(s => !isSlotError(s)).length)
const errorCount = computed(() => fileLoaderStore.spineSlots.filter(s =>  isSlotError(s)).length)

// ── Clone ────────────────────────────────────────────────────────────────────
function onClone(id: string) {
  const src = fileLoaderStore.spineSlots.find(s => s.id === id)
  if (!src || src.error) return

  // Only flush live state when cloning the active slot — for inactive slots
  // the saved state already reflects their last known state correctly.
  if (id === slotSelectionStore.activeSlotId) {
    fileLoaderStore.saveSlotState(id, buildSlotSavedState({
      playback:             animationStore,
      activeSkins:          skeletonStore.activeSkins,
      showPlaceholders:     viewerStore.showPlaceholders,
      disabledPlaceholders: viewerStore.disabledPlaceholders,
      slot:                 src,
      trackTimes:           trackTimesOf(animationStore.tracks),
    }))
  }

  const newSlot = fileLoaderStore.cloneSlot(id)
  if (!newSlot) return
  layersStore.placeRow(newSlot.id, id, 'before')
  slotSelectionStore.setActiveSlot(newSlot.id)
}

// ── Drag-and-drop reorder ────────────────────────────────────────────────────
const dragSrcKey     = ref<string | null>(null)
const dragOverKey    = ref<string | null>(null)
const dropPosition   = ref<'top' | 'bottom'>('top')

function onDragStart(e: DragEvent, key: string, mime: string) {
  dragSrcKey.value  = key
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
    // a placeholder drop zone takes the row as a child spine or an image
    e.dataTransfer.setData(mime, key)
  }
}

function onDragOver(e: DragEvent, key: string) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverKey.value = key
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dropPosition.value = layersStore.layers.some(l => l.id === key && l.background) || (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom'
}

function onDragLeave() {
  dragOverKey.value = null
}

function readChildRef(e: DragEvent, mime: string): PlaceholderChildRef | null {
  const data = e.dataTransfer?.getData(mime)
  return data ? JSON.parse(data) as PlaceholderChildRef : null
}

async function onDrop(e: DragEvent, targetKey: string) {
  e.preventDefault()
  const where  = dropPosition.value === 'top' ? 'before' : 'after'
  const srcKey = dragSrcKey.value
  onDragEnd()

  const spine = readChildRef(e, PH_SPINE_MIME)
  if (spine) return actions.promoteSpine(spine, targetKey, where)
  const image = readChildRef(e, PH_IMAGE_MIME)
  if (image) return actions.promoteImage(image, targetKey, where)
  if (srcKey) layersStore.placeRow(srcKey, targetKey, where)
}

function onDragEnd() {
  dragSrcKey.value  = null
  dragOverKey.value = null
}

// ── Drop zone ────────────────────────────────────────────────────────────────
const dropzoneActive = ref(false)

async function onDropzoneFiles(e: DragEvent) {
  dropzoneActive.value = false
  const files = Array.from(e.dataTransfer?.files ?? [])
  await handleDroppedFiles(files)
}

async function handleDroppedFiles(files: File[]): Promise<void> {
  if (files.length === 0) return

  const imageExts  = /\.(png|jpe?g|webp|gif|avif)$/i
  const spineExts  = /\.(json|skel|atlas)$/i
  const hasImages  = files.some(f => imageExts.test(f.name))
  const hasSpine   = files.some(f => spineExts.test(f.name))

  if (!hasSpine && hasImages) {
    const imgFile = files.find(f => imageExts.test(f.name))!
    const dataUrl = await readFileAsDataURL(imgFile)
    layersStore.addLayer({ name: imgFile.name, dataUrl, scale: 1 })
    return
  }

  if (hasSpine) {
    const result = await groupSpineFiles(files)
    if (result.globalError) {
      window.alert(result.globalError)
      return
    }
    const inheritDesync  = !globalSyncEnabled.value
    const inheritExpand  = globalExpandEnabled.value
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
      if (!slot.error) {
        if (inheritDesync) fileLoaderStore.setSyncEnabled(slot.id, false)
        if (inheritExpand && slot.placeholders?.some(p => p.kind === 'slot')) {
          const s = new Set(expandedSlots.value)
          s.add(slot.id)
          expandedSlots.value = s
        }
      }
    }
    layersStore.placeOnTop(added.filter(id => fileLoaderStore.spineSlots.some(s => s.id === id)))
  }
}

defineExpose({ handleDroppedFiles })

// ── Modified indicator ───────────────────────────────────────────────────────
function isModified(slot: SpineSlot): boolean {
  if (slot.error) return false

  if (slot.id === slotSelectionStore.activeSlotId) {
    return (
      Object.keys(animationStore.trackPlaylists).length > 0 ||
      animationStore.speed !== 1 ||
      viewerStore.zoom !== 1 ||
      viewerStore.posX !== 0 ||
      viewerStore.posY !== 0 ||
      slot.syncEnabled === false ||
      (slot.indPosX ?? 0) !== 0 ||
      (slot.indPosY ?? 0) !== 0 ||
      (slot.indZoom ?? 1) !== 1
    )
  }

  const s = slot.savedState
  if (!s) return false
  return (
    Object.keys(s.trackPlaylists).length > 0 ||
    s.speed !== 1 ||
    (s.syncEnabled === false) ||
    (s.indPosX ?? 0) !== 0 ||
    (s.indPosY ?? 0) !== 0 ||
    (s.indZoom ?? 1) !== 1
  )
}

function modifiedHint(slot: SpineSlot): string {
  const parts: string[] = []

  const playlists = slot.id === slotSelectionStore.activeSlotId
    ? animationStore.trackPlaylists
    : slot.savedState?.trackPlaylists ?? {}

  const speed = slot.id === slotSelectionStore.activeSlotId
    ? animationStore.speed
    : (slot.savedState?.speed ?? 1)

  const syncEnabled = slot.id === slotSelectionStore.activeSlotId
    ? (slot.syncEnabled !== false)
    : (slot.savedState?.syncEnabled !== false)

  const indZoom = slot.id === slotSelectionStore.activeSlotId
    ? (slot.indZoom ?? 1)
    : (slot.savedState?.indZoom ?? 1)

  const indPosX = slot.id === slotSelectionStore.activeSlotId
    ? (slot.indPosX ?? 0)
    : (slot.savedState?.indPosX ?? 0)

  const indPosY = slot.id === slotSelectionStore.activeSlotId
    ? (slot.indPosY ?? 0)
    : (slot.savedState?.indPosY ?? 0)

  if (Object.keys(playlists).length > 0) {
    const names = Object.values(playlists).flat().map(e => e.animationName)
    parts.push(`Anim: ${[...new Set(names)].join(', ')}`)
  }
  if (speed !== 1) parts.push(`Speed: ${speed}×`)
  if (!syncEnabled) {
    const hints: string[] = ['Desynced']
    if (indZoom !== 1) hints.push(`zoom ${indZoom.toFixed(2)}×`)
    if (indPosX !== 0 || indPosY !== 0) hints.push(`pan (${Math.round(indPosX)}, ${Math.round(indPosY)})`)
    parts.push(hints.join(' '))
  }

  return parts.join(' · ')
}
</script>

<style scoped>
.spines-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.spines-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--c-border-dim);
  flex-shrink: 0;
}

.spines-toolbar-label {
  flex: 1;
  font-size: 0.6875rem;
  color: var(--c-text-ghost);
  user-select: none;
}

.spines-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.spine-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 6px 8px;
  border-radius: 6px;
  margin: 0 6px 2px;
  cursor: pointer;
  user-select: none;
  transition: background 0.12s;
  min-width: 0;
  position: relative;
}

/* Drop indicator lines */
.spine-item--drop-top::before,
.spine-item--drop-bottom::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  height: 2px;
  background: var(--c-accent);
  border-radius: 1px;
  pointer-events: none;
}
.spine-item--drop-top::before  { top: -1px; }
.spine-item--drop-bottom::after { bottom: -1px; }

.spine-item--dragging {
  opacity: 0.4;
}

/* Drag handle */
.spine-drag-handle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  color: var(--c-text-ghost);
  cursor: grab;
  opacity: 0;
  transition: opacity 0.12s;
  padding: 2px 1px;
}
.spine-drag-handle--placeholder {
  width: 10px;
  cursor: default;
}
.spine-item:hover .spine-drag-handle:not(.spine-drag-handle--placeholder) {
  opacity: 1;
}
.spine-drag-handle:active {
  cursor: grabbing;
}

.spine-item:hover:not(.spine-item--error) {
  background: var(--c-hover);
}

.spine-item--active {
  background: var(--c-selection) !important;
  box-shadow: inset 2px 0 0 var(--c-accent);
}

.spine-item--pinned {
  background: var(--c-success-soft);
}

.spine-item--error {
  opacity: 0.45;
  cursor: default;
}

.spine-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-border-strong);
  flex-shrink: 0;
  transition: background 0.12s;
}

.spine-item--active .spine-dot {
  background: var(--c-accent);
}

.spine-item--pinned .spine-dot {
  background: var(--c-success);
}

.spine-name {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--c-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spine-item--active .spine-name {
  color: var(--c-text);
}

/* Modified indicator — small amber dot on the right */
.spine-modified-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-warning);
  flex-shrink: 0;
  opacity: 0.8;
}

.spine-item--active .spine-modified-dot {
  opacity: 1;
}

.spine-err-badge {
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--c-error);
  background: var(--c-error-soft);
  border: 1px solid var(--c-error);
  border-radius: 4px;
  padding: 1px 5px;
  flex-shrink: 0;
}

/* Validation errors use amber instead of red to distinguish from classification errors */
.spine-err-badge--validation {
  color: var(--c-warning);
  background: var(--c-warning-soft);
  border-color: var(--c-warning);
}

/* Sync button */
.spine-sync-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0;
  background: none;
  border: none;
  color: var(--c-success);
  cursor: pointer;
  border-radius: 3px;
  opacity: 1;
  transition: opacity 0.12s, color 0.12s;
}

.spine-sync-btn--desynced {
  color: var(--c-warning);
}

.spine-sync-btn:not(.spine-sync-btn--desynced):hover {
  background: var(--c-raised);
}

.spine-sync-btn--desynced:hover {
  background: var(--c-raised);
}

/* Clone button */
.spine-clone-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0;
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  border-radius: 3px;
  opacity: 1;
  transition: opacity 0.12s, color 0.12s;
}

.spine-clone-btn:hover {
  background: var(--c-raised);
  color: var(--c-text-muted);
}

.spine-clone-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.spine-pin-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0;
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  border-radius: 3px;
  opacity: 1;
  transition: opacity 0.12s, color 0.12s;
}

.spine-pin-btn--pinned {
  color: var(--c-success);
}

.spine-pin-btn--pending {
  color: var(--c-success);
  opacity: 0.35;
}

.spine-pin-btn:not(.spine-pin-btn--pinned):hover {
  background: var(--c-raised);
  color: var(--c-text-muted);
}

.spine-pin-btn--pinned:hover {
  background: var(--c-raised);
  color: var(--c-success);
}

/* Drop zone */
.spines-dropzone {
  margin: 4px 8px 0;
  padding: 8px;
  border: 1px dashed var(--c-border);
  border-radius: 6px;
  text-align: center;
  font-size: 0.75rem;
  color: var(--c-text-ghost);
  transition: border-color 0.15s, background 0.15s;
  cursor: default;
  flex-shrink: 0;
}

.spines-dropzone--over {
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
  color: var(--c-text-dim);
}

.spines-footer {
  padding: 8px 12px;
  font-size: 0.75rem;
  color: var(--c-text-ghost);
  border-top: 1px solid var(--c-border);
  flex-shrink: 0;
}

/* Expand chevron button */
.spine-expand-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0;
  background: none;
  border: none;
  color: var(--c-warning);
  cursor: pointer;
  border-radius: 3px;
  transition: color 0.12s, transform 0.15s;
}

.spine-expand-btn:hover {
  background: var(--c-raised);
  color: var(--c-warning);
}

.spine-expand-btn--open {
  transform: rotate(180deg);
  color: var(--c-warning);
}

.spine-layer-thumb {
  width: 18px;
  height: 18px;
  object-fit: cover;
  border-radius: 2px;
  flex-shrink: 0;
  border: 1px solid var(--c-border);
}

.spine-bg-check {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 4px;
  gap: 3px;
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--c-text-muted);
  cursor: pointer;
}

.spine-bg-check input {
  margin: 0;
}

.spine-layer-remove {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0;
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  font-size: 0.875rem;
  line-height: 1;
  border-radius: 3px;
}

.spine-layer-remove:hover {
  background: var(--c-error-soft);
  color: var(--c-error);
}

/* row gap is 6px: pull adjacent action buttons to 2px, "×" ends up 4px */
.spine-item > button + button {
  margin-left: -4px;
}
.spine-item > button + .spine-layer-remove {
  margin-left: -2px;
}

/* Placeholder tree */
.spine-child-prefix {
  flex-shrink: 0;
  margin-left: 4px;
  color: var(--c-text-ghost);
  font-size: 0.75rem;
}
</style>
