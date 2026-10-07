import { describe, it, expect, beforeEach, vi } from 'vitest'
import { toRaw } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { zipSync } from 'fflate'
import { saveSession } from '@/core/utils/fileHistory'
import { archiveOf } from '@/core/utils/fileLoader'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'
import { useFileLoaderStore, isSlotEdited, SPINE_SLOTS_LIMIT } from '@/core/stores/useFileLoaderStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import type { FileSet, PHChildEntry, SpineSlot, SpineSlotSavedState } from '@/core/types/FileSet'

const FILESET: FileSet = {
  skeleton: { filename: 's.skel', fileBody: new ArrayBuffer(8), type: 'skeleton-skel', mimeType: '' },
  atlas:    { filename: 's.atlas', fileBody: 'p.png', type: 'atlas', mimeType: '' },
  images:   [],
}

const slot = (id: string, extra: Partial<SpineSlot> = {}): SpineSlot => ({ id, name: id, fileSet: FILESET, ...extra })

const saved = (extra: Partial<SpineSlotSavedState> = {}): SpineSlotSavedState => ({
  speed: 1, selectedAnimation: 'idle', currentTrack: 0, loop: true, trackEnabled: {},
  trackPlaylists: { 0: [{ animationName: 'idle', loop: true }] }, wasPlaying: true, selectedSkins: [],
  showPlaceholders: true, disabledPlaceholders: [], syncEnabled: true, indPosX: 0, indPosY: 0, indZoom: 1, ...extra,
})

const ids = () => useFileLoaderStore().spineSlots.map(s => s.id)

vi.mock('@/core/utils/fileHistory', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/utils/fileHistory')>(),
  saveSession: vi.fn(async () => {}),
}))

/** A loadable set as dropped files: skeleton JSON of `spine`, atlas with one page, the page image. */
const files = (name: string, spine: string, opts: { atlas?: boolean } = {}): File[] => [
  new File([JSON.stringify({ skeleton: { spine }, bones: [{ name: 'root' }], slots: [], skins: [], animations: {} })], `${name}.json`),
  ...(opts.atlas === false ? [] : [new File([`${name}.png
size: 4,4
format: RGBA8888
filter: Linear,Linear
repeat: none
r
  rotate: false
  xy: 0, 0
  size: 4, 4
  orig: 4, 4
  offset: 0, 0
  index: -1
`], `${name}.atlas`)]),
  new File([new Uint8Array([137, 80, 78, 71])], `${name}.png`, { type: 'image/png' }),
]

describe('useFileLoaderStore.setTopLevelOrder', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('puts listed ids first and keeps the relative order of child slots', () => {
    const loader = useFileLoaderStore()
    loader.setSlots([slot('a'), slot('a1', { parentSlotId: 'a' }), slot('b'), slot('a2', { parentSlotId: 'a' }), slot('c')], '4.1')
    loader.setTopLevelOrder(['c', 'a', 'b'])
    expect(ids()).toEqual(['c', 'a', 'b', 'a1', 'a2'])
  })

  it('ignores unknown ids', () => {
    const loader = useFileLoaderStore()
    loader.setSlots([slot('a'), slot('b')], '4.1')
    loader.setTopLevelOrder(['x', 'b', 'a'])
    expect(ids()).toEqual(['b', 'a'])
  })
})

describe('useFileLoaderStore.cloneSlot (N9)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const loader = useFileLoaderStore()
    const ph = usePlaceholderImagesStore()
    loader.setSlots([
      slot('a', { savedState: saved({ trackTimes: { 0: 0.5 } }) }),
      slot('kid', { parentSlotId: 'a', savedState: saved({ selectedSkins: ['gold'] }) }),
    ], '4.1')
    const children: Record<string, PHChildEntry[]> = {
      placeholder_1: [
        { kind: 'image', imageId: 'img-1', fileName: 'x.png', dataURL: 'data:x', syncEnabled: false, posX: 5, posY: 6, scale: 2 },
        { kind: 'spine', imageId: 'sp-1', childSlotId: 'kid', fileName: 'kid', fileSet: FILESET, syncEnabled: true, posX: 0, posY: 0, scale: 1 },
      ],
    }
    ph.setSlotImages('a', children)
    return { loader, ph }
  }

  it('gives cloned images new ids and keeps their transform', () => {
    const { loader, ph } = seed()
    const clone = loader.cloneSlot('a')!
    const [img] = ph.getPlaceholderImages(clone.id, 'placeholder_1')
    expect(img).toMatchObject({ kind: 'image', dataURL: 'data:x', posX: 5, posY: 6, scale: 2, syncEnabled: false })
    expect(img.imageId).not.toBe('img-1')
    expect(ph.getChildContext('img-1')?.slotId).toBe('a')
  })

  it('clones child spines into independent child slots with their saved state', () => {
    const { loader, ph } = seed()
    const clone = loader.cloneSlot('a')!
    const spine = ph.getPlaceholderSpineEntries(clone.id, 'placeholder_1')[0]
    expect(spine.imageId).not.toBe('sp-1')
    expect(spine.childSlotId).not.toBe('kid')
    const kidClone = loader.spineSlots.find(s => s.id === spine.childSlotId)!
    expect(kidClone).toMatchObject({ parentSlotId: clone.id, name: 'kid', fileSet: FILESET })
    expect(kidClone.savedState?.selectedSkins).toEqual(['gold'])
    expect(loader.spineSlots.filter(s => s.parentSlotId === 'a').map(s => s.id)).toEqual(['kid'])
  })

  it('copies saved state without the source placeholder snapshot', () => {
    const { loader } = seed()
    const clone = loader.cloneSlot('a')!
    expect(clone.name).toBe('a (2)')
    expect(clone.savedState?.trackTimes).toEqual({ 0: 0.5 })
    expect(clone.fileSet).not.toBe(FILESET)
    expect(clone.fileSet!.skeleton.fileBody).not.toBe(FILESET.skeleton.fileBody)
  })

  it('stops cloning child spines at the slot limit', () => {
    const { loader, ph } = seed()
    for (let i = loader.spineSlots.length; i < SPINE_SLOTS_LIMIT - 1; i++) loader.addSlot(slot(`fill-${i}`))
    const clone = loader.cloneSlot('a')!
    expect(loader.spineSlots).toHaveLength(SPINE_SLOTS_LIMIT)
    expect(ph.getPlaceholderSpineEntries(clone.id, 'placeholder_1')).toEqual([])
    expect(ph.getPlaceholderImages(clone.id, 'placeholder_1')).toHaveLength(1)
  })
})

describe('useFileLoaderStore.patchSlotPlaceholderImages (C23)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('stores placeholder entries without the child FileSet', () => {
    const loader = useFileLoaderStore()
    loader.setSlots([slot('a', { savedState: saved() })], '4.1')
    const entry: PHChildEntry = { kind: 'spine', imageId: 'e1', childSlotId: 'kid', fileName: 'kid', fileSet: FILESET, syncEnabled: true, posX: 0, posY: 0, scale: 1 }
    loader.patchSlotPlaceholderImages('a', { p: [entry] })

    const state = loader.spineSlots[0].savedState!
    const [out] = state.placeholderChildren!.p
    expect('fileSet' in out).toBe(false)
    expect(out).toMatchObject({ kind: 'spine', imageId: 'e1', childSlotId: 'kid' })
    const reachable = (v: unknown): boolean =>
      v === FILESET.skeleton.fileBody || (typeof v === 'object' && v !== null && Object.values(v).some(reachable))
    expect(reachable(state)).toBe(false)
  })
})

describe('useFileLoaderStore.removeSlot (B11)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('falls back to the first top-level slot without errors', () => {
    const loader = useFileLoaderStore()
    const sel = useSlotSelectionStore()
    loader.setSlots([
      slot('gone'),
      slot('kid', { parentSlotId: 'gone' }),
      slot('broken', { error: 'unmatched' }),
      slot('invalid', { validationErrors: ['missing image'] }),
      slot('ok'),
    ], '4.1')
    sel.activeSlotId = 'gone'
    loader.removeSlot('gone')
    expect(sel.activeSlotId).toBe('ok')
  })
})

describe('useFileLoaderStore.loadFileList (D2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(saveSession).mockClear()
  })

  it('loads a valid set, selects the runtime and records history once', async () => {
    const res = await useFileLoaderStore().loadFileList(files('hero', '4.2.40'))
    expect(res).toMatchObject({ version: '4.2', error: null, versionUnknown: false, unsupportedHint: null, historySaved: true })
    expect(res.slots.map(s => [s.name, s.validationErrors])).toEqual([['hero', undefined]])
    expect([useVersionStore().pixiVersion, useVersionStore().spineVersion]).toEqual([8, '4.2'])
    expect(useSlotSelectionStore().activeSlotId).toBe(res.slots[0].id)
    expect(saveSession).toHaveBeenCalledTimes(1)
    expect(saveSession).toHaveBeenCalledWith(['hero.json', 'hero.atlas', 'hero.png'], undefined)
  })

  it('skips history when asked', async () => {
    const res = await useFileLoaderStore().loadFileList(files('hero', '4.2.40'), { skipHistory: true })
    expect(res.historySaved).toBe(false)
    expect(saveSession).not.toHaveBeenCalled()
  })

  it('reports a missing atlas and records nothing', async () => {
    const res = await useFileLoaderStore().loadFileList(files('hero', '4.2.40', { atlas: false }))
    expect(res.error).toBe('Missing atlas file (.atlas)')
    expect(res.slots).toEqual([])
    expect(saveSession).not.toHaveBeenCalled()
  })

  it('marks a set of the other Pixi version as a mismatch', async () => {
    const res = await useFileLoaderStore().loadFileList([...files('a', '4.1.21'), ...files('b', '4.2.40')])
    expect(res.version).toBe('4.1')
    const b = res.slots.find(s => s.name === 'b')!
    expect(b.validationErrors).toEqual(['Spine version mismatch: b.json is 4.2, viewer is set to 4.1'])
  })

  it('lists archive entries as pending files and records the archive name with its handle', async () => {
    const entries = Object.fromEntries(await Promise.all(
      [...files('hero', '4.2.40'), new File(['<html>'], 'test.html')].map(async f => [f.name, new Uint8Array(await f.arrayBuffer())]),
    ))
    const zip = new File([zipSync(entries)], 'export.zip')
    const handle = {} as FileSystemFileHandle
    const store = useFileLoaderStore()
    const res = await store.loadFileList([zip], { handles: [handle] })
    expect(res.error).toBeNull()
    expect(res.slots.map(s => s.name)).toEqual(['hero'])
    expect(store.pendingFiles.map(f => `${archiveOf.get(toRaw(f))} › ${f.name}`).sort())
      .toEqual(['export.zip › hero.atlas', 'export.zip › hero.json', 'export.zip › hero.png'])
    expect(saveSession).toHaveBeenCalledWith(['export.zip'], [handle])
  })

  it('reports a corrupt archive and adds nothing', async () => {
    const store = useFileLoaderStore()
    const res = await store.loadFileList([new File(['garbage'], 'broken.zip')])
    expect(res.error).toBe('Cannot read archive: broken.zip')
    expect(store.spineSlots).toEqual([])
    expect(saveSession).not.toHaveBeenCalled()
  })
})

describe('useFileLoaderStore.addFileList (D2)', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await useFileLoaderStore().loadFileList(files('base', '4.2.40'), { skipHistory: true })
  })

  it('adds new sets on top of the list', async () => {
    const res = await useFileLoaderStore().addFileList(files('extra', '4.2.40'))
    expect(res.error).toBeNull()
    expect(res.ignored).toBe(0)
    expect(res.slots.map(s => s.name)).toEqual(['extra'])
    expect(useFileLoaderStore().spineSlots.map(s => s.name)).toEqual(['extra', 'base'])
    expect(useImageLayersStore().rows[0].id).toBe(res.slots[0].id)
  })

  it('adds a set of the other runtime as an error row', async () => {
    const res = await useFileLoaderStore().addFileList(files('old', '4.1.21'))
    expect(res.slots[0].validationErrors).toEqual(['Spine version mismatch: old.json is 4.1, viewer is set to 4.2'])
  })

  it('returns the load error without adding anything', async () => {
    const res = await useFileLoaderStore().addFileList(files('x', '4.2.40', { atlas: false }))
    expect(res).toEqual({ slots: [], ignored: 0, error: 'Missing atlas file (.atlas)' })
    expect(useFileLoaderStore().spineSlots).toHaveLength(1)
  })

  it('counts sets beyond the slot limit as ignored', async () => {
    const loader = useFileLoaderStore()
    for (let i = loader.spineSlots.length; i < SPINE_SLOTS_LIMIT - 1; i++) loader.addSlot(slot(`fill-${i}`))
    const res = await loader.addFileList([...files('p', '4.2.40'), ...files('q', '4.2.40')])
    expect(res.slots).toHaveLength(1)
    expect(res.ignored).toBe(1)
    expect(loader.spineSlots).toHaveLength(SPINE_SLOTS_LIMIT)
  })
})

describe('useFileLoaderStore.cloneSlot bone overrides (2.8)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('the clone gets its own copy of the saved overrides', () => {
    const loader = useFileLoaderStore()
    loader.setSlots([slot('a', { savedState: saved({ boneOverrides: { arm: { rotation: 30 } } }) })], '4.1')
    const clone = loader.cloneSlot('a')!
    expect(clone.savedState?.boneOverrides).toEqual({ arm: { rotation: 30 } })
    clone.savedState!.boneOverrides!.arm.rotation = 1
    expect(loader.spineSlots[0].savedState?.boneOverrides).toEqual({ arm: { rotation: 30 } })
  })
})

describe('useFileLoaderStore.loadFileList slot limit', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reports the sets dropped by the 30-slot limit as ignored', async () => {
    const all = Array.from({ length: SPINE_SLOTS_LIMIT + 2 }, (_, i) => files(`s${i}`, '4.2.40')).flat()
    const res = await useFileLoaderStore().loadFileList(all, { skipHistory: true })
    expect(res.slots).toHaveLength(SPINE_SLOTS_LIMIT)
    expect(res.ignored).toBe(2)
  })

  it('ignores nothing below the limit', async () => {
    const res = await useFileLoaderStore().loadFileList(files('hero', '4.2.40'), { skipHistory: true })
    expect(res.ignored).toBe(0)
  })
})

describe('useFileLoaderStore.cloneSlot edits (D4/D9)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const source = FILESET.skeleton
  const editedSet: FileSet = { ...FILESET, skeleton: { filename: 's.json', fileBody: '{"edited":1}', type: 'skeleton-json', mimeType: 'application/json' } }

  it('an edited slot clones edited and unsaved with an empty history and the shared source', () => {
    const loader = useFileLoaderStore()
    loader.setSlots([slot('a', {
      fileSet: editedSet,
      edit: { source, unsaved: false, warnings: ['w'], undo: ['x'], redo: ['y'] },
    })], '4.2')
    const clone = loader.cloneSlot('a')!
    expect(clone.edit).toEqual({ source, unsaved: true, warnings: ['w'], undo: [], redo: [] })
    expect(toRaw(clone.edit!.source)).toBe(toRaw(loader.spineSlots[0].edit!.source))
    expect(clone.fileSet!.skeleton.fileBody).toBe('{"edited":1}')
    expect(isSlotEdited(clone)).toBe(true)
    clone.edit!.warnings.push('more')
    expect(loader.spineSlots[0].edit!.warnings).toEqual(['w'])
  })

  it('a slot back at its source (history only) clones unedited', () => {
    const loader = useFileLoaderStore()
    loader.setSlots([slot('a', { edit: { source, unsaved: false, warnings: [], undo: ['x'], redo: [] } })], '4.2')
    expect(isSlotEdited(loader.spineSlots[0])).toBe(false)
    expect(loader.cloneSlot('a')!.edit).toBeUndefined()
  })

  it('edited child spines travel with the clone', () => {
    const loader = useFileLoaderStore()
    loader.setSlots([
      slot('a'),
      slot('kid', { parentSlotId: 'a', fileSet: editedSet, edit: { source, unsaved: false, warnings: [], undo: ['x'], redo: [] } }),
    ], '4.2')
    usePlaceholderImagesStore().setSlotImages('a', { p: [
      { kind: 'spine', imageId: 'sp-1', childSlotId: 'kid', fileName: 'kid', fileSet: FILESET, syncEnabled: true, posX: 0, posY: 0, scale: 1 },
    ] })
    const clone = loader.cloneSlot('a')!
    const kid = loader.spineSlots.find(s => s.parentSlotId === clone.id)!
    expect(kid.edit).toMatchObject({ unsaved: true, undo: [], redo: [] })
    expect(isSlotEdited(kid)).toBe(true)
  })

  it('removeSlot and clear drop the edit with the slot', () => {
    const loader = useFileLoaderStore()
    loader.setSlots([slot('a', { fileSet: editedSet, edit: { source, unsaved: true, warnings: [], undo: [], redo: [] } }), slot('b')], '4.2')
    loader.removeSlot('a')
    expect(loader.spineSlots.some(s => s.edit)).toBe(false)
    loader.clear()
    expect(loader.spineSlots).toEqual([])
  })
})
