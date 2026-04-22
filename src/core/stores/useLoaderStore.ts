/**
 * @file useLoaderStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import { guessFileType } from '@/core/utils/fileLoader'
import type { FileSet, SpineFile, SpineFileType, SpineSlot, SpineSlotSavedState } from '@/core/types/FileSet'

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

export const useLoaderStore = defineStore('loader', () => {
  /** Raw File objects shown in the file list (not yet read into memory) */
  const pendingFiles = ref<File[]>([])
  /** All loaded spine slots (up to SPINE_SLOTS_LIMIT) */
  const spineSlots = ref<SpineSlot[]>([])
  /** ID of the currently active spine slot */
  const activeSlotId = ref<string | null>(null)
  /** Spine version detected from the first valid slot's skeleton */
  const detectedVersion = ref<string | null>(null)
  /** IDs of slots that are pinned on scene (visible even when not active) */
  const pinnedSlotIds = ref<Set<string>>(new Set())

  /** Currently active slot */
  const activeSlot = computed(() =>
    spineSlots.value.find(s => s.id === activeSlotId.value) ?? null,
  )

  /** Backward-compat: fileSet of active slot */
  const fileSet = computed(() => activeSlot.value?.fileSet ?? null)

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

  function setPinned(id: string, pinned: boolean) {
    const next = new Set(pinnedSlotIds.value)
    if (pinned) next.add(id)
    else next.delete(id)
    pinnedSlotIds.value = next
  }

  function isPinned(id: string): boolean {
    return pinnedSlotIds.value.has(id)
  }

  function setPendingFiles(files: File[]) {
    pendingFiles.value    = files
    spineSlots.value      = []
    activeSlotId.value    = null
    detectedVersion.value = null
    pinnedSlotIds.value   = new Set()
  }

  /** Initialise independent-movement defaults on a slot (idempotent). */
  function initSlotDefaults(slot: SpineSlot): void {
    if (slot.syncEnabled === undefined) slot.syncEnabled = true
    if (slot.indPosX === undefined) slot.indPosX = 0
    if (slot.indPosY === undefined) slot.indPosY = 0
    if (slot.indZoom === undefined) slot.indZoom = 1
    if (slot.placeholders === undefined) slot.placeholders = scanPlaceholderSlots(slot.fileSet)
  }

  /** Replace all slots; activates the first fully-valid slot. */
  function setSlots(slots: SpineSlot[], version: string | null) {
    const limited = slots.slice(0, SPINE_SLOTS_LIMIT)
    limited.forEach(initSlotDefaults)
    spineSlots.value      = limited
    detectedVersion.value = version
    const first           = spineSlots.value.find(s => !s.error && !(s.validationErrors?.length))
    activeSlotId.value    = first?.id ?? null
  }

  function setActiveSlot(id: string) {
    if (spineSlots.value.some(s => s.id === id)) {
      activeSlotId.value = id
    }
  }

  function saveSlotState(id: string, state: SpineSlotSavedState) {
    const slot = spineSlots.value.find(s => s.id === id)
    if (slot) slot.savedState = state
  }

  function removeSlot(id: string) {
    const idx = spineSlots.value.findIndex(s => s.id === id)
    if (idx < 0) return
    spineSlots.value.splice(idx, 1)
    if (activeSlotId.value === id) {
      const next = spineSlots.value.find(s => !s.error)
      activeSlotId.value = next?.id ?? null
    }
    // Unpin removed slot
    const next = new Set(pinnedSlotIds.value)
    next.delete(id)
    pinnedSlotIds.value = next
  }

  function reorderSlots(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    const arr = [...spineSlots.value]
    const [item] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, item)
    spineSlots.value = arr
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
      id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: newName,
      fileSet: src.fileSet ? cloneFileSet(src.fileSet) : undefined,
      savedState: src.savedState ? JSON.parse(JSON.stringify(src.savedState)) : undefined,
      syncEnabled: src.syncEnabled ?? true,
      indPosX: src.indPosX ?? 0,
      indPosY: src.indPosY ?? 0,
      indZoom: src.indZoom ?? 1,
      placeholders: src.placeholders ? [...src.placeholders] : [],
    }

    spineSlots.value = [...spineSlots.value, newSlot]
    return newSlot
  }

  /** Update `syncEnabled` for the slot with the given id. */
  function setSyncEnabled(id: string, v: boolean): void {
    const slot = spineSlots.value.find(s => s.id === id)
    if (slot) slot.syncEnabled = v
  }

  function clear() {
    pendingFiles.value    = []
    spineSlots.value      = []
    activeSlotId.value    = null
    detectedVersion.value = null
    pinnedSlotIds.value   = new Set()
  }

  return {
    pendingFiles,
    spineSlots,
    activeSlotId,
    activeSlot,
    fileSet,
    detectedVersion,
    pendingFileInfos,
    hasFiles,
    validSlots,
    isLoaded,
    pinnedSlotIds,
    setPendingFiles,
    setSlots,
    setActiveSlot,
    saveSlotState,
    removeSlot,
    clear,
    setPinned,
    isPinned,
    reorderSlots,
    addSlot,
    cloneSlot,
    setSyncEnabled,
    setSlotPlaceholders,
  }
})
