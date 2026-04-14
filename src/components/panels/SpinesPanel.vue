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
      <div
        v-for="(slot, index) in loaderStore.spineSlots"
        :key="slot.id"
        class="spine-item"
        :class="{
          'spine-item--active':       slot.id === loaderStore.activeSlotId,
          'spine-item--pinned':       loaderStore.isPinned(slot.id) && slot.id !== loaderStore.activeSlotId,
          'spine-item--error':        !!slot.error,
          'spine-item--modified':     isModified(slot),
          'spine-item--dragging':     dragSrcIndex === index,
          'spine-item--drop-top':     dragOverIndex === index && dropPosition === 'top',
          'spine-item--drop-bottom':  dragOverIndex === index && dropPosition === 'bottom',
        }"
        :title="slot.error ?? slot.name"
        :draggable="!slot.error"
        @click="!slot.error && loaderStore.setActiveSlot(slot.id)"
        @dragstart="onDragStart($event, index)"
        @dragover="onDragOver($event, index)"
        @dragleave="onDragLeave"
        @drop="onDrop($event, index)"
        @dragend="onDragEnd"
      >
        <span
          v-if="!slot.error"
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
          v-if="isModified(slot) && !slot.error"
          class="spine-modified-dot"
          :title="modifiedHint(slot)"
        />
        <span v-if="slot.error" class="spine-err-badge" :title="slot.error">!</span>
        <button
          v-if="!slot.error"
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
import { useLoaderStore } from '@/core/stores/useLoaderStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import type { SpineSlot } from '@/core/types/FileSet'

const loaderStore    = useLoaderStore()
const animationStore = useAnimationStore()
const viewerStore    = useViewerStore()

const validCount = computed(() => loaderStore.spineSlots.filter(s => !s.error).length)
const errorCount = computed(() => loaderStore.spineSlots.filter(s =>  s.error).length)

// ── Drag-and-drop reorder ────────────────────────────────────────────────────
const dragSrcIndex  = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
/** 'top' = insert before, 'bottom' = insert after */
const dropPosition  = ref<'top' | 'bottom'>('top')

function onDragStart(e: DragEvent, index: number) {
  dragSrcIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = index
  // Determine whether cursor is in top or bottom half of the element
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dropPosition.value = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom'
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(e: DragEvent, toIndex: number) {
  e.preventDefault()
  if (dragSrcIndex.value === null) return
  let target = toIndex
  if (dropPosition.value === 'bottom') target = toIndex + 1
  // Adjust target for removal of source item
  const src = dragSrcIndex.value
  if (target > src) target -= 1
  loaderStore.reorderSlots(src, target)
  dragSrcIndex.value  = null
  dragOverIndex.value = null
}

function onDragEnd() {
  dragSrcIndex.value  = null
  dragOverIndex.value = null
}

/** Returns true if the slot has been changed from its default state. */
function isModified(slot: SpineSlot): boolean {
  if (slot.error) return false

  // Active slot — read live state from stores
  if (slot.id === loaderStore.activeSlotId) {
    return (
      Object.keys(animationStore.trackPlaylists).length > 0 ||
      animationStore.speed !== 1 ||
      viewerStore.zoom !== 1 ||
      viewerStore.posX !== 0 ||
      viewerStore.posY !== 0
    )
  }

  // Inactive slot — read from saved state
  const s = slot.savedState
  if (!s) return false
  return (
    Object.keys(s.trackPlaylists).length > 0 ||
    s.speed !== 1 ||
    s.zoom !== 1 ||
    s.posX !== 0 ||
    s.posY !== 0
  )
}

/** Tooltip describing what was changed. */
function modifiedHint(slot: SpineSlot): string {
  const parts: string[] = []

  const playlists = slot.id === loaderStore.activeSlotId
    ? animationStore.trackPlaylists
    : slot.savedState?.trackPlaylists ?? {}

  const zoom = slot.id === loaderStore.activeSlotId
    ? viewerStore.zoom
    : (slot.savedState?.zoom ?? 1)

  const posX = slot.id === loaderStore.activeSlotId
    ? viewerStore.posX
    : (slot.savedState?.posX ?? 0)

  const posY = slot.id === loaderStore.activeSlotId
    ? viewerStore.posY
    : (slot.savedState?.posY ?? 0)

  const speed = slot.id === loaderStore.activeSlotId
    ? animationStore.speed
    : (slot.savedState?.speed ?? 1)

  if (Object.keys(playlists).length > 0) {
    const names = Object.values(playlists)
      .flat()
      .map(e => e.animationName)
    parts.push(`Anim: ${[...new Set(names)].join(', ')}`)
  }
  if (zoom !== 1)            parts.push(`Zoom: ${zoom.toFixed(2)}×`)
  if (posX !== 0 || posY !== 0) parts.push(`Pan: (${Math.round(posX)}, ${Math.round(posY)})`)
  if (speed !== 1)           parts.push(`Speed: ${speed}×`)

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
  gap: 8px;
  padding: 6px 12px 6px 8px;
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
  opacity: 0;
  transition: opacity 0.12s, color 0.12s;
}

.spine-item:hover .spine-pin-btn,
.spine-pin-btn--pinned {
  opacity: 1;
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

.spines-footer {
  padding: 8px 12px;
  font-size: 0.7rem;
  color: var(--c-text-ghost);
  border-top: 1px solid var(--c-border);
}
</style>
