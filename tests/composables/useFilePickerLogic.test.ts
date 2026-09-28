import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFilePickerLogic } from '@/core/composables/useFilePickerLogic'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
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

  it('checks nothing when the detected version is unknown', async () => {
    const slots = await load([
      { id: 'a', name: 'A', fileSet: set('a.json', '') },
      { id: 'b', name: 'B', fileSet: set('b.json', '4.2.40') },
    ])
    expect(slots.every(s => !s.validationErrors)).toBe(true)
  })
})
