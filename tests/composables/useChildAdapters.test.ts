import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { makeFakeAdapter, track } from '../helpers/fakeAdapter'
import type { PHImageEntry, PHSpineEntry, SpineSlot, SpineSlotSavedState } from '@/core/types/FileSet'

const created: ReturnType<typeof makeFakeAdapter>[] = []
vi.mock('@/core/AdapterFactory', () => ({
  createSpineAdapter: vi.fn(async () => {
    const a = makeFakeAdapter()
    created.push(a)
    return a
  }),
}))

const { useChildAdapters } = await import('@/core/composables/stage/useChildAdapters')
const { useFileLoaderStore } = await import('@/core/stores/useFileLoaderStore')
const { useVersionStore } = await import('@/core/stores/useVersionStore')
const { useSlotSelectionStore } = await import('@/core/stores/useSlotSelectionStore')
const { useAnimationStore } = await import('@/core/stores/useAnimationStore')
const { usePlaceholderImagesStore } = await import('@/core/stores/usePlaceholderImagesStore')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FILESET = { skeleton: {}, atlas: {}, images: [] } as any

function entry(imageId: string, childSlotId: string): PHSpineEntry {
  return { kind: 'spine', imageId, childSlotId, fileName: 'c.skel', fileSet: FILESET, syncEnabled: true, posX: 0, posY: 0, scale: 1 }
}

function image(imageId: string): PHImageEntry {
  return { kind: 'image', imageId, fileName: 'i.png', dataURL: 'data:', syncEnabled: true, posX: 0, posY: 0, scale: 1 }
}

function saved(extra: Partial<SpineSlotSavedState>): SpineSlotSavedState {
  return {
    speed: 1.5, selectedAnimation: null, currentTrack: 0, loop: false, trackEnabled: {},
    trackPlaylists: {}, wasPlaying: true, selectedSkins: [], showPlaceholders: true,
    disabledPlaceholders: [], syncEnabled: true, indPosX: 0, indPosY: 0, indZoom: 1, ...extra,
  }
}

describe('useChildAdapters', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    created.length = 0
    useVersionStore().selectVersion(8, '4.2')
    const slots: SpineSlot[] = [
      { id: 'parent', name: 'p', fileSet: FILESET },
      { id: 'child', name: 'c', fileSet: FILESET, parentSlotId: 'parent' },
    ]
    useFileLoaderStore().setSlots(slots, '4.2')
  })

  it('replays saved enabled tracks with their times and skins on mount (N2)', async () => {
    const loader = useFileLoaderStore()
    loader.saveSlotState('child', saved({
      trackPlaylists: { 0: [{ animationName: 'idle', loop: true }, { animationName: 'win', loop: false }], 1: [{ animationName: 'blink', loop: true }] },
      trackEnabled: { 1: false },
      trackTimes: { 0: 0.4, 1: 0.2 },
      selectedSkins: ['gold'],
      speed: 2,
    }))
    const children = useChildAdapters()
    await children.mountChildAdapter(makeFakeAdapter(), 'parent', 'placeholder_1', entry('e1', 'child'))

    const child = created[0]
    expect(child.setAnimation.mock.calls).toEqual([[0, 'idle', false]])
    expect(child.addAnimation.mock.calls).toEqual([[0, 'win', false]])
    expect(child.seekTo.mock.calls).toEqual([[0, 0.4]])
    expect(child.setSkins).toHaveBeenCalledWith(['gold'])
    expect(child.setTimeScale).toHaveBeenLastCalledWith(2)
  })

  it('creates the child adapter for the child slot FileSet (C37)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const childSet = { skeleton: { filename: 'c.skel' }, atlas: {}, images: [] } as any
    useFileLoaderStore().spineSlots.find(s => s.id === 'child')!.fileSet = childSet
    await useChildAdapters().mountChildAdapter(makeFakeAdapter(), 'parent', 'p', entry('e1', 'child'))
    const { createSpineAdapter } = await import('@/core/AdapterFactory')
    expect(createSpineAdapter).toHaveBeenLastCalledWith(8, '4.2', childSet)
  })

  it('dedupes concurrent mounts of one entry', async () => {
    const children = useChildAdapters()
    const parent = makeFakeAdapter()
    await Promise.all([
      children.mountChildAdapter(parent, 'parent', 'p', entry('e1', 'child')),
      children.mountChildAdapter(parent, 'parent', 'p', entry('e1', 'child')),
    ])
    expect(created).toHaveLength(1)
    expect(children.childAdapters.size).toBe(1)
  })

  it('snapshots live tracks before destroying a child and resumes them on remount (C19)', async () => {
    const children = useChildAdapters()
    await children.mountChildAdapter(makeFakeAdapter(), 'parent', 'p', entry('e1', 'child'))
    const first = created[0]
    first.tracks = [{ ...track(0, 'run', 1.25), queue: [{ animationName: 'stop', loop: false }] }]

    children.moveChildAdapter('e1', null, 'other', 'p')
    expect(first.destroy).toHaveBeenCalled()
    expect(children.childAdapters.has('e1')).toBe(false)

    const ss = useFileLoaderStore().spineSlots.find(s => s.id === 'child')!.savedState!
    expect(ss.trackPlaylists).toEqual({ 0: [{ animationName: 'run', loop: true }, { animationName: 'stop', loop: false }] })
    expect(ss.trackTimes).toEqual({ 0: 1.25 })
    expect(ss.wasPlaying).toBe(true)

    await children.mountChildAdapter(makeFakeAdapter(), 'other', 'p', entry('e1', 'child'))
    const second = created[1]
    expect(second.setAnimation).toHaveBeenCalledWith(0, 'run', false)
    expect(second.addAnimation).toHaveBeenCalledWith(0, 'stop', false)
    expect(second.seekTo).toHaveBeenCalledWith(0, 1.25)
  })

  it('keeps saved skins and speed when snapshotting', async () => {
    useFileLoaderStore().saveSlotState('child', saved({ selectedSkins: ['red'], speed: 0.5, wasPlaying: false }))
    const children = useChildAdapters()
    await children.mountChildAdapter(makeFakeAdapter(), 'parent', 'p', entry('e1', 'child'))
    created[0].tracks = [track(2, 'idle', 0.5)]
    children.destroyChildAdaptersForSlot('parent')
    const ss = useFileLoaderStore().spineSlots.find(s => s.id === 'child')!.savedState!
    expect(ss).toMatchObject({ selectedSkins: ['red'], speed: 0.5, wasPlaying: false, trackTimes: { 2: 0.5 } })
  })

  it('snapshot keeps the saved full list when the live chain shows only the last entry', async () => {
    const list = [{ animationName: 'a', loop: true }, { animationName: 'b', loop: false }, { animationName: 'c', loop: false }]
    useFileLoaderStore().saveSlotState('child', saved({ trackPlaylists: { 0: list } }))
    const children = useChildAdapters()
    await children.mountChildAdapter(makeFakeAdapter(), 'parent', 'p', entry('e1', 'child'))
    created[0].tracks = [track(0, 'c', 0.2)]
    children.destroyChildAdaptersForSlot('parent')
    expect(useFileLoaderStore().spineSlots.find(s => s.id === 'child')!.savedState!.trackPlaylists).toEqual({ 0: list })
  })

  it('snapshot of the UI-active child takes the store lists', async () => {
    const children = useChildAdapters()
    await children.mountChildAdapter(makeFakeAdapter(), 'parent', 'p', entry('e1', 'child'))
    useSlotSelectionStore().setActiveSlot('child')
    children.activeChildAdapter.value = created[0]
    const list = [{ animationName: 'x', loop: true }, { animationName: 'y', loop: false }]
    useAnimationStore().setTrackPlaylist(0, list)
    created[0].tracks = [track(0, 'y', 0.1)]
    children.destroyChildAdaptersForSlot('parent')
    expect(useFileLoaderStore().spineSlots.find(s => s.id === 'child')!.savedState!.trackPlaylists).toEqual({ 0: list })
  })

  it('snapshot ignores the store while it still holds the parent (C35)', async () => {
    const own = [{ animationName: 'blink', loop: true }]
    useFileLoaderStore().saveSlotState('child', saved({ trackPlaylists: { 2: own }, trackEnabled: { 2: true } }))
    const children = useChildAdapters()
    await children.mountChildAdapter(makeFakeAdapter(), 'parent', 'p', entry('e1', 'child'))
    // the child is selected but the slot watcher has not swapped the stores yet
    useSlotSelectionStore().setActiveSlot('child')
    useAnimationStore().setTrackPlaylist(0, [{ animationName: 'win', loop: true }])
    children.destroyChildAdaptersForSlot('parent')
    expect(useFileLoaderStore().spineSlots.find(s => s.id === 'child')!.savedState!.trackPlaylists).toEqual({ 2: own })
  })

  it('saveChildState writes only the child the stores hold (C35)', async () => {
    const loader = useFileLoaderStore()
    loader.setSlots([
      { id: 'parent', name: 'p', fileSet: FILESET },
      { id: 'child', name: 'c', fileSet: FILESET, parentSlotId: 'parent' },
      { id: 'other', name: 'o', fileSet: FILESET, parentSlotId: 'parent' },
    ], '4.2')
    const children = useChildAdapters()
    await children.mountChildAdapter(makeFakeAdapter(), 'parent', 'p', entry('e1', 'child'))
    children.activeChildAdapter.value = created[0]
    useAnimationStore().setTrackPlaylist(0, [{ animationName: 'idle', loop: true }])

    children.saveChildState('other')
    expect(loader.spineSlots.find(s => s.id === 'other')!.savedState).toBeUndefined()
    children.saveChildState('child')
    expect(loader.spineSlots.find(s => s.id === 'child')!.savedState!.trackPlaylists).toEqual({ 0: [{ animationName: 'idle', loop: true }] })
  })

  it('remount resumes the known tracks when the saved list names a foreign animation (C35)', async () => {
    useFileLoaderStore().saveSlotState('child', saved({
      trackPlaylists: { 0: [{ animationName: 'M/win', loop: true }], 2: [{ animationName: 'blink', loop: true }] },
      trackEnabled: { 0: true, 2: true },
      selectedSkins: ['gold'],
    }))
    const children = useChildAdapters()
    await children.mountChildAdapter(makeFakeAdapter(), 'parent', 'p', entry('e1', 'child'))
    expect(created[0].setAnimation.mock.calls).toEqual([[2, 'blink', true]])
    expect(created[0].setSkins).toHaveBeenCalledWith(['gold'])
    expect(created[0].setTimeScale).toHaveBeenLastCalledWith(1.5)
  })

  it('reparents a mounted child into a destination placeholder without reloading', async () => {
    const children = useChildAdapters()
    await children.mountChildAdapter(makeFakeAdapter(), 'parent', 'p', entry('e1', 'child'))
    const dst = makeFakeAdapter()
    children.moveChildAdapter('e1', dst, 'other', 'placeholder_2')
    expect(created[0].destroy).not.toHaveBeenCalled()
    expect(dst.containers.get('placeholder_2')!.children).toContain(created[0].spineObj)
    expect(children.childAdapterMeta.get('e1')).toMatchObject({ parentSlotId: 'other', phName: 'placeholder_2' })
  })

  it('orderPlaceholderChildren sets zIndex = list index for images and child spines (D2)', async () => {
    const children = useChildAdapters()
    const parent = makeFakeAdapter()
    usePlaceholderImagesStore().setSlotImages('parent', { p: [image('img1'), entry('e1', 'child'), image('img2')] })
    await children.mountChildAdapter(parent, 'parent', 'p', entry('e1', 'child'))
    created[0].spineObj.zIndex = -1
    parent.setImageZIndex.mockClear()

    children.orderPlaceholderChildren(parent, 'parent', 'p')
    expect(parent.setImageZIndex.mock.calls).toEqual([['img1', 0], ['img2', 2]])
    expect(created[0].spineObj.zIndex).toBe(1)
  })

  it('mounting a child listed second in a mixed placeholder sets its zIndex to 1', async () => {
    usePlaceholderImagesStore().setSlotImages('parent', { p: [image('img1'), entry('e1', 'child'), image('img2')] })
    await useChildAdapters().mountChildAdapter(makeFakeAdapter(), 'parent', 'p', entry('e1', 'child'))
    expect(created[0].spineObj.zIndex).toBe(1)
  })

  it('a child moved into a placeholder holding two images gets zIndex 2', async () => {
    const children = useChildAdapters()
    await children.mountChildAdapter(makeFakeAdapter(), 'parent', 'p', entry('e1', 'child'))
    usePlaceholderImagesStore().setSlotImages('other', { q: [image('img1'), image('img2'), entry('e1', 'child')] })
    const dst = makeFakeAdapter()
    children.moveChildAdapter('e1', dst, 'other', 'q')
    expect(created[0].spineObj.zIndex).toBe(2)
    expect(dst.setImageZIndex.mock.calls).toEqual([['img1', 0], ['img2', 1]])
  })
})
