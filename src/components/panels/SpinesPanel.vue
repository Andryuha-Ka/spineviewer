<!--
 * @file SpinesPanel.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="spines-panel">
    <div class="spines-list">
      <template v-for="(slot, index) in loaderStore.spineSlots" :key="slot.id">
        <div
          class="spine-item"
          :class="{
            'spine-item--active':       slot.id === loaderStore.activeSlotId,
            'spine-item--pinned':       loaderStore.isPinned(slot.id) && slot.id !== loaderStore.activeSlotId,
            'spine-item--error':        isSlotError(slot),
            'spine-item--modified':     isModified(slot),
            'spine-item--dragging':     dragSrcIndex === index,
            'spine-item--drop-top':     dragOverIndex === index && dropPosition === 'top',
            'spine-item--drop-bottom':  dragOverIndex === index && dropPosition === 'bottom',
          }"
          :title="slot.error ?? (slot.validationErrors?.length ? slot.validationErrors[0] : slot.name)"
          :draggable="!isSlotError(slot)"
          @click="!isSlotError(slot) && (loaderStore.setActiveSlot(slot.id), backgroundStore.setActive(false))"
          @dragstart="onDragStart($event, index)"
          @dragover="onDragOver($event, index)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, index)"
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
            @click.stop="loaderStore.setSyncEnabled(slot.id, slot.syncEnabled !== false ? false : true)"
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
            :disabled="loaderStore.spineSlots.length >= SPINE_SLOTS_LIMIT"
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
            :class="{ 'spine-pin-btn--pinned': loaderStore.isPinned(slot.id) }"
            title="Keep on scene when switching"
            @click.stop="loaderStore.setPinned(slot.id, !loaderStore.isPinned(slot.id))"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M17 4h-1V3a1 1 0 0 0-2 0v1H10V3a1 1 0 0 0-2 0v1H7a3 3 0 0 0-2.12 5.12L6 17v.5a.5.5 0 0 0 .5.5H11v2.5a1 1 0 0 0 2 0V18h4.5a.5.5 0 0 0 .5-.5V17l1.12-7.88A3 3 0 0 0 17 4z"/>
            </svg>
          </button>
        </div>

        <!-- Placeholder tree -->
        <div
          v-if="!isSlotError(slot) && expandedSlots.has(slot.id) && slot.placeholders?.some(p => p.kind === 'slot')"
          class="ph-tree"
        >
          <div
            v-if="slot.placeholders!.every(p => p.name === PH_PENDING_SENTINEL)"
            class="ph-pending-hint"
          >Activate spine to load placeholders</div>
          <div
            v-for="ph in slot.placeholders!.filter(p => p.kind === 'slot' && p.name !== PH_PENDING_SENTINEL)"
            :key="ph.name"
            class="ph-tree-item"
          >
            <div
              class="ph-drop-zone"
              :class="{ 'ph-drop-zone--over': isPhDragOver(slot.id, ph.name) }"
              @dragenter.prevent.stop="setPhDragOver(slot.id, ph.name, true)"
              @dragover.prevent.stop="setPhDragOver(slot.id, ph.name, true)"
              @dragleave.stop="setPhDragOver(slot.id, ph.name, false)"
              @drop.prevent.stop="onPhDrop($event, slot.id, ph.name)"
            >
              <span class="ph-drop-name">{{ ph.name }}</span>
              <span class="ph-drop-hint">drop image here</span>
            </div>
            <div class="ph-images-list">
              <div
                v-for="entry in phImagesStore.getPlaceholderImages(slot.id, ph.name)"
                :key="entry.imageId"
                class="ph-image-entry"
                :class="{ 'ph-image-entry--active': entry.imageId === phImagesStore.activeImageId }"
                @click.stop="onImageThumbClick(slot.id, ph.name, entry.imageId)"
              >
                <img
                  :src="entry.dataURL"
                  class="ph-image-thumb"
                  alt=""
                />
                <span class="ph-image-name">{{ entry.fileName }}</span>
                <button
                  class="ph-image-sync-btn"
                  :class="{ 'ph-image-sync-btn--desynced': !entry.syncEnabled }"
                  title="Sync image with slot viewport"
                  @click.stop="phImagesStore.toggleImageSync(slot.id, ph.name, entry.imageId)"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7a5 5 0 0 1 0-10h2"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                </button>
                <button
                  class="ph-image-clone-btn"
                  title="Clone image"
                  @click.stop="phImagesStore.cloneImage(slot.id, ph.name, entry.imageId)"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
                <button
                  class="ph-image-remove"
                  title="Remove image"
                  @click.stop="phImagesStore.removeImage(slot.id, ph.name, entry.imageId)"
                >×</button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Background image item (special: no pin, sync only) -->
      <div
        v-if="backgroundStore.isLoaded"
        class="spine-item spine-item--background"
        :class="{
          'spine-item--active':      backgroundStore.isActive,
          'spine-item--drop-top':    bgDropPosition === 'top' && bgDragOver,
          'spine-item--drop-bottom': bgDropPosition === 'bottom' && bgDragOver,
          'spine-item--dragging':    dragSrcIsBg,
        }"
        draggable="true"
        title="Background image"
        @click="onActivateBackground"
        @dragstart="onBgDragStart"
        @dragover="onBgDragOver"
        @dragleave="onBgDragLeave"
        @drop="onBgDrop"
        @dragend="onDragEnd"
      >
        <span class="spine-drag-handle">
          <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
            <circle cx="2" cy="2"  r="1.2"/>
            <circle cx="6" cy="2"  r="1.2"/>
            <circle cx="2" cy="6"  r="1.2"/>
            <circle cx="6" cy="6"  r="1.2"/>
            <circle cx="2" cy="10" r="1.2"/>
            <circle cx="6" cy="10" r="1.2"/>
          </svg>
        </span>
        <span class="spine-dot spine-dot--image" />
        <span class="spine-name">Background</span>
        <!-- Sync toggle for background -->
        <button
          class="spine-sync-btn"
          :class="{ 'spine-sync-btn--desynced': !backgroundStore.syncEnabled }"
          title="Sync background with global viewport"
          @click.stop="backgroundStore.setSyncEnabled(!backgroundStore.syncEnabled)"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7a5 5 0 0 1 0-10h2"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </button>
      </div>
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
import { useLoaderStore, SPINE_SLOTS_LIMIT, PH_PENDING_SENTINEL } from '@/core/stores/useLoaderStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { useBackgroundStore } from '@/core/stores/useBackgroundStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import { groupSpineFiles, readFileAsDataURL } from '@/core/utils/fileLoader'
import { validateSpineFileSet } from '@/core/utils/spineValidator'
import type { SpineSlot, SpineSlotSavedState } from '@/core/types/FileSet'

const loaderStore     = useLoaderStore()
const animationStore  = useAnimationStore()
const viewerStore     = useViewerStore()
const backgroundStore = useBackgroundStore()
const skeletonStore   = useSkeletonStore()
const phImagesStore   = usePlaceholderImagesStore()

// ── Placeholder image activation ────────────────────────────────────────────
const pendingImageToActivate = ref<string | null>(null)

function onImageThumbClick(slotId: string, _phName: string, imageId: string): void {
  if (slotId !== loaderStore.activeSlotId) {
    pendingImageToActivate.value = imageId
    loaderStore.setActiveSlot(slotId)
    backgroundStore.setActive(false)
    const s = new Set(expandedSlots.value)
    s.add(slotId)
    expandedSlots.value = s
  } else {
    phImagesStore.setActiveImage(imageId)
  }
}

watch(() => loaderStore.activeSlotId, (newId) => {
  if (!pendingImageToActivate.value || !newId) return
  const slotImages = phImagesStore.getSlotImages(newId)
  const exists = Object.values(slotImages).flat().some(e => e.imageId === pendingImageToActivate.value)
  if (exists) phImagesStore.setActiveImage(pendingImageToActivate.value!)
  pendingImageToActivate.value = null
})

// ── Placeholder tree expand/collapse ────────────────────────────────────────
const expandedSlots = ref<Set<string>>(new Set())

function toggleExpand(id: string): void {
  const s = new Set(expandedSlots.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expandedSlots.value = s
}

function onExpandBtnClick(id: string): void {
  if (id !== loaderStore.activeSlotId) {
    loaderStore.setActiveSlot(id)
    backgroundStore.setActive(false)
    const s = new Set(expandedSlots.value)
    s.add(id)
    expandedSlots.value = s
  } else {
    toggleExpand(id)
  }
}

// ── Placeholder drop zone drag state ────────────────────────────────────────
const phDragOverKey = ref<string | null>(null)

function isPhDragOver(slotId: string, phName: string): boolean {
  return phDragOverKey.value === `${slotId}:${phName}`
}

function setPhDragOver(slotId: string, phName: string, active: boolean): void {
  phDragOverKey.value = active ? `${slotId}:${phName}` : null
}

async function onPhDrop(e: DragEvent, slotId: string, phName: string): Promise<void> {
  phDragOverKey.value = null
  const files = Array.from(e.dataTransfer?.files ?? [])
  const imageFiles = files.filter(f => f.type.startsWith('image/'))
  for (const file of imageFiles) {
    await phImagesStore.addImage(slotId, phName, file)
  }
}

/** True for both classification errors (slot.error) and content validation errors (slot.validationErrors). */
function isSlotError(slot: SpineSlot): boolean {
  return !!slot.error || !!(slot.validationErrors?.length)
}

const validCount = computed(() => loaderStore.spineSlots.filter(s => !isSlotError(s)).length)
const errorCount = computed(() => loaderStore.spineSlots.filter(s =>  isSlotError(s)).length)

// ── Background ────────────────────────────────────────────────────────────────
function onActivateBackground() {
  backgroundStore.setActive(true)
}

// ── Clone ────────────────────────────────────────────────────────────────────
function onClone(id: string) {
  const src = loaderStore.spineSlots.find(s => s.id === id)
  if (!src || src.error) return

  // Only flush live state when cloning the active slot — for inactive slots
  // the saved state already reflects their last known state correctly.
  if (id === loaderStore.activeSlotId) {
    const liveState: SpineSlotSavedState = {
      speed:               animationStore.speed,
      selectedAnimation:   animationStore.selectedAnimation,
      currentTrack:        animationStore.currentTrack,
      loop:                animationStore.loop,
      trackEnabled:        { ...animationStore.trackEnabled },
      trackPlaylists:      JSON.parse(JSON.stringify(animationStore.trackPlaylists)),
      wasPlaying:          animationStore.isPlaying,
      selectedSkins:       [...skeletonStore.activeSkins],
      showPlaceholders:    viewerStore.showPlaceholders,
      disabledPlaceholders: [...viewerStore.disabledPlaceholders],
      syncEnabled:         src.syncEnabled ?? true,
      indPosX:             src.indPosX ?? 0,
      indPosY:             src.indPosY ?? 0,
      indZoom:             src.indZoom ?? 1,
    }
    loaderStore.saveSlotState(id, liveState)
  }

  const newSlot = loaderStore.cloneSlot(id)
  if (!newSlot) return
  loaderStore.setActiveSlot(newSlot.id)
}

// ── Drag-and-drop reorder ────────────────────────────────────────────────────
const dragSrcIndex   = ref<number | null>(null)
const dragOverIndex  = ref<number | null>(null)
const dropPosition   = ref<'top' | 'bottom'>('top')
const dragSrcIsBg    = ref(false)
const bgDragOver     = ref(false)
const bgDropPosition = ref<'top' | 'bottom'>('top')

function onDragStart(e: DragEvent, index: number) {
  dragSrcIndex.value = index
  dragSrcIsBg.value  = false
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onBgDragStart(e: DragEvent) {
  dragSrcIsBg.value  = true
  dragSrcIndex.value = null
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', 'bg')
  }
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = index
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dropPosition.value = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom'
}

function onBgDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  bgDragOver.value = true
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  bgDropPosition.value = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom'
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onBgDragLeave() {
  bgDragOver.value = false
}

function onDrop(e: DragEvent, toIndex: number) {
  e.preventDefault()

  if (dragSrcIsBg.value) {
    // Background being dropped onto a spine item
    const targetListIdx = dropPosition.value === 'top' ? toIndex : toIndex + 1
    backgroundStore.setListIndex(targetListIdx)
    dragSrcIsBg.value  = false
    dragOverIndex.value = null
    return
  }

  if (dragSrcIndex.value === null) return

  let target = toIndex
  if (dropPosition.value === 'bottom') target = toIndex + 1
  const src = dragSrcIndex.value
  if (target > src) target -= 1

  // Adjust bg listIndex when a spine crosses its position
  if (backgroundStore.isLoaded) {
    const bgIdx = backgroundStore.listIndex
    if (src < bgIdx && target >= bgIdx) {
      backgroundStore.setListIndex(bgIdx - 1)
    } else if (src >= bgIdx && target < bgIdx) {
      backgroundStore.setListIndex(bgIdx + 1)
    }
  }

  loaderStore.reorderSlots(src, target)
  dragSrcIndex.value  = null
  dragOverIndex.value = null
}

function onBgDrop(e: DragEvent) {
  e.preventDefault()
  bgDragOver.value    = false
  dragSrcIndex.value  = null
  dragOverIndex.value = null
  dragSrcIsBg.value   = false
}

function onDragEnd() {
  dragSrcIndex.value  = null
  dragOverIndex.value = null
  dragSrcIsBg.value   = false
  bgDragOver.value    = false
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
    // Image-only drop → set as background
    const imgFile = files.find(f => imageExts.test(f.name))!
    const dataUrl = await readFileAsDataURL(imgFile)
    const img = new Image()
    img.src = dataUrl
    await new Promise<void>(r => { img.onload = () => r() })
    if (backgroundStore.isLoaded) {
      const ok = window.confirm('Replace current background image?')
      if (!ok) return
    }
    backgroundStore.set({ dataUrl, width: img.naturalWidth, height: img.naturalHeight })
    backgroundStore.setListIndex(loaderStore.spineSlots.length)
    return
  }

  if (hasSpine) {
    const result = await groupSpineFiles(files)
    if (result.globalError) {
      window.alert(result.globalError)
      return
    }
    for (const slot of result.slots) {
      if (!slot.error && slot.fileSet) {
        const errs = validateSpineFileSet(slot.fileSet)
        if (errs.length > 0) slot.validationErrors = errs
      }
      loaderStore.addSlot(slot)
    }
  }
}

defineExpose({ handleDroppedFiles })

// ── Modified indicator ───────────────────────────────────────────────────────
function isModified(slot: SpineSlot): boolean {
  if (slot.error) return false

  if (slot.id === loaderStore.activeSlotId) {
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

  const playlists = slot.id === loaderStore.activeSlotId
    ? animationStore.trackPlaylists
    : slot.savedState?.trackPlaylists ?? {}

  const speed = slot.id === loaderStore.activeSlotId
    ? animationStore.speed
    : (slot.savedState?.speed ?? 1)

  const syncEnabled = slot.id === loaderStore.activeSlotId
    ? (slot.syncEnabled !== false)
    : (slot.savedState?.syncEnabled !== false)

  const indZoom = slot.id === loaderStore.activeSlotId
    ? (slot.indZoom ?? 1)
    : (slot.savedState?.indZoom ?? 1)

  const indPosX = slot.id === loaderStore.activeSlotId
    ? (slot.indPosX ?? 0)
    : (slot.savedState?.indPosX ?? 0)

  const indPosY = slot.id === loaderStore.activeSlotId
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
  background: #9d8fff;
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
  background: rgba(255, 255, 255, 0.06);
}

.spine-item--active {
  background: rgba(124, 106, 245, 0.18) !important;
}

.spine-item--pinned {
  background: rgba(74, 222, 128, 0.07);
}

.spine-item--error {
  opacity: 0.45;
  cursor: default;
}

/* Background item special styling */
.spine-item--background {
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

.spine-item--background.spine-item--active {
  border-color: rgba(124, 106, 245, 0.4);
}

.spine-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
  transition: background 0.12s;
}

.spine-item--active .spine-dot {
  background: #9d8fff;
}

.spine-item--pinned .spine-dot {
  background: #4ade80;
}

.spine-dot--image {
  background: #60a5fa;
  border-radius: 2px;
}

.spine-item--active .spine-dot--image {
  background: #93c5fd;
}

.spine-name {
  flex: 1;
  font-size: 0.8rem;
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
  background: #f59e0b;
  flex-shrink: 0;
  opacity: 0.8;
}

.spine-item--active .spine-modified-dot {
  opacity: 1;
}

.spine-err-badge {
  font-size: 0.65rem;
  font-weight: 700;
  color: #f87171;
  background: rgba(248, 113, 113, 0.15);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 4px;
  padding: 1px 5px;
  flex-shrink: 0;
}

/* Validation errors use amber instead of red to distinguish from classification errors */
.spine-err-badge--validation {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.15);
  border-color: rgba(251, 191, 36, 0.3);
}

/* Sync button */
.spine-sync-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #4ade80;
  cursor: pointer;
  padding: 2px 3px;
  border-radius: 3px;
  opacity: 1;
  transition: opacity 0.12s, color 0.12s;
}

.spine-sync-btn--desynced {
  color: #f59e0b;
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
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  padding: 2px 3px;
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
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  padding: 2px 3px;
  border-radius: 3px;
  opacity: 1;
  transition: opacity 0.12s, color 0.12s;
}

.spine-pin-btn--pinned {
  color: #4ade80;
}

.spine-pin-btn:not(.spine-pin-btn--pinned):hover {
  background: var(--c-raised);
  color: var(--c-text-muted);
}

.spine-pin-btn--pinned:hover {
  background: var(--c-raised);
  color: #4ade80;
}

/* Drop zone */
.spines-dropzone {
  margin: 4px 8px 0;
  padding: 8px;
  border: 1px dashed var(--c-border);
  border-radius: 6px;
  text-align: center;
  font-size: 0.7rem;
  color: var(--c-text-ghost);
  transition: border-color 0.15s, background 0.15s;
  cursor: default;
  flex-shrink: 0;
}

.spines-dropzone--over {
  border-color: #9d8fff;
  background: rgba(157, 143, 255, 0.08);
  color: var(--c-text-dim);
}

.spines-footer {
  padding: 8px 12px;
  font-size: 0.7rem;
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
  background: none;
  border: none;
  color: #fbbf24;
  cursor: pointer;
  padding: 2px 3px;
  border-radius: 3px;
  transition: color 0.12s, transform 0.15s;
}

.spine-expand-btn:hover {
  background: var(--c-raised);
  color: #fcd34d;
}

.spine-expand-btn--open {
  transform: rotate(180deg);
  color: #fbbf24;
}

/* Placeholder tree */
.ph-tree {
  margin: 0 8px 4px 28px;
  border-left: 1px solid var(--c-border);
  padding-left: 8px;
}

.ph-tree-item {
  margin-bottom: 6px;
}

.ph-pending-hint {
  padding: 4px 8px;
  font-size: 0.7rem;
  color: var(--c-text-ghost);
  font-style: italic;
}

.ph-drop-zone {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 18px;
  border: 1px dashed var(--c-border);
  border-radius: 5px;
  cursor: default;
  transition: border-color 0.12s, background 0.12s;
}

.ph-drop-zone--over {
  border-color: #9d8fff;
  background: rgba(157, 143, 255, 0.08);
}

.ph-drop-name {
  font-size: 0.75rem;
  color: var(--c-text-dim);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ph-drop-hint {
  font-size: 0.65rem;
  color: var(--c-text-ghost);
  white-space: nowrap;
}

.ph-images-list {
  margin-top: 3px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ph-image-entry {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
}

.ph-image-thumb {
  width: 18px;
  height: 18px;
  object-fit: cover;
  border-radius: 2px;
  flex-shrink: 0;
  border: 1px solid var(--c-border);
}

.ph-image-entry--active {
  background: rgba(157, 143, 255, 0.08);
}

.ph-image-entry--active .ph-image-thumb {
  outline: 1.5px solid #9d8fff;
  border-radius: 2px;
}

.ph-image-sync-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  background: none;
  border: none;
  color: #4ade80;
  cursor: pointer;
  padding: 0;
  border-radius: 3px;
  transition: color 0.12s, background 0.12s;
}

.ph-image-sync-btn--desynced {
  color: #f59e0b;
}

.ph-image-sync-btn:hover {
  background: var(--c-raised);
}

.ph-image-name {
  flex: 1;
  font-size: 0.7rem;
  color: var(--c-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ph-image-clone-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  padding: 0;
  border-radius: 3px;
  transition: color 0.12s, background 0.12s;
}

.ph-image-clone-btn:hover {
  background: var(--c-raised);
  color: var(--c-text-muted);
}

.ph-image-remove {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1;
  border-radius: 2px;
  padding: 0;
  transition: color 0.12s, background 0.12s;
}

.ph-image-remove:hover {
  background: rgba(248, 113, 113, 0.2);
  color: #f87171;
}
</style>
