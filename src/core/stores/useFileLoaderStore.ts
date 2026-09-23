/**
 * @file useFileLoaderStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import { guessFileType } from '@/core/utils/fileLoader'
import type { FileSet, PHChildEntry, SpineFile, SpineFileType, SpineSlot, SpineSlotSavedState } from '@/core/types/FileSet'
import { useSlotSelectionStore } from './useSlotSelectionStore'
import { usePlaceholderImagesStore } from './usePlaceholderImagesStore'

function newSlotId(): string {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// placeholderChildren is rebuilt by cloneSlot; it may hold FileSet ArrayBuffers that JSON cannot copy.
function cloneSavedState(state: SpineSlotSavedState): SpineSlotSavedState {
  const rest = { ...state }
  delete rest.placeholderChildren
  return JSON.parse(JSON.stringify(rest))
}

/** Deep-clone a FileSet, correctly handling ArrayBuffer (binary .skel) via slice(). */
function cloneFileSet(fs: FileSet): FileSet {
  const cloneFile = (f: SpineFile): SpineFile => ({
    filename: f.filename,
    fileBody: f.fileBody instanceof ArrayBuffer ? f.fileBody.slice(0) : f.fileBody,
    type: f.type,
    mimeType: f.mimeType,
  })
  return {
    skeleton: cloneFile(fs.skeleton),
    atlas: cloneFile(fs.atlas),
    images: fs.images.map(cloneFile),
  }
}

export interface PendingFileInfo {
  name: string
  size: number
  type: SpineFileType
}

/** Hard limit on simultaneously loaded spine slots */
export const SPINE_SLOTS_LIMIT = 30

const PH_SCAN_RE = /placeholder/i

/** Sentinel name used for binary-scanned placeholders before full load. */
export const PH_PENDING_SENTINEL = '__pending__'

/** Quick scan of a JSON skeleton to find placeholder-named slots (no full Spine load needed). */
function scanPlaceholderSlots(fileSet: FileSet | undefined): Array<{ name: string; kind: 'bone' | 'slot' }> {
  if (!fileSet?.skeleton) return []

  if (fileSet.skeleton.type === 'skeleton-json') {
    try {
      const json = JSON.parse(fileSet.skeleton.fileBody as string)
      return (json.slots ?? [])
        .filter((s: { name?: string }) => typeof s.name === 'string' && PH_SCAN_RE.test(s.name))
        .map((s: { name: string }) => ({ name: s.name, kind: 'slot' as const }))
    } catch {
      return []
    }
  }

  if (fileSet.skeleton.type === 'skeleton-skel') {
    try {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(fileSet.skeleton.fileBody as ArrayBuffer)
      if (PH_SCAN_RE.test(text)) {
        return [{ name: PH_PENDING_SENTINEL, kind: 'slot' }]
      }
    } catch {
      // ignore
    }
  }

  return []
}

export const useFileLoaderStore = defineStore('file-loader', () => {
  // ── State — defined first so cross-store consumers see these refs immediately ─
  /** Raw File objects shown in the file list (not yet read into memory) */
  const pendingFiles = ref<File[]>([])
  /** All loaded spine slots (up to SPINE_SLOTS_LIMIT) */
  const spineSlots = ref<SpineSlot[]>([])
  /** Spine version detected from the first valid slot's skeleton */
  const detectedVersion = ref<string | null>(null)

  // Cross-store — called after refs are defined so useSlotSelectionStore can read spineSlots.
  const selectionStore = useSlotSelectionStore()
  const placeholderStore = usePlaceholderImagesStore()

  // ── Computed ─────────────────────────────────────────────────────────────────
  /** Recognised files from pendingFiles (ignores unknown extensions) */
  const pendingFileInfos = computed<PendingFileInfo[]>(() =>
    pendingFiles.value
      .map(f => ({ name: f.name, size: f.size, type: guessFileType(f.name) }))
      .filter((f): f is PendingFileInfo => f.type !== null),
  )

  const hasFiles = computed(() => pendingFiles.value.length > 0)
  /** Slots that passed both classification and content validation */
  const validSlots = computed(() => spineSlots.value.filter(s => !s.error && !(s.validationErrors?.length)))
  const isLoaded = computed(() => validSlots.value.length > 0)

  // ── Private helpers ───────────────────────────────────────────────────────────
  /** Initialise independent-movement defaults on a slot (idempotent). */
  function initSlotDefaults(slot: SpineSlot): void {
    if (slot.syncEnabled === undefined) slot.syncEnabled = true
    if (slot.indPosX === undefined) slot.indPosX = 0
    if (slot.indPosY === undefined) slot.indPosY = 0
    if (slot.indZoom === undefined) slot.indZoom = 1
    if (slot.placeholders === undefined) slot.placeholders = scanPlaceholderSlots(slot.fileSet)
  }

  // ── Actions ───────────────────────────────────────────────────────────────────
  function setPendingFiles(files: File[]) {
    pendingFiles.value    = files
    spineSlots.value      = []
    detectedVersion.value = null
    selectionStore.clearSelection()
  }

  /** Replace all slots; activates the first fully-valid slot. */
  function setSlots(slots: SpineSlot[], version: string | null) {
    placeholderStore.reset()
    const limited = slots.slice(0, SPINE_SLOTS_LIMIT)
    limited.forEach(initSlotDefaults)
    spineSlots.value      = limited
    detectedVersion.value = version
    const first           = spineSlots.value.find(s => !s.error && !(s.validationErrors?.length))
    selectionStore.activeSlotId = first?.id ?? null
  }

  function saveSlotState(id: string, state: SpineSlotSavedState) {
    const slot = spineSlots.value.find(s => s.id === id)
    if (slot) slot.savedState = state
  }

  function removeSlot(id: string) {
    const idx = spineSlots.value.findIndex(s => s.id === id)
    if (idx < 0) return
    spineSlots.value.splice(idx, 1)
    placeholderStore.clearSlotImages(id)
    if (selectionStore.activeSlotId === id) {
      const next = spineSlots.value.find(s => !s.error)
      selectionStore.activeSlotId = next?.id ?? null
    }
    // Unpin removed slot — only reassign if the slot was actually pinned to avoid
    // triggering the pin watcher unnecessarily (new Set always fires the watcher).
    if (selectionStore.pinnedSlotIds.has(id)) {
      selectionStore.setPinned(id, false)
    }
  }

  /** Remove slot + recursively remove all slots whose parentSlotId === id. */
  function removeSlotCascade(id: string): void {
    const childIds = spineSlots.value
      .filter(s => s.parentSlotId === id)
      .map(s => s.id)
    for (const childId of childIds) removeSlotCascade(childId)
    removeSlot(id)
  }

  /** Indices are positions among top-level slots (the Spines list); child slots keep their array positions. */
  function reorderSlots(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    const top = spineSlots.value.filter(s => !s.parentSlotId)
    const [item] = top.splice(fromIndex, 1)
    if (!item) return
    top.splice(toIndex, 0, item)
    let next = 0
    spineSlots.value = spineSlots.value.map(s => (s.parentSlotId ? s : top[next++]))
  }

  /** Patch placeholderChildren in savedState for a non-active slot (e.g. after drag-reparent). No-op if slot has no savedState yet. */
  function patchSlotPlaceholderImages(slotId: string, placeholderChildren: Record<string, PHChildEntry[]>): void {
    const slot = spineSlots.value.find(s => s.id === slotId)
    if (!slot?.savedState) return
    slot.savedState = { ...slot.savedState, placeholderChildren: JSON.parse(JSON.stringify(placeholderChildren)) }
  }

  /** Update placeholders on a slot — triggers reactive array update so SpinesPanel re-renders. */
  function setSlotPlaceholders(id: string, placeholders: NonNullable<SpineSlot['placeholders']>): void {
    spineSlots.value = spineSlots.value.map(s =>
      s.id === id ? { ...s, placeholders } : s,
    )
  }

  /** Add a single slot respecting SPINE_SLOTS_LIMIT; initialises ind* defaults. */
  function addSlot(slot: SpineSlot): void {
    if (spineSlots.value.length >= SPINE_SLOTS_LIMIT) return
    initSlotDefaults(slot)
    spineSlots.value = [...spineSlots.value, slot]
  }

  /**
   * Deep-clone the slot with the given id.
   * Returns the new slot (not yet active), or null when limit is reached or source has errors.
   */
  function cloneSlot(id: string): SpineSlot | null {
    const src = spineSlots.value.find(s => s.id === id)
    if (!src) return null
    if (src.error) return null
    if (spineSlots.value.length >= SPINE_SLOTS_LIMIT) return null

    // Build a unique name like "Name (2)", "Name (3)", …
    const baseName = src.name.replace(/ \(\d+\)$/, '')
    const existingNames = new Set(spineSlots.value.map(s => s.name))
    let suffix = 2
    let newName = `${baseName} (${suffix})`
    while (existingNames.has(newName)) {
      suffix++
      newName = `${baseName} (${suffix})`
    }

    const newSlot: SpineSlot = {
      id: newSlotId(),
      name: newName,
      fileSet: src.fileSet ? cloneFileSet(src.fileSet) : undefined,
      savedState: src.savedState ? cloneSavedState(src.savedState) : undefined,
      syncEnabled: src.syncEnabled ?? true,
      indPosX: src.indPosX ?? 0,
      indPosY: src.indPosY ?? 0,
      indZoom: src.indZoom ?? 1,
      placeholders: src.placeholders ? [...src.placeholders] : [],
    }

    const added = [newSlot]
    const children = clonePlaceholderChildren(id, newSlot.id, added)
    if (children) {
      placeholderStore.setSlotImages(newSlot.id, children)
      if (newSlot.savedState) newSlot.savedState.placeholderChildren = placeholderStore.getSlotImages(newSlot.id)
    }
    spineSlots.value = [...spineSlots.value, ...added]
    return newSlot
  }

  /**
   * Copies the placeholder children of a slot for its clone: images get new entry ids,
   * child spines become independent child slots (appended to `added`) within the slot limit.
   */
  function clonePlaceholderChildren(srcId: string, dstId: string, added: SpineSlot[]): Record<string, PHChildEntry[]> | undefined {
    const src = placeholderStore.hasSlot(srcId)
      ? placeholderStore.getSlotImages(srcId)
      : spineSlots.value.find(s => s.id === srcId)?.savedState?.placeholderChildren
    if (!src) return undefined
    const result: Record<string, PHChildEntry[]> = {}
    for (const [phName, entries] of Object.entries(src)) {
      result[phName] = []
      for (const entry of entries) {
        if (entry.kind === 'image') {
          result[phName].push({ ...entry, imageId: crypto.randomUUID() })
          continue
        }
        const childSrc = spineSlots.value.find(s => s.id === entry.childSlotId)
        if (!childSrc?.fileSet || spineSlots.value.length + added.length >= SPINE_SLOTS_LIMIT) continue
        const child: SpineSlot = {
          id: newSlotId(),
          name: childSrc.name,
          fileSet: childSrc.fileSet,
          parentSlotId: dstId,
          savedState: childSrc.savedState ? cloneSavedState(childSrc.savedState) : undefined,
          syncEnabled: childSrc.syncEnabled ?? true,
          indPosX: childSrc.indPosX ?? 0,
          indPosY: childSrc.indPosY ?? 0,
          indZoom: childSrc.indZoom ?? 1,
          placeholders: childSrc.placeholders ? [...childSrc.placeholders] : [],
        }
        added.push(child)
        result[phName].push({ ...entry, imageId: crypto.randomUUID(), childSlotId: child.id, fileSet: childSrc.fileSet })
      }
    }
    return result
  }

  /** Update `syncEnabled` for the slot with the given id. */
  function setSyncEnabled(id: string, v: boolean): void {
    const slot = spineSlots.value.find(s => s.id === id)
    if (slot) slot.syncEnabled = v
  }

  function clear() {
    pendingFiles.value    = []
    spineSlots.value      = []
    placeholderStore.reset()
    detectedVersion.value = null
    selectionStore.clearSelection()
  }

  return {
    pendingFiles,
    spineSlots,
    detectedVersion,
    pendingFileInfos,
    hasFiles,
    validSlots,
    isLoaded,
    setPendingFiles,
    setSlots,
    saveSlotState,
    removeSlot,
    removeSlotCascade,
    reorderSlots,
    addSlot,
    cloneSlot,
    setSyncEnabled,
    setSlotPlaceholders,
    patchSlotPlaceholderImages,
    clear,
  }
})
