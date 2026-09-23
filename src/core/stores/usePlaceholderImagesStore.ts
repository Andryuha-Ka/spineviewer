/**
 * @file usePlaceholderImagesStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import type { PHImageEntry, PHChildEntry, PHSpineEntry } from '@/core/types/FileSet'
import { readFileAsDataURL } from '@/core/utils/fileLoader'

export type { PHImageEntry, PHChildEntry, PHSpineEntry }

type PHChildAction =
  | { type: 'add';           slotId: string; phName: string; imageId: string; dataURL: string }
  | { type: 'remove';        slotId: string; phName: string; imageId: string }
  | { type: 'reorder-child'; slotId: string; phName: string; orderedIds: string[] }
  | { type: 'move-child';    slotId: string; phName: string; imageId: string; dataURL?: string; dstSlotId: string; dstPhName: string; scale: number; kind: 'image' | 'spine' }
  | { type: 'add-spine';     slotId: string; phName: string; imageId: string; childSlotId: string }
  | { type: 'remove-spine';  slotId: string; phName: string; imageId: string; childSlotId: string }

export const usePlaceholderImagesStore = defineStore('placeholder-images', () => {
  /** slotId → phName → entries[] */
  const children = ref<Record<string, Record<string, PHChildEntry[]>>>({})
  const _pendingActions = ref<PHChildAction[]>([])
  const activeImageId = ref<string | null>(null)

  const hasPendingActions = computed(() => _pendingActions.value.length > 0)

  async function addImage(slotId: string, phName: string, file: File): Promise<void> {
    const dataURL = await readFileAsDataURL(file)
    const imageId = crypto.randomUUID()

    if (!children.value[slotId]) children.value[slotId] = {}
    if (!children.value[slotId][phName]) children.value[slotId][phName] = []
    children.value[slotId][phName].push({
      kind: 'image', imageId, fileName: file.name, dataURL,
      syncEnabled: true, posX: 0, posY: 0, scale: 1,
    })

    _pendingActions.value.push({ type: 'add', slotId, phName, imageId, dataURL })
  }

  function addSpineChild(slotId: string, phName: string, entry: PHSpineEntry): void {
    if (!children.value[slotId]) children.value[slotId] = {}
    if (!children.value[slotId][phName]) children.value[slotId][phName] = []
    children.value[slotId][phName].push(entry)
    _pendingActions.value.push({ type: 'add-spine', slotId, phName, imageId: entry.imageId, childSlotId: entry.childSlotId })
  }

  function removeImage(slotId: string, phName: string, imageId: string): void {
    const entries = children.value[slotId]?.[phName]
    if (entries) {
      const idx = entries.findIndex(e => e.imageId === imageId)
      if (idx !== -1) entries.splice(idx, 1)
    }
    if (activeImageId.value === imageId) activeImageId.value = null
    _pendingActions.value.push({ type: 'remove', slotId, phName, imageId })
  }

  function removeSpineChild(slotId: string, phName: string, entryId: string): void {
    const entries = children.value[slotId]?.[phName]
    if (!entries) return
    const idx = entries.findIndex(e => e.imageId === entryId)
    if (idx === -1) return
    const [entry] = entries.splice(idx, 1)
    if (activeImageId.value === entryId) activeImageId.value = null
    _pendingActions.value.push({ type: 'remove-spine', slotId, phName, imageId: entryId, childSlotId: (entry as PHSpineEntry).childSlotId })
  }

  function setActiveImage(id: string | null): void { activeImageId.value = id }

  function updateImageTransform(slotId: string, phName: string, imageId: string, posX: number, posY: number, scale: number): void {
    const entry = children.value[slotId]?.[phName]?.find(e => e.imageId === imageId)
    if (entry) { entry.posX = posX; entry.posY = posY; entry.scale = scale }
  }

  function toggleImageSync(slotId: string, phName: string, imageId: string): void {
    const entry = children.value[slotId]?.[phName]?.find(e => e.imageId === imageId)
    if (entry) entry.syncEnabled = !entry.syncEnabled
  }

  function setAllImagesSync(value: boolean): void {
    for (const slotImages of Object.values(children.value))
      for (const entries of Object.values(slotImages))
        for (const entry of entries)
          entry.syncEnabled = value
  }

  function reorderChildren(slotId: string, phName: string, orderedIds: string[]): void {
    const entries = children.value[slotId]?.[phName]
    if (!entries) return
    const map = new Map(entries.map(e => [e.imageId, e]))
    children.value[slotId][phName] = orderedIds.map(id => map.get(id)!).filter(Boolean)
    _pendingActions.value.push({ type: 'reorder-child', slotId, phName, orderedIds })
  }

  function moveChild(srcSlotId: string, srcPhName: string, imageId: string, dstSlotId: string, dstPhName: string): void {
    const srcEntries = children.value[srcSlotId]?.[srcPhName]
    if (!srcEntries) return
    const idx = srcEntries.findIndex(e => e.imageId === imageId)
    if (idx === -1) return
    const [entry] = srcEntries.splice(idx, 1)
    if (activeImageId.value === imageId) activeImageId.value = null
    if (!children.value[dstSlotId]) children.value[dstSlotId] = {}
    if (!children.value[dstSlotId][dstPhName]) children.value[dstSlotId][dstPhName] = []
    children.value[dstSlotId][dstPhName].push({ ...entry, posX: 0, posY: 0 })
    const dataURL = entry.kind === 'image' ? entry.dataURL : undefined
    _pendingActions.value.push({ type: 'move-child', slotId: srcSlotId, phName: srcPhName, imageId, dataURL, dstSlotId, dstPhName, scale: entry.scale, kind: entry.kind })
  }

  function cloneImage(slotId: string, phName: string, imageId: string): void {
    const entry = children.value[slotId]?.[phName]?.find(e => e.imageId === imageId)
    if (!entry || entry.kind !== 'image') return
    const newId = crypto.randomUUID()
    const clone: PHImageEntry = {
      kind: 'image',
      imageId: newId,
      fileName: entry.fileName,
      dataURL: entry.dataURL,
      syncEnabled: entry.syncEnabled,
      posX: 0,
      posY: 0,
      scale: entry.scale,
    }
    children.value[slotId][phName].push(clone)
    _pendingActions.value.push({ type: 'add', slotId, phName, imageId: newId, dataURL: entry.dataURL })
  }

  function cloneSpineChild(slotId: string, phName: string, entryId: string, newChildSlotId: string): void {
    const src = children.value[slotId]?.[phName]?.find(e => e.imageId === entryId)
    if (!src || src.kind !== 'spine') return
    addSpineChild(slotId, phName, { ...src, imageId: crypto.randomUUID(), childSlotId: newChildSlotId, posX: 0, posY: 0, syncEnabled: false })
  }

  function getChildContext(imageId: string): { slotId: string; phName: string; entry: PHChildEntry } | null {
    for (const [slotId, phMap] of Object.entries(children.value)) {
      for (const [phName, entries] of Object.entries(phMap)) {
        const entry = entries.find(e => e.imageId === imageId)
        if (entry) return { slotId, phName, entry }
      }
    }
    return null
  }

  /** @internal Consumed exclusively by PreviewStage to flush pending canvas mutations. */
  function drainActions(): PHChildAction[] {
    const copy = _pendingActions.value.slice()
    _pendingActions.value = []
    return copy
  }

  /** @internal Read-only peek used by PreviewStage ticker to detect pending work. */
  function peekActions(): readonly PHChildAction[] {
    return _pendingActions.value
  }

  function clearSlotImages(slotId: string): void {
    if (activeImageId.value && getChildContext(activeImageId.value)?.slotId === slotId) activeImageId.value = null
    delete children.value[slotId]
  }

  /** True once the slot has an entry, even an emptied one — the live store then wins over savedState. */
  function hasSlot(slotId: string): boolean {
    return slotId in children.value
  }

  /** New session: drop every entry and any canvas action still queued for the old slots. */
  function reset(): void {
    children.value = {}
    _pendingActions.value = []
    activeImageId.value = null
  }

  function setSlotImages(slotId: string, state: Record<string, PHChildEntry[]> | undefined): void {
    // Rebuild plain objects per entry. PHSpineEntry.fileSet is intentionally excluded:
    // it is a non-serializable ArrayBuffer that lives in loaderStore.spineSlots, mirroring
    // how top-level spine slots keep fileSet out of savedState.
    const result: Record<string, PHChildEntry[]> = {}
    for (const [ph, entries] of Object.entries(state ?? {})) {
      result[ph] = entries.map(e => {
        if (e.kind === 'spine') {
          return {
            kind: 'spine', imageId: e.imageId, childSlotId: e.childSlotId,
            fileName: e.fileName, syncEnabled: e.syncEnabled,
            posX: e.posX, posY: e.posY, scale: e.scale,
          } as PHSpineEntry
        }
        return { kind: 'image', imageId: e.imageId, fileName: e.fileName, dataURL: e.dataURL,
          syncEnabled: e.syncEnabled, posX: e.posX, posY: e.posY, scale: e.scale } as PHImageEntry
      })
    }
    children.value[slotId] = result
  }

  function getSlotImages(slotId: string): Record<string, PHChildEntry[]> {
    return children.value[slotId] ?? {}
  }

  function getPlaceholderImages(slotId: string, phName: string): PHChildEntry[] {
    return children.value[slotId]?.[phName] ?? []
  }

  function getPlaceholderSpineEntries(slotId: string, phName: string): PHSpineEntry[] {
    return (children.value[slotId]?.[phName] ?? []).filter((e): e is PHSpineEntry => e.kind === 'spine')
  }

  return {
    // ── Query ──────────────────────────────────────────────
    children,
    activeImageId,
    hasPendingActions,
    hasSlot,
    getChildContext,
    getSlotImages,
    getPlaceholderImages,
    getPlaceholderSpineEntries,

    // ── Mutation ───────────────────────────────────────────
    addImage,
    addSpineChild,
    removeImage,
    removeSpineChild,
    setActiveImage,
    updateImageTransform,
    toggleImageSync,
    setAllImagesSync,
    reorderChildren,
    moveChild,
    cloneImage,
    cloneSpineChild,
    clearSlotImages,
    setSlotImages,
    reset,

    // ── Sync (internal queue) ──────────────────────────────
    drainActions,
    peekActions,
  }
})
