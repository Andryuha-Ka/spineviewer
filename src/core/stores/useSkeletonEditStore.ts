/**
 * @file useSkeletonEditStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { SvpError, type SvpErrorCode } from '@/core/api/svpErrors'
import { getStageCommands } from '@/core/api/stageCommands'
import {
  BONE_PROPS, boneSetup, createAnimation as createAnimationIn, deleteBoneKey, detectDialect, getBoneKeys, keyValueFromLocal,
  poseKeyTypes, replaceBoneTimelines, setBoneKeyCurve, setBoneSetup, upsertBoneKey,
  type BoneTimeline, type KeyEasing, type KeyValue, type SpineDialect, type SpineJsonDoc,
} from '@/core/spineJson/boneEdits'
import { buildSkeletonZip, safeFileName } from '@/core/utils/exportUtils'
import { detectFileSetVersion } from '@/core/utils/versionDetector'
import type { FileSet, SpineFile, SpineSlot, SpineSlotEdit } from '@/core/types/FileSet'
import type { BoneLocalTransform } from '@/core/types/ISpineAdapter'
import { isSlotEdited, useFileLoaderStore } from './useFileLoaderStore'
import { useSlotSelectionStore } from './useSlotSelectionStore'
import { useSkeletonStore } from './useSkeletonStore'
import { usePlaceholderImagesStore } from './usePlaceholderImagesStore'

export const UNDO_LIMIT = 20
/** All undo / redo histories together, at 2 bytes per character */
export const HISTORY_BUDGET_BYTES = 100 * 1024 * 1024

export interface EditState {
  edited: boolean
  unsaved: boolean
  overrides: number
  warnings: string[]
  canUndo: boolean
  canRedo: boolean
}

/** Most keys one buildAnimation call accepts. */
export const BUILD_KEYS_MAX = 10_000

export interface KeyRef { animation: string; bone: string; type: string; time: number }
export interface KeyInput { bone: string; type: string; time: number; value: KeyValue; easing?: KeyEasing }

export interface SkeletonExport {
  blob: Blob
  name: string
  mimeType: string
  warnings: string[]
}

interface SpineDocument { text: string; warnings: string[] }

const fail = (code: SvpErrorCode, message: string) => new SvpError(code, message)

// .skel → JSON conversions by source file: the source text undo reaches and the warnings, without converting twice
const converted = new WeakMap<SpineFile, SpineDocument>()
// push order of every undo entry, aligned with edit.undo, so the budget drops the oldest steps across slots first
const undoStamps = new WeakMap<SpineSlotEdit, number[]>()
let stampSeq = 0

const jsonFile = (source: SpineFile, text: string): SpineFile => ({
  filename: source.filename.replace(/\.(skel|json)$/i, '') + '.json',
  fileBody: text,
  type: 'skeleton-json',
  mimeType: 'application/json',
})

const skeletonName = (slot: SpineSlot): string =>
  (slot.edit?.source ?? slot.fileSet!.skeleton).filename.replace(/\.(skel|json)$/i, '')

function stampsOf(edit: SpineSlotEdit): number[] {
  const stamps = undoStamps.get(toRaw(edit)) ?? []
  const n = edit.undo.length
  return stamps.length >= n ? stamps.slice(stamps.length - n) : [...Array<number>(n - stamps.length).fill(0), ...stamps]
}

export const useSkeletonEditStore = defineStore('skeleton-edit', () => {
  const loader     = useFileLoaderStore()
  const selection  = useSlotSelectionStore()
  const skeleton   = useSkeletonStore()
  const placeholds = usePlaceholderImagesStore()

  // --- State ---
  const busy = ref(false)
  /** Conversion warnings of the latest document taken from a binary source */
  const lastWarnings = ref<string[]>([])
  let budgetBytes = HISTORY_BUDGET_BYTES

  const slotById = (id: string) => loader.spineSlots.find(s => s.id === id)

  function requireSlot(slotId: string | null | undefined): SpineSlot {
    const slot = slotId ? slotById(slotId) : undefined
    if (!slot) throw fail('NOT_FOUND', `Slot "${slotId}" not found`)
    if (!slot.fileSet) throw fail('INVALID_STATE', `Slot "${slot.name}" has no skeleton`)
    return slot
  }

  /** The slot whose adapter the UI shows: the active slot (the active child while one is active). */
  function activeSlotId(): string {
    const id = selection.activeSlotId
    if (!id || !skeleton.getAdapter()) throw fail('NO_SKELETON', 'No active skeleton')
    return id
  }

  // --- Query ---
  function isEdited(slotId: string): boolean {
    const slot = slotById(slotId)
    return !!slot && isSlotEdited(slot)
  }

  function isUnsaved(slotId: string): boolean {
    const slot = slotById(slotId)
    return !!slot && isSlotEdited(slot) && slot.edit!.unsaved
  }

  function overrideCount(slot: SpineSlot): number {
    const held = slot.id === selection.activeSlotId ? skeleton.boneOverrides : slot.savedState?.boneOverrides
    return Object.keys(held ?? {}).length
  }

  /** `<name> (edits|overrides|edits and overrides)` for every slot (or the listed ones) whose work would be lost. */
  function unsavedWorkSummary(slotIds?: Iterable<string>): string[] {
    const only = slotIds ? new Set(slotIds) : null
    const out: string[] = []
    for (const slot of loader.spineSlots) {
      if (only && !only.has(slot.id)) continue
      const edits = isUnsaved(slot.id)
      const overrides = overrideCount(slot) > 0
      if (edits || overrides) out.push(`${slot.name} (${edits && overrides ? 'edits and overrides' : edits ? 'edits' : 'overrides'})`)
    }
    return out
  }

  const hasUnsavedEdits = computed(() => unsavedWorkSummary().length > 0)

  function sourceText(slot: SpineSlot): string | null {
    const source = slot.edit?.source ?? slot.fileSet!.skeleton
    return typeof source.fileBody === 'string' ? source.fileBody : converted.get(toRaw(source))?.text ?? null
  }

  function warningsOf(slot: SpineSlot): string[] {
    const source = toRaw(slot.edit?.source ?? slot.fileSet!.skeleton)
    return [...(slot.edit?.warnings ?? converted.get(source)?.warnings ?? [])]
  }

  function getEditState(slotId: string): EditState {
    const slot = requireSlot(slotId)
    if (slot.fileSet!.skeleton.type === 'skeleton-skel' && slotId === selection.activeSlotId) {
      try { ensureDocument(slotId) } catch { /* warnings stay unknown until a conversion succeeds */ }
    }
    return {
      edited: isSlotEdited(slot),
      unsaved: isUnsaved(slotId),
      overrides: overrideCount(slot),
      warnings: warningsOf(slot),
      canUndo: (slot.edit?.undo.length ?? 0) > 0,
      canRedo: (slot.edit?.redo.length ?? 0) > 0,
    }
  }

  // --- Document ---
  /** The slot's Spine JSON text: its own text, or the conversion of a binary source by the live adapter. */
  function ensureDocument(slotId: string): SpineDocument {
    const slot = requireSlot(slotId)
    const file = slot.fileSet!.skeleton
    if (typeof file.fileBody === 'string') return { text: file.fileBody, warnings: warningsOf(slot) }
    const cached = converted.get(toRaw(file))
    if (cached) {
      lastWarnings.value = [...cached.warnings]
      return cached
    }
    const adapter = slotId === selection.activeSlotId ? skeleton.getAdapter() : null
    if (!adapter) throw fail('INVALID_STATE', `Activate "${slot.name}" before converting its binary skeleton`)
    const { json, warnings } = adapter.toSpineJson()
    const doc = { text: JSON.stringify(json), warnings: [...warnings] }
    converted.set(toRaw(file), doc)
    lastWarnings.value = [...warnings]
    return doc
  }

  function dialectOf(slot: SpineSlot, doc: SpineJsonDoc): SpineDialect {
    return detectDialect(doc, detectFileSetVersion(slot.fileSet!))
  }

  // --- History budget ---
  function historyBytes(): number {
    let chars = 0
    for (const s of loader.spineSlots) {
      for (const t of s.edit?.undo ?? []) chars += t.length
      for (const t of s.edit?.redo ?? []) chars += t.length
    }
    return chars * 2
  }

  /** Drops the oldest undo steps across all slots until the histories fit the budget. */
  function enforceBudget(): void {
    while (historyBytes() > budgetBytes) {
      let oldest: SpineSlot | null = null
      let oldestStamp = Infinity
      for (const s of loader.spineSlots) {
        if (!s.edit?.undo.length) continue
        const stamp = stampsOf(s.edit)[0]
        if (stamp < oldestStamp) { oldest = s; oldestStamp = stamp }
      }
      if (!oldest) return
      const edit = oldest.edit!
      const stamps = stampsOf(edit).slice(1)
      edit.undo.shift()
      undoStamps.set(toRaw(edit), stamps)
    }
  }

  // --- Transaction ---
  /**
   * Writes a new document (or the source file) into the slot and reloads it, as one step:
   * on a failed reload the slot gets its previous FileSet and history back and is reloaded again.
   */
  async function commit(slot: SpineSlot, next: { text: string } | { source: true }, history: Pick<SpineSlotEdit, 'undo' | 'redo'> & { stamps: number[] }, unsaved: boolean, warnings: string[]): Promise<void> {
    const id = slot.id
    const prevFileSet = slot.fileSet!
    const prevEdit = slot.edit
    const source = toRaw(prevEdit?.source ?? prevFileSet.skeleton)
    const backToSource = 'source' in next || next.text === sourceText(slot)
    const skeletonFile = backToSource ? source : jsonFile(source, (next as { text: string }).text)
    const fileSet: FileSet = { skeleton: skeletonFile, atlas: prevFileSet.atlas, images: prevFileSet.images }
    const nextEdit: SpineSlotEdit | undefined = backToSource && history.undo.length === 0 && history.redo.length === 0
      ? undefined
      : { source, unsaved: !backToSource && unsaved, warnings: [...warnings], undo: history.undo, redo: history.redo }
    if (nextEdit) undoStamps.set(nextEdit, history.stamps)

    const write = (fs: FileSet, edit: SpineSlotEdit | undefined) => {
      const target = slotById(id)
      if (!target) return
      target.fileSet = fs
      target.edit = edit
      if (target.parentSlotId) placeholds.setSpineChildFileSet(id, fs)
    }
    write(fileSet, nextEdit)
    const stage = getStageCommands()
    try {
      await stage?.reloadSlot(id)
    } catch (e) {
      write(prevFileSet, prevEdit)
      await stage?.reloadSlot(id).catch(() => {})
      throw fail('INVALID_STATE', `The edited skeleton could not be loaded: ${e instanceof Error ? e.message : String(e)}`)
    }
    enforceBudget()
  }

  async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (busy.value) throw fail('INVALID_STATE', 'Another skeleton edit is in progress')
    busy.value = true
    try {
      return await fn()
    } finally {
      busy.value = false
    }
  }

  /**
   * One data edit: document → pure edits (validated before anything changes) → undo step → FileSet → one reload → unsaved.
   * `mutate` throws to cancel; the slot is then unchanged.
   */
  function transact(slotId: string, mutate: (doc: SpineJsonDoc, dialect: SpineDialect) => void): Promise<void> {
    return exclusive(async () => {
      const slot = requireSlot(slotId)
      const { text, warnings } = ensureDocument(slotId)
      const doc = JSON.parse(text) as SpineJsonDoc
      mutate(doc, dialectOf(slot, doc))
      const nextText = JSON.stringify(doc)
      const undo = [...(slot.edit?.undo ?? []), text]
      const stamps = [...(slot.edit ? stampsOf(slot.edit) : []), ++stampSeq]
      const over = Math.max(0, undo.length - UNDO_LIMIT)
      await commit(slot, { text: nextText }, { undo: undo.slice(over), redo: [], stamps: stamps.slice(over) }, true, warnings)
    })
  }

  // --- Mutation: setup pose ---
  async function setSetupPose(bones: Record<string, Partial<BoneLocalTransform>>): Promise<void> {
    const id = activeSlotId()
    if (Object.keys(bones).length === 0) throw fail('INVALID_ARGUMENT', 'bones must not be empty')
    return transact(id, doc => {
      for (const [name, values] of Object.entries(bones)) setBoneSetup(doc, name, values)
    })
  }

  /** Held override values go to the setup pose and are released; a bone without one bakes its live unconstrained pose. */
  async function applyOverridesToSetupPose(bones?: string[]): Promise<string[]> {
    const id = activeSlotId()
    const adapter = skeleton.getAdapter()!
    const held = adapter.getBoneOverrides()
    const names = bones ?? Object.keys(held)
    if (names.length === 0) return []
    const live = new Map(adapter.getBoneLocalTransforms().map(b => [b.name, b.local]))
    const values: Record<string, Partial<BoneLocalTransform>> = {}
    for (const name of names) {
      const v = held[name] ?? live.get(name)
      if (!v) throw fail('NOT_FOUND', `Bone "${name}" not found`)
      values[name] = { ...v }
    }
    await transact(id, doc => {
      for (const [name, v] of Object.entries(values)) setBoneSetup(doc, name, v)
    })
    for (const name of names) if (held[name]) skeleton.setBoneOverride(name, null)
    return names
  }

  // --- Keys ---
  function getKeys(animation: string, bone?: string): BoneTimeline[] {
    const id = activeSlotId()
    const doc = JSON.parse(ensureDocument(id).text) as SpineJsonDoc
    return getBoneKeys(doc, { animation, bone }, dialectOf(requireSlot(id), doc))
  }

  /** One data edit on the active slot that resolves to what `mutate` returned. */
  async function editActive<T>(mutate: (doc: SpineJsonDoc, dialect: SpineDialect) => T): Promise<T> {
    let out!: T
    await transact(activeSlotId(), (doc, dialect) => { out = mutate(doc, dialect) })
    return out
  }

  const createAnimation = (name: string) => editActive(doc => { createAnimationIn(doc, name) })
  const setKey = (key: KeyRef & { value: KeyValue; easing?: KeyEasing }) => editActive((doc, d) => upsertBoneKey(doc, key, d))
  const deleteKey = (key: KeyRef) => editActive((doc, d) => deleteBoneKey(doc, key, d))
  const setKeyEasing = (key: KeyRef & { easing: KeyEasing }) => editActive((doc, d) => setBoneKeyCurve(doc, key, d))

  /**
   * Many keys as one edit: the animation is created when missing, `replace` drops its bone timelines first.
   * Any invalid entry cancels everything and is named by its zero-based index.
   */
  function buildAnimation(name: string, keys: KeyInput[], replace = false): Promise<BoneTimeline[]> {
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > BUILD_KEYS_MAX) {
      return Promise.reject(fail('INVALID_ARGUMENT', `keys must hold 1 to ${BUILD_KEYS_MAX} entries`))
    }
    return editActive((doc, dialect) => {
      if (!doc.animations || !Object.hasOwn(doc.animations, name)) createAnimationIn(doc, name)
      else if (replace) replaceBoneTimelines(doc, name)
      keys.forEach((key, i) => {
        try {
          if (typeof key !== 'object' || key === null) throw fail('INVALID_ARGUMENT', 'must be an object')
          upsertBoneKey(doc, { ...key, animation: name }, dialect)
        } catch (e) {
          const err = e instanceof SvpError ? e : fail('INVALID_ARGUMENT', String(e))
          throw new SvpError(err.code, `keys[${i}]: ${err.message.replace(/^[A-Z_]+: /, '')}`, { index: i })
        }
      })
      return getBoneKeys(doc, { animation: name }, dialect)
    })
  }

  /** Animation time of the lowest track playing `animation`. */
  function playingTime(animation: string): number {
    const state = skeleton.getAdapter()!.getTrackStates()
      .filter(s => s.animationName === animation)
      .sort((a, b) => a.trackIndex - b.trackIndex)[0]
    if (!state) throw fail('INVALID_STATE', 'Animation is not playing; give a time')
    const d = state.duration
    return d > 0 ? (state.loop ? state.time % d : Math.min(state.time, d)) : 0
  }

  /**
   * Keys the live local pose of the given bones (every overridden bone by default) for each timeline type with an
   * overridden property, then releases their overrides. A given bone without an override keys all its properties.
   */
  async function keyCurrentPose(animation: string, bones?: string[], time?: number): Promise<BoneTimeline[]> {
    getKeys(animation) // NOT_FOUND before the time check
    const adapter = skeleton.getAdapter()!
    const held = adapter.getBoneOverrides()
    const names = bones ?? Object.keys(held)
    const live = new Map(adapter.getBoneLocalTransforms().map(b => [b.name, b.local]))
    for (const name of names) if (!live.has(name)) throw fail('NOT_FOUND', `Bone "${name}" not found`)
    if (names.length === 0) return []
    const at = time ?? playingTime(animation)
    const out = await editActive((doc, dialect) => names.flatMap(bone => {
      const props = held[bone] ? Object.keys(held[bone]) as Array<keyof BoneLocalTransform> : [...BONE_PROPS]
      const setup = boneSetup(doc, bone)
      return poseKeyTypes(doc, { animation, bone }, props, dialect).map(type =>
        upsertBoneKey(doc, { animation, bone, type, time: at, value: keyValueFromLocal(type, live.get(bone)!, setup, bone) }, dialect))
    }))
    for (const name of names) if (held[name]) skeleton.setBoneOverride(name, null)
    return out
  }

  // --- Mutation: history ---
  function currentText(slot: SpineSlot): string {
    const body = slot.fileSet!.skeleton.fileBody
    return typeof body === 'string' ? body : ensureDocument(slot.id).text
  }

  function undo(slotId?: string): Promise<void> {
    const id = slotId ?? activeSlotId()
    return exclusive(async () => {
      const slot = requireSlot(id)
      const edit = slot.edit
      if (!edit?.undo.length) throw fail('INVALID_STATE', 'Nothing to undo')
      const stamps = stampsOf(edit)
      const prev = edit.undo[edit.undo.length - 1]
      const history = { undo: edit.undo.slice(0, -1), redo: [...edit.redo, currentText(slot)], stamps: stamps.slice(0, -1) }
      await commit(slot, { text: prev }, history, true, edit.warnings)
    })
  }

  function redo(slotId?: string): Promise<void> {
    const id = slotId ?? activeSlotId()
    return exclusive(async () => {
      const slot = requireSlot(id)
      const edit = slot.edit
      if (!edit?.redo.length) throw fail('INVALID_STATE', 'Nothing to redo')
      const next = edit.redo[edit.redo.length - 1]
      const undoList = [...edit.undo, currentText(slot)]
      const stamps = [...stampsOf(edit), ++stampSeq]
      const over = Math.max(0, undoList.length - UNDO_LIMIT)
      const history = { undo: undoList.slice(over), redo: edit.redo.slice(0, -1), stamps: stamps.slice(over) }
      await commit(slot, { text: next }, history, true, edit.warnings)
    })
  }

  /** Back to the source data, keeping overrides; one undoable step. A slot that is not edited is left alone. */
  function revertToSource(slotId?: string): Promise<void> {
    const id = slotId ?? activeSlotId()
    return exclusive(async () => {
      const slot = requireSlot(id)
      if (!isSlotEdited(slot)) return
      const edit = slot.edit!
      const undoList = [...edit.undo, currentText(slot)]
      const stamps = [...stampsOf(edit), ++stampSeq]
      const over = Math.max(0, undoList.length - UNDO_LIMIT)
      await commit(slot, { source: true }, { undo: undoList.slice(over), redo: [], stamps: stamps.slice(over) }, false, edit.warnings)
    })
  }

  // --- Mutation: export ---
  /** Edited-skeleton zip or its Spine JSON; a successful export clears `unsaved`. An unedited source is never marked edited. */
  function exportSkeleton(slotId: string, format: 'zip' | 'json', signal?: AbortSignal): Promise<SkeletonExport> {
    return exclusive(async () => {
      const slot = requireSlot(slotId)
      const { text, warnings } = ensureDocument(slotId)
      const name = skeletonName(slot)
      const fs = slot.fileSet!
      const blob = format === 'zip'
        ? await buildSkeletonZip({ skeleton: jsonFile(fs.skeleton, text), atlas: fs.atlas, images: fs.images }, name, signal)
        : new Blob([text], { type: 'application/json' })
      signal?.throwIfAborted()
      const target = slotById(slotId)
      if (target?.edit) target.edit.unsaved = false
      return {
        blob,
        name: `${safeFileName(name)}.${format}`,
        mimeType: format === 'zip' ? 'application/zip' : 'application/json',
        warnings: [...warnings],
      }
    })
  }

  // --- internal (tests) ---
  function setHistoryBudget(bytes: number): void { budgetBytes = bytes }

  return {
    // Query
    busy, lastWarnings, hasUnsavedEdits,
    isEdited, isUnsaved, unsavedWorkSummary, getEditState, ensureDocument, getKeys,
    // Mutation
    transact, setSetupPose, applyOverridesToSetupPose, undo, redo, revertToSource, exportSkeleton,
    createAnimation, setKey, deleteKey, setKeyEasing, buildAnimation, keyCurrentPose,
    // internal
    setHistoryBudget,
  }
})
