import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, ref, watch } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { makeFakeAdapter, track } from '../helpers/fakeAdapter'
import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import type { FileSet, PHChildEntry, SpineSlot, SpineSlotSavedState } from '@/core/types/FileSet'
import type { PixiSpriteObject } from '@/core/types/PixiSpriteObject'

const created: ReturnType<typeof makeFakeAdapter>[] = []
vi.mock('@/core/AdapterFactory', () => ({
  createSpineAdapter: vi.fn(async () => {
    const a = makeFakeAdapter()
    created.push(a)
    return a
  }),
}))

const { useSlotSwitch } = await import('@/core/composables/stage/useSlotSwitch')
const { useChildAdapters } = await import('@/core/composables/stage/useChildAdapters')
const { useFileLoaderStore } = await import('@/core/stores/useFileLoaderStore')
const { useSlotSelectionStore } = await import('@/core/stores/useSlotSelectionStore')
const { useAnimationStore } = await import('@/core/stores/useAnimationStore')
const { usePlaceholderImagesStore } = await import('@/core/stores/usePlaceholderImagesStore')
const { useVersionStore } = await import('@/core/stores/useVersionStore')

const FILESET: FileSet = {
  skeleton: { filename: 's.skel', fileBody: new ArrayBuffer(8), type: 'skeleton-skel', mimeType: '' },
  atlas:    { filename: 's.atlas', fileBody: '', type: 'atlas', mimeType: '' },
  images:   [],
}
const slot = (id: string, extra: Partial<SpineSlot> = {}): SpineSlot => ({ id, name: id, fileSet: FILESET, ...extra })
const saved = (extra: Partial<SpineSlotSavedState> = {}): SpineSlotSavedState => ({
  speed: 1, selectedAnimation: null, currentTrack: 0, loop: false, trackEnabled: {},
  trackPlaylists: {}, wasPlaying: false, selectedSkins: [], showPlaceholders: true,
  disabledPlaceholders: [], syncEnabled: true, indPosX: 0, indPosY: 0, indZoom: 1, ...extra,
})
const image = (imageId: string): PHChildEntry =>
  ({ kind: 'image', imageId, fileName: 'i.png', dataURL: `data:${imageId}`, syncEnabled: true, posX: 1, posY: 2, scale: 3 })

interface Harness {
  onStage: { adapter: ISpineAdapter | null; obj: unknown }
  mountedAdapters: Map<string, ISpineAdapter>
  loaded: Array<{ slotId?: string; adapter: ReturnType<typeof makeFakeAdapter> }>
  drain: ReturnType<typeof vi.fn>
  pixiApp: { stage: object; getLastStageChild: () => object }
  children: ReturnType<typeof useChildAdapters>
  slotSwitch: ReturnType<typeof useSlotSwitch>
}

function setup(pinia: Pinia): { wrapper: VueWrapper; h: Harness } {
  const harness = {} as Harness
  const Comp = defineComponent({
    setup() {
      const onStage: Harness['onStage'] = { adapter: null, obj: null }
      const mountedAdapters = new Map<string, ISpineAdapter>()
      const mountedSpineObjects = new Map<string, PixiSpriteObject>()
      const loaded: Harness['loaded'] = []
      const pixiApp = { stage: {}, getLastStageChild: () => ({}) }
      const drain = vi.fn(async () => {})
      const children = useChildAdapters()
      const slotSwitch = useSlotSwitch({
        onStage,
        mountedAdapters,
        mountedSpineObjects,
        children,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getPixiApp: () => pixiApp as any,
        loading: ref(false),
        spineLoaded: ref(false),
        spineError: ref(null),
        phItems: ref([]),
        loadSpine: async (_fs, slotId) => {
          const adapter = makeFakeAdapter()
          loaded.push({ slotId, adapter })
          onStage.adapter = adapter
          onStage.obj = adapter.spineObj
          if (slotId) mountedAdapters.set(slotId, adapter)
        },
        applySkins: () => {},
        applyPlaceholderLabels: () => {},
        drainPlaceholderActions: drain,
        applyViewport: () => {},
        syncZOrder: () => {},
      })
      slotSwitch.start(watch)
      Object.assign(harness, { onStage, mountedAdapters, loaded, drain, pixiApp, children, slotSwitch })
      return () => h('div')
    },
  })
  return { wrapper: mount(Comp, { global: { plugins: [pinia] } }), h: harness }
}

async function activate(id: string) {
  useSlotSelectionStore().setActiveSlot(id)
  await flushPromises()
}

describe('useSlotSwitch', () => {
  let pinia: Pinia
  let wrapper: VueWrapper
  let hs: Harness

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    created.length = 0
    useVersionStore().selectVersion(7, '4.1')
    useFileLoaderStore().setSlots([slot('a'), slot('b')], '4.1')
    ;({ wrapper, h: hs } = setup(pinia))
  })

  afterEach(() => wrapper.unmount())

  async function loadA() {
    // the stage loads the first slot itself; mimic it
    const adapter = makeFakeAdapter([track(0, 'idle', 0.75)])
    hs.onStage.adapter = adapter
    hs.mountedAdapters.set('a', adapter)
    const anim = useAnimationStore()
    anim.setTrackPlaylist(0, [{ animationName: 'idle', loop: true }])
    anim.speed = 1.5
    anim.play()
    return adapter
  }

  it('saves the leaving slot, destroys it when not pinned and fresh-loads the new one (5b)', async () => {
    const a = await loadA()
    usePlaceholderImagesStore().setSlotImages('a', { p: [image('ia')] })

    await activate('b')

    const ss = useFileLoaderStore().spineSlots.find(s => s.id === 'a')!.savedState!
    expect(ss).toMatchObject({ speed: 1.5, wasPlaying: true, trackTimes: { 0: 0.75 } })
    expect(ss.trackPlaylists).toEqual({ 0: [{ animationName: 'idle', loop: true }] })
    expect(ss.placeholderChildren?.p.map(e => e.imageId)).toEqual(['ia'])
    expect(a.destroy).toHaveBeenCalled()
    expect(hs.mountedAdapters.has('a')).toBe(false)
    expect(hs.loaded.map(l => l.slotId)).toEqual(['b'])
    expect(hs.onStage.adapter).toBe(hs.loaded[0].adapter)
    expect(hs.drain).toHaveBeenCalled()
  })

  it('restores saved playlists, seeks after play and prefers live placeholder images (N1)', async () => {
    await loadA()
    const loader = useFileLoaderStore()
    loader.saveSlotState('b', saved({
      trackPlaylists: { 0: [{ animationName: 'run', loop: true }], 1: [{ animationName: 'blink', loop: false }] },
      trackEnabled: { 1: false },
      trackTimes: { 0: 0.4 },
      wasPlaying: true,
      placeholderChildren: { p: [image('stale')] },
    }))
    usePlaceholderImagesStore().setSlotImages('b', { p: [image('live')] })

    await activate('b')
    const b = hs.loaded[0].adapter
    expect(b.setAnimation.mock.calls).toEqual([[0, 'run', true]])
    expect(b.addImageToPlaceholder.mock.calls).toEqual([['p', 'data:live', 'live']])
    expect(b.setImageTransform).toHaveBeenCalledWith('live', 1, 2, 3)
    expect(useAnimationStore().isPlaying).toBe(true)
    expect(hs.slotSwitch.takePendingSeekTimes()).toEqual({ 0: 0.4 })
    expect(hs.slotSwitch.takePendingSeekTimes()).toBeNull()
  })

  it('parks a pinned slot and reuses it without reloading (5a)', async () => {
    const a = await loadA()
    useSlotSelectionStore().setPinned('a', true)
    await activate('b')
    expect(a.destroy).not.toHaveBeenCalled()
    expect(hs.mountedAdapters.get('a')).toBe(a)

    await activate('a')
    expect(hs.loaded.map(l => l.slotId)).toEqual(['b'])
    expect(hs.onStage.adapter).toBe(a)
    expect(a.setAnimation).not.toHaveBeenCalled()
    expect(useAnimationStore().trackPlaylists).toEqual({ 0: [{ animationName: 'idle', loop: true }] })
  })

  function addChild() {
    useFileLoaderStore().addSlot(slot('kid', { parentSlotId: 'a', savedState: saved({ speed: 2, wasPlaying: true, selectedSkins: ['gold'] }) }))
    usePlaceholderImagesStore().setSlotImages('a', { p: [{
      kind: 'spine', imageId: 'e1', childSlotId: 'kid', fileName: 'kid', fileSet: FILESET,
      syncEnabled: true, posX: 0, posY: 0, scale: 1,
    }] })
  }

  it('activates a mounted child spine from its live tracks and keeps the parent on stage (Guard 1)', async () => {
    const a = await loadA()
    addChild()
    await hs.children.mountChildAdapter(a, 'a', 'p', usePlaceholderImagesStore().getPlaceholderSpineEntries('a', 'p')[0])
    const kid = created.at(-1)!
    kid.tracks = [track(1, 'wave', 0.3)]

    await activate('kid')
    expect(hs.children.activeChildAdapter.value).toBe(kid)
    expect(hs.onStage.adapter).toBe(a)
    expect(a.destroy).not.toHaveBeenCalled()
    const anim = useAnimationStore()
    expect(anim.trackPlaylists).toEqual({ 1: [{ animationName: 'wave', loop: true }] })
    expect(anim.speed).toBe(2)
    expect(kid.setTimeScale).toHaveBeenLastCalledWith(2)
    expect(useFileLoaderStore().spineSlots.find(s => s.id === 'a')!.savedState?.trackTimes).toEqual({ 0: 0.75 })
  })

  it('keeps played list entries and the head loop flag through a pinned switch (5a)', async () => {
    const a = await loadA()
    const list = [{ animationName: 'idle', loop: true }, { animationName: 'win', loop: false }, { animationName: 'fx', loop: false }]
    useAnimationStore().setTrackPlaylist(0, list)
    a.tracks = [track(0, 'fx', 0.1)]
    useSlotSelectionStore().setPinned('a', true)
    await activate('b')
    await activate('a')
    expect(useAnimationStore().trackPlaylists).toEqual({ 0: list })
  })

  it('activating a child prefers its saved full list over the live chain (Guard 1)', async () => {
    const a = await loadA()
    addChild()
    const list = [{ animationName: 'wave', loop: true }, { animationName: 'bow', loop: false }]
    useFileLoaderStore().saveSlotState('kid', saved({ trackPlaylists: { 1: list }, wasPlaying: true }))
    await hs.children.mountChildAdapter(a, 'a', 'p', usePlaceholderImagesStore().getPlaceholderSpineEntries('a', 'p')[0])
    created.at(-1)!.tracks = [track(1, 'bow', 0.3)]
    await activate('kid')
    expect(useAnimationStore().trackPlaylists).toEqual({ 1: list })
  })

  it('activating an unmounted child goes through its parent, mounts it, then activates it', async () => {
    await activate('b')
    addChild()
    await activate('kid')
    expect(useSlotSelectionStore().activeSlotId).toBe('kid')
    expect(hs.loaded.map(l => l.slotId)).toEqual(['b', 'a'])
    expect(hs.children.activeChildAdapter.value).toBe(created.at(-1))
  })

  it('returning from a child to its parent keeps the parent adapter (park, not destroy)', async () => {
    const a = await loadA()
    addChild()
    await hs.children.mountChildAdapter(a, 'a', 'p', usePlaceholderImagesStore().getPlaceholderSpineEntries('a', 'p')[0])
    await activate('kid')
    await activate('a')
    expect(a.destroy).not.toHaveBeenCalled()
    expect(hs.onStage.adapter).toBe(a)
    expect(hs.children.activeChildAdapter.value).toBeNull()
    expect(hs.loaded).toEqual([])
  })

  it('pinning a non-active slot mounts it with its saved playlists and live images', async () => {
    await loadA()
    useFileLoaderStore().saveSlotState('b', saved({
      trackPlaylists: { 2: [{ animationName: 'wave', loop: true }], 3: [{ animationName: 'off', loop: true }] },
      trackEnabled: { 3: false }, trackTimes: { 2: 0.6 }, wasPlaying: true, speed: 0.5,
    }))
    usePlaceholderImagesStore().setSlotImages('b', { p: [image('ib')] })
    useSlotSelectionStore().setPinned('b', true)
    await flushPromises()

    const b = created.at(-1)!
    expect(b.mount).toHaveBeenCalledWith(hs.pixiApp.stage)
    expect(b.setAnimation.mock.calls).toEqual([[2, 'wave', true]])
    expect(b.seekTo).toHaveBeenCalledWith(2, 0.6)
    expect(b.setTimeScale).toHaveBeenCalledWith(0.5)
    expect(b.addImageToPlaceholder).toHaveBeenCalledWith('p', 'data:ib', 'ib')
    expect(hs.mountedAdapters.get('b')).toBe(b)

    useSlotSelectionStore().setPinned('b', false)
    await flushPromises()
    expect(b.destroy).toHaveBeenCalled()
    expect(hs.mountedAdapters.has('b')).toBe(false)
  })

  it('unpinning the active slot and leaving it in the same tick saves its track times first (F1)', async () => {
    const a = await loadA()
    useSlotSelectionStore().setPinned('a', true)
    await flushPromises()
    a.destroy.mockImplementation(() => { a.tracks = [] })

    useSlotSelectionStore().setPinned('a', false)
    await activate('b')

    expect(useFileLoaderStore().spineSlots.find(s => s.id === 'a')!.savedState?.trackTimes).toEqual({ 0: 0.75 })
    expect(a.destroy).toHaveBeenCalledTimes(1)
    expect(hs.mountedAdapters.has('a')).toBe(false)
  })

  it('suppresses the isPlaying replay while a switch restores playback', async () => {
    await loadA()
    useFileLoaderStore().saveSlotState('b', saved({ trackPlaylists: { 0: [{ animationName: 'run', loop: true }] }, wasPlaying: true }))
    const seen: boolean[] = []
    watch(() => useAnimationStore().isPlaying, () => seen.push(hs.slotSwitch.isAnimPlaySuppressed()), { flush: 'sync' })
    await activate('b')
    expect(seen.length).toBeGreaterThan(0)
    expect(hs.slotSwitch.isAnimPlaySuppressed()).toBe(false)
  })
})

