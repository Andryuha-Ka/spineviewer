import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFileLoaderStore, SPINE_SLOTS_LIMIT } from '@/core/stores/useFileLoaderStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
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

describe('useFileLoaderStore.reorderSlots (N8)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('moves by position in the top-level list and leaves child slots in place', () => {
    const loader = useFileLoaderStore()
    loader.setSlots([slot('a'), slot('b'), slot('a-child', { parentSlotId: 'a' }), slot('c')], '4.1')
    // Spines list shows a, b, c — drag c (index 2) to the top
    loader.reorderSlots(2, 0)
    expect(ids()).toEqual(['c', 'a', 'a-child', 'b'])
    loader.reorderSlots(0, 2)
    expect(ids()).toEqual(['a', 'b', 'a-child', 'c'])
  })

  it('ignores out-of-range sources', () => {
    const loader = useFileLoaderStore()
    loader.setSlots([slot('a'), slot('b')], '4.1')
    loader.reorderSlots(5, 0)
    expect(ids()).toEqual(['a', 'b'])
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
