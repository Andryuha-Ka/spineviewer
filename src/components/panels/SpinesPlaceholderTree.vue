<!--
 * @file SpinesPlaceholderTree.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="ph-tree">
    <div
      v-if="spineSlot.placeholders!.every(p => p.name === PH_PENDING_SENTINEL)"
      class="ph-pending-hint"
    >Activate spine to load placeholders</div>
    <div
      v-for="ph in spineSlot.placeholders!.filter(p => p.kind === 'slot' && p.name !== PH_PENDING_SENTINEL)"
      :key="ph.name"
      class="ph-tree-item"
    >
      <div
        class="ph-drop-zone"
        :class="{ 'ph-drop-zone--over': isPhDragOver(spineSlot.id, ph.name) }"
        @dragenter.prevent.stop="setPhDragOver(spineSlot.id, ph.name, true)"
        @dragover.prevent.stop="setPhDragOver(spineSlot.id, ph.name, true)"
        @dragleave.stop="setPhDragOver(spineSlot.id, ph.name, false)"
        @drop.prevent.stop="onPhDrop($event, spineSlot.id, ph.name)"
      >
        <span class="ph-drop-name">{{ ph.name }}</span>
        <span class="ph-drop-hint">drop image or spine files here</span>
      </div>
      <div class="ph-images-list">
        <template
          v-for="entry in phImagesStore.getPlaceholderImages(spineSlot.id, ph.name)"
          :key="entry.imageId"
        >
          <div
            v-if="entry.kind === 'image'"
            class="ph-image-entry"
            :class="{
              'ph-image-entry--active':   entry.imageId === phImagesStore.activeImageId,
              'ph-image-entry--dragging': entry.imageId === draggingPhImageId,
              'ph-image-entry--drag-over': entry.imageId === dragOverPhImageId && entry.imageId !== draggingPhImageId,
            }"
            draggable="true"
            @click.stop="emit('thumbClick', spineSlot.id, entry.imageId)"
            @dragstart.stop="onPhImageDragStart($event, entry.imageId, spineSlot.id, ph.name)"
            @dragend.stop="onPhImageDragEnd"
            @dragover.prevent.stop="dragOverPhImageId = entry.imageId"
            @dragleave.stop="dragOverPhImageId = null"
            @drop.prevent.stop="onPhImageEntryDrop($event, spineSlot.id, ph.name, entry.imageId)"
          >
            <span
              class="ph-image-drag-handle"
              title="Drag to reorder or move to another placeholder"
            >
              <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
                <circle cx="1.5" cy="1.5" r="1.2"/>
                <circle cx="4.5" cy="1.5" r="1.2"/>
                <circle cx="1.5" cy="5"   r="1.2"/>
                <circle cx="4.5" cy="5"   r="1.2"/>
                <circle cx="1.5" cy="8.5" r="1.2"/>
                <circle cx="4.5" cy="8.5" r="1.2"/>
              </svg>
            </span>
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
              @click.stop="phImagesStore.toggleImageSync(spineSlot.id, ph.name, entry.imageId)"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7a5 5 0 0 1 0-10h2"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </button>
            <button
              class="ph-image-clone-btn"
              title="Clone image"
              @click.stop="phImagesStore.cloneImage(spineSlot.id, ph.name, entry.imageId)"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <button
              class="ph-image-remove"
              title="Remove image"
              @click.stop="phImagesStore.removeImage(spineSlot.id, ph.name, entry.imageId)"
            >×</button>
          </div>
          <div
            v-else-if="entry.kind === 'spine'"
            class="ph-spine-entry"
            :class="{
              'ph-spine-entry--active':    slotSelectionStore.activeSlotId === entry.childSlotId,
              'ph-spine-entry--dragging':  entry.imageId === draggingPhSpineId,
              'ph-spine-entry--drag-over': entry.imageId === dragOverPhSpineId && entry.imageId !== draggingPhSpineId,
            }"
            draggable="true"
            @click.stop="slotSelectionStore.setActiveSlot(entry.childSlotId)"
            @dragstart.stop="onPhSpineDragStart($event, entry.imageId, spineSlot.id, ph.name)"
            @dragend.stop="onPhSpineDragEnd"
            @dragover.prevent.stop="dragOverPhSpineId = entry.imageId"
            @dragleave.stop="dragOverPhSpineId = null"
            @drop.prevent.stop="onPhSpineEntryDrop($event, spineSlot.id, ph.name, entry.imageId)"
          >
            <span class="ph-image-drag-handle" title="Drag to reorder or move to another placeholder">
              <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
                <circle cx="1.5" cy="1.5" r="1.2"/>
                <circle cx="4.5" cy="1.5" r="1.2"/>
                <circle cx="1.5" cy="5"   r="1.2"/>
                <circle cx="4.5" cy="5"   r="1.2"/>
                <circle cx="1.5" cy="8.5" r="1.2"/>
                <circle cx="4.5" cy="8.5" r="1.2"/>
              </svg>
            </span>
            <svg class="ph-spine-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
              <line x1="12" y1="2" x2="12" y2="22"/>
              <line x1="2" y1="8.5" x2="22" y2="8.5"/>
            </svg>
            <span class="ph-spine-name">{{ entry.fileName }}</span>
            <button
              class="ph-image-sync-btn"
              :class="{ 'ph-image-sync-btn--desynced': !entry.syncEnabled }"
              title="Sync child spine with slot viewport"
              @click.stop="actions.toggleSpineChildSync(spineSlot.id, ph.name, entry)"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7a5 5 0 0 1 0-10h2"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </button>
            <button
              class="ph-image-clone-btn"
              :disabled="fileLoaderStore.spineSlots.length >= SPINE_SLOTS_LIMIT"
              title="Clone child spine"
              @click.stop="actions.cloneSpineChild(spineSlot.id, ph.name, entry)"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <button
              class="ph-image-remove"
              title="Remove child spine"
              @click.stop="actions.removeSpineChild(spineSlot.id, ph.name, entry)"
            >×</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFileLoaderStore, SPINE_SLOTS_LIMIT, PH_PENDING_SENTINEL } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import { usePlaceholderActions, SPINE_SLOT_MIME, type PlaceholderChildRef } from '@/core/composables/usePlaceholderActions'
import type { SpineSlot } from '@/core/types/FileSet'

defineProps<{ spineSlot: SpineSlot }>()

const emit = defineEmits<{
  thumbClick: [slotId: string, imageId: string]
}>()

const fileLoaderStore    = useFileLoaderStore()
const slotSelectionStore = useSlotSelectionStore()
const phImagesStore      = usePlaceholderImagesStore()
const actions            = usePlaceholderActions()

const PH_IMAGE_MIME   = 'application/x-ph-image'
const PH_SPINE_MIME   = 'application/x-ph-spine'

function readRef(e: DragEvent, mime: string): PlaceholderChildRef | null {
  const data = e.dataTransfer?.getData(mime)
  return data ? JSON.parse(data) as PlaceholderChildRef : null
}

function startDrag(e: DragEvent, mime: string, ref: PlaceholderChildRef): void {
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData(mime, JSON.stringify(ref))
}

// ── Placeholder drop zone ───────────────────────────────────────────────────
const phDragOverKey = ref<string | null>(null)

function isPhDragOver(slotId: string, phName: string): boolean {
  return phDragOverKey.value === `${slotId}:${phName}`
}

function setPhDragOver(slotId: string, phName: string, active: boolean): void {
  phDragOverKey.value = active ? `${slotId}:${phName}` : null
}

async function onPhDrop(e: DragEvent, slotId: string, phName: string): Promise<void> {
  phDragOverKey.value = null
  const topLevelSlotId = e.dataTransfer?.getData(SPINE_SLOT_MIME)
  if (topLevelSlotId) {
    await actions.moveSlotIntoPlaceholder(topLevelSlotId, slotId, phName)
    return
  }
  const spine = readRef(e, PH_SPINE_MIME)
  if (spine) {
    await actions.moveSpine(spine, slotId, phName)
    return
  }
  // an image row being dragged takes priority over dropped files
  const image = readRef(e, PH_IMAGE_MIME)
  if (image) {
    actions.moveImage(image, slotId, phName)
    return
  }
  await actions.dropFiles(Array.from(e.dataTransfer?.files ?? []), slotId, phName)
}

// ── Image rows ──────────────────────────────────────────────────────────────
const draggingPhImageId = ref<string | null>(null)
const dragOverPhImageId = ref<string | null>(null)

function onPhImageDragStart(e: DragEvent, imageId: string, slotId: string, phName: string): void {
  draggingPhImageId.value = imageId
  startDrag(e, PH_IMAGE_MIME, { imageId, srcSlotId: slotId, srcPhName: phName })
}

function onPhImageDragEnd(): void {
  draggingPhImageId.value = null
  dragOverPhImageId.value = null
}

function onPhImageEntryDrop(e: DragEvent, dstSlotId: string, dstPhName: string, dstImageId: string): void {
  dragOverPhImageId.value = null
  const image = readRef(e, PH_IMAGE_MIME)
  if (image && image.imageId !== dstImageId) actions.moveImage(image, dstSlotId, dstPhName, dstImageId)
}

// ── Child spine rows ────────────────────────────────────────────────────────
const draggingPhSpineId = ref<string | null>(null)
const dragOverPhSpineId = ref<string | null>(null)

function onPhSpineDragStart(e: DragEvent, imageId: string, slotId: string, phName: string): void {
  draggingPhSpineId.value = imageId
  startDrag(e, PH_SPINE_MIME, { imageId, srcSlotId: slotId, srcPhName: phName })
}

function onPhSpineDragEnd(): void {
  draggingPhSpineId.value = null
  dragOverPhSpineId.value = null
}

async function onPhSpineEntryDrop(e: DragEvent, dstSlotId: string, dstPhName: string, dstSpineId: string): Promise<void> {
  dragOverPhSpineId.value = null
  const spine = readRef(e, PH_SPINE_MIME)
  if (spine && spine.imageId !== dstSpineId) await actions.moveSpine(spine, dstSlotId, dstPhName, dstSpineId)
}
</script>

<style scoped>
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

.ph-image-drag-handle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 10px;
  color: var(--c-text-ghost);
  padding: 0;
  opacity: 0;
  transition: opacity 0.12s;
  pointer-events: none;
}

.ph-image-entry:hover .ph-image-drag-handle {
  opacity: 1;
}

.ph-image-entry {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
  cursor: grab;
}

.ph-image-entry:active {
  cursor: grabbing;
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

.ph-image-entry--dragging {
  opacity: 0.4;
}

.ph-image-entry--drag-over {
  outline: 1px dashed var(--c-text-ghost);
  border-radius: 3px;
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

/* Child prefix in main spine list */
/* PHSpineEntry row */
.ph-spine-entry {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(157, 143, 255, 0.04);
  cursor: grab;
}

.ph-spine-entry:active {
  cursor: grabbing;
}

.ph-spine-icon {
  flex-shrink: 0;
  color: #9d8fff;
}

.ph-spine-name {
  flex: 1;
  font-size: 0.7rem;
  color: var(--c-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ph-spine-entry--active {
  background: rgba(157, 143, 255, 0.08);
}

.ph-spine-entry--active .ph-spine-icon {
  color: #b8aaff;
}

.ph-spine-entry--dragging {
  opacity: 0.4;
}

.ph-spine-entry--drag-over {
  outline: 1px dashed var(--c-text-ghost);
  border-radius: 3px;
}
</style>
