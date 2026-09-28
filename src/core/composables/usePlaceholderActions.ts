/**
 * @file usePlaceholderActions.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { nextTick } from 'vue'
import { useFileLoaderStore, SPINE_SLOTS_LIMIT, cloneSavedState } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'
import { buildSlotSavedState, trackTimesOf } from '@/core/utils/slotState'
import { groupSpineFiles } from '@/core/utils/fileLoader'
import { spineVersionProblem } from '@/core/utils/versionDetector'
import type { FileSet, PHSpineEntry, SpineSlot } from '@/core/types/FileSet'

/** A placeholder child being dragged: its entry id and where it currently lives. */
export interface PlaceholderChildRef {
  imageId: string
  srcSlotId: string
  srcPhName: string
}

const SPINE_FILE_RE = /\.(json|skel|atlas)$/i

/** Drag data type of a Spines list row; a placeholder drop zone takes it as a child spine. */
export const SPINE_SLOT_MIME = 'application/x-spine-slot'
export const PH_IMAGE_MIME = 'application/x-ph-image'
export const PH_SPINE_MIME = 'application/x-ph-spine'
export const IMAGE_LAYER_MIME = 'application/x-image-layer'

function isSlotError(slot: SpineSlot): boolean {
  return !!slot.error || !!(slot.validationErrors?.length)
}

/** Store-level actions behind the Spines tab placeholder tree: drops, moves, clones and removals of placeholder children. */
export function usePlaceholderActions() {
  const fileLoaderStore    = useFileLoaderStore()
  const slotSelectionStore = useSlotSelectionStore()
  const phImagesStore      = usePlaceholderImagesStore()
  const versionStore       = useVersionStore()
  const animationStore     = useAnimationStore()
  const skeletonStore      = useSkeletonStore()
  const viewerStore        = useViewerStore()
  const layersStore        = useImageLayersStore()

  /** A child spine runs on its own version's runtime; only a version of the other Pixi major is refused. */
  function childVersionProblem(fileSet: FileSet): string | null {
    const globalVersion = versionStore.spineVersion
    if (!globalVersion) return 'Select a Spine version before adding child spines'
    return spineVersionProblem(fileSet, globalVersion)
  }

  /** Files dropped on a placeholder: spine files become a child spine, images become sprites. */
  async function dropFiles(files: File[], slotId: string, phName: string): Promise<void> {
    if (files.some(f => SPINE_FILE_RE.test(f.name))) {
      await addSpineFromFiles(files, slotId, phName)
      return
    }
    for (const file of files.filter(f => f.type.startsWith('image/'))) {
      await phImagesStore.addImage(slotId, phName, file)
    }
  }

  async function addSpineFromFiles(files: File[], slotId: string, phName: string): Promise<void> {
    const result = await groupSpineFiles(files)
    if (result.globalError) {
      window.alert(result.globalError)
      return
    }
    if (result.slots.length === 0 || result.slots[0].error) {
      window.alert(result.slots[0]?.error ?? 'Could not load spine files')
      return
    }
    const fileSet = result.slots[0].fileSet!
    const versionProblem = childVersionProblem(fileSet)
    if (versionProblem) {
      window.alert(versionProblem)
      return
    }
    if (fileLoaderStore.spineSlots.length >= SPINE_SLOTS_LIMIT) {
      window.alert(`Cannot add more spines: limit of ${SPINE_SLOTS_LIMIT} reached`)
      return
    }
    const childId = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    fileLoaderStore.addSlot({
      id: childId,
      name: fileSet.skeleton.filename,
      fileSet,
      parentSlotId: slotId,
    })
    phImagesStore.addSpineChild(slotId, phName, {
      kind: 'spine',
      imageId: crypto.randomUUID(),
      childSlotId: childId,
      fileName: fileSet.skeleton.filename,
      fileSet,
      syncEnabled: true,
      posX: 0,
      posY: 0,
      scale: 1,
    })
  }

  /** Reorders an image inside its placeholder (`beforeImageId`) or moves it to another placeholder. */
  function moveImage(src: PlaceholderChildRef, dstSlotId: string, dstPhName: string, beforeImageId?: string): void {
    if (src.srcSlotId === dstSlotId && src.srcPhName === dstPhName) {
      if (beforeImageId) reorder(dstSlotId, dstPhName, src.imageId, beforeImageId)
      return
    }
    phImagesStore.moveChild(src.srcSlotId, src.srcPhName, src.imageId, dstSlotId, dstPhName)
    fileLoaderStore.patchSlotPlaceholderImages(src.srcSlotId, phImagesStore.getSlotImages(src.srcSlotId))
    activateDestination(dstSlotId)
  }

  function activateDestination(dstSlotId: string): void {
    if (dstSlotId !== slotSelectionStore.activeSlotId && !slotSelectionStore.isPinned(dstSlotId)) {
      fileLoaderStore.patchSlotPlaceholderImages(dstSlotId, phImagesStore.getSlotImages(dstSlotId))
      slotSelectionStore.setActiveSlot(dstSlotId)
    }
  }

  /** Reorders a child spine inside its placeholder (`beforeEntryId`) or moves it to another placeholder. */
  async function moveSpine(src: PlaceholderChildRef, dstSlotId: string, dstPhName: string, beforeEntryId?: string): Promise<void> {
    if (src.srcSlotId === dstSlotId && src.srcPhName === dstPhName) {
      if (beforeEntryId) reorder(dstSlotId, dstPhName, src.imageId, beforeEntryId)
      return
    }
    const entry = phImagesStore.getPlaceholderSpineEntries(src.srcSlotId, src.srcPhName).find(en => en.imageId === src.imageId)
    if (!entry) return
    // Leave the child first so the slot watcher does not treat the reparented adapter as the active one.
    if (slotSelectionStore.activeSlotId === entry.childSlotId) {
      slotSelectionStore.setActiveSlot(src.srcSlotId)
      await nextTick()
    }
    const childSlot = fileLoaderStore.spineSlots.find(s => s.id === entry.childSlotId)
    if (childSlot) {
      childSlot.parentSlotId = dstSlotId
      childSlot.indPosX = 0
      childSlot.indPosY = 0
    }
    phImagesStore.moveChild(src.srcSlotId, src.srcPhName, src.imageId, dstSlotId, dstPhName)
    fileLoaderStore.patchSlotPlaceholderImages(src.srcSlotId, phImagesStore.getSlotImages(src.srcSlotId))
    activateDestination(dstSlotId)
  }

  /** Makes a child spine a top-level skeleton at the drop row and activates it. */
  async function promoteSpine(src: PlaceholderChildRef, targetKey: string, where: 'before' | 'after'): Promise<void> {
    const entry = phImagesStore.getPlaceholderSpineEntries(src.srcSlotId, src.srcPhName).find(en => en.imageId === src.imageId)
    if (!entry) return
    if (slotSelectionStore.activeSlotId === entry.childSlotId) {
      slotSelectionStore.setActiveSlot(src.srcSlotId)
      await nextTick()
    }
    phImagesStore.removeSpineChild(src.srcSlotId, src.srcPhName, entry.imageId)
    fileLoaderStore.patchSlotPlaceholderImages(src.srcSlotId, phImagesStore.getSlotImages(src.srcSlotId))
    await nextTick()
    const slot = fileLoaderStore.spineSlots.find(s => s.id === entry.childSlotId)
    if (!slot) return
    const reset = { syncEnabled: true, indPosX: 0, indPosY: 0, indZoom: 1 }
    slot.parentSlotId = undefined
    Object.assign(slot, reset)
    if (slot.savedState) slot.savedState = { ...slot.savedState, ...reset }
    layersStore.placeRow(slot.id, targetKey, where)
    slotSelectionStore.setActiveSlot(slot.id)
  }

  /** Turns a placeholder image into an image layer at the drop row. */
  function promoteImage(src: PlaceholderChildRef, targetKey: string, where: 'before' | 'after'): void {
    const entry = phImagesStore.getPlaceholderImages(src.srcSlotId, src.srcPhName).find(en => en.imageId === src.imageId)
    if (entry?.kind !== 'image') return
    phImagesStore.removeImage(src.srcSlotId, src.srcPhName, entry.imageId)
    fileLoaderStore.patchSlotPlaceholderImages(src.srcSlotId, phImagesStore.getSlotImages(src.srcSlotId))
    const layerId = layersStore.addLayer({ name: entry.fileName, dataUrl: entry.dataURL, scale: entry.scale })
    layersStore.placeRow(layerId, targetKey, where)
  }

  /** Turns an image layer into the last image of a placeholder. */
  function demoteLayer(layerId: string, dstSlotId: string, phName: string): void {
    const layer = layersStore.layers.find(l => l.id === layerId)
    if (!layer) return
    phImagesStore.addImageData(dstSlotId, phName, { fileName: layer.name, dataURL: layer.dataUrl, scale: layer.scale })
    layersStore.removeLayer(layerId)
    activateDestination(dstSlotId)
  }

  function reorder(slotId: string, phName: string, movedId: string, beforeId: string): void {
    if (movedId === beforeId) return
    const ids = phImagesStore.getPlaceholderImages(slotId, phName).map(en => en.imageId)
    const srcIdx = ids.indexOf(movedId)
    const dstIdx = ids.indexOf(beforeId)
    if (srcIdx === -1 || dstIdx === -1 || srcIdx === dstIdx) return
    ids.splice(srcIdx, 1)
    ids.splice(dstIdx, 0, movedId)
    phImagesStore.reorderChildren(slotId, phName, ids)
  }

  /** Turns a top-level spine into a child spine of another spine's placeholder, keeping its saved animation state. */
  async function moveSlotIntoPlaceholder(slotId: string, dstSlotId: string, phName: string): Promise<void> {
    const slot = fileLoaderStore.spineSlots.find(s => s.id === slotId)
    if (!slot?.fileSet || slot.parentSlotId || isSlotError(slot) || slotId === dstSlotId) return
    if (Object.values(phImagesStore.getSlotImages(slotId)).some(entries => entries.length > 0)) {
      window.alert('Remove the images and child spines from the placeholders of this spine before moving it into a placeholder')
      return
    }
    const versionProblem = childVersionProblem(slot.fileSet)
    if (versionProblem) {
      window.alert(versionProblem)
      return
    }
    if (slotSelectionStore.isPinned(slotId)) slotSelectionStore.setPinned(slotId, false)
    // Same order as removing an active child: let the slot watcher save and unload the slot first.
    if (slotSelectionStore.activeSlotId === slotId) {
      slotSelectionStore.setActiveSlot(dstSlotId)
      await nextTick()
    }
    layersStore.detachTopLevel(slotId)
    slot.parentSlotId = dstSlotId
    slot.syncEnabled  = true
    slot.indPosX      = 0
    slot.indPosY      = 0
    slot.indZoom      = 1
    phImagesStore.clearSlotImages(slotId)
    phImagesStore.addSpineChild(dstSlotId, phName, {
      kind: 'spine',
      imageId: crypto.randomUUID(),
      childSlotId: slotId,
      fileName: slot.name,
      fileSet: slot.fileSet,
      syncEnabled: true,
      posX: 0,
      posY: 0,
      scale: 1,
    })
    fileLoaderStore.patchSlotPlaceholderImages(dstSlotId, phImagesStore.getSlotImages(dstSlotId))
  }

  /** Sync lives on both the entry (panel) and the child slot (canvas guards). */
  function toggleSpineChildSync(slotId: string, phName: string, entry: PHSpineEntry): void {
    const newSync = !entry.syncEnabled
    phImagesStore.toggleImageSync(slotId, phName, entry.imageId)
    fileLoaderStore.setSyncEnabled(entry.childSlotId, newSync)
  }

  function isChildSlotReferenced(childSlotId: string): boolean {
    for (const phMap of Object.values(phImagesStore.children)) {
      for (const entries of Object.values(phMap)) {
        if (entries.some(e => e.kind === 'spine' && e.childSlotId === childSlotId)) return true
      }
    }
    return false
  }

  async function removeSpineChild(slotId: string, phName: string, entry: PHSpineEntry): Promise<void> {
    // If the child spine slot is currently active, switch to the parent first and let
    // the activeSlotId watcher run (with the child slot still in spineSlots) before
    // removing the slot from the store. Without nextTick the watcher fires after the
    // slot is already gone, prevSlot becomes null, and the parent adapter gets destroyed.
    if (slotSelectionStore.activeSlotId === entry.childSlotId) {
      slotSelectionStore.setActiveSlot(slotId)
      await nextTick()
    }
    phImagesStore.removeSpineChild(slotId, phName, entry.imageId)
    if (!isChildSlotReferenced(entry.childSlotId)) {
      fileLoaderStore.removeSlotCascade(entry.childSlotId)
    }
  }

  function cloneSpineChild(slotId: string, phName: string, entry: PHSpineEntry): void {
    if (fileLoaderStore.spineSlots.length >= SPINE_SLOTS_LIMIT) return
    const srcSlot = fileLoaderStore.spineSlots.find(s => s.id === entry.childSlotId)
    if (!srcSlot?.fileSet) return
    if (srcSlot.id === slotSelectionStore.activeSlotId) {
      fileLoaderStore.saveSlotState(srcSlot.id, buildSlotSavedState({
        playback:             animationStore,
        activeSkins:          skeletonStore.activeSkins,
        showPlaceholders:     viewerStore.showPlaceholders,
        disabledPlaceholders: viewerStore.disabledPlaceholders,
        slot:                 srcSlot,
        trackTimes:           trackTimesOf(animationStore.tracks),
      }))
    }
    const newChildId = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    fileLoaderStore.addSlot({
      id: newChildId,
      name: entry.fileName,
      fileSet: srcSlot.fileSet,
      parentSlotId: slotId,
      syncEnabled: false,
      savedState: srcSlot.savedState ? cloneSavedState(srcSlot.savedState) : undefined,
    })
    phImagesStore.cloneSpineChild(slotId, phName, entry.imageId, newChildId)
  }

  return {
    dropFiles,
    moveImage,
    moveSpine,
    moveSlotIntoPlaceholder,
    promoteSpine,
    promoteImage,
    demoteLayer,
    toggleSpineChildSync,
    removeSpineChild,
    cloneSpineChild,
  }
}
