/**
 * @file usePlaceholderImagesStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import type { FileSet, PHImageEntry, PHChildEntry, PHSpineEntry } from '@/core/types/FileSet'
import { readFileAsDataURL } from '@/core/utils/fileLoader'
import { withoutFileSets } from '@/core/utils/slotState'

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

  async function addImage(slotId: string, phName: string, file: File, at = 0): Promise<void> {
    addImageData(slotId, phName, { fileName: file.name, dataURL: await readFileAsDataURL(file), scale: 1 }, at)
  }

  function addImageData(slotId: string, phName: string, src: { fileName: string; dataURL: string; scale: number }, at = 0): void {
    const imageId = crypto.randomUUID()
    if (!children.value[slotId]) children.value[slotId] = {}
    if (!children.value[slotId][phName]) children.value[slotId][phName] = []
    children.value[slotId][phName].splice(at, 0, {
      kind: 'image', imageId, fileName: src.fileName, dataURL: src.dataURL,
      syncEnabled: true, posX: 0, posY: 0, scale: src.scale,
    })
    _pendingActions.value.push({ type: 'add', slotId, phName, imageId, dataURL: src.dataURL })
  }

  function addSpineChild(slotId: string, phName: string, entry: PHSpineEntry, at = 0): void {
    if (!children.value[slotId]) children.value[slotId] = {}
    if (!children.value[slotId][phName]) children.value[slotId][phName] = []
    children.value[slotId][phName].splice(at, 0, entry)
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
    children.value[dstSlotId][dstPhName].unshift({ ...entry, posX: 0, posY: 0 })
    const dataURL = entry.kind === 'image' ? entry.dataURL : undefined
    _pendingActions.value.push({ type: 'move-child', slotId: srcSlotId, phName: srcPhName, imageId, dataURL, dstSlotId, dstPhName, scale: entry.scale, kind: entry.kind })
  }

  function cloneImage(slotId: string, phName: string, imageId: string): void {
    const entries = children.value[slotId]?.[phName]
    const idx = entries?.findIndex(e => e.imageId === imageId) ?? -1
    const entry = entries?.[idx]
    if (!entries || !entry || entry.kind !== 'image') return
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
    entries.splice(idx, 0, clone)
    _pendingActions.value.push({ type: 'add', slotId, phName, imageId: newId, dataURL: entry.dataURL })
  }

  function cloneSpineChild(slotId: string, phName: string, entryId: string, newChildSlotId: string): void {
    const entries = children.value[slotId]?.[phName] ?? []
    const idx = entries.findIndex(e => e.imageId === entryId)
    const src = entries[idx]
    if (!src || src.kind !== 'spine') return
    addSpineChild(slotId, phName, { ...src, imageId: crypto.randomUUID(), childSlotId: newChildSlotId, posX: 0, posY: 0, syncEnabled: false }, idx)
  }

  /** An edit replaced the child slot's skeleton: keep the entry's FileSet copy in step. */
  function setSpineChildFileSet(childSlotId: string, fileSet: FileSet): void {
    for (const phMap of Object.values(children.value)) {
      for (const entries of Object.values(phMap)) {
        for (const e of entries) if (e.kind === 'spine' && e.childSlotId === childSlotId) e.fileSet = fileSet
      }
    }
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
  function drainActions(keep?: (a: PHChildAction) => boolean): PHChildAction[] {
    const all = _pendingActions.value
    _pendingActions.value = keep ? all.filter(keep) : []
    return keep ? all.filter(a => !keep(a)) : all.slice()
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
    children.value[slotId] = withoutFileSets(state)
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
    addImageData,
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
    setSpineChildFileSet,
    clearSlotImages,
    setSlotImages,
    reset,

    // ── Sync (internal queue) ──────────────────────────────
    drainActions,
    peekActions,
  }
})
