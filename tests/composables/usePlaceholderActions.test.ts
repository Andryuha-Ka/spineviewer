import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick, watch } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlaceholderActions } from '@/core/composables/usePlaceholderActions'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import { useVersionStore } from '@/core/stores/useVersionStore'
import type { FileSet, PHChildEntry, SpineSlot, SpineSlotSavedState } from '@/core/types/FileSet'

// binary skeleton header: hash, then the editor version string
const skel = (version: string) => new TextEncoder().encode('\u001cFVeOgUJ9Zde9qJlpLOM\u0007' + version + '\u0000\u0000').buffer

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

    it('refuses a spine the session runtime cannot load (3.8 skeleton in a 4.1 session)', async () => {
      const loader = useFileLoaderStore()
      const old: FileSet = { ...FILESET, skeleton: { ...FILESET.skeleton, filename: 'anticipationEffect.skel', fileBody: skel('3.8.99') } }
      loader.setSlots([slot('a'), slot('b', { fileSet: old })], '4.1')
      await usePlaceholderActions().moveSlotIntoPlaceholder('b', 'a', 'placeholder_1')
      expect(window.alert).toHaveBeenCalledWith('Spine version mismatch: anticipationEffect.skel is 3.8, viewer is set to 4.1')
      expect(loader.spineSlots.find(s => s.id === 'b')?.parentSlotId).toBeUndefined()
      expect(usePlaceholderImagesStore().getPlaceholderSpineEntries('a', 'placeholder_1')).toEqual([])
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
      expect(entries).toHaveLength(2)
      const clone = loader.spineSlots.find(s => s.id === entries[1].childSlotId)!
      expect(clone).toMatchObject({ parentSlotId: 'a', syncEnabled: false })
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

  it('drops images as placeholder sprites and ignores other files', async () => {
    const ph = usePlaceholderImagesStore()
    const png = new File(['x'], 'a.png', { type: 'image/png' })
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' })
    await usePlaceholderActions().dropFiles([png, txt], 'a', 'p')
    expect(ph.getPlaceholderImages('a', 'p').map(e => e.fileName)).toEqual(['a.png'])
  })
})
