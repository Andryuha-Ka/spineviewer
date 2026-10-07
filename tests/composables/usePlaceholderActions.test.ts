import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick, watch } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlaceholderActions } from '@/core/composables/usePlaceholderActions'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'
import type { FileSet, PHChildEntry, SpineSlot, SpineSlotSavedState } from '@/core/types/FileSet'

// binary skeleton header: hash, then the editor version string
const skel = (version: string) => new TextEncoder().encode('FVeOgUJ9\u0007' + version + '\u0000\u0000').buffer

const FILESET: FileSet = {
  skeleton: { filename: 's.skel', fileBody: skel('4.1.24'), type: 'skeleton-skel', mimeType: '' },
  atlas:    { filename: 's.atlas', fileBody: '', type: 'atlas', mimeType: '' },
  images:   [],
}
const slot = (id: string, extra: Partial<SpineSlot> = {}): SpineSlot => ({ id, name: id, fileSet: FILESET, ...extra })
const image = (imageId: string): PHChildEntry =>
  ({ kind: 'image', imageId, fileName: `${imageId}.png`, dataURL: 'data:', syncEnabled: true, posX: 0, posY: 0, scale: 1 })
const spine = (imageId: string, childSlotId: string): PHChildEntry =>
  ({ kind: 'spine', imageId, childSlotId, fileName: childSlotId, fileSet: FILESET, syncEnabled: true, posX: 0, posY: 0, scale: 1 })
const saved = (): SpineSlotSavedState => ({
  speed: 1, selectedAnimation: 'run', currentTrack: 0, loop: true, trackEnabled: {},
  trackPlaylists: { 0: [{ animationName: 'run', loop: true }] }, wasPlaying: true, selectedSkins: [],
  showPlaceholders: true, disabledPlaceholders: [], syncEnabled: false, indPosX: 40, indPosY: 50, indZoom: 2,
})

describe('usePlaceholderActions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('alert', vi.fn())
    useVersionStore().selectVersion(7, '4.1')
  })

  describe('moveSlotIntoPlaceholder (F1)', () => {
    it('turns a top-level spine into a child spine of the target placeholder', async () => {
      const loader = useFileLoaderStore()
      const ph = usePlaceholderImagesStore()
      loader.setSlots([slot('a'), slot('b', { savedState: saved(), syncEnabled: false, indPosX: 40, indZoom: 2 })], '4.2')

      await usePlaceholderActions().moveSlotIntoPlaceholder('b', 'a', 'placeholder_1')

      const b = loader.spineSlots.find(s => s.id === 'b')!
      expect(b).toMatchObject({ parentSlotId: 'a', syncEnabled: true, indPosX: 0, indPosY: 0, indZoom: 1 })
      expect(b.savedState?.trackPlaylists).toEqual({ 0: [{ animationName: 'run', loop: true }] })
      const [entry] = ph.getPlaceholderSpineEntries('a', 'placeholder_1')
      expect(entry).toMatchObject({ childSlotId: 'b', fileName: 'b', syncEnabled: true })
      expect(ph.hasPendingActions).toBe(true)
    })

    it('unpins the spine and leaves it before converting when it is active', async () => {
      const loader = useFileLoaderStore()
      const sel = useSlotSelectionStore()
      loader.setSlots([slot('b'), slot('a')], '4.2')
      sel.setPinned('b', true)
      expect(sel.activeSlotId).toBe('b')

      // the slot watcher must see the switch while b is still a top-level slot
      const seen: Array<string | undefined> = []
      watch(() => sel.activeSlotId, () => seen.push(loader.spineSlots.find(s => s.id === 'b')?.parentSlotId))

      await usePlaceholderActions().moveSlotIntoPlaceholder('b', 'a', 'placeholder_1')
      expect(sel.activeSlotId).toBe('a')
      expect(sel.isPinned('b')).toBe(false)
      expect(seen).toEqual([undefined])
      expect(loader.spineSlots.find(s => s.id === 'b')?.parentSlotId).toBe('a')
    })

    it('adds a 3.8 child in a 4.1 session (C37)', async () => {
      const loader = useFileLoaderStore()
      const old: FileSet = { ...FILESET, skeleton: { ...FILESET.skeleton, filename: 'anticipationEffect.skel', fileBody: skel('3.8.99') } }
      loader.setSlots([slot('a'), slot('b', { fileSet: old })], '4.1')
      await usePlaceholderActions().moveSlotIntoPlaceholder('b', 'a', 'placeholder_1')
      expect(window.alert).not.toHaveBeenCalled()
      expect(loader.spineSlots.find(s => s.id === 'b')?.parentSlotId).toBe('a')
    })

    it('refuses a spine that needs the other Pixi version (4.2 skeleton in a 4.1 session)', async () => {
      const loader = useFileLoaderStore()
      const v42: FileSet = { ...FILESET, skeleton: { ...FILESET.skeleton, filename: 'new.skel', fileBody: skel('4.2.40') } }
      loader.setSlots([slot('a'), slot('b', { fileSet: v42 })], '4.1')
      await usePlaceholderActions().moveSlotIntoPlaceholder('b', 'a', 'placeholder_1')
      expect(window.alert).toHaveBeenCalledWith('Spine version mismatch: new.skel is 4.2, viewer is set to 4.1')
      expect(loader.spineSlots.find(s => s.id === 'b')?.parentSlotId).toBeUndefined()
      expect(usePlaceholderImagesStore().getPlaceholderSpineEntries('a', 'placeholder_1')).toEqual([])
    })

    it('keeps saved track mix options when moving a skeleton into a placeholder', async () => {
      const loader = useFileLoaderStore()
      const trackMix = { 1: { mixDuration: 0, additive: true, mixInterpolation: 'circle' } }
      loader.setSlots([slot('a'), slot('b', { savedState: { ...saved(), trackMix } })], '4.1')
      await usePlaceholderActions().moveSlotIntoPlaceholder('b', 'a', 'placeholder_1')
      expect(loader.spineSlots.find(s => s.id === 'b')?.savedState?.trackMix).toEqual(trackMix)
    })

    it.each([
      ['4.2', '4.3.75-beta'],
      ['4.3', '4.2.40'],
    ] as const)('accepts a child of the other Pixi 8 version (%s session, %s child)', async (session, childVersion) => {
      useVersionStore().selectVersion(8, session)
      const loader = useFileLoaderStore()
      const other: FileSet = { ...FILESET, skeleton: { ...FILESET.skeleton, fileBody: skel(childVersion) } }
      loader.setSlots([slot('a'), slot('b', { fileSet: other })], session)
      await usePlaceholderActions().moveSlotIntoPlaceholder('b', 'a', 'placeholder_1')
      expect(window.alert).not.toHaveBeenCalled()
      expect(loader.spineSlots.find(s => s.id === 'b')?.parentSlotId).toBe('a')
    })

    it('refuses an unsupported version in a 4.3 session', async () => {
      useVersionStore().selectVersion(8, '4.3')
      const loader = useFileLoaderStore()
      const v44: FileSet = { ...FILESET, skeleton: { ...FILESET.skeleton, filename: 'next.skel', fileBody: skel('4.4.1') } }
      loader.setSlots([slot('a'), slot('b', { fileSet: v44 })], '4.3')
      await usePlaceholderActions().moveSlotIntoPlaceholder('b', 'a', 'placeholder_1')
      expect(window.alert).toHaveBeenCalledWith('Spine version mismatch: next.skel is 4.4 (unsupported), supported versions are 3.8, 4.0, 4.1, 4.2, 4.3')
      expect(loader.spineSlots.find(s => s.id === 'b')?.parentSlotId).toBeUndefined()
    })

    it('refuses a spine whose own placeholders hold children, itself, child slots and missing slots', async () => {
      const loader = useFileLoaderStore()
      const ph = usePlaceholderImagesStore()
      loader.setSlots([slot('a'), slot('b'), slot('c', { parentSlotId: 'a' })], '4.2')
      ph.setSlotImages('b', { placeholder_2: [image('img')] })
      const actions = usePlaceholderActions()

      await actions.moveSlotIntoPlaceholder('b', 'a', 'placeholder_1')
      expect(window.alert).toHaveBeenCalledTimes(1)
      await actions.moveSlotIntoPlaceholder('a', 'a', 'placeholder_1')
      await actions.moveSlotIntoPlaceholder('c', 'b', 'placeholder_2')
      await actions.moveSlotIntoPlaceholder('missing', 'a', 'placeholder_1')
      expect(loader.spineSlots.filter(s => s.parentSlotId).map(s => s.id)).toEqual(['c'])
      expect(ph.getPlaceholderSpineEntries('a', 'placeholder_1')).toEqual([])
    })
  })

  describe('moveImage', () => {
    it('reorders inside a placeholder', () => {
      const ph = usePlaceholderImagesStore()
      ph.setSlotImages('a', { p: [image('i1'), image('i2'), image('i3')] })
      usePlaceholderActions().moveImage({ imageId: 'i3', srcSlotId: 'a', srcPhName: 'p' }, 'a', 'p', 'i1')
      expect(ph.getPlaceholderImages('a', 'p').map(e => e.imageId)).toEqual(['i3', 'i1', 'i2'])
    })

    it('moves to another spine and activates it when it is not on stage', () => {
      const loader = useFileLoaderStore()
      const ph = usePlaceholderImagesStore()
      loader.setSlots([slot('a'), slot('b')], '4.2')
      ph.setSlotImages('a', { p: [image('i1')] })
      usePlaceholderActions().moveImage({ imageId: 'i1', srcSlotId: 'a', srcPhName: 'p' }, 'b', 'q')
      expect(ph.getPlaceholderImages('a', 'p')).toEqual([])
      expect(ph.getPlaceholderImages('b', 'q').map(e => e.imageId)).toEqual(['i1'])
      expect(useSlotSelectionStore().activeSlotId).toBe('b')
    })

    it('ignores a drop on its own placeholder zone', () => {
      const ph = usePlaceholderImagesStore()
      ph.setSlotImages('a', { p: [image('i1'), image('i2')] })
      usePlaceholderActions().moveImage({ imageId: 'i1', srcSlotId: 'a', srcPhName: 'p' }, 'a', 'p')
      expect(ph.getPlaceholderImages('a', 'p').map(e => e.imageId)).toEqual(['i1', 'i2'])
      expect(ph.hasPendingActions).toBe(false)
    })
  })

  describe('child spines', () => {
    it('moves a child spine and repoints its slot', async () => {
      const loader = useFileLoaderStore()
      const ph = usePlaceholderImagesStore()
      loader.setSlots([slot('a'), slot('b'), slot('kid', { parentSlotId: 'a', indPosX: 9 })], '4.2')
      ph.setSlotImages('a', { p: [spine('e1', 'kid')] })
      useSlotSelectionStore().setPinned('b', true)
      await usePlaceholderActions().moveSpine({ imageId: 'e1', srcSlotId: 'a', srcPhName: 'p' }, 'b', 'q')
      expect(loader.spineSlots.find(s => s.id === 'kid')).toMatchObject({ parentSlotId: 'b', indPosX: 0 })
      expect(ph.getPlaceholderSpineEntries('b', 'q').map(e => e.imageId)).toEqual(['e1'])
      expect(useSlotSelectionStore().activeSlotId).toBe('a')
    })

    it('removes an active child only after switching to its parent', async () => {
      const loader = useFileLoaderStore()
      const sel = useSlotSelectionStore()
      const ph = usePlaceholderImagesStore()
      loader.setSlots([slot('a'), slot('kid', { parentSlotId: 'a' })], '4.2')
      ph.setSlotImages('a', { p: [spine('e1', 'kid')] })
      sel.setActiveSlot('kid')
      await nextTick()

      const slotsWhenLeaving: string[][] = []
      watch(() => sel.activeSlotId, () => slotsWhenLeaving.push(loader.spineSlots.map(s => s.id)))
      const entry = ph.getPlaceholderSpineEntries('a', 'p')[0]
      await usePlaceholderActions().removeSpineChild('a', 'p', entry)

      expect(slotsWhenLeaving).toEqual([['a', 'kid']])
      expect(loader.spineSlots.map(s => s.id)).toEqual(['a'])
    })

    describe('Remove a posed child spine', () => {
      function posedChild(extra: Partial<SpineSlot> = {}) {
        const loader = useFileLoaderStore()
        const ph = usePlaceholderImagesStore()
        loader.setSlots([
          slot('a'),
          slot('gem', { parentSlotId: 'a', savedState: { ...saved(), boneOverrides: { tip: { rotation: 5 } } }, ...extra }),
        ], '4.2')
        ph.setSlotImages('a', { p: [spine('e1', 'gem')] })
        return { loader, ph, entry: ph.getPlaceholderSpineEntries('a', 'p')[0] }
      }

      it('asks first; declining changes nothing', async () => {
        const { loader, ph, entry } = posedChild()
        const confirm = vi.fn(() => false)
        vi.stubGlobal('confirm', confirm)
        await usePlaceholderActions().removeSpineChild('a', 'p', entry)
        expect(confirm).toHaveBeenCalledWith('Unsaved work will be lost: gem (overrides). Continue?')
        expect(loader.spineSlots.map(s => s.id)).toEqual(['a', 'gem'])
        expect(ph.getPlaceholderSpineEntries('a', 'p')).toHaveLength(1)
      })

      it('removes after confirming and names descendants with their work', async () => {
        const { loader, entry } = posedChild()
        const grand = slot('pip', { parentSlotId: 'gem', savedState: { ...saved(), boneOverrides: { b: { x: 1 } } } })
        loader.addSlot(grand)
        const confirm = vi.fn(() => true)
        vi.stubGlobal('confirm', confirm)
        await usePlaceholderActions().removeSpineChild('a', 'p', entry)
        expect(confirm).toHaveBeenCalledWith('Unsaved work will be lost: gem (overrides), pip (overrides). Continue?')
        expect(loader.spineSlots.map(s => s.id)).toEqual(['a'])
      })

      it('reads live overrides of the active child', async () => {
        const { entry } = posedChild({ savedState: saved() })
        useSlotSelectionStore().setActiveSlot('gem')
        useSkeletonStore().boneOverrides = { tip: { rotation: 9 } }
        const confirm = vi.fn(() => false)
        vi.stubGlobal('confirm', confirm)
        await usePlaceholderActions().removeSpineChild('a', 'p', entry)
        expect(confirm).toHaveBeenCalledWith('Unsaved work will be lost: gem (overrides). Continue?')
        expect(useSlotSelectionStore().activeSlotId).toBe('gem')
      })

      it('does not ask when another entry keeps the child slot', async () => {
        const { ph } = posedChild()
        ph.setSlotImages('a', { p: [spine('e1', 'gem'), spine('e2', 'gem')] })
        const confirm = vi.fn(() => false)
        vi.stubGlobal('confirm', confirm)
        await usePlaceholderActions().removeSpineChild('a', 'p', ph.getPlaceholderSpineEntries('a', 'p')[0])
        expect(confirm).not.toHaveBeenCalled()
        expect(ph.getPlaceholderSpineEntries('a', 'p')).toHaveLength(1)
      })
    })

    it('keeps a child slot that another entry still references', async () => {
      const loader = useFileLoaderStore()
      const ph = usePlaceholderImagesStore()
      loader.setSlots([slot('a'), slot('kid', { parentSlotId: 'a' })], '4.2')
      ph.setSlotImages('a', { p: [spine('e1', 'kid'), spine('e2', 'kid')] })
      await usePlaceholderActions().removeSpineChild('a', 'p', ph.getPlaceholderSpineEntries('a', 'p')[0])
      expect(loader.spineSlots.map(s => s.id)).toEqual(['a', 'kid'])
    })

    it('clones a child spine into a new desynced child slot', () => {
      const loader = useFileLoaderStore()
      const ph = usePlaceholderImagesStore()
      loader.setSlots([slot('a'), slot('kid', { parentSlotId: 'a' })], '4.2')
      ph.setSlotImages('a', { p: [spine('e1', 'kid')] })
      usePlaceholderActions().cloneSpineChild('a', 'p', ph.getPlaceholderSpineEntries('a', 'p')[0])
      const entries = ph.getPlaceholderSpineEntries('a', 'p')
      expect(entries.map(e => e.imageId)[1]).toBe('e1')
      const clone = loader.spineSlots.find(s => s.id === entries[0].childSlotId)!
      expect(clone).toMatchObject({ parentSlotId: 'a', syncEnabled: false })
    })

    it('clones an inactive child with a separate copy of its saved state (B14)', () => {
      const loader = useFileLoaderStore()
      const ph = usePlaceholderImagesStore()
      const src = { ...saved(), selectedSkins: ['gold'], placeholderChildren: { p: [image('i1')] } }
      loader.setSlots([slot('a'), slot('kid', { parentSlotId: 'a', savedState: src })], '4.2')
      ph.setSlotImages('a', { p: [spine('e1', 'kid')] })
      usePlaceholderActions().cloneSpineChild('a', 'p', ph.getPlaceholderSpineEntries('a', 'p')[0])
      const cloneId = ph.getPlaceholderSpineEntries('a', 'p')[0].childSlotId
      const clone = loader.spineSlots.find(s => s.id === cloneId)!
      expect(clone).toMatchObject({ syncEnabled: false, indPosX: 0, indPosY: 0 })
      expect(clone.savedState).toMatchObject({ trackPlaylists: src.trackPlaylists, selectedSkins: ['gold'] })
      expect(clone.savedState!.placeholderChildren).toBeUndefined()
      expect(clone.savedState).not.toBe(src)
      expect(clone.savedState!.trackPlaylists).not.toBe(src.trackPlaylists)
    })

    it('captures live track times of an active child before cloning it (B14)', () => {
      const loader = useFileLoaderStore()
      const ph = usePlaceholderImagesStore()
      loader.setSlots([slot('a'), slot('kid', { parentSlotId: 'a' })], '4.2')
      ph.setSlotImages('a', { p: [spine('e1', 'kid')] })
      useSlotSelectionStore().activeSlotId = 'kid'
      useAnimationStore().tracks = [{ trackIndex: 0, animationName: 'run', time: 1.25, duration: 2, loop: true, timeScale: 1, queue: [], mixDuration: 0 }]
      useSkeletonStore().activeSkins = ['blue']
      usePlaceholderActions().cloneSpineChild('a', 'p', ph.getPlaceholderSpineEntries('a', 'p')[0])
      expect(loader.spineSlots.find(s => s.id === 'kid')!.savedState).toMatchObject({ trackTimes: { 0: 1.25 }, selectedSkins: ['blue'] })
      const cloneId = ph.getPlaceholderSpineEntries('a', 'p')[0].childSlotId
      expect(loader.spineSlots.find(s => s.id === cloneId)!.savedState).toMatchObject({ trackTimes: { 0: 1.25 }, selectedSkins: ['blue'] })
    })

    it('a clone of an active child keeps the store trackMix, mixDuration included', () => {
      const loader = useFileLoaderStore()
      const ph = usePlaceholderImagesStore()
      loader.setSlots([slot('a'), slot('kid', { parentSlotId: 'a' })], '4.2')
      ph.setSlotImages('a', { p: [spine('e1', 'kid')] })
      useSlotSelectionStore().activeSlotId = 'kid'
      const anim = useAnimationStore()
      anim.patchTrackMix(0, { mixDuration: 0.35 })
      anim.patchTrackMix(1, { mixDuration: 0.5, additive: true, mixInterpolation: 'circle' })
      usePlaceholderActions().cloneSpineChild('a', 'p', ph.getPlaceholderSpineEntries('a', 'p')[0])
      const cloneId = ph.getPlaceholderSpineEntries('a', 'p')[0].childSlotId
      expect(loader.spineSlots.find(s => s.id === cloneId)!.savedState!.trackMix)
        .toEqual({ 0: { mixDuration: 0.35 }, 1: { mixDuration: 0.5, additive: true, mixInterpolation: 'circle' } })
    })

    it('toggles sync on both the entry and the child slot', () => {
      const loader = useFileLoaderStore()
      const ph = usePlaceholderImagesStore()
      loader.setSlots([slot('a'), slot('kid', { parentSlotId: 'a' })], '4.2')
      ph.setSlotImages('a', { p: [spine('e1', 'kid')] })
      usePlaceholderActions().toggleSpineChildSync('a', 'p', ph.getPlaceholderSpineEntries('a', 'p')[0])
      expect(ph.getPlaceholderSpineEntries('a', 'p')[0].syncEnabled).toBe(false)
      expect(loader.spineSlots.find(s => s.id === 'kid')?.syncEnabled).toBe(false)
    })
  })

  it('reorders a mixed placeholder across kinds (A1)', async () => {
    const loader = useFileLoaderStore()
    const ph = usePlaceholderImagesStore()
    loader.setSlots([slot('a'), slot('kid', { parentSlotId: 'a' })], '4.2')
    ph.setSlotImages('a', { p: [image('i1'), spine('e1', 'kid'), image('i2')] })
    const actions = usePlaceholderActions()
    actions.moveImage({ imageId: 'i2', srcSlotId: 'a', srcPhName: 'p' }, 'a', 'p', 'e1')
    expect(ph.getPlaceholderImages('a', 'p').map(e => e.imageId)).toEqual(['i1', 'i2', 'e1'])
    await actions.moveSpine({ imageId: 'e1', srcSlotId: 'a', srcPhName: 'p' }, 'a', 'p', 'i1')
    expect(ph.getPlaceholderImages('a', 'p').map(e => e.imageId)).toEqual(['e1', 'i1', 'i2'])
  })

  describe('promoteSpine (A2)', () => {
    it('leaves an active child first, then makes it a synced top-level skeleton at the drop row', async () => {
      const loader = useFileLoaderStore()
      const sel = useSlotSelectionStore()
      const ph = usePlaceholderImagesStore()
      loader.setSlots([slot('a'), slot('b'), slot('kid', { parentSlotId: 'a', savedState: saved(), syncEnabled: false, indPosX: 40, indZoom: 2 })], '4.2')
      ph.setSlotImages('a', { p: [image('i1'), spine('e1', 'kid')] })
      sel.setActiveSlot('kid')
      await nextTick()
      const parentsWhenLeaving: Array<string | undefined> = []
      watch(() => sel.activeSlotId, () => parentsWhenLeaving.push(loader.spineSlots.find(s => s.id === 'kid')?.parentSlotId))

      await usePlaceholderActions().promoteSpine({ imageId: 'e1', srcSlotId: 'a', srcPhName: 'p' }, 'a', 'after')

      expect(parentsWhenLeaving[0]).toBe('a')
      expect(ph.getPlaceholderImages('a', 'p').map(e => e.imageId)).toEqual(['i1'])
      expect(ph.peekActions().some(a => a.type === 'remove-spine')).toBe(true)
      const kid = loader.spineSlots.find(s => s.id === 'kid')!
      expect(kid).toMatchObject({ parentSlotId: undefined, syncEnabled: true, indPosX: 0, indPosY: 0, indZoom: 1 })
      expect(kid.savedState).toMatchObject({ syncEnabled: true, indPosX: 0, indPosY: 0, indZoom: 1, selectedAnimation: 'run' })
      expect(useImageLayersStore().rows.map(r => r.id)).toEqual(['a', 'kid', 'b'])
      expect(sel.activeSlotId).toBe('kid')
      expect(loader.spineSlots).toHaveLength(3)
    })
  })

  describe('image layers (A3)', () => {
    it('promoteImage queues a remove and adds an inactive layer with the entry scale at the drop row', () => {
      const ph = usePlaceholderImagesStore()
      const layers = useImageLayersStore()
      useFileLoaderStore().setSlots([slot('a'), slot('b')], '4.2')
      ph.setSlotImages('a', { p: [{ ...image('i1'), scale: 2.5 } as PHChildEntry] })

      usePlaceholderActions().promoteImage({ imageId: 'i1', srcSlotId: 'a', srcPhName: 'p' }, 'b', 'before')

      expect(ph.getPlaceholderImages('a', 'p')).toEqual([])
      expect(ph.peekActions()).toContainEqual({ type: 'remove', slotId: 'a', phName: 'p', imageId: 'i1' })
      const [layer] = layers.layers
      expect(layer).toMatchObject({ name: 'i1.png', dataUrl: 'data:', scale: 2.5 })
      expect(layers.rows.map(r => r.id)).toEqual(['a', layer.id, 'b'])
      expect(layers.activeLayerId).toBeNull()
    })

    it('demoteLayer queues an add with the scale, removes the layer and activates an inactive destination', () => {
      const ph = usePlaceholderImagesStore()
      const layers = useImageLayersStore()
      const sel = useSlotSelectionStore()
      useFileLoaderStore().setSlots([slot('a'), slot('b')], '4.2')
      const id = layers.addLayer({ name: 'l.png', dataUrl: 'data:l', scale: 3 })

      usePlaceholderActions().demoteLayer(id, 'b', 'q')

      const [entry] = ph.getPlaceholderImages('b', 'q')
      expect(entry).toMatchObject({ kind: 'image', fileName: 'l.png', dataURL: 'data:l', scale: 3, posX: 0, posY: 0 })
      expect(ph.peekActions()).toContainEqual({ type: 'add', slotId: 'b', phName: 'q', imageId: entry.imageId, dataURL: 'data:l' })
      expect(layers.layers).toEqual([])
      expect(sel.activeSlotId).toBe('b')
    })

    it('demoteLayer ignores the background layer', () => {
      const ph = usePlaceholderImagesStore()
      const layers = useImageLayersStore()
      useFileLoaderStore().setSlots([slot('a'), slot('b')], '4.2')
      const id = layers.addLayer({ name: 'bg.png', dataUrl: 'data:bg', scale: 1 })
      layers.setBackground(id)

      usePlaceholderActions().demoteLayer(id, 'b', 'q')

      expect(layers.layers.map(l => l.id)).toEqual([id])
      expect(ph.getPlaceholderImages('b', 'q')).toEqual([])
      expect(ph.peekActions().some(a => a.type === 'add')).toBe(false)
    })

    it('demoteLayer does not activate a pinned destination', () => {
      const layers = useImageLayersStore()
      const sel = useSlotSelectionStore()
      useFileLoaderStore().setSlots([slot('a'), slot('b')], '4.2')
      sel.setPinned('b', true)
      sel.setActiveSlot('a')
      usePlaceholderActions().demoteLayer(layers.addLayer({ name: 'l', dataUrl: 'd', scale: 1 }), 'b', 'q')
      expect(sel.activeSlotId).toBe('a')
    })
  })

  it('lists new, moved-in and demoted children first (F8)', async () => {
    const loader = useFileLoaderStore()
    const ph = usePlaceholderImagesStore()
    const layers = useImageLayersStore()
    loader.setSlots([slot('a'), slot('b'), slot('kid', { parentSlotId: 'a' })], '4.2')
    ph.setSlotImages('a', { p: [image('i1'), spine('e1', 'kid')] })
    ph.setSlotImages('b', { q: [image('i2')] })
    useSlotSelectionStore().setPinned('b', true)
    const actions = usePlaceholderActions()
    actions.moveImage({ imageId: 'i1', srcSlotId: 'a', srcPhName: 'p' }, 'b', 'q')
    expect(ph.getPlaceholderImages('b', 'q').map(e => e.imageId)).toEqual(['i1', 'i2'])
    await actions.moveSpine({ imageId: 'e1', srcSlotId: 'a', srcPhName: 'p' }, 'b', 'q')
    expect(ph.getPlaceholderImages('b', 'q').map(e => e.imageId)).toEqual(['e1', 'i1', 'i2'])
    actions.demoteLayer(layers.addLayer({ name: 'l.png', dataUrl: 'd', scale: 1 }), 'b', 'q')
    expect(ph.getPlaceholderImages('b', 'q').map(e => e.fileName)[0]).toBe('l.png')
  })

  it('keeps drop order at the top of a placeholder for several images (F8)', async () => {
    const ph = usePlaceholderImagesStore()
    ph.setSlotImages('a', { p: [image('i1')] })
    const hat = new File(['x'], 'hat.png', { type: 'image/png' })
    const bow = new File(['x'], 'bow.png', { type: 'image/png' })
    await usePlaceholderActions().dropFiles([hat, bow], 'a', 'p')
    expect(ph.getPlaceholderImages('a', 'p').map(e => e.imageId === 'i1' ? 'i1' : e.fileName)).toEqual(['hat.png', 'bow.png', 'i1'])
  })

  it('drops images as placeholder sprites and ignores other files', async () => {
    const ph = usePlaceholderImagesStore()
    const png = new File(['x'], 'a.png', { type: 'image/png' })
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' })
    await usePlaceholderActions().dropFiles([png, txt], 'a', 'p')
    expect(ph.getPlaceholderImages('a', 'p').map(e => e.fileName)).toEqual(['a.png'])
  })

  it('accepts images by extension even without a MIME type (B20)', async () => {
    const ph = usePlaceholderImagesStore()
    const addImage = vi.spyOn(ph, 'addImage').mockResolvedValue(undefined)
    const hat = new File(['x'], 'hat.PNG', { type: '' })
    const bow = new File(['x'], 'bow.gif', { type: 'image/gif' })
    const notes = new File(['x'], 'notes.txt', { type: 'text/plain' })
    await usePlaceholderActions().dropFiles([hat, notes, bow], 'a', 'p')
    expect(addImage.mock.calls.map(c => c[2].name)).toEqual(['hat.PNG', 'bow.gif'])
  })
})
