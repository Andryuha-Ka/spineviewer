import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toRaw } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { unzipSync, strFromU8 } from 'fflate'
import { registerStageCommands, unregisterStageCommands, getStageCommands, type StageCommands } from '@/core/api/stageCommands'
import { useSkeletonEditStore, UNDO_LIMIT } from '@/core/stores/useSkeletonEditStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import { buildSlotSavedState } from '@/core/utils/slotState'
import type { FileSet, SpineFile, SpineSlot } from '@/core/types/FileSet'
import type { BoneLocalTransform } from '@/core/types/ISpineAdapter'
import { makeFakeAdapter, track } from '../helpers/fakeAdapter'
import { readFixtureJson } from '../fixtures/spine/fixtures'

const SOURCE = readFixtureJson('4.2')
const T = (over: Partial<BoneLocalTransform> = {}): BoneLocalTransform =>
  ({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, ...over })

const atlas: SpineFile = { filename: 'fixture.atlas', fileBody: 'fixture.png\nsize: 4,4\n', type: 'atlas', mimeType: 'text/plain' }
const png: SpineFile = { filename: 'fixture.png', fileBody: 'data:image/png;base64,iVBORw==', type: 'image', mimeType: 'image/png' }
const jsonSet = (): FileSet => ({
  skeleton: { filename: 'hero.json', fileBody: SOURCE, type: 'skeleton-json', mimeType: 'application/json' },
  atlas, images: [png],
})
const skelSet = (): FileSet => ({
  skeleton: { filename: 'bonus.skel', fileBody: new ArrayBuffer(16), type: 'skeleton-skel', mimeType: '' },
  atlas, images: [png],
})

function adapterFor() {
  const a = makeFakeAdapter()
  const bones = JSON.parse(SOURCE).bones.map((b: { name: string; parent?: string }) => ({ name: b.name, parent: b.parent ?? null }))
  return Object.assign(a, {
    bones,
    getBoneLocalTransforms: vi.fn(() => bones.map((b: { name: string }) => {
      const local = T({ ...(b.name === 'c' ? { rotation: 25, x: 41, y: 1 } : {}), ...a.overrides[b.name] })
      return { name: b.name, local, applied: local }
    })),
    toSpineJson: vi.fn(() => ({ json: { ...JSON.parse(SOURCE), skeleton: { spine: '4.2.40' } }, warnings: ['Skipped unknown attachment type in slot \'fx\''] })),
  })
}

function setup(fileSet: FileSet = jsonSet(), name = 'hero') {
  useVersionStore().selectVersion(8, '4.2')
  const loader = useFileLoaderStore()
  loader.setSlots([{ id: 'hero', name, fileSet }, { id: 'bonus', name: 'bonus', fileSet: jsonSet() }], '4.2')
  const adapter = adapterFor()
  useSkeletonStore().attachAdapter(adapter)
  const stage = { reloadSlot: vi.fn(async () => {}) }
  registerStageCommands(stage as unknown as StageCommands)
  return { adapter, stage, store: useSkeletonEditStore(), slot: () => loader.spineSlots.find(s => s.id === 'hero')! }
}

const docOf = (s: SpineSlot) => JSON.parse(s.fileSet!.skeleton.fileBody as string)
const boneOf = (s: SpineSlot, name: string) => docOf(s).bones.find((b: { name: string }) => b.name === name)

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  const c = getStageCommands()
  if (c) unregisterStageCommands(c)
})

describe('document and edit state (5.1, 5.5)', () => {
  it('JSON source: an edit replaces the skeleton file and keeps the source for revert', async () => {
    const { store, stage, slot } = setup()
    const source = slot().fileSet!.skeleton
    await store.setSetupPose({ c: { rotation: 30 } })
    expect(slot().fileSet!.skeleton).toMatchObject({ filename: 'hero.json', type: 'skeleton-json' })
    expect(boneOf(slot(), 'c').rotation).toBe(30)
    expect(toRaw(slot().edit!.source)).toBe(toRaw(source))
    expect(slot().edit).toMatchObject({ unsaved: true, warnings: [], undo: [SOURCE], redo: [] })
    expect(slot().fileSet!.atlas).toEqual(atlas)
    expect(store.isEdited('hero')).toBe(true)
    expect(stage.reloadSlot).toHaveBeenCalledTimes(1)
    expect(stage.reloadSlot).toHaveBeenCalledWith('hero')
  })

  it('.skel source: converted by the adapter, saved as <base>.json with the warnings', async () => {
    const { store, adapter, slot } = setup(skelSet(), 'bonus')
    const source = slot().fileSet!.skeleton
    expect(store.getEditState('hero').warnings).toEqual(["Skipped unknown attachment type in slot 'fx'"])
    await store.setSetupPose({ tail: { x: 3 } })
    expect(adapter.toSpineJson).toHaveBeenCalledTimes(1)
    expect(slot().fileSet!.skeleton).toMatchObject({ filename: 'bonus.json', type: 'skeleton-json', mimeType: 'application/json' })
    expect(toRaw(slot().edit!.source)).toBe(toRaw(source))
    expect(slot().edit!.warnings).toEqual(["Skipped unknown attachment type in slot 'fx'"])
    expect(store.lastWarnings).toEqual(slot().edit!.warnings)
    expect(boneOf(slot(), 'tail').x).toBe(3)
  })

  it('a child slot edit also updates the placeholder entry FileSet', async () => {
    const { store } = setup()
    const loader = useFileLoaderStore()
    loader.addSlot({ id: 'kid', name: 'kid', fileSet: jsonSet(), parentSlotId: 'hero' })
    const ph = usePlaceholderImagesStore()
    ph.addSpineChild('hero', 'p', { kind: 'spine', imageId: 'e1', childSlotId: 'kid', fileName: 'kid', fileSet: jsonSet(), syncEnabled: true, posX: 0, posY: 0, scale: 1 })
    useSlotSelectionStore().setActiveSlot('kid')
    await store.setSetupPose({ c: { y: 2 } })
    const kid = loader.spineSlots.find(s => s.id === 'kid')!
    expect(toRaw(ph.getPlaceholderSpineEntries('hero', 'p')[0].fileSet)).toBe(toRaw(kid.fileSet))
  })

  it('edit never reaches the saved state (invariant 5)', async () => {
    const { store, slot } = setup()
    await store.setSetupPose({ c: { rotation: 30 } })
    const ss = buildSlotSavedState({
      playback: { speed: 1, selectedAnimation: null, currentTrack: 0, loop: false, trackEnabled: {}, trackPlaylists: {}, trackMix: {}, isPlaying: false },
      activeSkins: [], showPlaceholders: true, disabledPlaceholders: [], slot: slot(),
    })
    expect('edit' in ss).toBe(false)
    expect(JSON.stringify(ss)).not.toContain('"undo"')
  })

  it('unsavedWorkSummary names edits, overrides or both ("Back with unsaved edits")', async () => {
    const { store } = setup()
    expect(store.unsavedWorkSummary()).toEqual([])
    expect(store.hasUnsavedEdits).toBe(false)
    await store.setSetupPose({ c: { rotation: 30 } })
    expect(store.unsavedWorkSummary()).toEqual(['hero (edits)'])
    useSkeletonStore().setBoneOverride('c', { x: 1 })
    useFileLoaderStore().saveSlotState('bonus', { boneOverrides: { c: { y: 1 } } } as never)
    expect(store.unsavedWorkSummary()).toEqual(['hero (edits and overrides)', 'bonus (overrides)'])
    expect(store.unsavedWorkSummary(['bonus'])).toEqual(['bonus (overrides)'])
    expect(store.unsavedWorkSummary(new Set<string>())).toEqual([])
    expect(store.hasUnsavedEdits).toBe(true)
  })

  it('overrides alone: not edited, but unsaved work ("Override only")', () => {
    const { store } = setup()
    useSkeletonStore().setBoneOverride('c', { x: 1 })
    expect(store.getEditState('hero')).toMatchObject({ edited: false, unsaved: false, overrides: 1 })
    expect(store.hasUnsavedEdits).toBe(true)
  })
})

describe('transaction (5.6)', () => {
  it('a failing edit leaves text, history and reload count unchanged', async () => {
    const { store, stage, slot } = setup()
    await store.setSetupPose({ c: { rotation: 30 } })
    const text = slot().fileSet!.skeleton.fileBody
    await expect(store.setSetupPose({ c: { rotation: 1 }, nope: { x: 1 } })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(store.setSetupPose({ c: { rotation: Infinity } })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    expect(slot().fileSet!.skeleton.fileBody).toBe(text)
    expect(slot().edit!.undo).toHaveLength(1)
    expect(stage.reloadSlot).toHaveBeenCalledTimes(1)
    expect(store.busy).toBe(false)
  })

  it('a reload failure restores the previous FileSet and history and reloads it again', async () => {
    const { store, stage, slot } = setup()
    const before = slot().fileSet
    stage.reloadSlot.mockRejectedValueOnce(new Error('parse error'))
    await expect(store.setSetupPose({ c: { rotation: 30 } })).rejects.toMatchObject({ code: 'INVALID_STATE' })
    expect(toRaw(slot().fileSet)).toBe(toRaw(before))
    expect(slot().edit).toBeUndefined()
    expect(stage.reloadSlot).toHaveBeenCalledTimes(2)
  })

  it('one call over many bones is one reload and one undo step', async () => {
    const { store, stage, slot } = setup()
    await store.setSetupPose({ a: { x: 1 }, b: { x: 2 }, c: { x: 3 }, tail: { x: 4 } })
    expect(stage.reloadSlot).toHaveBeenCalledTimes(1)
    expect(slot().edit!.undo).toHaveLength(1)
  })

  it('a second edit while one runs is refused', async () => {
    const { store, stage } = setup()
    let release!: () => void
    stage.reloadSlot.mockImplementationOnce(() => new Promise<void>(r => { release = r }))
    const first = store.setSetupPose({ c: { x: 1 } })
    await expect(store.setSetupPose({ c: { x: 2 } })).rejects.toMatchObject({ code: 'INVALID_STATE' })
    release()
    await first
  })
})

describe('setup actions (5.7)', () => {
  it('"Apply an override to the setup pose": override value written, override released', async () => {
    const { store, adapter, slot } = setup()
    useSkeletonStore().setBoneOverride('tail', { rotation: 20 })
    expect(await store.applyOverridesToSetupPose()).toEqual(['tail'])
    expect(boneOf(slot(), 'tail')).toMatchObject({ rotation: 20, x: -40, y: 20 })
    expect(adapter.getBoneOverrides()).toEqual({})
    expect(useSkeletonStore().boneOverrides).toEqual({})
  })

  it('"Bake a bone without an override": all seven live local values', async () => {
    const { store, slot } = setup()
    await store.applyOverridesToSetupPose(['c'])
    // absent fields mean the Spine default
    expect({ ...T(), ...boneOf(slot(), 'c') }).toMatchObject({ rotation: 25, x: 41, y: 1, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 })
  })

  it('an overridden bone writes only its overridden fields', async () => {
    const { store, slot } = setup()
    useSkeletonStore().setBoneOverride('c', { y: 7 })
    await store.applyOverridesToSetupPose(['c'])
    expect(boneOf(slot(), 'c')).toMatchObject({ y: 7, x: 40, rotation: 5, scaleX: 1.2 })
  })

  it('nothing to apply is no edit; an unknown bone is NOT_FOUND', async () => {
    const { store, stage } = setup()
    expect(await store.applyOverridesToSetupPose()).toEqual([])
    await expect(store.applyOverridesToSetupPose(['nope'])).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(stage.reloadSlot).not.toHaveBeenCalled()
  })
})

describe('undo, redo, revert (5.8)', () => {
  it('"Twenty-first edit": 20 undos possible, the first edit is gone', async () => {
    const { store, slot } = setup()
    for (let i = 1; i <= UNDO_LIMIT + 1; i++) await store.setSetupPose({ c: { x: i } })
    expect(slot().edit!.undo).toHaveLength(UNDO_LIMIT)
    for (let i = 0; i < UNDO_LIMIT; i++) await store.undo()
    expect(boneOf(slot(), 'c').x).toBe(1)
    expect(store.isEdited('hero')).toBe(true)
    await expect(store.undo()).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })

  it('"Memory budget": the oldest steps across all slots go first, the latest stay', async () => {
    const { store, slot } = setup()
    const compact = JSON.stringify(JSON.parse(SOURCE))
    for (const s of useFileLoaderStore().spineSlots) s.fileSet = { ...s.fileSet!, skeleton: { ...s.fileSet!.skeleton, fileBody: compact } }
    store.setHistoryBudget(compact.length * 2 * 3.5)
    for (let i = 1; i <= 6; i++) await store.setSetupPose({ c: { x: i } })
    expect(slot().edit!.undo).toHaveLength(3)
    await store.undo()
    expect(boneOf(slot(), 'c').x).toBe(5)

    // another slot's newer steps outlive this slot's older ones
    useSlotSelectionStore().setActiveSlot('bonus')
    await store.setSetupPose({ c: { x: 100 } })
    await store.setSetupPose({ c: { x: 101 } })
    const bonus = useFileLoaderStore().spineSlots.find(s => s.id === 'bonus')!
    expect(bonus.edit!.undo).toHaveLength(2)
    expect(slot().edit!.undo.length + slot().edit!.redo.length).toBeLessThanOrEqual(2)
  })

  it('"Redo dropped by a new edit"', async () => {
    const { store } = setup()
    await store.setSetupPose({ c: { x: 1 } })
    await store.setSetupPose({ c: { x: 2 } })
    await store.undo()
    expect(store.getEditState('hero').canRedo).toBe(true)
    await store.setSetupPose({ c: { x: 3 } })
    expect(store.getEditState('hero').canRedo).toBe(false)
    await expect(store.redo()).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })

  it('"Undo to source": not edited, the source file is back, redo restores the edit', async () => {
    const { store, slot, stage } = setup()
    const source = slot().fileSet!.skeleton
    await store.setSetupPose({ c: { x: 1 } })
    await store.undo()
    expect(toRaw(slot().fileSet!.skeleton)).toBe(toRaw(source))
    expect(store.getEditState('hero')).toMatchObject({ edited: false, unsaved: false, canUndo: false, canRedo: true })
    expect(store.unsavedWorkSummary()).toEqual([])
    await store.redo()
    expect(store.getEditState('hero')).toMatchObject({ edited: true, unsaved: true, canUndo: true, canRedo: false })
    expect(boneOf(slot(), 'c').x).toBe(1)
    expect(stage.reloadSlot).toHaveBeenCalledTimes(3)
  })

  it('undo to a .skel source puts the binary file back', async () => {
    const { store, slot } = setup(skelSet())
    const source = slot().fileSet!.skeleton
    await store.setSetupPose({ c: { x: 1 } })
    await store.undo()
    expect(toRaw(slot().fileSet!.skeleton)).toBe(toRaw(source))
    expect(store.isEdited('hero')).toBe(false)
    await store.redo()
    expect(boneOf(slot(), 'c').x).toBe(1)
  })

  it('"Undo a revert": revert is one undoable step and keeps overrides', async () => {
    const { store, slot, adapter } = setup()
    const source = slot().fileSet!.skeleton
    useSkeletonStore().setBoneOverride('c', { rotation: 9 })
    await store.setSetupPose({ c: { x: 1 } })
    await store.revertToSource()
    expect(toRaw(slot().fileSet!.skeleton)).toBe(toRaw(source))
    expect(store.getEditState('hero')).toMatchObject({ edited: false, unsaved: false, canUndo: true, overrides: 1 })
    expect(adapter.getBoneOverrides()).toEqual({ c: { rotation: 9 } })
    await store.undo()
    expect(store.getEditState('hero')).toMatchObject({ edited: true, unsaved: true })
    expect(boneOf(slot(), 'c').x).toBe(1)
  })

  it('revert of a non-active slot reloads that slot; an unedited slot is left alone', async () => {
    const { store, stage } = setup()
    useSlotSelectionStore().setActiveSlot('bonus')
    await store.setSetupPose({ c: { x: 1 } })
    useSlotSelectionStore().setActiveSlot('hero')
    stage.reloadSlot.mockClear()
    await store.revertToSource('hero')
    expect(stage.reloadSlot).not.toHaveBeenCalled()
    await store.revertToSource('bonus')
    expect(stage.reloadSlot).toHaveBeenCalledWith('bonus')
    expect(store.isEdited('bonus')).toBe(false)
  })
})

describe('export (5.10)', () => {
  const text = (b: Blob) => b.text()

  it('unedited JSON: the source text, byte-identical, no edit created', async () => {
    const { store, slot } = setup()
    const res = await store.exportSkeleton('hero', 'json')
    expect(res).toMatchObject({ name: 'hero.json', mimeType: 'application/json', warnings: [] })
    expect(await text(res.blob)).toBe(SOURCE)
    expect(slot().edit).toBeUndefined()
  })

  it('zip of an edited skeleton: <name>.json, atlas, pages; clears unsaved ("Export saves")', async () => {
    const { store } = setup()
    await store.setSetupPose({ c: { x: 1 } })
    const res = await store.exportSkeleton('hero', 'zip')
    expect(res).toMatchObject({ name: 'hero.zip', mimeType: 'application/zip', warnings: [] })
    const files = unzipSync(new Uint8Array(await res.blob.arrayBuffer()))
    expect(Object.keys(files).sort()).toEqual(['fixture.atlas', 'fixture.png', 'hero.json'])
    expect(JSON.parse(strFromU8(files['hero.json'])).bones[3].x).toBe(1)
    expect(store.getEditState('hero')).toMatchObject({ edited: true, unsaved: false })
    await store.setSetupPose({ c: { x: 2 } })
    expect(store.isUnsaved('hero')).toBe(true)
    await store.exportSkeleton('hero', 'json')
    expect(store.isUnsaved('hero')).toBe(false)
  })

  it('unedited .skel: serialized without creating edit, warnings in the result', async () => {
    const { store, slot } = setup(skelSet(), 'bonus')
    const res = await store.exportSkeleton('hero', 'zip')
    expect(res.name).toBe('bonus.zip')
    expect(res.warnings).toEqual(["Skipped unknown attachment type in slot 'fx'"])
    const files = unzipSync(new Uint8Array(await res.blob.arrayBuffer()))
    expect(Object.keys(files).sort()).toEqual(['bonus.json', 'fixture.atlas', 'fixture.png'])
    expect(JSON.parse(strFromU8(files['bonus.json'])).skeleton.spine).toBe('4.2.40')
    expect(slot().edit).toBeUndefined()
    expect(slot().fileSet!.skeleton.type).toBe('skeleton-skel')
  })

  it('an aborted export keeps unsaved', async () => {
    const { store } = setup()
    await store.setSetupPose({ c: { x: 1 } })
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(store.exportSkeleton('hero', 'zip', ctrl.signal)).rejects.toBeDefined()
    expect(store.isUnsaved('hero')).toBe(true)
  })
})

describe('keys (7.6, 7.7)', () => {
  const tlOf = (s: SpineSlot, anim: string, bone: string) => docOf(s).animations[anim]?.bones?.[bone]

  it('createAnimation, setKey, setKeyEasing, deleteKey: one reload each, getKeys reads them', async () => {
    const { store, stage, slot } = setup()
    await store.createAnimation('wave')
    const tl = await store.setKey({ animation: 'wave', bone: 'tail', type: 'rotate', time: 0.5, value: { rotation: 30 }, easing: 'stepped' })
    expect(tl).toEqual({ bone: 'tail', type: 'rotate', keys: [{ time: 0.5, value: { rotation: 30 }, easing: 'stepped' }] })
    await store.setKeyEasing({ animation: 'wave', bone: 'tail', type: 'rotate', time: 0.5, easing: [0.25, 0, 0.75, 1] })
    expect(store.getKeys('wave', 'tail')[0].keys[0].easing).toEqual([0.25, 0, 0.75, 1])
    expect(await store.deleteKey({ animation: 'wave', bone: 'tail', type: 'rotate', time: 0.5 })).toMatchObject({ keys: [] })
    expect(docOf(slot()).animations.wave).toEqual({})
    expect(stage.reloadSlot).toHaveBeenCalledTimes(4)
    expect(slot().edit!.undo).toHaveLength(4)
    await expect(store.createAnimation('wave')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    await expect(store.deleteKey({ animation: 'wave', bone: 'tail', type: 'rotate', time: 0.5 })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(stage.reloadSlot).toHaveBeenCalledTimes(4)
  })

  it('"Build and undo": one reload, one undo step', async () => {
    const { store, stage, slot } = setup()
    const timelines = await store.buildAnimation('nod', [
      { bone: 'tail', type: 'rotate', time: 0, value: { rotation: 0 } },
      { bone: 'tail', type: 'rotate', time: 0.5, value: { rotation: -15 }, easing: [0.25, 0, 0.75, 1] },
      { bone: 'knob', type: 'translatex', time: 0.25, value: { x: 2 } },
    ])
    expect(timelines.map(t => `${t.bone}.${t.type}:${t.keys.length}`)).toEqual(['tail.rotate:2', 'knob.translatex:1'])
    expect(stage.reloadSlot).toHaveBeenCalledTimes(1)
    await store.undo()
    expect(slot().fileSet!.skeleton.fileBody).toBe(SOURCE)
    expect(store.isEdited('hero')).toBe(false)
  })

  it('"Invalid entry": rejects naming the zero-based index, nothing changes', async () => {
    const { store, stage, slot } = setup()
    const ok = { bone: 'tail', type: 'rotate', time: 0, value: { rotation: 1 } }
    const err = await store.buildAnimation('nod', [ok, ok, { ...ok, bone: 'nope' }, ok, ok]).catch(e => e)
    expect(err).toMatchObject({ code: 'NOT_FOUND', details: { index: 2 } })
    expect(err.message).toMatch(/^NOT_FOUND: keys\[2\]: Bone "nope" not found/)
    expect((await store.buildAnimation('nod', [ok, null as never]).catch(e => e)).message).toMatch(/keys\[1\]/)
    await expect(store.buildAnimation('nod', [])).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    await expect(store.buildAnimation('nod', Array(10_001).fill(ok))).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    expect(stage.reloadSlot).not.toHaveBeenCalled()
    expect(slot().fileSet!.skeleton.fileBody).toBe(SOURCE)
  })

  it('build with replace drops bone timelines only; without it merges', async () => {
    const { store, slot } = setup()
    const others = Object.keys(JSON.parse(SOURCE).animations.extra).filter(k => k !== 'bones')
    await store.buildAnimation('extra', [{ bone: 'tail', type: 'translate', time: 0.1, value: { x: 1, y: 2 } }], true)
    const extra = docOf(slot()).animations.extra
    expect(Object.keys(extra.bones)).toEqual(['tail'])
    expect(Object.keys(extra.bones.tail)).toEqual(['translate'])
    expect(Object.keys(extra).filter(k => k !== 'bones')).toEqual(others)
    await store.buildAnimation('anim', [{ bone: 'c', type: 'rotate', time: 0.1, value: { rotation: 3 } }])
    expect(tlOf(slot(), 'anim', 'c').rotate).toHaveLength(5)
  })

  it('"Key an override": key at the playing time, value relative to setup, override released', async () => {
    const { store, adapter, slot } = setup()
    adapter.tracks.push(track(2, 'anim', 0.9), track(0, 'anim', 2.4))
    adapter.overrides.tail = { rotation: 70 }
    const res = await store.keyCurrentPose('anim')
    // tail setup rotation 30; lowest track 0 loops a 2 s animation: 2.4 s → 0.4 s
    expect(res).toEqual([{ bone: 'tail', type: 'rotate', keys: [{ time: expect.closeTo(0.4, 9), value: { rotation: 40 }, easing: 'linear' }] }])
    expect(adapter.overrides.tail).toBeUndefined()
    expect(tlOf(slot(), 'anim', 'tail')).toEqual({ rotate: [{ time: expect.closeTo(0.4, 9), value: 40 }] })
  })

  it('"Batch of keys": ten bones, one reload, one undo removes every key', async () => {
    const { store, stage, adapter, slot } = setup()
    const names = JSON.parse(SOURCE).bones.map((b: { name: string }) => b.name)
    expect(names).toHaveLength(10)
    for (const n of names) adapter.overrides[n] = { rotation: 50 }
    const res = await store.keyCurrentPose('slider-anim', undefined, 0.2)
    expect(res).toHaveLength(10)
    expect(stage.reloadSlot).toHaveBeenCalledTimes(1)
    expect(Object.keys(adapter.overrides)).toEqual([])
    await store.undo()
    expect(slot().fileSet!.skeleton.fileBody).toBe(SOURCE)
  })

  it('separate-axis rule, explicit bone without an override, and the not-playing error', async () => {
    const { store, stage, adapter, slot } = setup()
    adapter.overrides.c = { x: 50 }
    await expect(store.keyCurrentPose('anim')).rejects.toThrow('Animation is not playing; give a time')
    await expect(store.keyCurrentPose('nope', undefined, 0)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(store.keyCurrentPose('anim', ['nope'], 0)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(stage.reloadSlot).not.toHaveBeenCalled()
    // "anim" keys c only on translatex / translatey: x goes to translatex (setup x 40)
    await store.keyCurrentPose('anim', undefined, 0.2)
    const c = tlOf(slot(), 'anim', 'c')
    expect(c.translate).toBeUndefined()
    expect(c.translatex[1]).toEqual({ time: 0.2, value: 10 })
    expect(c.translatey).toHaveLength(3)
    // c without an override: every kind from its live pose (rotation 25, x 41, y 1) against setup (5, 40, 0, 1.2, 10, -5)
    await store.keyCurrentPose('slider-anim', ['c'], 0)
    expect(tlOf(slot(), 'slider-anim', 'c')).toEqual({
      rotate: [{ time: 0, value: 20 }],
      translate: [{ time: 0, x: 1, y: 1 }],
      scale: [{ time: 0, x: 1 / 1.2, y: 1 }],
      shear: [{ time: 0, x: -10, y: 5 }],
    })
  })
})
