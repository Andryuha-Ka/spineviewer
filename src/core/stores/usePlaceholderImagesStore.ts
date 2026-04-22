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
  type: 'add' | 'remove'
  slotId: string
  phName: string
  imageId: string
  dataURL?: string
}

export const usePlaceholderImagesStore = defineStore('placeholder-images', () => {
  /** slotId → phName → entries[] */
  const images = ref<Record<string, Record<string, PHImageEntry[]>>>({})
  const _pendingActions = ref<PHImageAction[]>([])

  const hasPendingActions = computed(() => _pendingActions.value.length > 0)

  async function addImage(slotId: string, phName: string, file: File): Promise<void> {
    const dataURL = await readFileAsDataURL(file)
    const imageId = crypto.randomUUID()

    if (!images.value[slotId]) images.value[slotId] = {}
    if (!images.value[slotId][phName]) images.value[slotId][phName] = []
    images.value[slotId][phName].push({ imageId, fileName: file.name, dataURL })

    _pendingActions.value.push({ type: 'add', slotId, phName, imageId, dataURL })
  }

  function removeImage(slotId: string, phName: string, imageId: string): void {
    const entries = images.value[slotId]?.[phName]
    if (entries) {
      const idx = entries.findIndex(e => e.imageId === imageId)
      if (idx !== -1) entries.splice(idx, 1)
    }
    _pendingActions.value.push({ type: 'remove', slotId, phName, imageId })
  }

  function drainActions(): PHImageAction[] {
    const copy = _pendingActions.value.slice()
    _pendingActions.value = []
    return copy
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
    hasPendingActions,
    addImage,
    removeImage,
    drainActions,
    clearSlotImages,
    setSlotImages,
    getSlotImages,
    getPlaceholderImages,
  }
})
