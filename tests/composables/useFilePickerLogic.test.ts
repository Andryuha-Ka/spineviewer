import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFilePickerLogic } from '@/core/composables/useFilePickerLogic'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useVersionStore } from '@/core/stores/useVersionStore'
import type { FileSet, SpineSlot } from '@/core/types/FileSet'
import { groupSpineFiles } from '@/core/utils/fileLoader'

vi.mock('@/core/utils/fileLoader', () => ({ groupSpineFiles: vi.fn(), getFilesFromDataTransfer: vi.fn() }))
vi.mock('@/core/utils/spineValidator', () => ({ validateSpineFileSet: () => [] }))
vi.mock('@/core/utils/fileHistory', () => ({
  saveSession: vi.fn(),
  isFileSystemAccessSupported: () => false,
  pickFilesViaFSAA: vi.fn(),
  pickFolderViaFSAA: vi.fn(),
}))

describe('useFilePickerLogic.onOpenCompare (B5)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const openWith = (slots: SpineSlot[]) => {
    useFileLoaderStore().spineSlots = slots
    const emit = vi.fn()
    useFilePickerLogic(emit).onOpenCompare()
    return emit
  }
  const bad: SpineSlot = { id: 'x', name: 'X', error: 'Missing atlas' }

  it('emits the ids of the first two valid slots', () => {
    expect(openWith([bad, { id: 'y', name: 'Y' }, { id: 'z', name: 'Z' }]))
      .toHaveBeenCalledWith('open-compare', { left: 'y', right: 'z' })
  })

  it('emits only left for one valid slot', () => {
    expect(openWith([bad, { id: 'y', name: 'Y', validationErrors: ['e'] }, { id: 'z', name: 'Z' }]))
      .toHaveBeenCalledWith('open-compare', { left: 'z' })
  })

  it('emits an empty payload for none', () => {
    expect(openWith([bad])).toHaveBeenCalledWith('open-compare', {})
  })
})

describe('useFilePickerLogic.handleFiles (C36)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const set = (filename: string, spine: string): FileSet => ({
    skeleton: { filename, type: 'skeleton-json', fileBody: JSON.stringify({ skeleton: { spine } }) },
    atlas:    { filename: 'a.atlas', type: 'atlas', fileBody: '' },
    images:   [],
  } as unknown as FileSet)

  const load = async (slots: SpineSlot[]) => {
    vi.mocked(groupSpineFiles).mockResolvedValue({ slots } as Awaited<ReturnType<typeof groupSpineFiles>>)
    await useFilePickerLogic(vi.fn()).handleFiles([new File([''], 'x')], undefined, true)
    return useFileLoaderStore().spineSlots
  }

  it('marks nothing for a 4.1 batch with a 3.8 set (C37)', async () => {
    const slots = await load([
      { id: 'a', name: 'A', fileSet: set('a.json', '4.1.21') },
      { id: 'b', name: 'B', fileSet: set('anticipationEffect.json', '3.8.99') },
    ])
    expect(slots.every(s => !s.validationErrors)).toBe(true)
    expect(useFileLoaderStore().detectedVersion).toBe('4.1')
  })

  it('marks only the set that needs the other Pixi version', async () => {
    const slots = await load([
      { id: 'a', name: 'A', fileSet: set('a.json', '4.1.21') },
      { id: 'b', name: 'B', fileSet: set('b.json', '4.2.40') },
      { id: 'c', name: 'C', fileSet: set('c.json', '4.1.21') },
    ])
    expect(slots.map(s => s.validationErrors)).toEqual([
      undefined,
      ['Spine version mismatch: b.json is 4.2, viewer is set to 4.1'],
      undefined,
    ])
  })

  it('shows the unsupported-version hint and keeps the runtime selection (B22)', async () => {
    const versions = useVersionStore()
    versions.selectVersion(7, '4.1')
    vi.mocked(groupSpineFiles).mockResolvedValue({ slots: [{ id: 'a', name: 'A', fileSet: set('a.json', '4.4.1') }] } as Awaited<ReturnType<typeof groupSpineFiles>>)
    const picker = useFilePickerLogic(vi.fn())
    await picker.handleFiles([new File([''], 'x')], undefined, true)
    expect(picker.unsupportedHint.value).toBe('Spine 4.4 is newer than the supported runtimes (3.8, 4.0, 4.1, 4.2, 4.3)')
    expect(picker.versionUnknown.value).toBe(false)
    expect([versions.pixiVersion, versions.spineVersion]).toEqual([7, '4.1'])
    picker.onClear()
    expect(picker.unsupportedHint.value).toBeNull()
  })

  it('selects Pixi 8 + Spine 4.3 for a 4.3 drop', async () => {
    useVersionStore().selectVersion(7, '4.1')
    await load([{ id: 'a', name: 'A', fileSet: set('a.json', '4.3.75-beta') }])
    expect([useVersionStore().pixiVersion, useVersionStore().spineVersion]).toEqual([8, '4.3'])
  })

  it('marks a lone unsupported set, keeps Open Viewer disabled and the runtime unchanged (C47)', async () => {
    useVersionStore().selectVersion(8, '4.2')
    const slots = await load([{ id: 'hero', name: 'hero', fileSet: set('hero.json', '4.4.1') }])
    expect(slots[0].validationErrors).toEqual([
      'Spine version mismatch: hero.json is 4.4 (unsupported), supported versions are 3.8, 4.0, 4.1, 4.2, 4.3',
    ])
    expect(useFileLoaderStore().isLoaded).toBe(false)
    expect([useVersionStore().pixiVersion, useVersionStore().spineVersion]).toEqual([8, '4.2'])
  })

  it('marks an unsupported set among 4.2 sets and keeps the 4.2 sets valid (B30)', async () => {
    const slots = await load([
      ...['a', 'b', 'c', 'd'].map(id => ({ id, name: id, fileSet: set(`${id}.json`, '4.2.40') })),
      { id: 'legacy', name: 'legacy', fileSet: set('legacy.json', '3.7.94') },
    ])
    expect(useFileLoaderStore().detectedVersion).toBe('4.2')
    expect(slots.map(s => s.validationErrors)).toEqual([
      undefined, undefined, undefined, undefined,
      ['Spine version mismatch: legacy.json is 3.7 (unsupported), supported versions are 3.8, 4.0, 4.1, 4.2, 4.3'],
    ])
  })

  it('never marks a supported set because the first set is unsupported', async () => {
    const slots = await load([
      { id: 'new', name: 'new', fileSet: set('new.json', '4.4.1') },
      { id: 'a', name: 'A', fileSet: set('a.json', '4.2.40') },
      { id: 'b', name: 'B', fileSet: set('b.json', '') },
    ])
    expect(slots.map(s => s.validationErrors?.length ?? 0)).toEqual([1, 0, 0])
    expect(useFileLoaderStore().isLoaded).toBe(true)
  })

  it('keeps a 4.3 set valid among 4.2 sets', async () => {
    const slots = await load([
      ...['a', 'b', 'c'].map(id => ({ id, name: id, fileSet: set(`${id}.json`, '4.2.40') })),
      { id: 'bonus', name: 'bonus', fileSet: set('bonus.json', '4.3.13') },
    ])
    expect(useFileLoaderStore().detectedVersion).toBe('4.2')
    expect(slots.every(s => !s.validationErrors)).toBe(true)
  })

  it('marks a 4.2 set among 4.1 sets with the session wording', async () => {
    const slots = await load([
      ...['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id, fileSet: set(`${id}.json`, '4.1.21') })),
      { id: 'bonus', name: 'bonus', fileSet: set('bonus.json', '4.2.40') },
    ])
    expect(slots.map(s => s.validationErrors)).toEqual([
      undefined, undefined, undefined, undefined, undefined,
      ['Spine version mismatch: bonus.json is 4.2, viewer is set to 4.1'],
    ])
  })

  it('checks nothing when the detected version is unknown', async () => {
    const slots = await load([
      { id: 'a', name: 'A', fileSet: set('a.json', '') },
      { id: 'b', name: 'B', fileSet: set('b.json', '4.2.40') },
    ])
    expect(slots.every(s => !s.validationErrors)).toBe(true)
  })
})
