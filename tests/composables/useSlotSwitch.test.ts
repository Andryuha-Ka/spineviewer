import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, ref, watch } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { makeFakeAdapter, slider, track, withSpine43 } from '../helpers/fakeAdapter'
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
const { useSkeletonStore } = await import('@/core/stores/useSkeletonStore')

/** Adapter the harness's loadSpine puts on stage next. */
let nextLoad: () => ReturnType<typeof makeFakeAdapter> = () => makeFakeAdapter()

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
  applySkins: ReturnType<typeof vi.fn>
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
      const applySkins = vi.fn()
      const children = useChildAdapters()
      const createLoadedAdapter = async (): Promise<ISpineAdapter> => nextLoad()
      const attachLoaded = (adapter: ISpineAdapter, _fs: FileSet, slotId?: string) => {
        loaded.push({ slotId, adapter: adapter as ReturnType<typeof makeFakeAdapter> })
        onStage.adapter = adapter
        onStage.obj = (adapter as ReturnType<typeof makeFakeAdapter>).spineObj
        if (slotId) mountedAdapters.set(slotId, adapter)
        useSkeletonStore().populateFrom(adapter)
      }
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
        loadSpine: async (fs, slotId) => attachLoaded(await createLoadedAdapter(), fs, slotId),
        createLoadedAdapter,
        attachLoaded,
        applySkins,
        applyPlaceholderLabels: () => {},
        drainPlaceholderActions: drain,
        applyViewport: () => {},
        syncZOrder: () => {},
      })
      slotSwitch.start(watch)
      Object.assign(harness, { onStage, mountedAdapters, loaded, drain, applySkins, pixiApp, children, slotSwitch })
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
    nextLoad = () => makeFakeAdapter()
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

  it('restore orders placeholder images with the top row in front (D1)', async () => {
    await loadA()
    usePlaceholderImagesStore().setSlotImages('b', { p: [image('i1'), image('i2')] })

    await activate('b')
    const b = hs.loaded[0].adapter
    expect(b.setImageZIndex.mock.calls).toEqual([['i1', 1], ['i2', 0]])
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

  function addChildTo(parentId: string, kidId: string, entryId: string) {
    useFileLoaderStore().addSlot(slot(kidId, { parentSlotId: parentId }))
    usePlaceholderImagesStore().setSlotImages(parentId, { p: [{
      kind: 'spine', imageId: entryId, childSlotId: kidId, fileName: kidId, fileSet: FILESET,
      syncEnabled: true, posX: 0, posY: 0, scale: 1,
    }] })
  }

  async function mountKid(parent: ISpineAdapter, parentId: string) {
    await hs.children.mountChildAdapter(parent, parentId, 'p', usePlaceholderImagesStore().getPlaceholderSpineEntries(parentId, 'p')[0])
    return created.at(-1)!
  }

  it.each([false, true])('activating a child of pinned A from X puts A on stage and unloads X (C25, X pinned: %s)', async (xPinned) => {
    const a = await loadA()
    useSlotSelectionStore().setPinned('a', true)
    addChild()
    const kid = await mountKid(a, 'a')
    if (xPinned) useSlotSelectionStore().setPinned('b', true)
    await activate('b')
    const b = hs.loaded[0].adapter
    hs.drain.mockClear()

    await activate('kid')
    expect(hs.onStage.adapter).toBe(a)
    expect(hs.children.activeChildAdapter.value).toBe(kid)
    expect(b.destroy).toHaveBeenCalledTimes(xPinned ? 0 : 1)
    expect(hs.mountedAdapters.has('b')).toBe(xPinned)
    expect(hs.drain).toHaveBeenCalled()
  })

  it('activating a child of pinned A from a child of B saves and unloads B with its children (O7)', async () => {
    const a = await loadA()
    useSlotSelectionStore().setPinned('a', true)
    addChildTo('a', 'kidA', 'eA')
    const kidA = await mountKid(a, 'a')
    await activate('b')
    const b = hs.loaded[0].adapter
    b.tracks = [track(0, 'run', 0.5)]
    addChildTo('b', 'kidB', 'eB')
    const kidB = await mountKid(b, 'b')
    await activate('kidB')
    expect(hs.onStage.adapter).toBe(b)

    await activate('kidA')
    expect(useFileLoaderStore().spineSlots.find(s => s.id === 'b')!.savedState?.trackTimes).toEqual({ 0: 0.5 })
    expect(b.destroy).toHaveBeenCalledTimes(1)
    expect(kidB.destroy).toHaveBeenCalledTimes(1)
    expect(hs.mountedAdapters.has('b')).toBe(false)
    expect(hs.onStage.adapter).toBe(a)
    expect(hs.children.activeChildAdapter.value).toBe(kidA)
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

  it('per-track mix of a disabled track survives a switch away and back (C52)', async () => {
    await loadA()
    const anim = useAnimationStore()
    anim.setTrackPlaylist(1, [{ animationName: 'blink', loop: true }])
    anim.setTrackEnabled(1, false)
    anim.patchTrackMix(0, { mixDuration: 0.3 })
    anim.patchTrackMix(1, { mixDuration: 0.3, additive: true, mixInterpolation: 'circle' })
    const mix = { 0: { mixDuration: 0.3 }, 1: { mixDuration: 0.3, additive: true, mixInterpolation: 'circle' } }

    await activate('b')
    expect(useFileLoaderStore().spineSlots.find(s => s.id === 'a')!.savedState?.trackMix).toEqual(mix)
    expect(anim.trackMix).toEqual({})

    await activate('a')
    const back = hs.loaded[1].adapter
    expect(back.setTrackMixOptions.mock.calls).toEqual([[0, mix[0]], [1, mix[1]]])
    expect(back.setTrackMixOptions.mock.invocationCallOrder[1]).toBeLessThan(back.setAnimation.mock.invocationCallOrder[0])
    expect(back.setAnimation.mock.calls.map(c => c[0])).toEqual([0])
    expect(anim.trackMix).toEqual(mix)
  })

  it('a pinned reuse loads the store trackMix from the saved slot, else from live tracks (5a)', async () => {
    const a = await loadA()
    a.tracks = [{ ...track(0, 'idle', 0.75), mixDuration: 0.2 }]
    useSlotSelectionStore().setPinned('a', true)
    await activate('b')
    await activate('a')
    expect(useAnimationStore().trackMix).toEqual({ 0: { mixDuration: 0.2 } })

    useAnimationStore().patchTrackMix(2, { mixDuration: 0.4 })
    await activate('b')
    await activate('a')
    expect(useAnimationStore().trackMix).toEqual({ 0: { mixDuration: 0.2 }, 2: { mixDuration: 0.4 } })
    expect(a.setTrackMixOptions).not.toHaveBeenCalled()
  })

  it('activating a child loads the store trackMix from its saved state, else from its live tracks (Guard 1)', async () => {
    const a = await loadA()
    addChild()
    await hs.children.mountChildAdapter(a, 'a', 'p', usePlaceholderImagesStore().getPlaceholderSpineEntries('a', 'p')[0])
    const kid = created.at(-1)!
    kid.tracks = [{ ...track(1, 'wave', 0.3), mixDuration: 0.25 }]
    await activate('kid')
    expect(useAnimationStore().trackMix).toEqual({ 1: { mixDuration: 0.25 } })

    await activate('a')
    useFileLoaderStore().saveSlotState('kid', saved({ trackMix: { 4: { mixDuration: 0.5 } } }))
    await activate('kid')
    expect(useAnimationStore().trackMix).toEqual({ 4: { mixDuration: 0.5 } })
  })

  it('leaving an active child keeps the parent saved trackMix and adds its live tracks', async () => {
    const a = await loadA()
    useSlotSelectionStore().setPinned('a', true)
    addChild()
    await hs.children.mountChildAdapter(a, 'a', 'p', usePlaceholderImagesStore().getPlaceholderSpineEntries('a', 'p')[0])
    useAnimationStore().patchTrackMix(3, { mixDuration: 0.5 })
    await activate('kid')
    a.tracks = [{ ...track(0, 'idle', 0.75), mixDuration: 0.1 }]
    await activate('b')
    expect(useFileLoaderStore().spineSlots.find(s => s.id === 'a')!.savedState?.trackMix)
      .toEqual({ 3: { mixDuration: 0.5 }, 0: { mixDuration: 0.1 } })
  })

  it('reusing a parked 4.3 adapter fills slider and mix fields and drops leftover slider overrides (5a)', async () => {
    await loadA()
    const b = withSpine43(makeFakeAdapter(), [slider('blink')])
    hs.mountedAdapters.set('b', b)
    useSlotSelectionStore().setPinned('b', true)
    await activate('b')
    expect(hs.onStage.adapter).toBe(b)
    expect(useSkeletonStore().sliders.map(s => s.name)).toEqual(['blink'])
    expect(useSkeletonStore().mixInterpolations.length).toBeGreaterThan(0)
    expect(b.resetSlider).toHaveBeenCalledWith('blink')
  })

  describe('bone overrides', () => {
    const withArm = () => {
      const x = makeFakeAdapter()
      Object.assign(x, { bones: [{ name: 'arm', parent: null }] })
      return x
    }
    const savedOf = (id: string) => useFileLoaderStore().spineSlots.find(s => s.id === id)!.savedState!

    beforeEach(() => { nextLoad = withArm })

    it('switch X → Y → X keeps the overrides of an unpinned slot (2.8)', async () => {
      const a = await loadA()
      a.setBoneOverride('arm', { rotation: 30 })
      await activate('b')
      expect(savedOf('a').boneOverrides).toEqual({ arm: { rotation: 30 } })
      expect(a.destroy).toHaveBeenCalled()

      await activate('a')
      const back = hs.loaded[1].adapter
      expect(back.getBoneOverrides()).toEqual({ arm: { rotation: 30 } })
      expect(useSkeletonStore().boneOverrides).toEqual({ arm: { rotation: 30 } })
    })

    it('a pinned slot keeps its own live map and the mirror follows it on reuse (2.8)', async () => {
      const a = await loadA()
      useSlotSelectionStore().setPinned('a', true)
      a.setBoneOverride('arm', { x: 4 })
      await activate('b')
      expect(useSkeletonStore().boneOverrides).toEqual({})
      expect(a.getBoneOverrides()).toEqual({ arm: { x: 4 } })
      await activate('a')
      expect(hs.onStage.adapter).toBe(a)
      expect(useSkeletonStore().boneOverrides).toEqual({ arm: { x: 4 } })
    })

    it('leaving an active child saves its overrides and the parent ones', async () => {
      const a = await loadA()
      useSlotSelectionStore().setPinned('a', true)
      a.setBoneOverride('arm', { y: 1 })
      addChild()
      const kid = await mountKid(a, 'a')
      await activate('kid')
      kid.setBoneOverride('arm', { rotation: 5 })
      await activate('b')
      expect(savedOf('kid').boneOverrides).toEqual({ arm: { rotation: 5 } })
      expect(savedOf('a').boneOverrides).toEqual({ arm: { y: 1 } })
    })

    it('saveActive snapshots tracks and overrides of the slot on stage (2.3, viewer → compare)', async () => {
      const a = await loadA()
      a.setBoneOverride('arm', { scaleX: 2 })
      hs.slotSwitch.saveActive()
      expect(savedOf('a')).toMatchObject({
        trackPlaylists: { 0: [{ animationName: 'idle', loop: true }] },
        trackTimes: { 0: 0.75 },
        wasPlaying: true,
        boneOverrides: { arm: { scaleX: 2 } },
      })
    })

    it('saveActive with an active child snapshots the child and its parent (2.3)', async () => {
      const a = await loadA()
      a.setBoneOverride('arm', { y: 3 })
      addChild()
      const kid = await mountKid(a, 'a')
      await activate('kid')
      kid.tracks = [track(1, 'wave', 0.4)]
      kid.setBoneOverride('arm', { rotation: 7 })
      hs.slotSwitch.saveActive()
      expect(savedOf('kid')).toMatchObject({ trackTimes: { 1: 0.4 }, boneOverrides: { arm: { rotation: 7 } } })
      expect(savedOf('a').boneOverrides).toEqual({ arm: { y: 3 } })
    })

    it('saveActive does nothing without a skeleton on stage', () => {
      hs.slotSwitch.saveActive()
      expect(useFileLoaderStore().spineSlots.every(s => !s.savedState)).toBe(true)
    })
  })
  describe('reloadSlot (data edits)', () => {
    const editedLoad = (animations = ['idle', 'run', 'wave']) => () => {
      const x = makeFakeAdapter([], animations)
      Object.assign(x, { bones: [{ name: 'arm', parent: null }], slots: [{ name: 'body', bone: 'arm', blendMode: 0 }] })
      return x
    }

    async function loadPlaying() {
      const a = await loadA()
      Object.assign(a, { bones: [{ name: 'arm', parent: null }] })
      a.tracks = [
        track(0, 'idle', 0.7),
        { ...track(1, 'run', 0.2, false), queue: [{ animationName: 'wave', loop: false }] },
      ]
      a.setBoneOverride('arm', { rotation: 45 })
      const anim = useAnimationStore()
      anim.setTrackPlaylist(1, [{ animationName: 'run', loop: false }, { animationName: 'wave', loop: false }])
      anim.trackMix = { 0: { mixDuration: 0.3 } }
      const sk = useSkeletonStore()
      sk.populateFrom(a)
      sk.activeSkins = ['red']
      sk.selectedBone = 'arm'
      const s = useFileLoaderStore().spineSlots.find(x => x.id === 'a')!
      Object.assign(s, { syncEnabled: false, indPosX: 12, indPosY: -3, indZoom: 1.5 })
      useSlotSelectionStore().setPinned('a', true)
      await flushPromises()
      return a
    }

    it('swaps the active slot keeping tracks, times, overrides, skins, pin, offsets and selection ("Reload after a data edit keeps playback")', async () => {
      nextLoad = editedLoad()
      const a = await loadPlaying()
      const anim = useAnimationStore()
      const playlists = JSON.parse(JSON.stringify(anim.trackPlaylists))

      await hs.slotSwitch.reloadSlot('a')

      const b = hs.loaded.at(-1)!.adapter
      expect(a.destroy).toHaveBeenCalled()
      expect(hs.onStage.adapter).toBe(b)
      expect(hs.mountedAdapters.get('a')).toBe(b)
      expect(hs.loaded.at(-1)!.slotId).toBe('a')
      expect(b.setAnimation).toHaveBeenCalledWith(0, 'idle', true)
      expect(b.setAnimation).toHaveBeenCalledWith(1, 'run', false)
      expect(b.addAnimation).toHaveBeenCalledWith(1, 'wave', false)
      expect(b.seekTo).toHaveBeenCalledWith(0, 0.7)
      expect(b.seekTo).toHaveBeenCalledWith(1, 0.2)
      expect(b.setTrackMixOptions).toHaveBeenCalledWith(0, { mixDuration: 0.3 })
      expect(b.setTimeScale).toHaveBeenLastCalledWith(1.5)
      expect(b.getBoneOverrides()).toEqual({ arm: { rotation: 45 } })
      expect(useSkeletonStore().boneOverrides).toEqual({ arm: { rotation: 45 } })
      expect(anim.trackPlaylists).toEqual(playlists)
      expect(anim.isPlaying).toBe(true)
      expect(anim.speed).toBe(1.5)
      expect(useSkeletonStore().activeSkins).toEqual(['red'])
      expect(useSkeletonStore().selectedBone).toBe('arm')
      expect(useSlotSelectionStore().isPinned('a')).toBe(true)
      expect(useFileLoaderStore().spineSlots.find(x => x.id === 'a')).toMatchObject({ syncEnabled: false, indPosX: 12, indPosY: -3, indZoom: 1.5 })
      expect(hs.drain).toHaveBeenCalled()
      // skins reset slot attachments, so they go before the replayed seeks that pose the first frame
      expect(hs.applySkins.mock.invocationCallOrder.at(-1)).toBeLessThan(b.seekTo.mock.invocationCallOrder[0])
    })

    it('a paused slot stays paused at its times', async () => {
      nextLoad = editedLoad()
      await loadPlaying()
      const anim = useAnimationStore()
      anim.pause()
      await flushPromises()

      await hs.slotSwitch.reloadSlot('a')

      const b = hs.loaded.at(-1)!.adapter
      expect(b.setTimeScale).toHaveBeenLastCalledWith(0)
      expect(b.seekTo).toHaveBeenCalledWith(0, 0.7)
      expect(anim.isPaused).toBe(true)
      expect(anim.isPlaying).toBe(false)
    })

    it('a failed load leaves the old adapter on stage and rejects', async () => {
      const a = await loadPlaying()
      nextLoad = () => { throw new Error('bad json') }
      await expect(hs.slotSwitch.reloadSlot('a')).rejects.toThrow('bad json')
      expect(a.destroy).not.toHaveBeenCalled()
      expect(hs.onStage.adapter).toBe(a)
    })

    it('clears tracks and list entries of animations the new data lacks (revert)', async () => {
      nextLoad = editedLoad(['idle'])
      await loadPlaying()
      useAnimationStore().selectedAnimation = 'run'

      await hs.slotSwitch.reloadSlot('a')

      const b = hs.loaded.at(-1)!.adapter
      expect(b.setAnimation).toHaveBeenCalledTimes(1)
      expect(b.setAnimation).toHaveBeenCalledWith(0, 'idle', true)
      expect(useAnimationStore().trackPlaylists[1]).toBeUndefined()
      expect(useAnimationStore().selectedAnimation).toBeNull()
    })

    it('reloads the child spines of the reloaded slot', async () => {
      nextLoad = editedLoad()
      const a = await loadPlaying()
      addChild()
      const kid = await mountKid(a, 'a')
      await hs.slotSwitch.reloadSlot('a')
      expect(kid.destroy).toHaveBeenCalled()
      expect(created.at(-1)).not.toBe(kid)
      expect(hs.children.childAdapters.get('e1')).toBe(created.at(-1))
    })

    it('an active child is destroyed and mounted again from its new FileSet, staying active', async () => {
      const a = await loadPlaying()
      addChild()
      const kid = await mountKid(a, 'a')
      kid.tracks = [track(1, 'wave', 0.3)]
      await activate('kid')
      const kidSlot = useFileLoaderStore().spineSlots.find(s => s.id === 'kid')!
      kidSlot.fileSet = { ...FILESET, skeleton: { ...FILESET.skeleton, filename: 'kid.json' } }

      await hs.slotSwitch.reloadSlot('kid')

      const fresh = created.at(-1)!
      expect(kid.destroy).toHaveBeenCalled()
      expect(fresh).not.toBe(kid)
      expect(hs.children.activeChildAdapter.value).toBe(fresh)
      expect(useSkeletonStore().getAdapter()).toBe(fresh)
      expect(fresh.setAnimation).toHaveBeenCalledWith(1, 'wave', true)
      expect(fresh.seekTo).toHaveBeenCalledWith(1, 0.3)
      expect(hs.onStage.adapter).toBe(a)
      expect(hs.slotSwitch.isUiReloading()).toBe(false)
    })

    it('a pinned slot that is not active is rebuilt in place from its saved state', async () => {
      nextLoad = editedLoad()
      const a = await loadPlaying()
      await activate('b')
      expect(hs.mountedAdapters.get('a')).toBe(a)
      a.tracks = [track(0, 'idle', 1.1)]
      const bAdapter = hs.onStage.adapter

      await hs.slotSwitch.reloadSlot('a')

      const fresh = hs.mountedAdapters.get('a') as ReturnType<typeof makeFakeAdapter>
      expect(fresh).not.toBe(a)
      expect(a.destroy).toHaveBeenCalled()
      expect(hs.onStage.adapter).toBe(bAdapter)
      expect(fresh.mount).toHaveBeenCalledWith(hs.pixiApp.stage)
      expect(fresh.seekTo).toHaveBeenCalledWith(0, 1.1)
      expect(fresh.getBoneOverrides()).toEqual({ arm: { rotation: 45 } })
      expect(fresh.setSkins).toHaveBeenCalledWith(['red'])
      expect(fresh.setSkins.mock.invocationCallOrder[0]).toBeLessThan(fresh.seekTo.mock.invocationCallOrder[0])
    })

    it('4.3 slider poses survive the reload; unposed and missing sliders are left alone', async () => {
      nextLoad = () => withSpine43(editedLoad()(), [slider('lean'), slider('tilt')])
      const a = await loadPlaying()
      withSpine43(a, [slider('lean', { time: 0.5, mix: 0.3 }), slider('tilt'), slider('gone', { time: 1 })])

      await hs.slotSwitch.reloadSlot('a')

      const b = hs.loaded.at(-1)!.adapter as ReturnType<typeof withSpine43>
      expect(b.setSliderPose).toHaveBeenCalledTimes(1)
      expect(b.setSliderPose).toHaveBeenCalledWith('lean', { time: 0.5, mix: 0.3 })
      expect(useSkeletonStore().sliders.map(s => s.name)).toEqual(['lean', 'tilt'])
    })

    it('a reloaded active child keeps its slider poses', async () => {
      const a = await loadPlaying()
      addChild()
      const kid = withSpine43(await mountKid(a, 'a'), [slider('lean', { mix: 0.4 })])
      await activate('kid')
      const { createSpineAdapter } = await import('@/core/AdapterFactory')
      vi.mocked(createSpineAdapter).mockImplementationOnce(async () => {
        const x = withSpine43(makeFakeAdapter(), [slider('lean')])
        created.push(x)
        return x
      })

      await hs.slotSwitch.reloadSlot('kid')

      const fresh = created.at(-1) as ReturnType<typeof withSpine43>
      expect(fresh).not.toBe(kid)
      expect(fresh.setSliderPose).toHaveBeenCalledWith('lean', { time: 0, mix: 0.4 })
    })

    it('a slot that is not rendered needs no reload', async () => {
      await loadPlaying()
      const before = hs.loaded.length
      await hs.slotSwitch.reloadSlot('b')
      expect(hs.loaded.length).toBe(before)
    })
  })
})
