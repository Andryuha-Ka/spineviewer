/**
 * @file usePlaceholderImagesStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import type { PHImageEntry } from '@/core/types/FileSet'
import { readFileAsDataURL } from '@/core/utils/fileLoader'

export type { PHImageEntry }

interface PHImageAction {
  type: 'add' | 'remove' | 'reorder' | 'move'
  slotId: string         // srcSlotId for 'move'
  phName: string         // srcPhName for 'move'
  imageId?: string
  dataURL?: string
  orderedIds?: string[]  // for 'reorder'
  dstSlotId?: string     // for 'move'
  dstPhName?: string     // for 'move'
  scale?: number         // for 'move'
}

export const usePlaceholderImagesStore = defineStore('placeholder-images', () => {
  /** slotId → phName → entries[] */
  const images = ref<Record<string, Record<string, PHImageEntry[]>>>({})
  const _pendingActions = ref<PHImageAction[]>([])
  const activeImageId = ref<string | null>(null)

  const hasPendingActions = computed(() => _pendingActions.value.length > 0)

  async function addImage(slotId: string, phName: string, file: File): Promise<void> {
    const dataURL = await readFileAsDataURL(file)
    const imageId = crypto.randomUUID()

    if (!images.value[slotId]) images.value[slotId] = {}
    if (!images.value[slotId][phName]) images.value[slotId][phName] = []
    images.value[slotId][phName].push({
      imageId, fileName: file.name, dataURL,
      syncEnabled: true, posX: 0, posY: 0, scale: 1,
    })

    _pendingActions.value.push({ type: 'add', slotId, phName, imageId, dataURL })
  }

  function removeImage(slotId: string, phName: string, imageId: string): void {
    const entries = images.value[slotId]?.[phName]
    if (entries) {
      const idx = entries.findIndex(e => e.imageId === imageId)
      if (idx !== -1) entries.splice(idx, 1)
    }
    if (activeImageId.value === imageId) activeImageId.value = null
    _pendingActions.value.push({ type: 'remove', slotId, phName, imageId })
  }

  function setActiveImage(id: string | null): void { activeImageId.value = id }

  function updateImageTransform(slotId: string, phName: string, imageId: string, posX: number, posY: number, scale: number): void {
    const entry = images.value[slotId]?.[phName]?.find(e => e.imageId === imageId)
    if (entry) { entry.posX = posX; entry.posY = posY; entry.scale = scale }
  }

  function toggleImageSync(slotId: string, phName: string, imageId: string): void {
    const entry = images.value[slotId]?.[phName]?.find(e => e.imageId === imageId)
    if (entry) entry.syncEnabled = !entry.syncEnabled
  }

  function setAllImagesSync(value: boolean): void {
    for (const slotImages of Object.values(images.value))
      for (const entries of Object.values(slotImages))
        for (const entry of entries)
          entry.syncEnabled = value
  }

  function reorderImages(slotId: string, phName: string, orderedIds: string[]): void {
    const entries = images.value[slotId]?.[phName]
    if (!entries) return
    const map = new Map(entries.map(e => [e.imageId, e]))
    images.value[slotId][phName] = orderedIds.map(id => map.get(id)!).filter(Boolean)
    _pendingActions.value.push({ type: 'reorder', slotId, phName, orderedIds })
  }

  function moveImage(srcSlotId: string, srcPhName: string, imageId: string, dstSlotId: string, dstPhName: string): void {
    const srcEntries = images.value[srcSlotId]?.[srcPhName]
    if (!srcEntries) return
    const idx = srcEntries.findIndex(e => e.imageId === imageId)
    if (idx === -1) return
    const [entry] = srcEntries.splice(idx, 1)
    if (activeImageId.value === imageId) activeImageId.value = null
    if (!images.value[dstSlotId]) images.value[dstSlotId] = {}
    if (!images.value[dstSlotId][dstPhName]) images.value[dstSlotId][dstPhName] = []
    images.value[dstSlotId][dstPhName].push({ ...entry, posX: 0, posY: 0 })
    _pendingActions.value.push({ type: 'move', slotId: srcSlotId, phName: srcPhName, imageId, dataURL: entry.dataURL, dstSlotId, dstPhName, scale: entry.scale })
  }

  function cloneImage(slotId: string, phName: string, imageId: string): void {
    const entry = images.value[slotId]?.[phName]?.find(e => e.imageId === imageId)
    if (!entry) return
    const newId = crypto.randomUUID()
    const clone: PHImageEntry = {
      imageId: newId,
      fileName: entry.fileName,
      dataURL: entry.dataURL,
      syncEnabled: entry.syncEnabled,
      posX: 0,
      posY: 0,
      scale: entry.scale,
    }
    images.value[slotId][phName].push(clone)
    _pendingActions.value.push({ type: 'add', slotId, phName, imageId: newId, dataURL: entry.dataURL })
  }

  function getImageContext(imageId: string): { slotId: string; phName: string; entry: PHImageEntry } | null {
    for (const [slotId, phMap] of Object.entries(images.value)) {
      for (const [phName, entries] of Object.entries(phMap)) {
        const entry = entries.find(e => e.imageId === imageId)
        if (entry) return { slotId, phName, entry }
      }
    }
    return null
  }

  function drainActions(): PHImageAction[] {
    const copy = _pendingActions.value.slice()
    _pendingActions.value = []
    return copy
  }

  /** Returns pending actions without removing them — for pre-processing before adapter park/destroy. */
  function peekActions(): readonly PHImageAction[] {
    return _pendingActions.value
  }

  function clearSlotImages(slotId: string): void {
    delete images.value[slotId]
  }

  function setSlotImages(slotId: string, state: Record<string, PHImageEntry[]> | undefined): void {
    images.value[slotId] = JSON.parse(JSON.stringify(state ?? {}))
  }

  function getSlotImages(slotId: string): Record<string, PHImageEntry[]> {
    return images.value[slotId] ?? {}
  }

  function getPlaceholderImages(slotId: string, phName: string): PHImageEntry[] {
    return images.value[slotId]?.[phName] ?? []
  }

  return {
    images,
    activeImageId,
    hasPendingActions,
    addImage,
    removeImage,
    setActiveImage,
    updateImageTransform,
    toggleImageSync,
    setAllImagesSync,
    reorderImages,
    moveImage,
    cloneImage,
    getImageContext,
    drainActions,
    peekActions,
    clearSlotImages,
    setSlotImages,
    getSlotImages,
    getPlaceholderImages,
  }
})
